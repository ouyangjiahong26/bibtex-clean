/**
 * 筛选删除对话框的纯数据层与元素树层。
 *
 * 1. renderFilterDialog — 纯数据，给条件区、候选列表与按钮提供文案与行数据
 * 2. buildFilterDialogContent / buildConditionRows / buildCandidateRows — 生成
 *    ztoolkit 的 ElementProps 树
 *
 * 控件用原生 XUL（menulist / textbox / checkbox / radio / button）：这个对话框
 * 是 chrome 里的 XUL 文档，原生 select 的弹出层在 Zotero 7（Gecko 115）上不可用，
 * ztoolkit 也要为此打补丁；XUL 控件是 Zotero 自己用的那条路。
 *
 * 打开对话框与事件绑定在 filterDialogWindow.ts。
 */

import type { TagElementProps } from "zotero-plugin-toolkit";
import {
  candidateKey,
  filterCandidates,
  type Candidate,
  type CandidateKind,
  type FilterCondition,
  type FilterField,
  type FilterOperator,
  type MatchMode,
} from "./filterCandidates";
import type { FilterDialogState } from "./filterSelection";
import { getString, type StringGetter } from "../utils/locale";

// ── 结构化数据类型 ──────────────────────────────────────────────

export type FilterCandidateRow = {
  key: string;
  kindLabel: string;
  title: string;
  parentTitle: string;
  checked: boolean;
};

export type FilterDialogData = {
  title: string;
  typeLabel: string;
  kinds: { value: CandidateKind; label: string; checked: boolean }[];
  matchLabel: string;
  matchModes: { value: MatchMode; label: string; checked: boolean }[];
  fields: { value: FilterField; label: string }[];
  operators: { value: FilterOperator; label: string }[];
  conditions: FilterCondition[];
  valuePlaceholder: string;
  addConditionLabel: string;
  removeConditionLabel: string;
  selectAllLabel: string;
  selectNoneLabel: string;
  checkedSummary: string;
  confirmLabel: string;
  emptyText: string;
  visibleCount: number;
  checkedCount: number;
  rows: FilterCandidateRow[];
};

const FIELD_KEYS: Record<FilterField, string> = {
  any: "dialog-filter-field-any",
  title: "dialog-filter-field-title",
  url: "dialog-filter-field-url",
  path: "dialog-filter-field-path",
  note: "dialog-filter-field-note",
};

const OPERATOR_KEYS: Record<FilterOperator, string> = {
  contains: "dialog-filter-operator-contains",
  notContains: "dialog-filter-operator-not-contains",
};

const KIND_KEYS: Record<CandidateKind, string> = {
  "link-attachment": "dialog-filter-kind-link-attachment",
  note: "dialog-filter-kind-note",
};

/**
 * 从候选项与当前状态计算对话框所需的全部文案与行数据。
 * 纯函数，不依赖 DOM，可直接快照测试。
 */
export function renderFilterDialog(
  candidates: Candidate[],
  state: FilterDialogState,
  getStringFn: StringGetter = getString as StringGetter,
): FilterDialogData {
  const visible = filterCandidates(candidates, state.filter);
  const checkedKeys = new Set(state.checkedKeys);
  const isChecked = (candidate: Candidate) =>
    checkedKeys.has(candidateKey(candidate));
  const rows: FilterCandidateRow[] = visible.map((candidate) => ({
    key: candidateKey(candidate),
    kindLabel: getStringFn(KIND_KEYS[candidate.kind]),
    title: candidate.title,
    parentTitle: candidate.parentTitle,
    checked: isChecked(candidate),
  }));
  const checked = visible.filter(isChecked);
  const checkedNoteCount = checked.filter(
    (candidate) => candidate.kind === "note",
  ).length;

  return {
    title: getStringFn("dialog-title-filter-delete"),
    typeLabel: getStringFn("dialog-filter-type-label"),
    kinds: (["link-attachment", "note"] as CandidateKind[]).map((kind) => ({
      value: kind,
      label: getStringFn(KIND_KEYS[kind]),
      checked: state.filter.kinds.includes(kind),
    })),
    matchLabel: getStringFn("dialog-filter-match-label"),
    matchModes: (["all", "any"] as MatchMode[]).map((mode) => ({
      value: mode,
      label: getStringFn(
        mode === "all" ? "dialog-filter-match-all" : "dialog-filter-match-any",
      ),
      checked: state.filter.match === mode,
    })),
    fields: (Object.keys(FIELD_KEYS) as FilterField[]).map((field) => ({
      value: field,
      label: getStringFn(FIELD_KEYS[field]),
    })),
    operators: (Object.keys(OPERATOR_KEYS) as FilterOperator[]).map(
      (operator) => ({
        value: operator,
        label: getStringFn(OPERATOR_KEYS[operator]),
      }),
    ),
    conditions: state.filter.conditions,
    valuePlaceholder: getStringFn("dialog-filter-value-placeholder"),
    addConditionLabel: getStringFn("dialog-filter-add-condition"),
    removeConditionLabel: getStringFn("dialog-filter-remove-condition"),
    selectAllLabel: getStringFn("dialog-filter-select-all"),
    selectNoneLabel: getStringFn("dialog-filter-select-none"),
    checkedSummary: getStringFn("dialog-filter-checked-summary", {
      args: { count: String(checked.length) },
    }),
    confirmLabel: getStringFn(
      checkedNoteCount > 0
        ? "dialog-button-confirm-delete-with-notes"
        : "dialog-button-confirm-delete",
      {
        args: {
          count: String(checked.length),
          notes: String(checkedNoteCount),
        },
      },
    ),
    emptyText: getStringFn("dialog-filter-empty"),
    visibleCount: rows.length,
    checkedCount: checked.length,
    rows,
  };
}

