import { assert } from "chai";
import {
  applyAuthorChange,
  applyChanges,
  formatAuthors,
  parseAuthors,
  undoChanges,
} from "../src/modules/zoteroWriter";
import { computeChanges, type FieldChange } from "../src/modules/changes";

// Zotero 运行时 mock，使 applyChanges/undoChanges 测试可在 Node 中运行
(globalThis as any).Zotero = {
  Items: {
    getByLibraryAndKeyAsync: async () => undefined,
  },
};

describe("zoteroWriter", function () {
  describe("applyAuthorChange", function () {
    it("replaces all authors and puts them before non-author creators", function () {
      const creators: _ZoteroTypes.Item.CreatorJSON[] = [
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "editor", firstName: "Jane", lastName: "Doe" },
        { creatorType: "author", firstName: "Bob", lastName: "Brown" },
      ];
      const item = createMockItem(creators);
      applyAuthorChange(item, "Smith, John and Brown, Bob");
      assert.deepEqual(creators, [
        { creatorType: "author", lastName: "Smith", firstName: "John" },
        { creatorType: "author", lastName: "Brown", firstName: "Bob" },
        { creatorType: "editor", firstName: "Jane", lastName: "Doe" },
      ]);
    });

    it("splits a combined single-field author into separate creators", function () {
      const creators: _ZoteroTypes.Item.CreatorJSON[] = [
        { creatorType: "author", name: "Zhang San; Li Si; Wang Wu; Zhao Liu" },
      ];
      const item = createMockItem(creators);
      applyAuthorChange(item, "Zhang San and Li Si and Wang Wu and Zhao Liu");
      assert.deepEqual(creators, [
        { creatorType: "author", name: "Zhang San" },
        { creatorType: "author", name: "Li Si" },
        { creatorType: "author", name: "Wang Wu" },
        { creatorType: "author", name: "Zhao Liu" },
      ]);
    });

    it("keeps the inventor creator type in patent items", function () {
      const creators: _ZoteroTypes.Item.CreatorJSON[] = [
        { creatorType: "inventor", firstName: "John", lastName: "Smith" },
        { creatorType: "inventor", firstName: "Jane", lastName: "Doe" },
      ];
      const item = createMockItem(creators);
      applyAuthorChange(item, "Smith, John and Doe, Jane");
      assert.deepEqual(creators, [
        { creatorType: "inventor", lastName: "Smith", firstName: "John" },
        { creatorType: "inventor", lastName: "Doe", firstName: "Jane" },
      ]);
    });
  });

  describe("applyChanges", function () {
    let originalGetAsync: typeof Zotero.Items.getByLibraryAndKeyAsync;

    beforeEach(function () {
      originalGetAsync = Zotero.Items.getByLibraryAndKeyAsync;
    });

    afterEach(function () {
      Zotero.Items.getByLibraryAndKeyAsync = originalGetAsync;
    });

    it("keeps successful changes when other items fail", async function () {
      const goodItem = createMockSavableItem({ key: "A1", issue: "3" });
      const badItem = createMockSavableItem({
        key: "A2",
        issue: "5",
        saveError: new Error("save failed"),
      });

      Zotero.Items.getByLibraryAndKeyAsync = async (
        libraryID: number,
        key: string,
      ) => {
        if (key === "A1") return goodItem.item;
        if (key === "A2") return badItem.item;
        throw new Error(`Item ${key} not found`);
      };

      const changes: FieldChange[] = [
        {
          libraryID: 1,
          itemKey: "A1",
          field: "issue",
          oldValue: "第三期",
          newValue: "3",
        },
        {
          libraryID: 1,
          itemKey: "A2",
          field: "issue",
          oldValue: "第五期",
          newValue: "5",
        },
      ];

      const { succeeded, failed } = await applyChanges(changes);

      assert.lengthOf(succeeded, 1);
      assert.equal(succeeded[0].itemKey, "A1");
      assert.equal(goodItem.getField("issue"), "3");

      assert.lengthOf(failed, 1);
      assert.equal(failed[0].change.itemKey, "A2");
      assert.match(failed[0].error.message, /save failed/);
    });

    it("batches multiple changes on the same item into a single save", async function () {
      const item = createMockSavableItem({
        key: "A1",
        issue: "第三期",
        creators: [
          { creatorType: "author", firstName: "John", lastName: "Smith" },
        ],
      });

      Zotero.Items.getByLibraryAndKeyAsync = async () => item.item;

      const changes: FieldChange[] = [
        {
          libraryID: 1,
          itemKey: "A1",
          field: "author",
          oldValue: "Smith, John",
          newValue: "Smith, John",
        },
        {
          libraryID: 1,
          itemKey: "A1",
          field: "issue",
          oldValue: "第三期",
          newValue: "3",
        },
      ];

      const { succeeded } = await applyChanges(changes);

      assert.lengthOf(succeeded, 2);
      assert.equal(item.getField("issue"), "3");
      assert.equal(item.saveTxCount(), 1);
    });

    it("processes multiple independent items in parallel", async function () {
      const item1 = createMockSavableItem({ key: "A1", issue: "第一期" });
      const item2 = createMockSavableItem({ key: "A2", issue: "第二期" });
      const item3 = createMockSavableItem({ key: "A3", issue: "第三期" });

      Zotero.Items.getByLibraryAndKeyAsync = async (
        _libraryID: number,
        key: string,
      ) => {
        if (key === "A1") return item1.item;
        if (key === "A2") return item2.item;
        if (key === "A3") return item3.item;
        throw new Error(`Item ${key} not found`);
      };

      const changes: FieldChange[] = [
        {
          libraryID: 1,
          itemKey: "A1",
          field: "issue",
          oldValue: "第一期",
          newValue: "1",
        },
        {
          libraryID: 1,
          itemKey: "A2",
          field: "issue",
          oldValue: "第二期",
          newValue: "2",
        },
        {
          libraryID: 1,
          itemKey: "A3",
          field: "issue",
          oldValue: "第三期",
          newValue: "3",
        },
      ];

      const { succeeded, failed } = await applyChanges(changes);

      assert.lengthOf(succeeded, 3);
      assert.lengthOf(failed, 0);
      assert.equal(item1.getField("issue"), "1");
      assert.equal(item2.getField("issue"), "2");
      assert.equal(item3.getField("issue"), "3");
    });

    it("handles more than 20 items across batch boundaries", async function () {
      const itemCount = 21;
      const items = Array.from({ length: itemCount }, (_, i) =>
        createMockSavableItem({ key: `A${i}`, issue: `第${i}期` }),
      );

      Zotero.Items.getByLibraryAndKeyAsync = async (
        _libraryID: number,
        key: string,
      ) => {
        const idx = parseInt(key.slice(1), 10);
        if (idx >= 0 && idx < itemCount) return items[idx].item;
        throw new Error(`Item ${key} not found`);
      };

      const changes: FieldChange[] = items.map((_, i) => ({
        libraryID: 1,
        itemKey: `A${i}`,
        field: "issue",
        oldValue: `第${i}期`,
        newValue: `${i}`,
      }));

      const { succeeded, failed } = await applyChanges(changes);

      assert.lengthOf(succeeded, itemCount);
      assert.lengthOf(failed, 0);
      for (let i = 0; i < itemCount; i++) {
        assert.equal(items[i].getField("issue"), `${i}`);
      }
    });
  });

  describe("undoChanges", function () {
    let originalGetAsync: typeof Zotero.Items.getByLibraryAndKeyAsync;

    beforeEach(function () {
      originalGetAsync = Zotero.Items.getByLibraryAndKeyAsync;
    });

    afterEach(function () {
      Zotero.Items.getByLibraryAndKeyAsync = originalGetAsync;
    });

    it("restores old field values", async function () {
      const item = createMockSavableItem({ key: "A1", issue: "3" });

      Zotero.Items.getByLibraryAndKeyAsync = async (
        libraryID: number,
        key: string,
      ) => {
        if (key === "A1") return item.item;
        throw new Error(`Item ${key} not found`);
      };

      const changes: FieldChange[] = [
        {
          libraryID: 1,
          itemKey: "A1",
          field: "issue",
          oldValue: "第三期",
          newValue: "3",
        },
      ];

      const { succeeded, failed } = await undoChanges(changes);

      assert.lengthOf(succeeded, 1);
      assert.lengthOf(failed, 0);
      assert.equal(item.getField("issue"), "第三期");
    });

    it("restores author creators from the old formatted value", async function () {
      const item = createMockSavableItem({
        key: "A1",
        creators: [
          { creatorType: "author", lastName: "Smith", firstName: "John" },
          { creatorType: "author", lastName: "Doe", firstName: "Jane" },
        ],
      });

      Zotero.Items.getByLibraryAndKeyAsync = async (
        libraryID: number,
        key: string,
      ) => {
        if (key === "A1") return item.item;
        throw new Error(`Item ${key} not found`);
      };

      const changes: FieldChange[] = [
        {
          libraryID: 1,
          itemKey: "A1",
          field: "author",
          oldValue: "Smith, John; Doe, Jane",
          newValue: "Smith, John and Doe, Jane",
        },
      ];

      const { succeeded, failed } = await undoChanges(changes);

      assert.lengthOf(succeeded, 1);
      assert.lengthOf(failed, 0);
      assert.deepEqual(item.getCreatorsJSON(), [
        { creatorType: "author", lastName: "Smith", firstName: "John" },
        { creatorType: "author", lastName: "Doe", firstName: "Jane" },
      ]);
    });

    it("keeps successful undos when other items fail", async function () {
      const goodItem = createMockSavableItem({ key: "A1", issue: "3" });
      const badItem = createMockSavableItem({
        key: "A2",
        issue: "5",
        saveError: new Error("save failed"),
      });

      Zotero.Items.getByLibraryAndKeyAsync = async (
        libraryID: number,
        key: string,
      ) => {
        if (key === "A1") return goodItem.item;
        if (key === "A2") return badItem.item;
        throw new Error(`Item ${key} not found`);
      };

      const changes: FieldChange[] = [
        {
          libraryID: 1,
          itemKey: "A1",
          field: "issue",
          oldValue: "第三期",
          newValue: "3",
        },
        {
          libraryID: 1,
          itemKey: "A2",
          field: "issue",
          oldValue: "第五期",
          newValue: "5",
        },
      ];

      const { succeeded, failed } = await undoChanges(changes);

      assert.lengthOf(succeeded, 1);
      assert.equal(succeeded[0].itemKey, "A1");
      assert.equal(goodItem.getField("issue"), "第三期");

      assert.lengthOf(failed, 1);
      assert.equal(failed[0].change.itemKey, "A2");
    });
  });

  describe("formatAuthors", function () {
    it("joins clean multi-author items with ' and ' so they never need cleaning", function () {
      const authors = formatAuthors([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
      assert.equal(authors, "Smith, John and Doe, Jane");
    });

    it("keeps semicolons only when a creator itself contains one", function () {
      const authors = formatAuthors([
        { creatorType: "author", name: "Zhang San; Li Si" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
      assert.equal(authors, "Zhang San; Li Si; Doe, Jane");
    });

    it("ignores non-author creators", function () {
      const authors = formatAuthors([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "editor", firstName: "Jane", lastName: "Doe" },
      ]);
      assert.equal(authors, "Smith, John");
    });

    it("includes inventor creators for patents", function () {
      const authors = formatAuthors([
        { creatorType: "inventor", firstName: "John", lastName: "Smith" },
        { creatorType: "inventor", firstName: "Jane", lastName: "Doe" },
      ]);
      assert.equal(authors, "Smith, John and Doe, Jane");
    });

    it("omits comma when firstName is empty", function () {
      const authors = formatAuthors([
        { creatorType: "author", firstName: "霙婧", lastName: "钱" },
        { creatorType: "author", firstName: "", lastName: "乔鹏昊" },
      ]);
      assert.equal(authors, "钱, 霙婧 and 乔鹏昊");
    });

    it("returns undefined when there are no authors", function () {
      assert.isUndefined(
        formatAuthors([
          { creatorType: "editor", firstName: "Jane", lastName: "Doe" },
        ]),
      );
    });

    it("feeds computeChanges a clean string that produces no author change", function () {
      const authors = formatAuthors([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
      const changes = computeChanges([
        {
          key: "A1",
          libraryID: 1,
          title: "论文",
          author: authors,
          issue: "3",
          volume: "10",
        },
      ]);
      assert.deepEqual(changes, [], "干净的多作者条目不应产生清理变更");
    });
  });

  describe("parseAuthors", function () {
    it("splits authors by ' and ' and parses last, first format", function () {
      const authors = parseAuthors("Smith, John and Doe, Jane");
      assert.deepEqual(authors, [
        { creatorType: "author", lastName: "Smith", firstName: "John" },
        { creatorType: "author", lastName: "Doe", firstName: "Jane" },
      ]);
    });

    it("falls back to single-field name when there is no comma", function () {
      const authors = parseAuthors("ACME Corporation");
      assert.deepEqual(authors, [
        { creatorType: "author", name: "ACME Corporation" },
      ]);
    });

    it("filters out empty segments caused by consecutive separators", function () {
      const authors = parseAuthors("闻国光 and  and 过仕宁");
      assert.deepEqual(authors, [
        { creatorType: "author", name: "闻国光" },
        { creatorType: "author", name: "过仕宁" },
      ]);
    });

    it("filters out leading/trailing whitespace-only segments", function () {
      const authors = parseAuthors("  Smith, John   and     Doe, Jane  ");
      assert.deepEqual(authors, [
        { creatorType: "author", lastName: "Smith", firstName: "John" },
        { creatorType: "author", lastName: "Doe", firstName: "Jane" },
      ]);
    });

    it("uses the given creator type for every parsed creator", function () {
      const authors = parseAuthors("Smith, John and ACME Corp", "inventor");
      assert.deepEqual(authors, [
        { creatorType: "inventor", lastName: "Smith", firstName: "John" },
        { creatorType: "inventor", name: "ACME Corp" },
      ]);
    });
  });
});

function createMockItem(
  creators: _ZoteroTypes.Item.CreatorJSON[],
): Zotero.Item {
  return {
    getCreatorsJSON: () => creators,
    setCreators: (newCreators: _ZoteroTypes.Item.CreatorJSON[]) => {
      creators.length = 0;
      creators.push(...newCreators);
    },
  } as unknown as Zotero.Item;
}

function createMockSavableItem({
  key,
  issue,
  creators,
  saveError,
}: {
  key: string;
  issue?: string;
  creators?: _ZoteroTypes.Item.CreatorJSON[];
  saveError?: Error;
}) {
  const fields: Record<string, string> = issue ? { issue } : {};
  const itemCreators = creators ? [...creators] : [];
  let saveTxCount = 0;
  const item = {
    key,
    getField: (field: string) => fields[field],
    setField: (field: string, value: string) => {
      fields[field] = value;
      return true;
    },
    getCreatorsJSON: () => itemCreators,
    setCreators: (newCreators: _ZoteroTypes.Item.CreatorJSON[]) => {
      itemCreators.length = 0;
      itemCreators.push(...newCreators);
    },
    saveTx: async () => {
      saveTxCount++;
      if (saveError) {
        throw saveError;
      }
    },
  } as unknown as Zotero.Item;
  return {
    item,
    getField: (field: string) => fields[field],
    getCreatorsJSON: () => itemCreators,
    saveTxCount: () => saveTxCount,
  };
}
