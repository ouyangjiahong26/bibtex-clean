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
      const state = initialState(candidates);

      assert.deepEqual(state.filter.kinds, ["link-attachment", "note"]);
      assert.equal(state.filter.match, "all");
      assert.deepEqual(state.filter.conditions, [
        { field: "any", operator: "contains", value: "" },
      ]);
    });

    it("checks every candidate before any filtering", function () {
      assert.deepEqual(initialState(candidates).checkedKeys, [
        candidateKey(snapshot),
        candidateKey(note),
      ]);
    });
  });

  describe("withFilter-driven transitions", function () {
    it("recomputes checked rows for the new visible set", function () {
      const state = initialState(candidates);
      const manual = toggleChecked(state, candidateKey(note));

      const filtered = toggleKind(manual, "note", candidates);

      assert.deepEqual(filtered.filter.kinds, ["link-attachment"]);
      assert.deepEqual(filtered.checkedKeys, [candidateKey(snapshot)]);
    });

    it("leaves nothing checked when no kind is selected", function () {
      const state = toggleKind(initialState(candidates), "note", candidates);
      const bothOff = toggleKind(state, "link-attachment", candidates);

      assert.deepEqual(bothOff.filter.kinds, []);
      assert.deepEqual(bothOff.checkedKeys, []);
    });

    it("re-filters when a second condition is added", function () {
      const base = initialState(candidates);
      const titled = withCondition(
        base,
        0,
        { field: "title", value: "超星" },
        candidates,
      );
      assert.deepEqual(titled.checkedKeys, [candidateKey(snapshot)]);

      // 「全部」模式下第二行把快照排除掉：快照没有笔记正文
      const withNoteRow = addCondition(titled, candidates);
      const both = withCondition(
        withNoteRow,
        1,
        { field: "note", value: "扫描版" },
        candidates,
      );
      assert.deepEqual(both.checkedKeys, []);
    });

    it("switching to 'any' re-checks the union of matches", function () {
      const base = initialState(candidates);
      const titled = withCondition(
        base,
        0,
        { field: "title", value: "超星" },
        candidates,
      );
      const withNoteRow = addCondition(titled, candidates);
      const both = withCondition(
        withNoteRow,
        1,
        { field: "note", value: "扫描版" },
        candidates,
      );

      const anyMode = withMatchMode(both, "any", candidates);

      assert.equal(anyMode.filter.match, "any");
      assert.deepEqual(anyMode.checkedKeys, [
        candidateKey(snapshot),
        candidateKey(note),
      ]);
    });

    it("unchecks every visible row as soon as a negation is active", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "title", operator: "notContains", value: "超星" },
        candidates,
      );

      assert.deepEqual(state.checkedKeys, []);
      assert.deepEqual(checkedCandidates(candidates, state), []);
    });
  });

  describe("condition rows", function () {
    it("adds a new empty row without changing visibility", function () {
      const state = addCondition(initialState(candidates), candidates);

      assert.lengthOf(state.filter.conditions, 2);
      assert.deepEqual(state.filter.conditions[1], {
        field: "any",
        operator: "contains",
        value: "",
      });
      assert.deepEqual(state.checkedKeys, [
        candidateKey(snapshot),
        candidateKey(note),
      ]);
    });

    it("keeps at least one row when the last one is removed", function () {
      const state = removeCondition(initialState(candidates), 0, candidates);

      assert.lengthOf(state.filter.conditions, 1);
      assert.equal(state.filter.conditions[0].value, "");
    });

    it("removes the addressed row", function () {
      const two = addCondition(initialState(candidates), candidates);
      const addressed = withCondition(two, 0, { value: "超星" }, candidates);

      const state = removeCondition(addressed, 1, candidates);

      assert.lengthOf(state.filter.conditions, 1);
      assert.equal(state.filter.conditions[0].value, "超星");
    });

    it("ignores an out-of-range index", function () {
      const state = initialState(candidates);
      assert.deepEqual(
        removeCondition(state, 5, candidates).filter.conditions,
        state.filter.conditions,
      );
      assert.deepEqual(
        withCondition(state, 5, { value: "x" }, candidates).filter.conditions,
        state.filter.conditions,
      );
    });
  });

  describe("manual selection", function () {
    it("toggles a single row without re-filtering", function () {
      const state = initialState(candidates);
      const unchecked = toggleChecked(state, candidateKey(snapshot));
      assert.deepEqual(unchecked.checkedKeys, [candidateKey(note)]);

      const rechecked = toggleChecked(unchecked, candidateKey(snapshot));
      assert.deepEqual(rechecked.checkedKeys, [
        candidateKey(note),
        candidateKey(snapshot),
      ]);
    });

    it("checks and unchecks every visible row", function () {
      const base = toggleKind(initialState(candidates), "note", candidates);

      const none = setAllChecked(base, candidates, false);
      assert.deepEqual(none.checkedKeys, []);

      const all = setAllChecked(none, candidates, true);
      assert.deepEqual(all.checkedKeys, [candidateKey(snapshot)]);
    });

    it("checks only visible rows even if a hidden key was checked before", function () {
      const state = initialState(candidates);
      const narrowed = withCondition(
        state,
        0,
        { field: "title", value: "超星" },
        candidates,
      );

      assert.deepEqual(
        checkedCandidates(candidates, narrowed).map(candidateKey),
        [candidateKey(snapshot)],
      );
    });
  });
});
