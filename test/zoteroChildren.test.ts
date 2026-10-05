import { assert } from "chai";
import {
  collectCandidates,
  deleteConcurrency,
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
  contentType?: string;
  filePath?: string | false;
  note?: string;
  attachments?: number[];
  notes?: number[];
  parentItemID?: number | false;
  saveError?: Error;
  saveHook?: () => void | Promise<void>;
};

type MockItem = Zotero.Item & { deleted: boolean };

function createMockItem(options: MockItemOptions): MockItem {
  const item = {
    key: options.key,
    libraryID: options.libraryID ?? 1,
    parentItemID: options.parentItemID ?? false,
    attachmentLinkMode: options.linkMode ?? LINK_MODES.LINK_MODE_IMPORTED_FILE,
    attachmentContentType: options.contentType ?? "",
    deleted: false,
    isRegularItem: () => options.kind === "regular",
    isAttachment: () => options.kind === "attachment",
    isNote: () => options.kind === "note",
    isSnapshotAttachment: () =>
      options.linkMode === LINK_MODES.LINK_MODE_IMPORTED_URL &&
      options.contentType === "text/html",
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
      if (options.saveHook) {
        await options.saveHook();
      }
      if (options.saveError) throw options.saveError;
    },
    // 只实现被测代码用到的成员，其余成员由断言以外的地方承担
  } as unknown as MockItem;
  return item;
}

