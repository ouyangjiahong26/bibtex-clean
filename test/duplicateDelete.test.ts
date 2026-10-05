import { assert } from "chai";
import {
  duplicateDeleteSelectedItems,
  type DeleteNotifierAdapter,
  type DuplicateCollectAdapter,
  type DeleteResult,
  type DuplicateDialogAdapter,
  type DuplicateDeleteWriterAdapter,
  type ScanProgressAdapter,
  type ScanProgressHandle,
} from "../src/modules/duplicateDelete";
import type { Trashable } from "../src/modules/filterDelete";
import type {
  DuplicateAttachment,
  DuplicateGroup,
} from "../src/modules/duplicateGroups";
import type { Locale } from "../src/utils/locale";

/** 回显 key 与参数，便于断言通知文案里的计数。 */
const locale = {
  getString: (key: string, options?: { args?: Record<string, unknown> }) =>
    options?.args
      ? `${key}:${Object.entries(options.args)
          .map(([name, value]) => `${name}=${value}`)
          .join(",")}`
      : key,
} satisfies Locale;

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

const annotated = fileAttachment({
  itemKey: "KEEP",
  annotationCount: 3,
});
const plainDuplicate = fileAttachment({
  itemKey: "DROP",
  dateAdded: "2024-06-01 00:00:00",
});
const snapshotDuplicate: DuplicateAttachment = {
  itemKey: "SNAP",
  libraryID: 1,
  kind: "link-attachment",
  title: "网页快照",
  parentTitle: "论文一",
  url: "https://example.com/paper",
  dateAdded: "2024-06-01 00:00:00",
  annotationCount: 0,
  snapshot: true,
};

const group: DuplicateGroup = {
  groupKey: "paper.pdf",
  members: [annotated, plainDuplicate],
  keepKey: "1\x00KEEP",
};

class FakeNotifier implements DeleteNotifierAdapter {
  public infos: string[] = [];
  public errors: string[] = [];
  public deleteErrors: { candidate: { title: string }; error: Error }[][] = [];
  public successes: { text: string; detail?: string }[] = [];

  showInfo(text: string): void {
    this.infos.push(text);
  }

  showError(text: string): void {
    this.errors.push(text);
  }

  showDeleteSuccess(text: string, detail?: string): void {
    this.successes.push({ text, detail });
  }

  showDeleteErrorDetails(
    failed: { candidate: { title: string }; error: Error }[],
  ): void {
    this.deleteErrors.push(failed);
  }
}

/** 记录进度更新与关闭的假进度句柄。 */
class FakeScan implements ScanProgressHandle {
  public updates: [number, number][] = [];
  public closed = 0;

  update(processed: number, total: number): void {
    this.updates.push([processed, total]);
  }

  close(): void {
    this.closed += 1;
  }
}

function createHarness(options: {
  groups: DuplicateGroup[];
  chosen?: DuplicateAttachment[];
  result?: DeleteResult<DuplicateAttachment>;
  collectError?: Error;
}) {
  const notifier = new FakeNotifier();
  const dialogCalls: DuplicateGroup[][] = [];
  const deletedBatches: DuplicateAttachment[][] = [];
  const scan = new FakeScan();

  const collect: DuplicateCollectAdapter = {
    collectGroups: async (onProgress) => {
      if (options.collectError) {
        throw options.collectError;
      }
      onProgress?.(3, 5);
      return options.groups;
    },
  };
  const dialog: DuplicateDialogAdapter = {
    choose: async (all) => {
      dialogCalls.push(all);
      return options.chosen;
    },
  };
  const writer: DuplicateDeleteWriterAdapter = {
    moveToTrash: async <T extends Trashable>(chosen: T[]) => {
      deletedBatches.push(chosen as DuplicateAttachment[]);
      return (options.result ?? {
        succeeded: chosen,
        failed: [],
      }) as DeleteResult<T>;
    },
  };
  const progress: ScanProgressAdapter = { startScan: () => scan };

  return {
    notifier,
    dialogCalls,
    deletedBatches,
    scan,
    adapters: { collect, dialog, writer, notifier, progress },
  };
}

