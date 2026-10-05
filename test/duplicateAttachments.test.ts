import { assert } from "chai";
import {
  collectDuplicateGroups,
  toDuplicateAttachment,
} from "../src/modules/duplicateAttachments";

// Zotero 运行时 mock，使重复附件收集可在 Node 中测试
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
  filename?: string;
  dateAdded?: string;
  annotationCount?: number;
  /** 复现 Zotero 的行为：numAnnotations() 对非文件附件抛错。 */
  numAnnotationsThrows?: boolean;
  attachments?: number[];
};

type MockItem = Zotero.Item & {
  attachmentFilename: string | undefined;
  dateAdded: string;
};

function createMockItem(options: MockItemOptions): MockItem {
  const item = {
    key: options.key,
    libraryID: options.libraryID ?? 1,
    parentItemID: false,
    attachmentLinkMode: options.linkMode ?? LINK_MODES.LINK_MODE_IMPORTED_FILE,
    attachmentContentType: options.contentType ?? "",
    attachmentFilename: options.filename,
    dateAdded: options.dateAdded ?? "2024-01-01 00:00:00",
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
    getAttachments: () => options.attachments ?? [],
    numAnnotations: () => {
      if (options.numAnnotationsThrows) {
        throw new Error(
          "numAnnotations() can only be called on file attachments",
        );
      }
      return options.annotationCount ?? 0;
    },
  } as unknown as MockItem;
  return item;
}

let itemsByID: Map<number, MockItem>;
let originalZotero: unknown;

function registerItem(id: number, item: MockItem): MockItem {
  itemsByID.set(id, item);
  return item;
}

