import { assert } from "chai";
import {
  filterDeleteSelectedItems,
  type CandidateAdapter,
  type DeleteAdapter,
  type DeleteResult,
  type DeleteNotifierAdapter,
  type FilterDialogAdapter,
} from "../src/modules/filterDelete";
import type { Candidate } from "../src/modules/filterCandidates";
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

const snapshot: Candidate = {
  itemKey: "ATT1",
  libraryID: 1,
  kind: "link-attachment",
  title: "超星电子书",
  parentTitle: "论文一",
  snapshot: true,
};

const plainLink: Candidate = {
  itemKey: "ATT2",
  libraryID: 1,
  kind: "link-attachment",
  title: "出版社页面",
  parentTitle: "论文一",
};

const note: Candidate = {
  itemKey: "NOTE1",
  libraryID: 1,
  kind: "note",
  title: "阅读笔记",
  parentTitle: "论文一",
};

class FakeNotifier implements DeleteNotifierAdapter {
  public infos: string[] = [];
  public successes: { text: string; detail?: string }[] = [];
  public errors: { candidate: Candidate; error: Error }[][] = [];

  showInfo(text: string): void {
    this.infos.push(text);
  }

  showDeleteSuccess(text: string, detail?: string): void {
    this.successes.push({ text, detail });
  }

  showDeleteErrorDetails(
    failed: { candidate: Candidate; error: Error }[],
  ): void {
    this.errors.push(failed);
  }
}

function createHarness(options: {
  candidates: Candidate[];
  chosen?: Candidate[];
  result?: DeleteResult;
}) {
  const notifier = new FakeNotifier();
  const dialogCalls: Candidate[][] = [];
  const deletedBatches: Candidate[][] = [];

  const candidates: CandidateAdapter = {
    collectCandidates: async () => options.candidates,
  };
  const dialog: FilterDialogAdapter = {
    choose: async (all) => {
      dialogCalls.push(all);
      return options.chosen;
    },
  };
  const writer: DeleteAdapter = {
    moveToTrash: async (chosen) => {
      deletedBatches.push(chosen);
      return options.result ?? { succeeded: chosen, failed: [] };
    },
  };

  return {
    notifier,
    dialogCalls,
    deletedBatches,
    adapters: { candidates, dialog, writer, notifier },
  };
}

describe("filterDeleteSelectedItems", function () {
  it("tells the user when nothing is selectable, without opening a dialog", async function () {
    const harness = createHarness({ candidates: [] });

    await filterDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.infos, ["message-no-candidates"]);
    assert.deepEqual(harness.dialogCalls, []);
    assert.deepEqual(harness.deletedBatches, []);
  });

  it("deletes nothing when the user cancels", async function () {
    const harness = createHarness({ candidates: [snapshot, note] });

    await filterDeleteSelectedItems(harness.adapters, locale);

    assert.lengthOf(harness.dialogCalls, 1);
    assert.deepEqual(harness.deletedBatches, []);
    assert.deepEqual(harness.notifier.successes, []);
    assert.deepEqual(harness.notifier.infos, []);
  });

  it("deletes nothing when the user confirms an empty selection", async function () {
    const harness = createHarness({ candidates: [snapshot, note], chosen: [] });

    await filterDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.deletedBatches, []);
    assert.deepEqual(harness.notifier.successes, []);
  });

  it("passes the whole candidate set to the dialog", async function () {
    const all = [snapshot, plainLink, note];
    const harness = createHarness({ candidates: all, chosen: [note] });

    await filterDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.dialogCalls[0], all);
    assert.deepEqual(harness.deletedBatches[0], [note]);
  });

  it("reports the deleted count and note count", async function () {
    const harness = createHarness({
      candidates: [plainLink, note],
      chosen: [plainLink, note],
    });

    await filterDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.successes, [
      {
        text: "message-success-deleted-with-notes:count=2,notes=1",
        detail: undefined,
      },
    ]);
    assert.deepEqual(harness.notifier.errors, []);
  });

  it("omits the note count when no note was deleted", async function () {
    const harness = createHarness({
      candidates: [plainLink],
      chosen: [plainLink],
    });

    await filterDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.successes, [
      { text: "message-success-deleted:count=1,notes=0", detail: undefined },
    ]);
  });

  it("explains that snapshot files stay on disk", async function () {
    const harness = createHarness({
      candidates: [snapshot],
      chosen: [snapshot],
    });

    await filterDeleteSelectedItems(harness.adapters, locale);

    assert.equal(
      harness.notifier.successes[0].detail,
      "message-delete-snapshot-note",
    );
  });

  it("reports failures and the partial success separately", async function () {
    const failed = { candidate: note, error: new Error("save failed") };
    const harness = createHarness({
      candidates: [snapshot, note],
      chosen: [snapshot, note],
      result: { succeeded: [snapshot], failed: [failed] },
    });

    await filterDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.errors, [[failed]]);
    assert.deepEqual(harness.notifier.successes, [
      {
        text: "message-success-partial-delete",
        detail: "message-delete-snapshot-note",
      },
    ]);
  });

  it("reports only the failures when nothing was deleted", async function () {
    const failed = { candidate: note, error: new Error("save failed") };
    const harness = createHarness({
      candidates: [note],
      chosen: [note],
      result: { succeeded: [], failed: [failed] },
    });

    await filterDeleteSelectedItems(harness.adapters, locale);

    assert.deepEqual(harness.notifier.errors, [[failed]]);
    assert.deepEqual(harness.notifier.successes, []);
    assert.deepEqual(harness.notifier.infos, []);
  });
});
