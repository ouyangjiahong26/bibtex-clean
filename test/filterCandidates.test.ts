import { assert } from "chai";
import {
  activeConditions,
  candidateKey,
  defaultCheckedKeys,
  filterCandidates,
  matchesCondition,
  type Candidate,
  type CandidateFilter,
  type FilterCondition,
} from "../src/modules/filterCandidates";

/** 网页快照：库内存了网页副本。 */
const snapshot: Candidate = {
  itemKey: "ATT1",
  libraryID: 1,
  kind: "link-attachment",
  title: "超星电子书",
  parentTitle: "论文一",
  url: "https://book.chaoxing.com/Reader/12345",
  path: "/home/user/Zotero/storage/ATT1/index.html",
  snapshot: true,
};

/** 网页链接：只保存外部地址。 */
const linkedUrl: Candidate = {
  itemKey: "ATT2",
  libraryID: 1,
  kind: "link-attachment",
  title: "出版社页面",
  parentTitle: "论文一",
  url: "https://example.com/article",
  path: "https://example.com/article",
};

/** 子笔记：只有标题与正文。 */
const note: Candidate = {
  itemKey: "NOTE1",
  libraryID: 2,
  kind: "note",
  title: "阅读笔记",
  parentTitle: "论文二",
  noteText: "扫描版 PDF 的页码与正文不符，需要复核。",
};

const candidates: Candidate[] = [snapshot, linkedUrl, note];

function filter(overrides: Partial<CandidateFilter> = {}): CandidateFilter {
  return {
    kinds: ["link-attachment", "note"],
    match: "all",
    conditions: [],
    ...overrides,
  };
}

function condition(overrides: Partial<FilterCondition> = {}): FilterCondition {
  return { field: "any", operator: "contains", value: "", ...overrides };
}