describe("duplicateAttachments", function () {
  beforeEach(function () {
    itemsByID = new Map();
    const runtimeGlobals = globalThis as unknown as Record<string, unknown>;
    originalZotero = runtimeGlobals.Zotero;
    runtimeGlobals.Zotero = {
      Attachments: LINK_MODES,
      Items: {
        get: (id: number) => itemsByID.get(id),
      },
    };
  });

  afterEach(function () {
    const runtimeGlobals = globalThis as unknown as Record<string, unknown>;
    runtimeGlobals.Zotero = originalZotero;
  });

  describe("toDuplicateAttachment 转换", function () {
    it("读取导入与链接文件附件的文件名和批注数", function () {
      const imported = toDuplicateAttachment(
        createMockItem({
          key: "F1",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_FILE,
          title: "全文 PDF",
          filename: "paper.pdf",
          dateAdded: "2024-05-01 08:00:00",
          annotationCount: 4,
        }),
        "论文一",
        "1\x00P1",
      );
      const linked = toDuplicateAttachment(
        createMockItem({
          key: "F2",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_LINKED_FILE,
          filename: "data.csv",
        }),
        "论文一",
        "1\x00P1",
      );

      assert.deepEqual(imported, {
        itemKey: "F1",
        libraryID: 1,
        kind: "file-attachment",
        title: "全文 PDF",
        parentTitle: "论文一",
        parentKey: "1\x00P1",
        filename: "paper.pdf",
        dateAdded: "2024-05-01 08:00:00",
        annotationCount: 4,
      });
      assert.equal(linked?.kind, "file-attachment");
      // 文件附件缺文件名时不参与判定
      assert.isUndefined(
        toDuplicateAttachment(
          createMockItem({
            key: "F3",
            kind: "attachment",
            linkMode: LINK_MODES.LINK_MODE_IMPORTED_FILE,
            filename: "  ",
          }),
          "论文一",
          "1\x00P1",
        ),
      );
    });

    it("读取链接附件的 URL 与快照标记", function () {
      // Zotero 的 numAnnotations() 对非文件附件抛错：链接附件路径绝不能碰它
      const snapshot = toDuplicateAttachment(
        createMockItem({
          key: "S1",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
          contentType: "text/html",
          url: "https://example.com/page",
          numAnnotationsThrows: true,
        }),
        "论文一",
        "1\x00P1",
      );
      const link = toDuplicateAttachment(
        createMockItem({
          key: "S2",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_LINKED_URL,
          url: "https://example.com/other",
          numAnnotationsThrows: true,
        }),
        "论文一",
        "1\x00P1",
      );

      assert.equal(snapshot?.kind, "link-attachment");
      assert.isTrue(snapshot?.snapshot);
      assert.equal(snapshot?.annotationCount, 0);
      assert.isFalse(link?.snapshot);
      assert.equal(
        link?.title,
        "https://example.com/other",
        "缺标题时退回 URL",
      );
      // 链接附件缺 URL 时不参与判定
      assert.isUndefined(
        toDuplicateAttachment(
          createMockItem({
            key: "S3",
            kind: "attachment",
            linkMode: LINK_MODES.LINK_MODE_LINKED_URL,
          }),
          "论文一",
          "1\x00P1",
        ),
      );
    });

    it("把带来源网址存储的全文 PDF 当作文件附件", function () {
      // 抓取器保存的 PDF 全文是 imported_url 但非网页快照：按文件附件判重，
      // numAnnotations() 生效
      const fullTextPdf = toDuplicateAttachment(
        createMockItem({
          key: "P1",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
          contentType: "application/pdf",
          filename: "paper.pdf",
          annotationCount: 3,
        }),
        "论文一",
        "1\x00P1",
      );

      assert.equal(fullTextPdf?.kind, "file-attachment");
      assert.equal(fullTextPdf?.filename, "paper.pdf");
      assert.equal(fullTextPdf?.annotationCount, 3);
    });

    it("拒绝笔记与普通条目", function () {
      assert.isUndefined(
        toDuplicateAttachment(
          createMockItem({ key: "N1", kind: "note" }),
          "论文一",
          "1\x00P1",
        ),
      );
      assert.isUndefined(
        toDuplicateAttachment(
          createMockItem({ key: "R1", kind: "regular" }),
          "论文一",
          "1\x00P1",
        ),
      );
    });
  });

  describe("collectDuplicateGroups 收集分组", function () {
    it("对同一父条目下的重复分组并保留带批注的副本", async function () {
      const keep = registerItem(
        1,
        createMockItem({
          key: "KEEP",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_FILE,
          title: "带批注的副本",
          filename: "paper.pdf",
          dateAdded: "2024-06-01 00:00:00",
          annotationCount: 5,
        }),
      );
      registerItem(
        2,
        createMockItem({
          key: "DROP",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_FILE,
          title: "合并带来的副本",
          filename: "paper.pdf",
          dateAdded: "2024-01-01 00:00:00",
        }),
      );
      const parent = createMockItem({
        key: "P1",
        kind: "regular",
        title: "论文一",
        attachments: [1, 2],
      });

      const groups = await collectDuplicateGroups([parent], {
        wait: async () => {},
      });

      assert.lengthOf(groups, 1);
      assert.equal(groups[0].groupKey, "paper.pdf");
      assert.equal(groups[0].members[0].itemKey, keep.key);
      assert.equal(groups[0].keepKey, "1\x00KEEP");
    });

    it("在同一父条目内按文件名对带来源网址的全文 PDF 分组", async function () {
      const keep = registerItem(
        1,
        createMockItem({
          key: "KEEP",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
          contentType: "application/pdf",
          title: "带批注的全文",
          filename: "paper.pdf",
          dateAdded: "2024-06-01 00:00:00",
          annotationCount: 5,
        }),
      );
      registerItem(
        2,
        createMockItem({
          key: "DROP",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
          contentType: "application/pdf",
          title: "合并带来的全文",
          filename: "paper.pdf",
          dateAdded: "2024-01-01 00:00:00",
        }),
      );
      const parent = createMockItem({
        key: "P1",
        kind: "regular",
        title: "论文一",
        attachments: [1, 2],
      });

      const groups = await collectDuplicateGroups([parent], {
        wait: async () => {},
      });

      assert.lengthOf(groups, 1);
      assert.equal(groups[0].groupKey, "paper.pdf");
      assert.equal(groups[0].members[0].itemKey, keep.key);
      assert.equal(groups[0].keepKey, "1\x00KEEP");
    });

    it("不把不同父条目下的同名附件分组", async function () {
      registerItem(
        1,
        createMockItem({
          key: "A1",
          kind: "attachment",
          filename: "paper.pdf",
        }),
      );
      registerItem(
        2,
        createMockItem({
          key: "B1",
          kind: "attachment",
          filename: "paper.pdf",
        }),
      );
      const parents = [
        createMockItem({
          key: "P1",
          kind: "regular",
          attachments: [1],
        }),
        createMockItem({
          key: "P2",
          kind: "regular",
          attachments: [2],
        }),
      ];

      assert.lengthOf(
        await collectDuplicateGroups(parents, { wait: async () => {} }),
        0,
      );
    });

    it("在同一父条目内按 URL 对重复链接附件分组", async function () {
      registerItem(
        1,
        createMockItem({
          key: "S1",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_URL,
          contentType: "text/html",
          url: "https://example.com/page",
          numAnnotationsThrows: true,
        }),
      );
      registerItem(
        2,
        createMockItem({
          key: "S2",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_LINKED_URL,
          url: "https://example.com/page",
          numAnnotationsThrows: true,
        }),
      );
      const parent = createMockItem({
        key: "P1",
        kind: "regular",
        attachments: [1, 2],
      });

      const groups = await collectDuplicateGroups([parent], {
        wait: async () => {},
      });

      assert.lengthOf(groups, 1);
      assert.equal(groups[0].members[0].kind, "link-attachment");
    });

    it("忽略非普通条目的选中项与无分组键的附件", async function () {
      registerItem(
        1,
        createMockItem({
          key: "F1",
          kind: "attachment",
          linkMode: LINK_MODES.LINK_MODE_IMPORTED_FILE,
        }),
      );
      const parent = createMockItem({
        key: "P1",
        kind: "regular",
        attachments: [1],
      });
      const strayAttachment = createMockItem({
        key: "X1",
        kind: "attachment",
        filename: "paper.pdf",
      });

      assert.lengthOf(
        await collectDuplicateGroups([parent, strayAttachment], {
          wait: async () => {},
        }),
        0,
      );
    });

    it("每 50 个条目汇报进度并让出给界面", async function () {
      const items = Array.from({ length: 120 }, (_value, index) =>
        createMockItem({ key: `P${index}`, kind: "regular" }),
      );
      const progress: [number, number][] = [];
      let waits = 0;

      const groups = await collectDuplicateGroups(items, {
        onProgress: (done, total) => progress.push([done, total]),
        wait: async () => {
          waits += 1;
        },
      });

      assert.lengthOf(groups, 0);
      assert.deepEqual(progress, [
        [50, 120],
        [100, 120],
        [120, 120],
      ]);
      assert.equal(waits, 2, "每 50 个条目让出一次，结束回调不再让出");
    });
  });
});
