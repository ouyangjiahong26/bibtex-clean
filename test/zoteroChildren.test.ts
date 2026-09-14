import { assert } from "chai";
import {
  collectCandidates,
  isLinkAttachment,
  moveCandidatesToTrash,
  toCandidate,
} from "../src/modules/zoteroChildren";
import type { Candidate } from "../src/modules/filterCandidates";

// Zotero 运行时 mock，使候选收集与删除可在 Node 中测试
const LINK_MODES = {
  LINK_MODE_IMPORTED_FILE: 0,
  LINK_MODE_IMPORTED_URL: 1,
  LINK_MODE_LINKED_FILE: 2,
  LINK_MODE_LINKED_URL: 3,
};

type MockItemOptions = {
  key: string;
  kind: "regular" | "attachment" | "note";
  libraryID?: number;
  title?: string;
  url?: string;
  linkMode?: number;
  filePath?: string | false;
  note?: string;
  attachments?: number[];
  notes?: number[];
  parentItemID?: number | false;
  saveError?: Error;
};

type MockItem = Zotero.Item & { deleted: boolean };

function createMockItem(options: MockItemOptions): MockItem {
  const item = {
    key: options.key,
    libraryID: options.libraryID ?? 1,
    parentItemID: options.parentItemID ?? false,
    attachmentLinkMode: options.linkMode ?? LINK_MODES.LINK_MODE_IMPORTED_FILE,
    deleted: false,
    isRegularItem: () => options.kind === "regular",
    isAttachment: () => options.kind === "attachment",
    isNote: () => options.kind === "note",
    getField: (field: string) => {
      if (field === "title") return options.title ?? "";
      if (field === "url") return options.url ?? "";
      return "";
    },
    getNote: () => options.note ?? "",
    getFilePath: () => options.filePath ?? false,
    getAttachments: () => options.attachments ?? [],
    getNotes: () => options.notes ?? [],
    saveTx: async () => {
      if (options.saveError) throw options.saveError;
    },
    // 只实现被测代码用到的成员，其余成员由断言以外的地方承担
  } as unknown as MockItem;
  return item;
}

let itemsByID: Map<number, MockItem>;
let itemsByKey: Map<string, MockItem>;
let originalZotero: unknown;

function registerItem(id: number, item: MockItem): MockItem {
  itemsByID.set(id, item);
  itemsByKey.set(item.key, item);
  return item;
}

function candidateOf(key: string, libraryID = 1): Candidate {
  return {
    itemKey: key,
    libraryID,
    kind: "link-attachment",
    title: key,
    parentTitle: "",
  };
}