let itemsByID: Map<number, MockItem>;
let itemsByKey: Map<string, MockItem>;
let originalZotero: unknown;
let prefValue: unknown;

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
    prefValue = undefined;
    // 测试里替换 Zotero 全局。真实形状由 zotero-types 提供，此处只喂被调用的 API
    const runtimeGlobals = globalThis as unknown as Record<string, unknown>;
    originalZotero = runtimeGlobals.Zotero;
    runtimeGlobals.Zotero = {
      Attachments: LINK_MODES,
      Prefs: {
        get: (key: string) => {
          assert.equal(
            key,
            "extensions.zotero.bibtexclean.deleteConcurrency",
            "写入端只读这一个偏好键",
          );
          return prefValue;
        },
      },
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

  describe("isLinkAttachment 判定", function () {
    it("接受网页快照与网页链接", function () {
      const snapshot = createMockItem({
        key: "A1",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
        contentType: "text/html",
      });
      const webLink = createMockItem({
        key: "A2",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_LINKED_URL,
      });

      assert.isTrue(isLinkAttachment(snapshot));
      assert.isTrue(isLinkAttachment(webLink));
    });

    it("拒绝文件附件、笔记、普通条目", function () {
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

    it("拒绝带来源网址的存储文档（如全文 PDF）", function () {
      // 抓取器把带来源网址的下载文件存成 imported_url，contentType 是 PDF 等
      const fullTextPdf = createMockItem({
        key: "A5",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
        contentType: "application/pdf",
        title: "Full Text PDF",
      });

      assert.isFalse(isLinkAttachment(fullTextPdf));
    });
  });

  describe("toCandidate 转换", function () {
    it("把网页快照转成标记为快照的候选", function () {
      const item = createMockItem({
        key: "A1",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
        contentType: "text/html",
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

    it("把网页链接标记为非快照，标题回退为 URL", function () {
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

    it("把笔记连同正文转成候选", function () {
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

    it("标题为空时回退到笔记首个非空行", function () {
      const item = createMockItem({
        key: "N2",
        kind: "note",
        note: "\n\n  扫描版需要复核  \n其余内容",
      });

      assert.equal(toCandidate(item, "")?.title, "扫描版需要复核");
    });

    it("对非候选返回 undefined", function () {
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

    it("对带来源网址的全文 PDF 返回 undefined", function () {
      const fullTextPdf = createMockItem({
        key: "A5",
        kind: "attachment",
        linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
        contentType: "application/pdf",
        title: "Full Text PDF",
        url: "https://example.com/paper.pdf",
      });

      assert.isUndefined(toCandidate(fullTextPdf, "论文一"));
    });
  });

  describe("collectCandidates 收集", function () {
    it("收集所选条目的直接子附件与直接子笔记", function () {
      const snapshot = registerItem(
        2,
        createMockItem({
          key: "A1",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
          contentType: "text/html",
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

    it("排除带来源网址的全文 PDF，保留快照与笔记", function () {
      registerItem(
        2,
        createMockItem({
          key: "A1",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
          contentType: "application/pdf",
          title: "Full Text PDF",
        }),
      );
      registerItem(
        3,
        createMockItem({
          key: "A2",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
          contentType: "text/html",
          title: "快照",
        }),
      );
      registerItem(
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
        ["A2", "N1"],
      );
    });

    it("绝不包含所选父条目本身", function () {
      const parent = createMockItem({
        key: "R1",
        kind: "regular",
        title: "论文一",
        attachments: [],
        notes: [],
      });

      assert.deepEqual(collectCandidates([parent]), []);
    });

    it("把直接选中的附件或笔记作为候选", function () {
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

    it("独立附件的父标题留空", function () {
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

    it("父条目同时被选中时不重复列出同一子条目", function () {
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

  describe("deleteConcurrency 偏好值", function () {
    it("偏好未设置时用内置默认值", function () {
      assert.equal(deleteConcurrency(), 4);
    });

    it("偏好不是数字时用默认值", function () {
      prefValue = "many";
      assert.equal(deleteConcurrency(), 4);
    });

    it("把偏好值限制在 [1, 20] 区间", function () {
      prefValue = 0;
      assert.equal(deleteConcurrency(), 1);
      prefValue = -5;
      assert.equal(deleteConcurrency(), 1);
      prefValue = 2.7;
      assert.equal(deleteConcurrency(), 2);
      prefValue = 999;
      assert.equal(deleteConcurrency(), 20);
    });
  });

  describe("moveCandidatesToTrash 移入回收站", function () {
    function registerNotes(
      keys: string[],
      saveHook?: () => void | Promise<void>,
    ): void {
      keys.forEach((key, index) => {
        registerItem(
          index + 1,
          createMockItem({ key, kind: "note", saveHook }),
        );
      });
    }

    /**
     * 目标运行时是 firefox115（Gecko 115），`Promise.withResolvers`（Fx 119+）
     * 不可用，因此这里用 executor 形式建可控的 gate。
     */
    function createGate(): { promise: Promise<void>; release: () => void } {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promise, release };
    }

    /** 只推进微任务，不依赖真实时间。 */
    async function flushMicrotasks(times = 8): Promise<void> {
      for (let tick = 0; tick < times; tick += 1) {
        await Promise.resolve();
      }
    }

    it("最多同时删除配置数量的条目", async function () {
      prefValue = 2;
      const keys = ["A1", "A2", "A3", "A4"];
      const releases: Array<() => void> = [];
      let inFlight = 0;
      let maxInFlight = 0;
      registerNotes(keys, () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const gate = createGate();
        releases.push(() => {
          inFlight -= 1;
          gate.release();
        });
        return gate.promise;
      });

      const running = moveCandidatesToTrash(
        keys.map((key) => candidateOf(key)),
      );
      await flushMicrotasks();
      assert.equal(inFlight, 2, "第一批同时进行两次删除");

      while (releases.length > 0) {
        releases.shift()!();
        await flushMicrotasks();
      }
      const result = await running;

      assert.equal(maxInFlight, 2, "并发数不超过偏好设置");
      assert.deepEqual(
        result.succeeded.map((candidate) => candidate.itemKey),
        keys,
      );
      assert.deepEqual(result.failed, []);
    });

    it("偏好为 1 时逐个删除", async function () {
      prefValue = 1;
      const keys = ["A1", "A2", "A3"];
      const releases: Array<() => void> = [];
      registerNotes(keys, () => {
        const gate = createGate();
        releases.push(gate.release);
        return gate.promise;
      });

      const running = moveCandidatesToTrash(
        keys.map((key) => candidateOf(key)),
      );
      await flushMicrotasks();
      assert.equal(releases.length, 1, "同一时刻只有一次删除在等待");

      while (releases.length > 0) {
        releases.shift()!();
        await flushMicrotasks();
      }
      await running;

      assert.deepEqual(
        keys,
        ["A1", "A2", "A3"],
        "三个条目都被处理，只是没有重叠",
      );
    });

    it("批次中一项失败时继续处理批次", async function () {
      prefValue = 2;
      registerItem(1, createMockItem({ key: "A1", kind: "note" }));
      registerItem(
        2,
        createMockItem({
          key: "A2",
          kind: "note",
          saveError: new Error("save failed"),
        }),
      );
      registerItem(3, createMockItem({ key: "A3", kind: "note" }));

      const result = await moveCandidatesToTrash(
        ["A1", "A2", "A3"].map((key) => candidateOf(key)),
      );

      assert.deepEqual(
        result.succeeded.map((candidate) => candidate.itemKey),
        ["A1", "A3"],
      );
      assert.deepEqual(
        result.failed.map(({ candidate }) => candidate.itemKey),
        ["A2"],
      );
      assert.match(result.failed[0].error.message, /save failed/);
    });

    it("把每个候选标记为删除并保存", async function () {
      const item = registerItem(1, createMockItem({ key: "A1", kind: "note" }));

      const result = await moveCandidatesToTrash([candidateOf("A1")]);

      assert.isTrue(item.deleted);
      assert.lengthOf(result.succeeded, 1);
      assert.deepEqual(result.failed, []);
    });

    it("一项保存失败时继续处理", async function () {
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

    it("把缺失条目报告为失败，不影响其余条目", async function () {
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

    it("按库和键共同匹配条目", async function () {
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