describe("filterCandidates", function () {
  describe("candidateKey", function () {
    it("combines libraryID and itemKey so same keys in different libraries differ", function () {
      assert.equal(candidateKey(snapshot), "1\u0000ATT1");
      assert.notEqual(
        candidateKey({ ...snapshot, libraryID: 3 }),
        candidateKey(snapshot),
      );
    });
  });

  describe("activeConditions", function () {
    it("ignores rows whose value is empty or whitespace", function () {
      const conditions = [
        condition({ value: "" }),
        condition({ value: "   " }),
        condition({ value: "超星" }),
      ];
      assert.deepEqual(activeConditions(conditions), [conditions[2]]);
    });

    it("keeps values without trimming them in place", function () {
      const conditions = [condition({ value: " 超星 " })];
      assert.equal(activeConditions(conditions)[0].value, " 超星 ");
    });
  });

  describe("matchesCondition", function () {
    it("matches title, url, path and note text by scope", function () {
      assert.isTrue(
        matchesCondition(
          snapshot,
          condition({ field: "title", value: "超星" }),
        ),
      );
      assert.isTrue(
        matchesCondition(
          snapshot,
          condition({ field: "url", value: "chaoxing.com" }),
        ),
      );
      assert.isTrue(
        matchesCondition(
          snapshot,
          condition({ field: "path", value: "storage/ATT1" }),
        ),
      );
      assert.isTrue(
        matchesCondition(note, condition({ field: "note", value: "扫描版" })),
      );
    });

    it("does not match a scope the candidate has no data for", function () {
      assert.isFalse(
        matchesCondition(note, condition({ field: "url", value: "example" })),
      );
      assert.isFalse(
        matchesCondition(snapshot, condition({ field: "note", value: "扫描" })),
      );
    });

    it("matches 'any field' against every field of the candidate", function () {
      assert.isTrue(
        matchesCondition(note, condition({ field: "any", value: "扫描版" })),
      );
      assert.isTrue(
        matchesCondition(
          snapshot,
          condition({ field: "any", value: "storage" }),
        ),
      );
      assert.isFalse(
        matchesCondition(note, condition({ field: "any", value: "chaoxing" })),
      );
    });

    it("does not match the parent item title (display-only field)", function () {
      assert.isFalse(
        matchesCondition(
          linkedUrl,
          condition({ field: "any", value: "论文一" }),
        ),
      );
    });

    it("compares case-insensitively and trims the value", function () {
      assert.isTrue(
        matchesCondition(
          linkedUrl,
          condition({ field: "url", value: "  EXAMPLE.com  " }),
        ),
      );
    });

    it("inverts the result for 'not contains'", function () {
      assert.isFalse(
        matchesCondition(
          snapshot,
          condition({ field: "title", value: "超星", operator: "notContains" }),
        ),
      );
      assert.isTrue(
        matchesCondition(
          snapshot,
          condition({ field: "title", value: "扫描", operator: "notContains" }),
        ),
      );
    });

    it("treats 'not contains' on missing data as a match", function () {
      assert.isTrue(
        matchesCondition(
          note,
          condition({
            field: "url",
            value: "example.com",
            operator: "notContains",
          }),
        ),
      );
    });
  });

  describe("filterCandidates", function () {
    it("returns every candidate when only both kinds are selected", function () {
      assert.deepEqual(filterCandidates(candidates, filter()), candidates);
    });

    it("keeps only the selected kinds", function () {
      assert.deepEqual(
        filterCandidates(candidates, filter({ kinds: ["note"] })),
        [note],
      );
    });

    it("returns nothing when no kind is selected", function () {
      assert.deepEqual(filterCandidates(candidates, filter({ kinds: [] })), []);
    });

    it("requires every condition in 'all' mode", function () {
      const conditions = [
        condition({ field: "any", value: "chaoxing" }),
        condition({ field: "title", value: "超星" }),
      ];
      assert.deepEqual(filterCandidates(candidates, filter({ conditions })), [
        snapshot,
      ]);
    });

    it("requires one condition in 'any' mode", function () {
      const conditions = [
        condition({ field: "title", value: "超星" }),
        condition({ field: "note", value: "扫描版" }),
      ];
      assert.deepEqual(
        filterCandidates(candidates, filter({ match: "any", conditions })),
        [snapshot, note],
      );
    });

    it("ignores empty condition rows instead of matching everything", function () {
      const withEmptyRow = filter({ conditions: [condition({ value: "" })] });
      assert.deepEqual(
        filterCandidates(candidates, withEmptyRow),
        filterCandidates(candidates, filter()),
      );

      const anyMode = filter({
        match: "any",
        conditions: [condition({ value: "" })],
      });
      assert.deepEqual(
        filterCandidates(candidates, anyMode),
        filterCandidates(candidates, filter()),
      );
    });

    it("excludes matches of a negated condition", function () {
      const conditions = [
        condition({
          field: "any",
          value: "扫描",
          operator: "notContains",
        }),
      ];
      // 笔记正文含 扫描版，命中否定条件，被排除
      assert.deepEqual(filterCandidates(candidates, filter({ conditions })), [
        snapshot,
        linkedUrl,
      ]);
    });
  });

  describe("defaultCheckedKeys", function () {
    it("checks every visible row when no condition negates", function () {
      const visible = filterCandidates(candidates, filter());
      assert.deepEqual(
        defaultCheckedKeys(visible, [condition({ value: "超星" })]),
        visible.map(candidateKey),
      );
    });

    it("checks nothing when any active condition negates", function () {
      const conditions = [
        condition({ value: "超星" }),
        condition({ operator: "notContains", value: "扫描" }),
      ];
      assert.deepEqual(
        defaultCheckedKeys(filterCandidates(candidates, filter()), conditions),
        [],
      );
    });

    it("ignores negated rows whose value is empty", function () {
      const conditions = [condition({ operator: "notContains", value: "" })];
      const visible = filterCandidates(candidates, filter());
      assert.deepEqual(
        defaultCheckedKeys(visible, conditions),
        visible.map(candidateKey),
      );
    });
  });
});