// ── 对话框 DOM 契约 ─────────────────────────────────────────────
//
// 事件绑定靠 id 与 data-* 定位元素，两边各写一份字符串必然漂移，
// 因此集中在这里，并由 filterDialog.test.ts 断言元素树里确实存在这些标记。

export const FILTER_DIALOG_IDS = {
  root: "bibtex-clean-filter-root",
  conditions: "bibtex-clean-conditions",
  addCondition: "bibtex-clean-add-condition",
  candidateList: "bibtex-clean-candidate-list",
  checkedSummary: "bibtex-clean-checked-summary",
  selectAll: "bibtex-clean-select-all",
  selectNone: "bibtex-clean-select-none",
  confirmButton: "filter-confirm-delete",
  cancelButton: "filter-cancel",
} as const;

/** 事件代理读取的 data-* 属性名。 */
export const FILTER_DIALOG_DATA_KEYS = {
  kind: "data-kind",
  match: "data-match",
  candidate: "data-key",
  role: "data-role",
} as const;

/** 条件行内的控件角色。 */
export const FILTER_DIALOG_ROLES = {
  field: "field",
  operator: "operator",
  value: "value",
  removeCondition: "remove-condition",
} as const;

// ── 元素树 ──────────────────────────────────────────────────────

function menulist(
  role: string,
  options: { value: string; label: string }[],
  selected: string,
): TagElementProps {
  return {
    tag: "menulist",
    classList: ["filter-select"],
    attributes: { [FILTER_DIALOG_DATA_KEYS.role]: role },
    children: [
      {
        tag: "menupopup",
        children: options.map((option) => ({
          tag: "menuitem",
          attributes: {
            label: option.label,
            value: option.value,
            selected: option.value === selected,
          },
        })),
      },
    ],
  };
}

/** 条件区：每行是 字段范围 × 运算符 × 值。 */
export function buildConditionRows(data: FilterDialogData): TagElementProps {
  return {
    tag: "vbox",
    id: FILTER_DIALOG_IDS.conditions,
    children: buildConditionRowItems(data),
  };
}

/** 条件行本身，供重绘时替换容器内容。 */
export function buildConditionRowItems(
  data: FilterDialogData,
): TagElementProps[] {
  return data.conditions.map((condition, index) => ({
    tag: "hbox",
    classList: ["condition-row"],
    attributes: {
      "data-index": String(index),
      align: "center",
    },
    children: [
      menulist(FILTER_DIALOG_ROLES.field, data.fields, condition.field),
      menulist(
        FILTER_DIALOG_ROLES.operator,
        data.operators,
        condition.operator,
      ),
      {
        tag: "textbox",
        classList: ["filter-input"],
        attributes: {
          [FILTER_DIALOG_DATA_KEYS.role]: FILTER_DIALOG_ROLES.value,
          value: condition.value,
          placeholder: data.valuePlaceholder,
          flex: "1",
        },
      },
      {
        tag: "button",
        attributes: {
          [FILTER_DIALOG_DATA_KEYS.role]: FILTER_DIALOG_ROLES.removeCondition,
          label: data.removeConditionLabel,
        },
      },
    ],
  }));
}

