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
  it("tells the user when there is no duplicate, without opening a dialog", async function () {
    const harness = createHarness({ groups: [] });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.infos, ["message-no-duplicates"]);
    assert.deepEqual(harness.dialogCalls, []);
    assert.deepEqual(harness.deletedBatches, []);
  });

  it("deletes nothing when the user cancels", async function () {
    const harness = createHarness({ groups: [group] });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.lengthOf(harness.dialogCalls, 1);
    assert.deepEqual(harness.deletedBatches, []);
    assert.deepEqual(harness.notifier.successes, []);
    assert.deepEqual(harness.notifier.infos, []);
  });

  it("deletes nothing when the user confirms an empty selection", async function () {
    const harness = createHarness({ groups: [group], chosen: [] });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.deletedBatches, []);
    assert.deepEqual(harness.notifier.successes, []);
  });

  it("passes the groups to the dialog and deletes the chosen attachments", async function () {
    const harness = createHarness({
      groups: [group],
      chosen: [plainDuplicate],
    });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.dialogCalls[0], [group]);
    assert.deepEqual(harness.deletedBatches[0], [plainDuplicate]);
  });

  it("reports the deleted count without extra detail for plain duplicates", async function () {
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

  it("warns when the deleted attachments carry annotations", async function () {
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

  it("warns when the deleted attachments include snapshots", async function () {
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

  it("combines the annotation and snapshot details", async function () {
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

  it("reports failures and the partial success separately", async function () {
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

  it("reports only the failures when nothing was deleted", async function () {
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

  it("forwards scan progress to the progress handle and closes it", async function () {
    const harness = createHarness({ groups: [group], chosen: [] });

    await duplicateDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.scan.updates, [[3, 5]]);
    assert.equal(harness.scan.closed, 1);
  });

  it("closes the scan and reports an unexpected failure instead of dying silently", async function () {
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