describe("duplicateDeleteSelectedItems", function () {
  it("没有重复项时告知用户，且不打开对话框", async function () {
    const harness = createHarness({ groups: [] });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.infos, ["message-no-duplicates"]);
    assert.deepEqual(harness.dialogCalls, []);
    assert.deepEqual(harness.deletedBatches, []);
  });

  it("用户取消时不删除任何条目", async function () {
    const harness = createHarness({ groups: [group] });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.lengthOf(harness.dialogCalls, 1);
    assert.deepEqual(harness.deletedBatches, []);
    assert.deepEqual(harness.notifier.successes, []);
    assert.deepEqual(harness.notifier.infos, []);
  });

  it("用户确认空选择时不删除任何条目", async function () {
    const harness = createHarness({ groups: [group], chosen: [] });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.deletedBatches, []);
    assert.deepEqual(harness.notifier.successes, []);
  });

  it("把分组传给对话框并删除所选附件", async function () {
    const harness = createHarness({
      groups: [group],
      chosen: [plainDuplicate],
    });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.dialogCalls[0], [group]);
    assert.deepEqual(harness.deletedBatches[0], [plainDuplicate]);
  });

  it("普通重复附件只报告删除数量，不附加说明", async function () {
    const harness = createHarness({
      groups: [group],
      chosen: [plainDuplicate],
    });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.successes, [
      {
        text: "message-success-duplicates-deleted:count=1",
        detail: undefined,
      },
    ]);
    assert.deepEqual(harness.notifier.deleteErrors, []);
  });

  it("删除的附件带批注时给出提醒", async function () {
    const harness = createHarness({
      groups: [group],
      chosen: [annotated, plainDuplicate],
    });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.successes, [
      {
        text: "message-success-duplicates-deleted:count=2",
        detail: "message-delete-annotations-note:count=3",
      },
    ]);
  });

  it("删除的附件包含快照时给出提醒", async function () {
    const harness = createHarness({
      groups: [group],
      chosen: [snapshotDuplicate],
    });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.successes, [
      {
        text: "message-success-duplicates-deleted:count=1",
        detail: "message-delete-snapshot-note",
      },
    ]);
  });

  it("合并批注与快照的附加说明", async function () {
    const harness = createHarness({
      groups: [group],
      chosen: [annotated, snapshotDuplicate],
    });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.equal(
      harness.notifier.successes[0].detail,
      "message-delete-annotations-note:count=3 message-delete-snapshot-note",
    );
  });

  it("分别报告失败与部分成功", async function () {
    const failed = {
      candidate: plainDuplicate,
      error: new Error("save failed"),
    };
    const harness = createHarness({
      groups: [group],
      chosen: [annotated, plainDuplicate],
      result: { succeeded: [annotated], failed: [failed] },
    });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.deleteErrors, [[failed]]);
    assert.deepEqual(harness.notifier.successes, [
      {
        text: "message-success-partial-delete",
        detail: "message-delete-annotations-note:count=3",
      },
    ]);
  });

  it("没有删除任何条目时只报告失败", async function () {
    const failed = {
      candidate: plainDuplicate,
      error: new Error("save failed"),
    };
    const harness = createHarness({
      groups: [group],
      chosen: [plainDuplicate],
      result: { succeeded: [], failed: [failed] },
    });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.deleteErrors, [[failed]]);
    assert.deepEqual(harness.notifier.successes, []);
    assert.deepEqual(harness.notifier.infos, []);
  });

  it("把扫描进度转发到进度句柄并关闭它", async function () {
    const harness = createHarness({ groups: [group], chosen: [] });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.scan.updates, [[3, 5]]);
    assert.equal(harness.scan.closed, 1);
  });

  it("关闭扫描并报告意外失败，而不是静默退出", async function () {
    const harness = createHarness({
      groups: [group],
      collectError: new Error(" Items.get blew up"),
    });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.equal(harness.scan.closed, 1);
    assert.deepEqual(harness.dialogCalls, []);
    assert.deepEqual(harness.notifier.errors, [
      "message-error-unexpected:message= Items.get blew up",
    ]);
  });
});
