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
  describe("applyAuthorChange 写入作者", function () {
    it("替换全部作者并排在非作者创作者之前", function () {
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

    it("把合并的单字段作者拆成多个创作者", function () {
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

    it("专利条目保留 inventor 创作者类型", function () {
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

  describe("applyChanges 写入变更", function () {
    let originalGetAsync: typeof Zotero.Items.getByLibraryAndKeyAsync;

    beforeEach(function () {
      originalGetAsync = Zotero.Items.getByLibraryAndKeyAsync;
    });

    afterEach(function () {
      Zotero.Items.getByLibraryAndKeyAsync = originalGetAsync;
    });

    it("其他条目失败时保留已成功的变更", async function () {
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

    it("同一条目的多个变更合并为一次保存", async function () {
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

    it("并行处理多个独立条目", async function () {
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

    it("处理跨批次边界的 20 多个条目", async function () {
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

  describe("undoChanges 撤销变更", function () {
    let originalGetAsync: typeof Zotero.Items.getByLibraryAndKeyAsync;

    beforeEach(function () {
      originalGetAsync = Zotero.Items.getByLibraryAndKeyAsync;
    });

    afterEach(function () {
      Zotero.Items.getByLibraryAndKeyAsync = originalGetAsync;
    });

    it("恢复字段旧值", async function () {
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

    it("按旧格式化值恢复作者创作者", async function () {
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

    it("其他条目失败时保留已成功的撤销", async function () {
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

  describe("formatAuthors 格式化作者", function () {
    it("用 ' and ' 连接干净的多作者条目，无需再清理", function () {
      const authors = formatAuthors([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
      assert.equal(authors, "Smith, John and Doe, Jane");
    });

    it("仅当创作者自身包含分号时才保留分号", function () {
      const authors = formatAuthors([
        { creatorType: "author", name: "Zhang San; Li Si" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
      assert.equal(authors, "Zhang San; Li Si; Doe, Jane");
    });

    it("忽略非作者创作者", function () {
      const authors = formatAuthors([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "editor", firstName: "Jane", lastName: "Doe" },
      ]);
      assert.equal(authors, "Smith, John");
    });

    it("专利包含 inventor 创作者", function () {
      const authors = formatAuthors([
        { creatorType: "inventor", firstName: "John", lastName: "Smith" },
        { creatorType: "inventor", firstName: "Jane", lastName: "Doe" },
      ]);
      assert.equal(authors, "Smith, John and Doe, Jane");
    });

    it("firstName 为空时省略逗号", function () {
      const authors = formatAuthors([
        { creatorType: "author", firstName: "霙婧", lastName: "钱" },
        { creatorType: "author", firstName: "", lastName: "乔鹏昊" },
      ]);
      assert.equal(authors, "钱, 霙婧 and 乔鹏昊");
    });

    it("没有作者时返回 undefined", function () {
      assert.isUndefined(
        formatAuthors([
          { creatorType: "editor", firstName: "Jane", lastName: "Doe" },
        ]),
      );
    });

    it("传给 computeChanges 的干净字符串不产生作者变更", function () {
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

  describe("parseAuthors 解析作者", function () {
    it("按 ' and ' 拆分作者并解析“姓, 名”格式", function () {
      const authors = parseAuthors("Smith, John and Doe, Jane");
      assert.deepEqual(authors, [
        { creatorType: "author", lastName: "Smith", firstName: "John" },
        { creatorType: "author", lastName: "Doe", firstName: "Jane" },
      ]);
    });

    it("无逗号时回退为单字段名称", function () {
      const authors = parseAuthors("ACME Corporation");
      assert.deepEqual(authors, [
        { creatorType: "author", name: "ACME Corporation" },
      ]);
    });

    it("过滤连续分隔符产生的空段", function () {
      const authors = parseAuthors("闻国光 and  and 过仕宁");
      assert.deepEqual(authors, [
        { creatorType: "author", name: "闻国光" },
        { creatorType: "author", name: "过仕宁" },
      ]);
    });

    it("过滤首尾空白段", function () {
      const authors = parseAuthors("  Smith, John   and     Doe, Jane  ");
      assert.deepEqual(authors, [
        { creatorType: "author", lastName: "Smith", firstName: "John" },
        { creatorType: "author", lastName: "Doe", firstName: "Jane" },
      ]);
    });

    it("为每个解析出的创作者使用给定类型", function () {
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
