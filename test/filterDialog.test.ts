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
  setAllChecked,
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
      const data = view(initialState());

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
      const data = view(initialState());

      assert.deepEqual(
        data.fields.map((field) => field.value),
        ["any", "title", "url", "path", "note"],
      );
      assert.deepEqual(
        data.operators.map((operator) => operator.value),
        ["contains", "notContains"],
      );
    });

    it("renders every candidate as an unchecked row with its own and parent title", function () {
      const data = view(initialState());

      assert.deepEqual(data.rows, [
        {
          key: candidateKey(snapshot),
          kindLabel: "dialog-filter-kind-link-attachment",
          title: "超星电子书",
          parentTitle: "论文一",
          checked: false,
        },
        {
          key: candidateKey(note),
          kindLabel: "dialog-filter-kind-note",
          title: "阅读笔记",
          parentTitle: "论文一",
          checked: false,
        },
      ]);
      assert.equal(data.checkedCount, 0);
    });

    it("counts checked items and notes in the summary and confirm label", function () {
      const data = view(setAllChecked(initialState(), candidates, true));

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
      const linksOnly = toggleKind(initialState(), "note");
      const state = setAllChecked(linksOnly, candidates, true);

      assert.equal(
        view(state).confirmLabel,
        "dialog-button-confirm-delete:count=1,notes=0",
      );
    });

    it("keeps visible rows unselected after a negated condition, but still lists them", function () {
      const state = withCondition(initialState(), 0, {
        field: "title",
        operator: "notContains",
        value: "超星",
      });

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
      const state = withCondition(initialState(), 0, {
        field: "title",
        value: "不存在的关键词",
      });

      const data = view(state);
      assert.deepEqual(data.rows, []);
      assert.equal(data.visibleCount, 0);
      assert.equal(data.emptyText, "dialog-filter-empty");
    });

    it("exposes the raw condition rows for the condition area", function () {
      const state = withCondition(initialState(), 0, {
        field: "url",
        operator: "notContains",
        value: "chaoxing",
      });

      assert.deepEqual(view(state).conditions, [
        { field: "url", operator: "notContains", value: "chaoxing" },
      ]);
    });
  });

  describe("buildCandidateRowItems", function () {
    it("renders a checkbox, badge, title and parent title per row", function () {
      const all = setAllChecked(initialState(), candidates, true);
      const items = buildCandidateRowItems(view(all));

      assert.lengthOf(items, 2);
      const [first, second] = items;
      const checkbox = first.children?.find((child) => child.tag === "input");
      assert.equal(
        attr(checkbox!, FILTER_DIALOG_DATA_KEYS.candidate),
        "1\u0000ATT1",
      );
      assert.isTrue(checkbox!.properties?.checked);
      assert.equal(checkbox!.namespace, "html", "控件用 HTML");

      const labels = first.children?.filter((child) => child.tag === "label");
      assert.deepEqual(
        labels?.map((label) => attr(label, "value")),
        ["dialog-filter-kind-link-attachment", "超星电子书", "论文一"],
      );
      assert.equal(labels?.[0].namespace, "xul", "文字用 XUL label");

      const secondCheckbox = second.children?.find(
        (child) => child.tag === "input",
      );
      assert.equal(
        attr(secondCheckbox!, FILTER_DIALOG_DATA_KEYS.candidate),
        "1\u0000NOTE1",
      );
    });

    it("leaves unchecked rows unchecked", function () {
      const state = withCondition(initialState(), 0, {
        field: "title",
        operator: "notContains",
        value: "超星",
      });

      const items = buildCandidateRowItems(view(state));
      assert.lengthOf(items, 1);
      const checkbox = items[0].children?.find(
        (child) => child.tag === "input",
      );
      assert.isFalse(checkbox!.properties?.checked);
    });

    it("shows the empty state instead of rows", function () {
      const state = withCondition(initialState(), 0, {
        field: "title",
        value: "不存在的关键词",
      });

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

      const data = renderFilterDialog([nasty], initialState(), mockGetString);
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
    it("builds two selects, a text input and a remove button per row", function () {
      const state = withCondition(initialState(), 0, {
        field: "note",
        operator: "notContains",
        value: "扫描",
      });

      const items = buildConditionRowItems(view(state));
      assert.lengthOf(items, 1);
      const row = items[0];
      assert.equal(attr(row, "data-index"), "0");

      const selects = (row.children ?? []).filter(
        (child) => child.tag === "select",
      );
      assert.lengthOf(selects, 2);
      assert.equal(
        attr(selects[0], FILTER_DIALOG_DATA_KEYS.role),
        FILTER_DIALOG_ROLES.field,
      );
      assert.equal(
        attr(selects[1], FILTER_DIALOG_DATA_KEYS.role),
        FILTER_DIALOG_ROLES.operator,
      );

      const fieldOptions = selects[0].children ?? [];
      assert.equal(attr(fieldOptions[0], "value"), "any");
      assert.equal(
        fieldOptions[0].properties?.innerHTML,
        "dialog-filter-field-any",
        "选项文字走 innerHTML",
      );
      assert.deepEqual(
        fieldOptions
          .filter((option) => attr(option, "selected"))
          .map((option) => attr(option, "value")),
        ["note"],
      );
      assert.deepEqual(
        (selects[1].children ?? [])
          .filter((option) => attr(option, "selected"))
          .map((option) => attr(option, "value")),
        ["notContains"],
      );

      const input = (row.children ?? []).find((child) => child.tag === "input");
      assert.equal(input!.properties?.value, "扫描");
      assert.equal(
        attr(input, "placeholder"),
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
        removeButton!.properties?.innerHTML,
        "dialog-filter-remove-condition",
        "按钮文字走 innerHTML",
      );
    });
  });

  describe("buildFilterDialogContent", function () {
    it("wires the interactive containers and controls", function () {
      const content = buildFilterDialogContent(view(initialState()));
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

      const kindInputs = nodes.filter(
        (node) =>
          node.tag === "input" &&
          attr(node, FILTER_DIALOG_DATA_KEYS.kind) !== undefined,
      );
      assert.deepEqual(
        kindInputs.map((node) => [
          attr(node, FILTER_DIALOG_DATA_KEYS.kind),
          node.properties?.checked,
        ]),
        [
          ["link-attachment", true],
          ["note", true],
        ],
      );

      const matchInputs = nodes.filter(
        (node) =>
          node.tag === "input" &&
          attr(node, FILTER_DIALOG_DATA_KEYS.match) !== undefined,
      );
      assert.deepEqual(
        matchInputs.map((node) => [
          attr(node, FILTER_DIALOG_DATA_KEYS.match),
          node.properties?.checked,
        ]),
        [
          ["all", true],
          ["any", false],
        ],
      );

      // 每种控件的文字都必须落在能被渲染的载体上
      const kindsText = nodes.filter(
        (node) => node.tag === "label" && node.namespace === "xul",
      );
      assert.isNotEmpty(kindsText, "文字用 XUL label 渲染");
    });

    it("shows the checked summary and empty state text", function () {
      const state = withCondition(initialState(), 0, {
        field: "title",
        value: "不存在的关键词",
      });

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
      const content = buildFilterDialogContent(view(initialState()));
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
      const data = view(initialState());

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

    it("gives every element an explicit namespace, and controls use HTML", function () {
      const data = view(initialState());
      const nodes = [
        ...flatten(buildFilterDialogContent(data)),
        ...buildConditionRowItems(data).flatMap(flatten),
        ...buildCandidateRowItems(data).flatMap(flatten),
      ];

      // ztoolkit 在 tag 同时属于 HTML 与 XUL 时优先 HTML：不写 namespace 的 label
      // 会被建成 HTML 元素（HTML label 不显示 value）；而 XUL 控件又不渲染自身
      // 文字。所以每个元素都必须显式写 namespace，控件走 HTML、文字走 XUL。
      assert.deepEqual(
        nodes
          .filter(
            (node) => node.namespace !== "xul" && node.namespace !== "html",
          )
          .map((node) => node.tag),
        [],
      );
      assert.deepEqual(
        nodes
          .filter((node) =>
            ["input", "select", "button"].includes(node.tag ?? ""),
          )
          .filter((node) => node.namespace !== "html")
          .map((node) => node.tag),
        [],
        "控件必须是 HTML：XUL 控件在插件对话框里不渲染自身文字",
      );
      const tags = nodes.map((node) => node.tag);
      assert.include(tags, "label");
      assert.include(tags, "button");
    });
  });
});
