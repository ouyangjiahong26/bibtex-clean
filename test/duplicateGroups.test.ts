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
    it("文件名相同的文件附件忽略大小写归为一组", function () {
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

    it("文件名不同的附件不混入同一组", function () {
      const groups = toDuplicateGroups([
        fileAttachment({ itemKey: "A1", filename: "paper.pdf" }),
        fileAttachment({ itemKey: "A2", filename: "supplement.pdf" }),
      ]);

      assert.lengthOf(groups, 0, "不同文件名单独成组，成员不足 2 不算重复");
    });

    it("链接附件按完全相同的 URL 分组，且不跨类型混组", function () {
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

    it("大小写不同的 URL 不视为重复", function () {
      const groups = toDuplicateGroups([
        linkAttachment({ itemKey: "L1", url: "https://example.com/Page" }),
        linkAttachment({ itemKey: "L2", url: "https://example.com/page" }),
      ]);

      assert.lengthOf(groups, 0);
    });

    it("丢弃没有文件名或 URL 的附件", function () {
      const groups = toDuplicateGroups([
        fileAttachment({ itemKey: "F1", filename: undefined }),
        fileAttachment({ itemKey: "F2", filename: "  " }),
        linkAttachment({ itemKey: "L1", url: undefined }),
        linkAttachment({ itemKey: "L2", url: "" }),
      ]);

      assert.lengthOf(groups, 0);
    });

    it("同一父条目内的分组与其他父条目分开", function () {
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

    it("分组先按父条目标题再按 groupKey 排序，组内保留者排最前", function () {
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
    it("优先选择批注数最多的成员", function () {
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

    it("批注数相同时按最早的 dateAdded 决出", function () {
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

    it("都没有批注时回退到最早的成员", function () {
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

    it("默认勾选保留者以外的全部成员", function () {
      const groups = makeGroups();
      assert.deepEqual(defaultTrashKeys(groups), [
        duplicateAttachmentKey(
          groups[0].members.find((m) => m.itemKey === "DROP")!,
        ),
      ]);
    });

    it("切换某键的勾选状态", function () {
      const key = defaultTrashKeys(makeGroups())[0];
      assert.deepEqual(toggleCheckedKey([key], key), []);
      assert.deepEqual(toggleCheckedKey([], key), [key]);
    });

    it("按分组顺序返回勾选的附件", function () {
      const checked = checkedAttachments(
        makeGroups(),
        defaultTrashKeys(makeGroups()),
      );

      assert.deepEqual(
        checked.map((attachment) => attachment.itemKey),
        ["DROP"],
      );
    });

    it("用户勾选整组时也可以删除保留者", function () {
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
