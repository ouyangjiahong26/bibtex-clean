import { assert } from "chai";
import {
  checkedAttachments,
  defaultTrashKeys,
  duplicateAttachmentKey,
  pickKeep,
  toDuplicateGroups,
  toggleCheckedKey,
  type DuplicateAttachment,
} from "../src/modules/duplicateGroups";

function fileAttachment(
  overrides: Partial<DuplicateAttachment> & { itemKey: string },
): DuplicateAttachment {
  return {
    libraryID: 1,
    kind: "file-attachment",
    title: overrides.itemKey,
    parentTitle: "论文一",
    parentKey: "1\x00PARENT1",
    filename: "paper.pdf",
    dateAdded: "2024-01-01 00:00:00",
    annotationCount: 0,
    ...overrides,
  };
}

function linkAttachment(
  overrides: Partial<DuplicateAttachment> & { itemKey: string },
): DuplicateAttachment {
  return {
    libraryID: 1,
    kind: "link-attachment",
    title: overrides.itemKey,
    parentTitle: "论文一",
    parentKey: "1\x00PARENT1",
    url: "https://example.com/paper",
    dateAdded: "2024-01-01 00:00:00",
    annotationCount: 0,
    ...overrides,
  };
}

describe("duplicateGroups", function () {
  describe("toDuplicateGroups", function () {
    it("groups file attachments sharing a filename case-insensitively", function () {
      const groups = toDuplicateGroups([
        fileAttachment({ itemKey: "A1", filename: "Paper.PDF" }),
        fileAttachment({ itemKey: "A2", filename: "paper.pdf" }),
      ]);

      assert.lengthOf(groups, 1);
      assert.deepEqual(
        groups[0].members.map((member) => member.itemKey).sort(),
        ["A1", "A2"],
      );
    });

    it("keeps attachments with different filenames in separate groups or none", function () {
      const groups = toDuplicateGroups([
        fileAttachment({ itemKey: "A1", filename: "paper.pdf" }),
        fileAttachment({ itemKey: "A2", filename: "supplement.pdf" }),
      ]);

      assert.lengthOf(groups, 0, "不同文件名单独成组，成员不足 2 不算重复");
    });

    it("groups link attachments by exact URL but not across kinds", function () {
      const url = "https://example.com/paper";
      const groups = toDuplicateGroups([
        linkAttachment({ itemKey: "L1", url }),
        linkAttachment({ itemKey: "L2", url }),
        fileAttachment({ itemKey: "F1", filename: url }),
      ]);

      assert.lengthOf(groups, 1);
      assert.equal(groups[0].groupKey, url);
      assert.deepEqual(
        groups[0].members.map((member) => member.itemKey).sort(),
        ["L1", "L2"],
        "文件名恰好等于 URL 时不与链接附件混组",
      );
    });

    it("does not treat differently-cased URLs as duplicates", function () {
      const groups = toDuplicateGroups([
        linkAttachment({ itemKey: "L1", url: "https://example.com/Page" }),
        linkAttachment({ itemKey: "L2", url: "https://example.com/page" }),
      ]);

      assert.lengthOf(groups, 0);
    });

    it("drops attachments without a filename or URL", function () {
      const groups = toDuplicateGroups([
        fileAttachment({ itemKey: "F1", filename: undefined }),
        fileAttachment({ itemKey: "F2", filename: "  " }),
        linkAttachment({ itemKey: "L1", url: undefined }),
        linkAttachment({ itemKey: "L2", url: "" }),
      ]);

      assert.lengthOf(groups, 0);
    });

    it("keeps groups within the same parent item separate from other parents", function () {
      const groups = toDuplicateGroups([
        fileAttachment({
          itemKey: "A1",
          parentTitle: "论文一",
          parentKey: "1\x00P1",
        }),
        fileAttachment({
          itemKey: "A2",
          parentTitle: "论文一",
          parentKey: "1\x00P1",
        }),
        fileAttachment({
          itemKey: "B1",
          parentTitle: "论文二",
          parentKey: "1\x00P2",
        }),
        fileAttachment({
          itemKey: "B2",
          parentTitle: "论文二",
          parentKey: "1\x00P2",
        }),
      ]);

      assert.lengthOf(groups, 2);
      assert.deepEqual(
        groups.map((group) => group.members[0].parentTitle),
        ["论文一", "论文二"],
      );
    });

    it("sorts groups by parent title then group key, keeper first inside", function () {
      const groups = toDuplicateGroups([
        fileAttachment({
          itemKey: "LATE",
          parentTitle: "论文一",
          filename: "b.pdf",
          dateAdded: "2024-06-01 00:00:00",
        }),
        fileAttachment({
          itemKey: "EARLY",
          parentTitle: "论文一",
          filename: "b.pdf",
          dateAdded: "2024-01-01 00:00:00",
        }),
        fileAttachment({
          itemKey: "P1",
          parentTitle: "论文一",
          filename: "a.pdf",
          dateAdded: "2024-02-01 00:00:00",
        }),
        fileAttachment({
          itemKey: "P2",
          parentTitle: "论文一",
          filename: "a.pdf",
          dateAdded: "2024-03-01 00:00:00",
        }),
      ]);

      assert.deepEqual(
        groups.map((group) => group.groupKey),
        ["a.pdf", "b.pdf"],
      );
      assert.deepEqual(
        groups[1].members.map((member) => member.itemKey),
        ["EARLY", "LATE"],
        "保留者排最前，其余按添加时间升序",
      );
    });
  });

  describe("pickKeep", function () {
    it("prefers the member with the most annotations", function () {
      const keep = pickKeep([
        fileAttachment({ itemKey: "PLAIN", dateAdded: "2024-01-01 00:00:00" }),
        fileAttachment({
          itemKey: "ANNOTATED",
          dateAdded: "2024-06-01 00:00:00",
          annotationCount: 3,
        }),
      ]);

      assert.equal(keep.itemKey, "ANNOTATED");
    });

    it("breaks annotation ties by earliest dateAdded", function () {
      const keep = pickKeep([
        fileAttachment({
          itemKey: "BOTH-LATE",
          dateAdded: "2024-06-01 00:00:00",
          annotationCount: 2,
        }),
        fileAttachment({
          itemKey: "BOTH-EARLY",
          dateAdded: "2024-01-01 00:00:00",
          annotationCount: 2,
        }),
      ]);

      assert.equal(keep.itemKey, "BOTH-EARLY");
    });

    it("falls back to the earliest member when none has annotations", function () {
      const keep = pickKeep([
        fileAttachment({ itemKey: "NEW", dateAdded: "2024-06-01 00:00:00" }),
        fileAttachment({ itemKey: "OLD", dateAdded: "2024-01-01 00:00:00" }),
      ]);

      assert.equal(keep.itemKey, "OLD");
    });
  });

  describe("defaultTrashKeys 与勾选", function () {
    // describe 块里不允许做函数调用 setup，用例内各自构造
    function makeGroups() {
      return toDuplicateGroups([
        fileAttachment({
          itemKey: "KEEP",
          filename: "paper.pdf",
          dateAdded: "2024-01-01 00:00:00",
        }),
        fileAttachment({
          itemKey: "DROP",
          filename: "paper.pdf",
          dateAdded: "2024-06-01 00:00:00",
        }),
      ]);
    }

    it("checks every member except the keeper by default", function () {
      const groups = makeGroups();
      assert.deepEqual(defaultTrashKeys(groups), [
        duplicateAttachmentKey(
          groups[0].members.find((m) => m.itemKey === "DROP")!,
        ),
      ]);
    });

    it("toggles a key in and out", function () {
      const key = defaultTrashKeys(makeGroups())[0];
      assert.deepEqual(toggleCheckedKey([key], key), []);
      assert.deepEqual(toggleCheckedKey([], key), [key]);
    });

    it("returns checked attachments in group order", function () {
      const checked = checkedAttachments(
        makeGroups(),
        defaultTrashKeys(makeGroups()),
      );

      assert.deepEqual(
        checked.map((attachment) => attachment.itemKey),
        ["DROP"],
      );
    });

    it("may delete the keeper too when the user checks the whole group", function () {
      const groups = makeGroups();
      const allKeys = groups[0].members.map(duplicateAttachmentKey);
      const checked = checkedAttachments(groups, allKeys);

      assert.deepEqual(checked.map((attachment) => attachment.itemKey).sort(), [
        "DROP",
        "KEEP",
      ]);
    });
  });
});
