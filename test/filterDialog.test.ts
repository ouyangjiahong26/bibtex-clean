import { assert } from "chai";
import {
  FILTER_DIALOG_DATA_KEYS,
  FILTER_DIALOG_IDS,
  FILTER_DIALOG_ROLES,
  renderCandidateRowsHtml,
  renderConditionRowsHtml,
  renderFilterDialog,
  renderFilterDialogHtml,
  type FilterDialogData,
} from "../src/modules/filterDialog";
import {
  initialState,
  toggleKind,
  withCondition,
  type FilterDialogState,
} from "../src/modules/filterSelection";
import { candidateKey, type Candidate } from "../src/modules/filterCandidates";

/** 回显 key 与参数，便于断言文案里的计数。 */
function mockGetString(
  key: string,
  options?: { args?: Record<string, unknown> },
): string {
  if (!options?.args) return key;
  const args = Object.entries(options.args)
    .map(([name, value]) => `${name}=${value}`)
    .join(",");
  return `${key}:${args}`;
}

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
  libraryID: 1,
  kind: "note",
  title: "阅读笔记",
  parentTitle: "论文一",
  noteText: "扫描版 PDF 的页码与正文不符。",
};

const candidates: Candidate[] = [snapshot, note];

function view(state: FilterDialogState): FilterDialogData {
  return renderFilterDialog(candidates, state, mockGetString);
}

