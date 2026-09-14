import { assert } from "chai";
import type { TagElementProps } from "zotero-plugin-toolkit";
import {
  FILTER_DIALOG_DATA_KEYS,
  FILTER_DIALOG_IDS,
  FILTER_DIALOG_ROLES,
  buildCandidateRowItems,
  buildCandidateRows,
  buildConditionRowItems,
  buildConditionRows,
  buildFilterDialogContent,
  renderFilterDialog,
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

/** 展开元素树，便于按 tag/id/属性查找。 */
function flatten(props: TagElementProps): TagElementProps[] {
  return [props, ...(props.children ?? []).flatMap(flatten)];
}

function attr(props: TagElementProps, name: string): unknown {
  return props.attributes?.[name];
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

  describe("buildCandidateRowItems", function () {
    it("renders a checkbox, badge, title and parent title per row", function () {
      const items = buildCandidateRowItems(view(initialState(candidates)));

      assert.lengthOf(items, 2);
      const [first, second] = items;
      const checkbox = first.children?.find(
        (child) => child.tag === "checkbox",
      );
      assert.equal(
        attr(checkbox!, FILTER_DIALOG_DATA_KEYS.candidate),
        "1\u0000ATT1",
      );
      assert.isTrue(attr(checkbox!, "checked"));

      const labels = first.children?.filter((child) => child.tag === "label");
      assert.deepEqual(
        labels?.map((label) => attr(label, "value")),
        ["dialog-filter-kind-link-attachment", "超星电子书", "论文一"],
      );

      const secondCheckbox = second.children?.find(
        (child) => child.tag === "checkbox",
      );
      assert.equal(
        attr(secondCheckbox!, FILTER_DIALOG_DATA_KEYS.candidate),
        "1\u0000NOTE1",
      );
    });

    it("leaves unchecked rows without a checked attribute", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "title", operator: "notContains", value: "超星" },
        candidates,
      );

      const items = buildCandidateRowItems(view(state));
      assert.lengthOf(items, 1);
      const checkbox = items[0].children?.find(
        (child) => child.tag === "checkbox",
      );
      assert.isFalse(attr(checkbox!, "checked"));
    });

    it("shows the empty state instead of rows", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "title", value: "不存在的关键词" },
        candidates,
      );

      const items = buildCandidateRowItems(view(state));
      assert.lengthOf(items, 1);
      assert.equal(items[0].tag, "label");
      assert.equal(attr(items[0], "value"), "dialog-filter-empty");
    });

    it("keeps candidate text verbatim (no HTML escaping needed for attributes)", function () {
      const nasty: Candidate = {
        itemKey: "ATT9",
        libraryID: 1,
        kind: "link-attachment",
        title: "<script>alert('x')</script>",
        parentTitle: "论文 & 笔记",
        snapshot: false,
      };

      const data = renderFilterDialog(
        [nasty],
        initialState([nasty]),
        mockGetString,
      );
      const labels = buildCandidateRowItems(data)[0].children?.filter(
        (child) => child.tag === "label",
      );

      assert.deepEqual(
        labels?.map((label) => attr(label, "value")),
        [
          "dialog-filter-kind-link-attachment",
          "<script>alert('x')</script>",
          "论文 & 笔记",
        ],
      );
    });
  });

  describe("buildConditionRowItems", function () {
    it("builds a menulist pair, a textbox and a remove button per row", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "note", operator: "notContains", value: "扫描" },
        candidates,
      );

      const items = buildConditionRowItems(view(state));
      assert.lengthOf(items, 1);
      const row = items[0];
      assert.equal(attr(row, "data-index"), "0");

      const [fieldList, operatorList] = (row.children ?? []).filter(
        (child) => child.tag === "menulist",
      );
      assert.equal(
        attr(fieldList, FILTER_DIALOG_DATA_KEYS.role),
        FILTER_DIALOG_ROLES.field,
      );
      assert.equal(
        attr(operatorList, FILTER_DIALOG_DATA_KEYS.role),
        FILTER_DIALOG_ROLES.operator,
      );

      const fieldItems = fieldList.children?.[0].children ?? [];
      assert.equal(attr(fieldItems[0], "value"), "any");
      const selectedField = fieldItems.filter((item) => attr(item, "selected"));
      assert.deepEqual(
        selectedField.map((item) => attr(item, "value")),
        ["note"],
      );
      const operatorItems = operatorList.children?.[0].children ?? [];
      assert.deepEqual(
        operatorItems
          .filter((item) => attr(item, "selected"))
          .map((item) => attr(item, "value")),
        ["notContains"],
      );

      const textbox = (row.children ?? []).find(
        (child) => child.tag === "textbox",
      );
      assert.equal(attr(textbox, "value"), "扫描");
      assert.equal(
        attr(textbox, "placeholder"),
        "dialog-filter-value-placeholder",
      );

      const removeButton = (row.children ?? []).find(
        (child) => child.tag === "button",
      );
      assert.equal(
        attr(removeButton, FILTER_DIALOG_DATA_KEYS.role),
        FILTER_DIALOG_ROLES.removeCondition,
      );
      assert.equal(
        attr(removeButton, "label"),
        "dialog-filter-remove-condition",
      );
    });
  });

  describe("buildFilterDialogContent", function () {
    it("wires the interactive containers and controls", function () {
      const content = buildFilterDialogContent(view(initialState(candidates)));
      const nodes = flatten(content);

      assert.equal(content.id, FILTER_DIALOG_IDS.root);
      for (const id of [
        FILTER_DIALOG_IDS.conditions,
        FILTER_DIALOG_IDS.candidateList,
        FILTER_DIALOG_IDS.checkedSummary,
        FILTER_DIALOG_IDS.addCondition,
        FILTER_DIALOG_IDS.selectAll,
        FILTER_DIALOG_IDS.selectNone,
      ]) {
        assert.isDefined(
          nodes.find((node) => node.id === id),
          `元素树里应有 id=${id}`,
        );
      }

      const kinds = nodes.filter(
        (node) =>
          node.tag === "checkbox" && attr(node, FILTER_DIALOG_DATA_KEYS.kind),
      );
      assert.deepEqual(
        kinds.map((node) => [
          attr(node, FILTER_DIALOG_DATA_KEYS.kind),
          attr(node, "checked"),
        ]),
        [
          ["link-attachment", true],
          ["note", true],
        ],
      );

      const radios = nodes.filter(
        (node) =>
          node.tag === "radio" && attr(node, FILTER_DIALOG_DATA_KEYS.match),
      );
      assert.deepEqual(
        radios.map((node) => [
          attr(node, FILTER_DIALOG_DATA_KEYS.match),
          attr(node, "selected"),
        ]),
        [
          ["all", true],
          ["any", false],
        ],
      );
    });

    it("shows the checked summary and empty state text", function () {
      const state = withCondition(
        initialState(candidates),
        0,
        { field: "title", value: "不存在的关键词" },
        candidates,
      );

      const content = buildFilterDialogContent(view(state));
      const nodes = flatten(content);
      const summary = nodes.find(
        (node) => node.id === FILTER_DIALOG_IDS.checkedSummary,
      );
      const empty = nodes.find(
        (node) =>
          node.tag === "label" && attr(node, "value") === "dialog-filter-empty",
      );

      assert.equal(
        attr(summary!, "value"),
        "dialog-filter-checked-summary:count=0",
      );
      assert.isDefined(empty);
    });

    it("marks the clicking targets with the data-* attributes the wiring reads", function () {
      const content = buildFilterDialogContent(view(initialState(candidates)));
      const nodes = flatten(content);

      for (const name of Object.values(FILTER_DIALOG_DATA_KEYS)) {
        assert.isTrue(
          nodes.some((node) => attr(node, name) !== undefined),
          `元素树里应有 ${name}`,
        );
      }
      for (const role of Object.values(FILTER_DIALOG_ROLES)) {
        assert.isTrue(
          nodes.some(
            (node) => attr(node, FILTER_DIALOG_DATA_KEYS.role) === role,
          ),
          `元素树里应有 role=${role}`,
        );
      }
    });

    it("keeps the candidate list container reusable for repainting", function () {
      const data = view(initialState(candidates));

      assert.equal(
        buildCandidateRows(data).id,
        FILTER_DIALOG_IDS.candidateList,
      );
      assert.equal(buildConditionRows(data).id, FILTER_DIALOG_IDS.conditions);
      assert.lengthOf(
        buildCandidateRows(data).children ?? [],
        2,
        "容器内是候选行，重绘时可整体替换",
      );
    });

    it("gives every element an explicit XUL namespace", function () {
      const data = view(initialState(candidates));
      // 重绘走的是行项构建器，两条路径都要盖章
      const nodes = [
        ...flatten(buildFilterDialogContent(data)),
        ...buildConditionRowItems(data).flatMap(flatten),
        ...buildCandidateRowItems(data).flatMap(flatten),
      ];

      // ztoolkit 在 tag 同时属于 HTML 与 XUL 时优先 HTML：label 与 button 会因此
      // 被建成 HTML 元素，而 HTML label 不显示 value、HTML button 不显示 label，
      // 对话框就只剩控件框、没有任何文字。每个元素都必须写明 namespace。
      assert.deepEqual(
        nodes
          .filter((node) => node.namespace !== "xul")
          .map((node) => node.tag),
        [],
      );

      const tags = nodes.map((node) => node.tag);
      assert.include(tags, "label");
      assert.include(tags, "button");
    });
  });
});
