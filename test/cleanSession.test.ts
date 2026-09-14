import { assert } from "chai";
import type {
  Change,
  CleanableItem,
  FieldChange,
} from "../src/modules/changes";
import {
  CleanWorkflow,
  cleanSelectedItems,
  undoLastCleanOperation,
  type CleanWorkflowAdapters,
  type UndoAdapters,
} from "../src/modules/cleanSession";
import { CleanSessionStore } from "../src/modules/cleanSessionStore";
import type { Locale } from "../src/utils/locale";

type NotifierCall =
  | { method: "showInfo"; text: string }
  | { method: "showSuccess"; text: string }
  | { method: "showErrorDetails"; failed: { change: Change; error: Error }[] }
  | { method: "showUndoableSuccess"; text: string; onUndo: () => void };

function createFakeAdapters() {
  const dialogCalls: { changes: Change[]; totalItemCount: number }[] = [];
  const writerCalls: { type: "apply" | "undo"; changes: FieldChange[] }[] = [];
  const notifierCalls: NotifierCall[] = [];

  let dialogResult = true;
  let applyResult: {
    succeeded: FieldChange[];
    failed: { change: FieldChange; error: Error }[];
  } = { succeeded: [], failed: [] };
  let undoResult: {
    succeeded: FieldChange[];
    failed: { change: FieldChange; error: Error }[];
  } = { succeeded: [], failed: [] };

  const adapters: CleanWorkflowAdapters = {
    dialog: {
      confirm: async (changes, totalItemCount) => {
        dialogCalls.push({ changes, totalItemCount });
        return dialogResult;
      },
    },
    writer: {
      toCleanableItem: (item: any) => {
        if (item.isRegularItem === false) {
          return undefined;
        }
        return {
          key: item.key,
          libraryID: 1,
          title: item.title,
          author: item.author,
          issue: item.issue,
        } as CleanableItem;
      },
      applyChanges: async (changes) => {
        writerCalls.push({ type: "apply", changes });
        return {
          succeeded:
            applyResult.succeeded.length > 0 ? applyResult.succeeded : changes,
          failed: applyResult.failed,
        };
      },
      undoChanges: async (changes) => {
        writerCalls.push({ type: "undo", changes });
        return {
          succeeded:
            undoResult.succeeded.length > 0 ? undoResult.succeeded : changes,
          failed: undoResult.failed,
        };
      },
    },
    notifier: {
      showInfo: (text: string) =>
        notifierCalls.push({ method: "showInfo", text }),
      showSuccess: (text: string) =>
        notifierCalls.push({ method: "showSuccess", text }),
      showErrorDetails: (failed: { change: Change; error: Error }[]) =>
        notifierCalls.push({ method: "showErrorDetails", failed }),
      showUndoableSuccess: (text: string, onUndo: () => void) =>
        notifierCalls.push({ method: "showUndoableSuccess", text, onUndo }),
    },
  };

  return {
    adapters,
    dialogCalls,
    writerCalls,
    notifierCalls,
    setDialogResult(value: boolean) {
      dialogResult = value;
    },
    setApplyResult(result: {
      succeeded: FieldChange[];
      failed: { change: FieldChange; error: Error }[];
    }) {
      applyResult = result;
    },
    setUndoResult(result: {
      succeeded: FieldChange[];
      failed: { change: FieldChange; error: Error }[];
    }) {
      undoResult = result;
    },
  };
}

function createCleanable(
  key: string,
  title: string,
  author?: string,
  issue?: string,
): CleanableItem {
  return { key, libraryID: 1, title, author, issue };
}

function asZoteroItems(items: CleanableItem[]): Zotero.Item[] {
  return items as unknown as Zotero.Item[];
}

