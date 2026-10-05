import { assert } from "chai";
import {
  activeConditions,
  candidateKey,
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
    it("组合 libraryID 与 itemKey，不同库中的相同 itemKey 也不同", function () {
      assert.equal(candidateKey(snapshot), "1\u0000ATT1");
      assert.notEqual(
        candidateKey({ ...snapshot, libraryID: 3 }),
        candidateKey(snapshot),
      );
    });
  });

  describe("activeConditions", function () {
    it("忽略值为空或全是空白字符的行", function () {
      const conditions = [
        condition({ value: "" }),
        condition({ value: "   " }),
        condition({ value: "超星" }),
      ];
      assert.deepEqual(activeConditions(conditions), [conditions[2]]);
    });

    it("保留值且不修剪空白", function () {
      const conditions = [condition({ value: " 超星 " })];
      assert.equal(activeConditions(conditions)[0].value, " 超星 ");
    });
  });

  describe("matchesCondition", function () {
    it("按字段范围匹配标题、url、path 与笔记正文", function () {
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

    it("候选没有对应数据的字段范围不匹配", function () {
      assert.isFalse(
        matchesCondition(note, condition({ field: "url", value: "example" })),
      );
      assert.isFalse(
        matchesCondition(snapshot, condition({ field: "note", value: "扫描" })),
      );
    });

    it("any 字段与候选的所有字段匹配", function () {
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

    it("不匹配父条目标题（仅用于显示的字段）", function () {
      assert.isFalse(
        matchesCondition(
          linkedUrl,
          condition({ field: "any", value: "论文一" }),
        ),
      );
    });

    it("比较不区分大小写，并修剪值的空白", function () {
      assert.isTrue(
        matchesCondition(
          linkedUrl,
          condition({ field: "url", value: "  EXAMPLE.com  " }),
        ),
      );
    });

    it("notContains 时反转结果", function () {
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

    it("数据缺失时 notContains 视为匹配", function () {
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
    it("两种类型都选中时返回全部候选", function () {
      assert.deepEqual(filterCandidates(candidates, filter()), candidates);
    });

    it("只保留选中的类型", function () {
      assert.deepEqual(
        filterCandidates(candidates, filter({ kinds: ["note"] })),
        [note],
      );
    });

    it("没有选中任何类型时返回空", function () {
      assert.deepEqual(filterCandidates(candidates, filter({ kinds: [] })), []);
    });

    it("all 模式下要求满足每个条件", function () {
      const conditions = [
        condition({ field: "any", value: "chaoxing" }),
        condition({ field: "title", value: "超星" }),
      ];
      assert.deepEqual(filterCandidates(candidates, filter({ conditions })), [
        snapshot,
      ]);
    });

    it("any 模式下只需满足一个条件", function () {
      const conditions = [
        condition({ field: "title", value: "超星" }),
        condition({ field: "note", value: "扫描版" }),
      ];
      assert.deepEqual(
        filterCandidates(candidates, filter({ match: "any", conditions })),
        [snapshot, note],
      );
    });

    it("忽略值为空的条件行，而不是匹配所有内容", function () {
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

    it("排除命中否定条件的候选", function () {
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
});
