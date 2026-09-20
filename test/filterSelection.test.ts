import { assert } from "chai";
import { candidateKey, type Candidate } from "../src/modules/filterCandidates";
import {
  addCondition,
  checkedCandidates,
  initialState,
  removeCondition,
  setAllChecked,
  toggleChecked,
  toggleKind,
  withCondition,
  withMatchMode,
  type FilterDialogState,
} from "../src/modules/filterSelection";

const snapshot: Candidate = {
  itemKey: "ATT1",
  libraryID: 1,
  kind: "link-attachment",
  title: "超星电子书",
  parentTitle: "论文一",
  url: "https://book.chaoxing.com/Reader/12345",
  snapshot: true,
};

const note: Candidate = {
  itemKey: "NOTE1",
  libraryID: 2,
  kind: "note",
  title: "阅读笔记",
  parentTitle: "论文二",
  noteText: "扫描版 PDF 的页码与正文不符。",
};

const candidates: Candidate[] = [snapshot, note];

describe("filterSelection", function () {
  describe("initialState", function () {
    it("starts with both kinds, 'all' matching and a single empty condition", function () {
      const state = initialState();

      assert.deepEqual(state.filter.kinds, ["link-attachment", "note"]);
      assert.equal(state.filter.match, "all");
      assert.deepEqual(state.filter.conditions, [
        { field: "any", operator: "contains", value: "" },
      ]);
    });

    it("checks nothing before any filtering", function () {
      assert.deepEqual(initialState().checkedKeys, []);
    });
  });

  describe("withFilter-driven transitions", function () {
    it("clears checked rows when a kind is toggled", function () {
      const manual = toggleChecked(initialState(), candidateKey(note));

      const filtered = toggleKind(manual, "note");

      assert.deepEqual(filtered.filter.kinds, ["link-attachment"]);
      assert.deepEqual(filtered.checkedKeys, []);
    });

    it("leaves nothing checked when no kind is selected", function () {
      const state = toggleKind(initialState(), "note");
      const bothOff = toggleKind(state, "link-attachment");

      assert.deepEqual(bothOff.filter.kinds, []);
      assert.deepEqual(bothOff.checkedKeys, []);
    });

    it("clears checked rows when a second condition is added", function () {
      const titled = withCondition(initialState(), 0, {
        field: "title",
        value: "超星",
      });
      assert.deepEqual(titled.checkedKeys, []);

      // 全部模式下第二行把快照排除掉：快照没有笔记正文
      const withNoteRow = addCondition(titled);
      const both = withCondition(withNoteRow, 1, {
        field: "note",
        value: "扫描版",
      });
      assert.deepEqual(both.checkedKeys, []);
    });

    it("switching to 'any' clears the checked rows", function () {
      const titled = withCondition(initialState(), 0, {
        field: "title",
        value: "超星",
      });
      const withNoteRow = addCondition(titled);
      const both = withCondition(withNoteRow, 1, {
        field: "note",
        value: "扫描版",
      });

      const anyMode = withMatchMode(both, "any");

      assert.equal(anyMode.filter.match, "any");
      assert.deepEqual(anyMode.checkedKeys, []);
    });

    it("clears manual selections as soon as a negated condition is active", function () {
      // 旧版「含否定条件时默认不勾选」的特例已取消：现在条件变化一律清空勾选
      const checked = toggleChecked(initialState(), candidateKey(snapshot));

      const changed = withCondition(checked, 0, {
        operator: "notContains",
        value: "超星",
      });

      assert.deepEqual(changed.checkedKeys, []);
      assert.deepEqual(checkedCandidates(candidates, changed), []);
    });
  });

  describe("condition rows", function () {
    it("adds a new empty row without changing visibility", function () {
      const state = addCondition(initialState());

      assert.lengthOf(state.filter.conditions, 2);
      assert.deepEqual(state.filter.conditions[1], {
        field: "any",
        operator: "contains",
        value: "",
      });
      assert.deepEqual(state.checkedKeys, []);
    });

    it("keeps at least one row when the last one is removed", function () {
      const state = removeCondition(initialState(), 0);

      assert.lengthOf(state.filter.conditions, 1);
      assert.equal(state.filter.conditions[0].value, "");
    });

    it("removes the addressed row", function () {
      const two = addCondition(initialState());
      const addressed = withCondition(two, 0, { value: "超星" });

      const state = removeCondition(addressed, 1);

      assert.lengthOf(state.filter.conditions, 1);
      assert.equal(state.filter.conditions[0].value, "超星");
    });

    it("ignores an out-of-range index", function () {
      const state = initialState();
      assert.deepEqual(
        removeCondition(state, 5).filter.conditions,
        state.filter.conditions,
      );
      assert.deepEqual(
        withCondition(state, 5, { value: "x" }).filter.conditions,
        state.filter.conditions,
      );
    });

    it("keeps manual selections when the same value is applied again", function () {
      // 焦点进出下拉框会用同一个值再走一遍 withCondition；
      // 条件没变就不该清空勾选，否则用户手改的勾选会被冲掉。
      const checked = toggleChecked(initialState(), candidateKey(snapshot));

      const same = withCondition(checked, 0, { value: "" });

      assert.deepEqual(same.checkedKeys, [candidateKey(snapshot)]);
    });

    it("clears checked rows when the value actually changes", function () {
      const checked = toggleChecked(initialState(), candidateKey(note));

      const changed = withCondition(checked, 0, { value: "超星" });

      assert.deepEqual(changed.checkedKeys, []);
    });
  });

  describe("manual selection", function () {
    it("toggles a single row without re-filtering", function () {
      const checked = toggleChecked(initialState(), candidateKey(snapshot));
      assert.deepEqual(checked.checkedKeys, [candidateKey(snapshot)]);

      const unchecked = toggleChecked(checked, candidateKey(snapshot));
      assert.deepEqual(unchecked.checkedKeys, []);
    });

    it("checks and unchecks every visible row", function () {
      const base = toggleKind(initialState(), "note");

      const none = setAllChecked(base, candidates, false);
      assert.deepEqual(none.checkedKeys, []);

      const all = setAllChecked(none, candidates, true);
      assert.deepEqual(all.checkedKeys, [candidateKey(snapshot)]);
    });

    it("reports only checked rows that are visible under the current filter", function () {
      // checkedKeys 里可能留着已不可见行的 key；
      // checkedCandidates 只回当前可见的勾选行
      const state: FilterDialogState = {
        ...initialState(),
        checkedKeys: [candidateKey(snapshot), candidateKey(note)],
      };
      const withoutNotes: FilterDialogState = {
        ...state,
        filter: { ...state.filter, kinds: ["link-attachment"] },
      };

      assert.deepEqual(
        checkedCandidates(candidates, withoutNotes).map(candidateKey),
        [candidateKey(snapshot)],
      );
    });
  });
});