describe("cleanSession", function () {
  describe("CleanWorkflow state machine (isolated)", function () {
    const fakeLocale = { getString: (key: string) => `MOCK[${key}]` };

    it("starts in Idle state", function () {
      const workflow = CleanWorkflow.fromIdle();
      assert.equal(workflow.state.kind, "Idle");
    });

    it("Idle -> ItemsSelected when items are selected", function () {
      const items = asZoteroItems([createCleanable("A1", "Paper One")]);
      const workflow = CleanWorkflow.fromIdle().selectItems(items);
      assert.equal(workflow.state.kind, "ItemsSelected");
    });

    it("ItemsSelected -> ChangesComputed when there are cleanable items and changes", function () {
      const { adapters } = createFakeAdapters();
      const items = asZoteroItems([
        createCleanable("A1", "Paper One", "Smith, John; Doe, Jane"),
      ]);

      const workflow = CleanWorkflow.fromIdle()
        .selectItems(items)
        .compute(adapters.writer);

      assert.equal(workflow.state.kind, "ChangesComputed");
      assert.equal((workflow.state as any).totalItemCount, 1);
      assert.lengthOf((workflow.state as any).changes, 1);
    });

    it("ItemsSelected -> NoCleanableItems when nothing can be cleaned", function () {
      const { adapters } = createFakeAdapters();
      const workflow = CleanWorkflow.fromIdle()
        .selectItems([])
        .compute(adapters.writer);

      assert.equal(workflow.state.kind, "NoCleanableItems");
    });

    it("ItemsSelected -> NoChanges when cleanable items produce no changes", function () {
      const { adapters } = createFakeAdapters();
      const items = asZoteroItems([
        createCleanable("A1", "Paper One", "Smith, John and Doe, Jane"),
      ]);

      const workflow = CleanWorkflow.fromIdle()
        .selectItems(items)
        .compute(adapters.writer);

      assert.equal(workflow.state.kind, "NoChanges");
    });

    it("ChangesComputed -> Confirmed when user confirms", async function () {
      const { adapters, dialogCalls } = createFakeAdapters();
      const items = asZoteroItems([
        createCleanable("A1", "Paper One", "Smith, John; Doe, Jane"),
      ]);

      const confirmed = await CleanWorkflow.fromIdle()
        .selectItems(items)
        .compute(adapters.writer)
        .confirm(adapters.dialog);

      assert.equal(confirmed.state.kind, "Confirmed");
      assert.lengthOf(dialogCalls, 1);
    });

    it("ChangesComputed -> Cancelled when user cancels", async function () {
      const { adapters, setDialogResult } = createFakeAdapters();
      setDialogResult(false);
      const items = asZoteroItems([
        createCleanable("A1", "Paper One", "Smith, John; Doe, Jane"),
      ]);

      const cancelled = await CleanWorkflow.fromIdle()
        .selectItems(items)
        .compute(adapters.writer)
        .confirm(adapters.dialog);

      assert.equal(cancelled.state.kind, "Cancelled");
    });

    it("Confirmed -> Applied after writing changes", async function () {
      const { adapters, writerCalls } = createFakeAdapters();
      const items = asZoteroItems([
        createCleanable("A1", "Paper One", "Smith, John; Doe, Jane"),
      ]);

      const applied = await CleanWorkflow.fromIdle()
        .selectItems(items)
        .compute(adapters.writer)
        .confirm(adapters.dialog)
        .then((w) => w.apply(adapters.writer));

      assert.equal(applied.state.kind, "Applied");
      assert.lengthOf(writerCalls, 1);
      assert.equal(writerCalls[0].type, "apply");
    });

    it("Applied -> Notified records store and shows undoable success on full success", async function () {
      const { adapters, notifierCalls } = createFakeAdapters();
      const store = new CleanSessionStore();
      const items = asZoteroItems([
        createCleanable("A1", "Paper One", "Smith, John; Doe, Jane"),
      ]);

      const confirmed = await CleanWorkflow.fromIdle()
        .selectItems(items)
        .compute(adapters.writer)
        .confirm(adapters.dialog);
      const applied = await confirmed.apply(adapters.writer);
      const notified = applied.notify(
        store,
        adapters.notifier,
        {
          writer: adapters.writer,
          notifier: adapters.notifier,
        },
        fakeLocale,
      );

      assert.equal(notified.state.kind, "Notified");
      assert.isTrue((notified.state as any).recorded);
      assert.isTrue(store.hasUndo());
      const successCall = notifierCalls.find(
        (c) => c.method === "showUndoableSuccess",
      );
      assert.isDefined(successCall);
    });

    it("Applied -> Notified shows info on partial failure", function () {
      const { adapters, notifierCalls } = createFakeAdapters();
      const store = new CleanSessionStore();
      const changes: Change[] = [
        {
          itemLibraryID: 1,
          itemKey: "A1",
          itemTitle: "Paper One",
          field: "author",
          oldValue: "Smith, John; Doe, Jane",
          newValue: "Smith, John and Doe, Jane",
        },
        {
          itemLibraryID: 1,
          itemKey: "A2",
          itemTitle: "Paper Two",
          field: "author",
          oldValue: "Lee, Stan; Ditko, Steve",
          newValue: "Lee, Stan and Ditko, Steve",
        },
      ];

      const workflow = new (CleanWorkflow as any)({
        kind: "Applied",
        cleanableItems: [
          createCleanable("A1", "Paper One", "Smith, John; Doe, Jane"),
          createCleanable("A2", "Paper Two", "Lee, Stan; Ditko, Steve"),
        ],
        changes,
        totalItemCount: 2,
        result: {
          succeeded: [changes[0]],
          failed: [{ change: changes[1], error: new Error("save failed") }],
        },
      });

      const notified = workflow.notify(
        store,
        adapters.notifier,
        {
          writer: adapters.writer,
          notifier: adapters.notifier,
        },
        fakeLocale,
      );

      assert.equal(notified.state.kind, "Notified");
      assert.isTrue((notified.state as any).recorded);
      const infoCall = notifierCalls.find((c) => c.method === "showInfo");
      assert.isDefined(infoCall);
      const errorCall = notifierCalls.find(
        (c) => c.method === "showErrorDetails",
      );
      assert.isDefined(errorCall);
    });

    it("Applied -> Notified does not record store when all changes fail", function () {
      const { adapters, notifierCalls } = createFakeAdapters();
      const store = new CleanSessionStore();
      const changes: Change[] = [
        {
          itemLibraryID: 1,
          itemKey: "A1",
          itemTitle: "Paper One",
          field: "author",
          oldValue: "Smith, John; Doe, Jane",
          newValue: "Smith, John and Doe, Jane",
        },
      ];

      const workflow = new (CleanWorkflow as any)({
        kind: "Applied",
        cleanableItems: [
          createCleanable("A1", "Paper One", "Smith, John; Doe, Jane"),
        ],
        changes,
        totalItemCount: 1,
        result: {
          succeeded: [],
          failed: [{ change: changes[0], error: new Error("save failed") }],
        },
      });

      const notified = workflow.notify(
        store,
        adapters.notifier,
        {
          writer: adapters.writer,
          notifier: adapters.notifier,
        },
        fakeLocale,
      );

      assert.equal(notified.state.kind, "Notified");
      assert.isFalse((notified.state as any).recorded);
      assert.isFalse(store.hasUndo());
      const errorCall = notifierCalls.find(
        (c) => c.method === "showErrorDetails",
      );
      assert.isDefined(errorCall);
    });

    it("throws on invalid state transitions", async function () {
      const { adapters } = createFakeAdapters();
      const items = asZoteroItems([
        createCleanable("A1", "Paper One", "Smith, John; Doe, Jane"),
      ]);

      const changesComputed = CleanWorkflow.fromIdle()
        .selectItems(items)
        .compute(adapters.writer);
      assert.throws(() => changesComputed.compute(adapters.writer));
      assert.throws(() =>
        changesComputed.notify(
          new CleanSessionStore(),
          adapters.notifier,
          adapters,
          fakeLocale,
        ),
      );

      const itemsSelected = CleanWorkflow.fromIdle().selectItems(items);
      assert.throws(() =>
        itemsSelected.notify(
          new CleanSessionStore(),
          adapters.notifier,
          adapters,
          fakeLocale,
        ),
      );

      const idle = CleanWorkflow.fromIdle();
      assert.throws(() => idle.compute(adapters.writer));

      // confirm 是 async：非法转移表现为 rejected promise，而非同步抛出。
      let rejected = false;
      try {
        await idle.confirm(adapters.dialog);
      } catch {
        rejected = true;
      }
      assert.isTrue(rejected, "confirm from Idle should reject");
    });
  });

  describe("cleanSession (click chain from right-click menu)", function () {
    let originalGetActiveZoteroPane: typeof Zotero.getActiveZoteroPane;
    let mockSelectedItems: any[] = [];

    const fakeLocale = { getString: (key: string) => `MOCK[${key}]` };

    beforeEach(function () {
      mockSelectedItems = [];
      originalGetActiveZoteroPane = Zotero.getActiveZoteroPane;
      Zotero.getActiveZoteroPane = () =>
        ({
          getSelectedItems: () => mockSelectedItems,
        }) as unknown as _ZoteroTypes.ZoteroPane;
    });

    afterEach(function () {
      Zotero.getActiveZoteroPane = originalGetActiveZoteroPane;
    });

    it("clean click: selected item is loaded, dialog shown, field written, store records", async function () {
      const fakes = createFakeAdapters();
      mockSelectedItems = [
        {
          key: "A1",
          title: "Paper One",
          author: "Smith, John; Doe, Jane",
        },
      ];
      const store = new CleanSessionStore();

      await cleanSelectedItems(store, fakes.adapters, fakeLocale);

      assert.lengthOf(fakes.dialogCalls, 1);
      assert.lengthOf(fakes.writerCalls, 1);
      assert.equal(fakes.writerCalls[0].type, "apply");
      assert.lengthOf(fakes.writerCalls[0].changes, 1);
      assert.isTrue(store.hasUndo());
      const successCall = fakes.notifierCalls.find(
        (c) => c.method === "showUndoableSuccess",
      );
      assert.isDefined(successCall);
    });

    it("clean click + cancel: dialog opens, no field is written, store stays empty", async function () {
      const fakes = createFakeAdapters();
      fakes.setDialogResult(false);
      mockSelectedItems = [
        {
          key: "A2",
          title: "Paper Two",
          author: "Smith, John; Doe, Jane",
        },
      ];
      const store = new CleanSessionStore();

      await cleanSelectedItems(store, fakes.adapters, fakeLocale);

      assert.lengthOf(fakes.dialogCalls, 1);
      assert.lengthOf(fakes.writerCalls, 0);
      assert.isFalse(store.hasUndo());
      assert.lengthOf(
        fakes.notifierCalls.filter((c) => c.method === "showUndoableSuccess"),
        0,
      );
    });

    it("clean click with no selection: dialog never opens, notifier shows info", async function () {
      const fakes = createFakeAdapters();
      mockSelectedItems = [];
      const store = new CleanSessionStore();

      await cleanSelectedItems(store, fakes.adapters, fakeLocale);

      assert.lengthOf(fakes.dialogCalls, 0);
      assert.lengthOf(fakes.writerCalls, 0);
      assert.isFalse(store.hasUndo());
      const infoCall = fakes.notifierCalls.find((c) => c.method === "showInfo");
      assert.isDefined(infoCall);
    });

    it("clean click with no changes: dialog never opens, notifier shows info", async function () {
      const fakes = createFakeAdapters();
      mockSelectedItems = [
        {
          key: "A3",
          title: "Paper Three",
          author: "Smith, John and Doe, Jane",
        },
      ];
      const store = new CleanSessionStore();

      await cleanSelectedItems(store, fakes.adapters, fakeLocale);

      assert.lengthOf(fakes.dialogCalls, 0);
      assert.lengthOf(fakes.writerCalls, 0);
      assert.isFalse(store.hasUndo());
      const infoCall = fakes.notifierCalls.find((c) => c.method === "showInfo");
      assert.isDefined(infoCall);
    });

    it("undo click after a recorded clean: writer undoes and store is consumed", async function () {
      const fakes = createFakeAdapters();
      const changes: Change[] = [
        {
          itemLibraryID: 1,
          itemKey: "A3",
          itemTitle: "Paper Three",
          field: "author",
          oldValue: "Smith, John; Doe, Jane",
          newValue: "Smith, John and Doe, Jane",
        },
      ];
      const store = new CleanSessionStore();
      store.record(changes);

      await undoLastCleanOperation(store, fakes.adapters, fakeLocale);

      assert.lengthOf(fakes.writerCalls, 1);
      assert.equal(fakes.writerCalls[0].type, "undo");
      assert.deepEqual(
        fakes.writerCalls[0].changes.map((c) => c.itemKey),
        ["A3"],
      );
      assert.isFalse(store.hasUndo());
      const successCall = fakes.notifierCalls.find(
        (c) => c.method === "showSuccess",
      );
      assert.isDefined(successCall);
    });
  });
});