describe("zoteroChildren", function () {
  beforeEach(function () {
    itemsByID = new Map();
    itemsByKey = new Map();
    // 测试里替换 Zotero 全局；真实形状由 zotero-types 提供，此处只喂被调用的 API
    const runtimeGlobals = globalThis as unknown as Record<string, unknown>;
    originalZotero = runtimeGlobals.Zotero;
    runtimeGlobals.Zotero = {
      Attachments: LINK_MODES,
      Items: {
        get: (id: number) => itemsByID.get(id),
        getByLibraryAndKeyAsync: async (libraryID: number, key: string) => {
          const item = itemsByKey.get(key);
          return item && item.libraryID === libraryID ? item : undefined;
        },
      },
    };
  });

  afterEach(function () {
    // 同一进程里还有别的测试文件，退出时把真实 Zotero 放回去
    const runtimeGlobals = globalThis as unknown as Record<string, unknown>;
    runtimeGlobals.Zotero = originalZotero;
  });

  describe("isLinkAttachment", function () {
    it("accepts snapshots and web links", function () {
      const snapshot = createMockItem({
        key: "A1",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
      });
      const webLink = createMockItem({
        key: "A2",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_LINKED_URL,
      });

      assert.isTrue(isLinkAttachment(snapshot));
      assert.isTrue(isLinkAttachment(webLink));
    });

    it("rejects file attachments, notes and regular items", function () {
      const importedFile = createMockItem({
        key: "A3",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_IMPORTED_FILE,
      });
      const linkedFile = createMockItem({
        key: "A4",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_LINKED_FILE,
      });
      const note = createMockItem({ key: "N1", kind: "note" });
      const regular = createMockItem({ key: "R1", kind: "regular" });

      assert.isFalse(isLinkAttachment(importedFile));
      assert.isFalse(isLinkAttachment(linkedFile));
      assert.isFalse(isLinkAttachment(note));
      assert.isFalse(isLinkAttachment(regular));
    });
  });

  describe("toCandidate", function () {
    it("turns a snapshot into a candidate flagged as snapshot", function () {
      const item = createMockItem({
        key: "A1",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
        title: "超星电子书",
        url: "https://book.chaoxing.com/Reader/1",
        filePath: "/storage/A1/index.html",
      });

      assert.deepEqual(toCandidate(item, "论文一"), {
        itemKey: "A1",
        libraryID: 1,
        kind: "link-attachment",
        title: "超星电子书",
        parentTitle: "论文一",
        url: "https://book.chaoxing.com/Reader/1",
        path: "/storage/A1/index.html",
        snapshot: true,
      });
    });

    it("marks a web link as not a snapshot and falls back to the URL as title", function () {
      const item = createMockItem({
        key: "A2",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_LINKED_URL,
        url: "https://example.com/a",
        filePath: false,
      });

      const candidate = toCandidate(item, "论文一");
      assert.equal(candidate?.title, "https://example.com/a");
      assert.isFalse(candidate?.snapshot);
      assert.isUndefined(candidate?.path);
    });

    it("turns a note into a candidate with its body text", function () {
      const item = createMockItem({
        key: "N1",
        kind: "note",
        title: "阅读笔记",
        note: "第一行\n第二行",
      });

      assert.deepEqual(toCandidate(item, "论文一"), {
        itemKey: "N1",
        libraryID: 1,
        kind: "note",
        title: "阅读笔记",
        parentTitle: "论文一",
        noteText: "第一行\n第二行",
      });
    });

    it("falls back to the first non-empty note line when the title is empty", function () {
      const item = createMockItem({
        key: "N2",
        kind: "note",
        note: "\n\n  扫描版需要复核  \n其余内容",
      });

      assert.equal(toCandidate(item, "")?.title, "扫描版需要复核");
    });

    it("returns undefined for non-candidates", function () {
      assert.isUndefined(
        toCandidate(createMockItem({ key: "R1", kind: "regular" }), ""),
      );
      assert.isUndefined(
        toCandidate(
          createMockItem({
            key: "A3",
            kind: "attachment",
            linkMode: LINK_MODES.LINK_MODE_IMPORTED_FILE,
          }),
          "",
        ),
      );
    });
  });

  describe("collectCandidates", function () {
    it("collects direct child attachments and notes of a selected item", function () {
      const snapshot = registerItem(
        2,
        createMockItem({
          key: "A1",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
          title: "快照",
        }),
      );
      registerItem(
        3,
        createMockItem({
          key: "A3",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_FILE,
        }),
      );
      const note = registerItem(
        4,
        createMockItem({ key: "N1", kind: "note", title: "笔记" }),
      );
      const parent = createMockItem({
        key: "R1",
        kind: "regular",
        title: "论文一",
        attachments: [2, 3],
        notes: [4],
      });

      const candidates = collectCandidates([parent]);

      assert.deepEqual(
        candidates.map((candidate) => candidate.itemKey),
        ["A1", "N1"],
      );
      assert.equal(candidates[0].parentTitle, "论文一");
      assert.isTrue(candidates[0].snapshot);
      assert.equal(candidates[1].kind, "note");
      assert.equal(snapshot.key, "A1");
      assert.equal(note.key, "N1");
    });

    it("never includes the selected parent item itself", function () {
      const parent = createMockItem({
        key: "R1",
        kind: "regular",
        title: "论文一",
        attachments: [],
        notes: [],
      });

      assert.deepEqual(collectCandidates([parent]), []);
    });

    it("takes a directly selected attachment or note as the candidate", function () {
      const parent = registerItem(
        1,
        createMockItem({ key: "R1", kind: "regular", title: "论文一" }),
      );
      const note = registerItem(
        5,
        createMockItem({
          key: "N1",
          kind: "note",
          title: "笔记",
          parentItemID: 1,
        }),
      );

      const candidates = collectCandidates([note]);

      assert.lengthOf(candidates, 1);
      assert.equal(candidates[0].itemKey, "N1");
      assert.equal(candidates[0].parentTitle, "论文一");
      assert.equal(parent.key, "R1");
    });

    it("leaves the parent title empty for a standalone attachment", function () {
      const attachment = registerItem(
        6,
        createMockItem({
          key: "A9",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_LINKED_URL,
          title: "孤立链接",
        }),
      );

      assert.deepEqual(collectCandidates([attachment]), [
        {
          itemKey: "A9",
          libraryID: 1,
          kind: "link-attachment",
          title: "孤立链接",
          parentTitle: "",
          url: undefined,
          path: undefined,
          snapshot: false,
        },
      ]);
    });

    it("does not list the same child twice when its parent is selected too", function () {
      registerItem(
        7,
        createMockItem({
          key: "A1",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_LINKED_URL,
          title: "链接",
          parentItemID: 1,
        }),
      );
      const child = itemsByID.get(7)!;
      const parent = createMockItem({
        key: "R1",
        kind: "regular",
        title: "论文一",
        attachments: [7],
      });

      const candidates = collectCandidates([parent, child]);

      assert.lengthOf(candidates, 1);
      assert.equal(candidates[0].itemKey, "A1");
    });
  });

  describe("moveCandidatesToTrash", function () {
    it("marks every candidate as deleted and saves it", async function () {
      const item = registerItem(1, createMockItem({ key: "A1", kind: "note" }));

      const result = await moveCandidatesToTrash([candidateOf("A1")]);

      assert.isTrue(item.deleted);
      assert.lengthOf(result.succeeded, 1);
      assert.deepEqual(result.failed, []);
    });

    it("keeps going when one item fails to save", async function () {
      registerItem(1, createMockItem({ key: "A1", kind: "note" }));
      registerItem(
        2,
        createMockItem({
          key: "A2",
          kind: "note",
          saveError: new Error("save failed"),
        }),
      );

      const result = await moveCandidatesToTrash([
        candidateOf("A1"),
        candidateOf("A2"),
      ]);

      assert.deepEqual(
        result.succeeded.map((candidate) => candidate.itemKey),
        ["A1"],
      );
      assert.lengthOf(result.failed, 1);
      assert.equal(result.failed[0].candidate.itemKey, "A2");
      assert.match(result.failed[0].error.message, /save failed/);
    });

    it("reports a missing item as a failure without touching the others", async function () {
      registerItem(1, createMockItem({ key: "A1", kind: "note" }));

      const result = await moveCandidatesToTrash([
        candidateOf("A1"),
        candidateOf("GONE"),
      ]);

      assert.deepEqual(
        result.succeeded.map((candidate) => candidate.itemKey),
        ["A1"],
      );
      assert.match(result.failed[0].error.message, /未找到条目 GONE/);
    });

    it("matches the item by library as well as key", async function () {
      registerItem(
        1,
        createMockItem({ key: "A1", kind: "note", libraryID: 2 }),
      );

      const result = await moveCandidatesToTrash([candidateOf("A1", 1)]);

      assert.deepEqual(result.succeeded, []);
      assert.match(result.failed[0].error.message, /未找到条目 A1/);
    });
  });
});