/** 候选列表：勾选框 + 类型徽标 + 子项标题 + 父条目标题。 */
export function buildCandidateRows(data: FilterDialogData): TagElementProps {
  return {
    tag: "vbox",
    id: FILTER_DIALOG_IDS.candidateList,
    classList: ["candidate-list"],
    // 固定高度而不是 max-height：外层不再用 fitContent，配合 flex 才不会被压成 0
    attributes: { flex: "1" },
    styles: { minHeight: "240px", overflowY: "auto" },
    children: buildCandidateRowItems(data),
  };
}

/** 候选行本身，供重绘时替换容器内容。 */
export function buildCandidateRowItems(
  data: FilterDialogData,
): TagElementProps[] {
  if (data.rows.length === 0) {
    return [
      {
        tag: "label",
        classList: ["candidate-empty"],
        attributes: { value: data.emptyText, flex: "1" },
        styles: { textAlign: "center", opacity: "0.7" },
      },
    ];
  }

  return data.rows.map((row) => ({
    tag: "hbox",
    classList: ["candidate-row"],
    attributes: { align: "center" },
    children: [
      {
        tag: "checkbox",
        attributes: {
          [FILTER_DIALOG_DATA_KEYS.candidate]: row.key,
          checked: row.checked,
          "aria-label": row.title,
        },
      },
      {
        tag: "label",
        classList: ["candidate-badge"],
        attributes: { value: row.kindLabel },
      },
      {
        tag: "label",
        classList: ["candidate-title"],
        attributes: { value: row.title, crop: "end", flex: "1" },
      },
      {
        tag: "label",
        classList: ["candidate-parent"],
        attributes: { value: row.parentTitle, crop: "end" },
        styles: { opacity: "0.7", maxWidth: "240px" },
      },
    ],
  }));
}

/** 完整对话框内容：条件区 + 候选列表 + 底部计数与批量勾选。 */
export function buildFilterDialogContent(
  data: FilterDialogData,
): TagElementProps {
  return {
    tag: "vbox",
    id: FILTER_DIALOG_IDS.root,
    classList: ["bibtex-clean-filter"],
    attributes: { flex: "1" },
    styles: { padding: "12px 16px", overflowY: "auto" },
    children: [
      {
        tag: "vbox",
        classList: ["filter-controls"],
        children: [
          {
            tag: "hbox",
            classList: ["filter-line"],
            attributes: { align: "center" },
            children: [
              {
                tag: "label",
                classList: ["filter-label"],
                attributes: { value: data.typeLabel },
              },
              ...data.kinds.map((kind) => ({
                tag: "checkbox",
                attributes: {
                  [FILTER_DIALOG_DATA_KEYS.kind]: kind.value,
                  label: kind.label,
                  checked: kind.checked,
                },
              })),
            ],
          },
          {
            tag: "hbox",
            classList: ["filter-line"],
            attributes: { align: "center" },
            children: [
              {
                tag: "label",
                classList: ["filter-label"],
                attributes: { value: data.matchLabel },
              },
              {
                tag: "radiogroup",
                attributes: { [FILTER_DIALOG_DATA_KEYS.role]: "match" },
                children: data.matchModes.map((mode) => ({
                  tag: "radio",
                  attributes: {
                    [FILTER_DIALOG_DATA_KEYS.match]: mode.value,
                    label: mode.label,
                    selected: mode.checked,
                  },
                })),
              },
            ],
          },
          buildConditionRows(data),
          {
            tag: "button",
            id: FILTER_DIALOG_IDS.addCondition,
            attributes: { label: data.addConditionLabel },
          },
        ],
      },
      buildCandidateRows(data),
      {
        tag: "hbox",
        classList: ["filter-footer"],
        attributes: { align: "center" },
        children: [
          {
            tag: "label",
            id: FILTER_DIALOG_IDS.checkedSummary,
            attributes: { value: data.checkedSummary, flex: "1" },
          },
          {
            tag: "button",
            id: FILTER_DIALOG_IDS.selectAll,
            attributes: { label: data.selectAllLabel },
          },
          {
            tag: "button",
            id: FILTER_DIALOG_IDS.selectNone,
            attributes: { label: data.selectNoneLabel },
          },
        ],
      },
    ],
  };
}
