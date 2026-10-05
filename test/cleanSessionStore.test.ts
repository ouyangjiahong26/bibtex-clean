import { assert } from "chai";
import { CleanSessionStore } from "../src/modules/cleanSessionStore";
import type { Change } from "../src/modules/changes";

describe("CleanSessionStore", function () {
  let store: CleanSessionStore;

  beforeEach(function () {
    store = new CleanSessionStore();
  });

  it("未记录操作时 hasUndo 返回 false", function () {
    assert.isFalse(store.hasUndo());
  });

  it("record 记录变更后 hasUndo 返回 true", function () {
    const changes: Change[] = [
      {
        itemLibraryID: 1,
        itemKey: "A1",
        itemTitle: "Paper",
        field: "author",
        oldValue: "old",
        newValue: "new",
      },
    ];
    store.record(changes);
    assert.isTrue(store.hasUndo());
  });

  it("current 返回已记录的操作且不清除", function () {
    const changes: Change[] = [
      {
        itemLibraryID: 1,
        itemKey: "A1",
        itemTitle: "Paper",
        field: "issue",
        oldValue: "第3期",
        newValue: "3",
      },
    ];
    store.record(changes);

    const op1 = store.current();
    assert.isDefined(op1);
    assert.lengthOf(op1!.changes, 1);

    // Still there after current()
    const op2 = store.current();
    assert.isDefined(op2);
  });

  it("consume 返回并清除已记录的操作", function () {
    const changes: Change[] = [
      {
        itemLibraryID: 1,
        itemKey: "A1",
        itemTitle: "Paper",
        field: "issue",
        oldValue: "第3期",
        newValue: "3",
      },
    ];
    store.record(changes);

    const op = store.consume();
    assert.isDefined(op);
    assert.lengthOf(op!.changes, 1);

    assert.isFalse(store.hasUndo());
    assert.isUndefined(store.consume());
  });

  it("record 深拷贝变更，外部修改不影响存储数据", function () {
    const changes: Change[] = [
      {
        itemLibraryID: 1,
        itemKey: "A1",
        itemTitle: "Paper",
        field: "issue",
        oldValue: "第3期",
        newValue: "3",
      },
    ];
    store.record(changes);

    // Mutate original
    changes[0].newValue = "MUTATED";

    const stored = store.consume();
    assert.equal(stored!.changes[0].newValue, "3");
  });

  it("record 替换先前的操作", function () {
    const changes1: Change[] = [
      {
        itemLibraryID: 1,
        itemKey: "A1",
        itemTitle: "First",
        field: "issue",
        oldValue: "1",
        newValue: "2",
      },
    ];
    const changes2: Change[] = [
      {
        itemLibraryID: 1,
        itemKey: "A2",
        itemTitle: "Second",
        field: "author",
        oldValue: "old",
        newValue: "new",
      },
    ];
    store.record(changes1);
    store.record(changes2);

    const op = store.consume();
    assert.equal(op!.changes[0].itemKey, "A2");
  });
});