describe("filterDialog", function () {
  describe("renderFilterDialog", function () {
    it("offers both kinds and both match modes, with 'all' selected", function () {
      const data = view(initialState(candidates));

      assert.deepEqual(data.kinds, [
        {
          value: "link-attachment",
          label: "dialog-filter-kind-link-attachment",
          checked: true,
        },
        { value: "note", label: "dialog-filter-kind-note", checked: true },
      ]);
      assert.deepEqual(data.matchModes, [
        { value: "all", label: "dialog-filter-match-all", checked: true },
        { value: "any", label: "dialog-filter-match-any", checked: false },
      ]);
    });

    it("lists the field scopes and operators of a condition row", function () {
      const data = view(initialState(candidates));

      assert.deepEqual(
        data.fields.map((field) => field.value),
        ["any", "title", "url", "path", "note"],
      );
      assert.deepEqual(
        data.operators.map((operator) => operator.value),
        ["contains", "notContains"],
      );
    });

    it("renders every candidate as a checked row with its own and parent title", function () {
      const data = view(initialState(candidates));

      assert.deepEqual(data.rows, [
        {
          key: candidateKey(snapshot),
          kindLabel: "dialog-filter-kind-link-attachment",
          title: "超星电子书",
          parentTitle: "论文一",
          checked: true,
        },
        {
          key: candidateKey(note),
          kindLabel: "dialog-filter-kind-note",
          title: "阅读笔记",
          parentTitle: "论文一",
          checked: true,
        },
      ]);
      assert.equal(data.checkedCount, 2);
    });

    it("counts checked items and notes in the summary and confirm label", function () {
      const data = view(initialState(candidates));

      assert.equal(
        data.checkedSummary,
        "dialog-filter-checked-summary:count=2",
      );
      assert.equal(
        data.confirmLabel,
        "dialog-button-confirm-delete-with-notes:count=2,notes=1",
      );
    });

    it("drops the note count from the confirm label when no note is checked", function () {
      const state = toggleKind(initialState(candidates), "note", candidates);

      assert.equal(
        view(state).confirmLabel,
        "dialog-button-confirm-delete:count=1,notes=0",
      );
    });

    it("keeps visible rows unselected after a negated condition, but still lists them", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "title", operator: "notContains", value: "超星" },
        candidates,
      );

      const data = view(state);
      assert.lengthOf(data.rows, 1);
      assert.equal(data.rows[0].title, "阅读笔记");
      assert.isFalse(data.rows[0].checked);
      assert.equal(data.checkedCount, 0);
      assert.equal(
        data.confirmLabel,
        "dialog-button-confirm-delete:count=0,notes=0",
      );
    });

    it("carries the empty state when no candidate matches", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "title", value: "不存在的关键词" },
        candidates,
      );

      const data = view(state);
      assert.deepEqual(data.rows, []);
      assert.equal(data.visibleCount, 0);
      assert.equal(data.emptyText, "dialog-filter-empty");
    });

    it("exposes the raw condition rows for the condition area", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "url", operator: "notContains", value: "chaoxing" },
        candidates,
      );

      assert.deepEqual(view(state).conditions, [
        { field: "url", operator: "notContains", value: "chaoxing" },
      ]);
    });
  });

  describe("renderCandidateRowsHtml", function () {
    it("renders a checkbox, badge, title and parent title per row", function () {
      const html = renderCandidateRowsHtml(view(initialState(candidates)));

      assert.include(html, 'data-key="1\u0000ATT1"');
      assert.include(html, 'data-key="1\u0000NOTE1"');
      assert.include(html, "dialog-filter-kind-link-attachment");
      assert.include(html, "超星电子书");
      assert.include(html, "论文一");
      assert.include(html, "checked");
    });

    it("omits the checked attribute for unselected rows", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "title", operator: "notContains", value: "超星" },
        candidates,
      );

      const html = renderCandidateRowsHtml(view(state));
      assert.notInclude(html, "checked");
      assert.include(html, 'data-key="1\u0000NOTE1"');
    });

    it("shows the empty state instead of rows", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "title", value: "不存在的关键词" },
        candidates,
      );

      const html = renderCandidateRowsHtml(view(state));
      assert.include(html, "candidate-empty");
      assert.include(html, "dialog-filter-empty");
      assert.notInclude(html, "candidate-row");
    });

    it("escapes candidate text", function () {
      const nasty: Candidate = {
        itemKey: "ATT9",
        libraryID: 1,
        kind: "link-attachment",
        title: "<script>alert('x')</script>",
        parentTitle: "论文 & 笔记",
        snapshot: false,
      };

      const html = renderCandidateRowsHtml(
        renderFilterDialog([nasty], initialState([nasty]), mockGetString),
      );

      assert.notInclude(html, "<script>");
      assert.include(html, "&lt;script&gt;");
      assert.include(html, "论文 &amp; 笔记");
    });
  });

  describe("renderConditionRowsHtml", function () {
    it("renders one row per condition with the current values selected", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "note", operator: "notContains", value: "扫描" },
        candidates,
      );

      const html = renderConditionRowsHtml(view(state));

      assert.include(html, 'value="note" selected');
      assert.include(html, 'value="notContains" selected');
      assert.include(html, 'value="扫描"');
      assert.include(html, 'data-index="0"');
    });

    it("escapes the condition value", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { value: '"><script>alert(1)</script>' },
        candidates,
      );

      const html = renderConditionRowsHtml(view(state));

      assert.notInclude(html, "<script>");
      assert.include(html, "&lt;script&gt;");
    });
  });

  describe("renderFilterDialogHtml", function () {
    it("wires the interactive containers and controls", function () {
      const html = renderFilterDialogHtml(view(initialState(candidates)));

      assert.include(html, 'id="bibtex-clean-filter-root"');
      assert.include(html, 'id="bibtex-clean-conditions"');
      assert.include(html, 'id="bibtex-clean-candidate-list"');
      assert.include(html, 'id="bibtex-clean-checked-summary"');
      assert.include(html, 'id="bibtex-clean-add-condition"');
      assert.include(html, 'id="bibtex-clean-select-all"');
      assert.include(html, 'id="bibtex-clean-select-none"');
      assert.include(html, 'data-kind="link-attachment"');
      assert.include(html, 'data-kind="note"');
      assert.include(html, 'data-match="all"');
      assert.include(html, "<style>");
    });

    it("shows the checked summary and empty state text", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "title", value: "不存在的关键词" },
        candidates,
      );

      const html = renderFilterDialogHtml(view(state));

      assert.include(html, "dialog-filter-checked-summary:count=0");
      assert.include(html, "dialog-filter-empty");
    });
  });

  describe("对话框 DOM 契约", function () {
    it("事件绑定查找的 id 都出现在渲染出的 HTML 里", function () {
      const html = renderFilterDialogHtml(view(initialState(candidates)));
      // 确认/取消按钮由 ztoolkit.Dialog 创建，不出现在内容 HTML 里
      const contentIds = Object.values(FILTER_DIALOG_IDS).filter(
        (id) =>
          id !== FILTER_DIALOG_IDS.confirmButton &&
          id !== FILTER_DIALOG_IDS.cancelButton,
      );

      for (const id of contentIds) {
        assert.include(html, `id="${id}"`);
      }
      assert.lengthOf(
        contentIds,
        7,
        "新增 id 常量时必须同步内容 HTML 与事件绑定",
      );
    });

    it("条件行与候选行带齐事件代理读取的 data-* 标记", function () {
      const html = renderFilterDialogHtml(view(initialState(candidates)));

      assert.include(html, `data-${FILTER_DIALOG_DATA_KEYS.kind}=`);
      assert.include(html, `data-${FILTER_DIALOG_DATA_KEYS.match}=`);
      assert.include(html, `data-${FILTER_DIALOG_DATA_KEYS.candidate}=`);
      for (const role of Object.values(FILTER_DIALOG_ROLES)) {
        assert.include(html, `data-role="${role}"`);
      }
    });
  });
});
