/**
 * 筛选删除对话框的纯数据层与 HTML 层。
 *
 * 1. renderFilterDialog — 纯数据，给条件区、候选列表与按钮提供文案与行数据
 * 2. renderFilterDialogHtml / renderConditionRowsHtml / renderCandidateRowsHtml — 拼装 HTML
 *
 * 打开对话框与 DOM 事件绑定在 filterDialogWindow.ts。
 * 对话框即模拟运行：屏幕上勾选的行就是待删集，条件一变勾选按新的可见集重算。
 */

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
import { escapeHtml } from "../utils/html";

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
// 因此集中在这里，并由 filterDialog.test.ts 断言 HTML 里确实存在这些标记。

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

/** 事件代理读取的 data-* 键。 */
export const FILTER_DIALOG_DATA_KEYS = {
  kind: "kind",
  match: "match",
  candidate: "key",
  role: "role",
} as const;

/** 条件行内的控件角色。 */
export const FILTER_DIALOG_ROLES = {
  field: "field",
  operator: "operator",
  value: "value",
  removeCondition: "remove-condition",
} as const;

// ── HTML 拼装 ───────────────────────────────────────────────────

function renderOptions<T extends string>(
  options: { value: T; label: string }[],
  selected: T,
): string {
  return options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}"${
          option.value === selected ? " selected" : ""
        }>${escapeHtml(option.label)}</option>`,
    )
    .join("");
}

/** 条件区：每行是 字段范围 × 运算符 × 值。 */
export function renderConditionRowsHtml(data: FilterDialogData): string {
  return data.conditions
    .map(
      (condition, index) => `
    <div class="condition-row" data-index="${index}">
      <select class="filter-select" data-role="${FILTER_DIALOG_ROLES.field}">${renderOptions(
        data.fields,
        condition.field,
      )}</select>
      <select class="filter-select" data-role="${FILTER_DIALOG_ROLES.operator}">${renderOptions(
        data.operators,
        condition.operator,
      )}</select>
      <input class="filter-input" type="text" data-role="${FILTER_DIALOG_ROLES.value}" value="${escapeHtml(
        condition.value,
      )}" placeholder="${escapeHtml(data.valuePlaceholder)}">
      <button type="button" class="filter-button" data-role="${FILTER_DIALOG_ROLES.removeCondition}">${escapeHtml(
        data.removeConditionLabel,
      )}</button>
    </div>
  `,
    )
    .join("");
}

/** 候选列表：勾选框 + 类型徽标 + 子项标题 + 父条目标题。 */
export function renderCandidateRowsHtml(data: FilterDialogData): string {
  if (data.rows.length === 0) {
    return `<div class="candidate-empty">${escapeHtml(data.emptyText)}</div>`;
  }
  return data.rows
    .map(
      (row) => `
    <label class="candidate-row">
      <input type="checkbox" data-${FILTER_DIALOG_DATA_KEYS.candidate}="${escapeHtml(
        row.key,
      )}"${row.checked ? " checked" : ""}>
      <span class="candidate-badge">${escapeHtml(row.kindLabel)}</span>
      <span class="candidate-title">${escapeHtml(row.title)}</span>
      <span class="candidate-parent">${escapeHtml(row.parentTitle)}</span>
    </label>
  `,
    )
    .join("");
}

/** 完整对话框内容：条件区 + 候选列表 + 底部计数与批量勾选。 */
export function renderFilterDialogHtml(data: FilterDialogData): string {
  const kinds = data.kinds
    .map(
      (kind) => `<label class="filter-option">
        <input type="checkbox" data-${FILTER_DIALOG_DATA_KEYS.kind}="${escapeHtml(
          kind.value,
        )}"${kind.checked ? " checked" : ""}> ${escapeHtml(kind.label)}
      </label>`,
    )
    .join("");
  const matchModes = data.matchModes
    .map(
      (mode) => `<label class="filter-option">
        <input type="radio" name="bibtex-clean-match" data-${
          FILTER_DIALOG_DATA_KEYS.match
        }="${escapeHtml(mode.value)}"${
          mode.checked ? " checked" : ""
        }> ${escapeHtml(mode.label)}
      </label>`,
    )
    .join("");

  return `
    <style>
      .bibtex-clean-filter {
        font-size: 13px;
        color: var(--fill-primary, #333);
      }
      .filter-controls {
        border-bottom: 1px solid #eee;
        padding-bottom: 10px;
        margin-bottom: 10px;
      }
      .filter-line {
        margin-bottom: 6px;
      }
      .filter-label {
        color: #666;
        margin-right: 8px;
      }
      .filter-option {
        margin-right: 12px;
      }
      .condition-row {
        display: flex;
        gap: 6px;
        margin-bottom: 6px;
      }
      .filter-select,
      .filter-input {
        padding: 2px 4px;
      }
      .filter-input {
        flex: 1;
      }
      .filter-button {
        padding: 2px 8px;
      }
      .candidate-list {
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid #eee;
        border-radius: 4px;
      }
      .candidate-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-bottom: 1px solid #f2f2f2;
      }
      .candidate-row:hover {
        background: #fafafa;
      }
      .candidate-badge {
        flex: none;
        font-size: 11px;
        color: #666;
        border: 1px solid #ddd;
        border-radius: 3px;
        padding: 0 4px;
      }
      .candidate-title {
        flex: 1;
        font-weight: 600;
      }
      .candidate-parent {
        flex: none;
        color: #888;
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .candidate-empty {
        padding: 16px;
        color: #888;
        text-align: center;
      }
      .filter-footer {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-top: 10px;
      }
      .filter-footer .checked-summary {
        flex: 1;
        color: #666;
      }
    </style>
    <div class="bibtex-clean-filter" id="${FILTER_DIALOG_IDS.root}">
      <div class="filter-controls">
        <div class="filter-line">
          <span class="filter-label">${escapeHtml(data.typeLabel)}</span>
          ${kinds}
        </div>
        <div class="filter-line">
          <span class="filter-label">${escapeHtml(data.matchLabel)}</span>
          ${matchModes}
        </div>
        <div id="${FILTER_DIALOG_IDS.conditions}">${renderConditionRowsHtml(data)}</div>
        <button type="button" class="filter-button" id="${FILTER_DIALOG_IDS.addCondition}">${escapeHtml(
          data.addConditionLabel,
        )}</button>
      </div>
      <div class="candidate-list" id="${FILTER_DIALOG_IDS.candidateList}">${renderCandidateRowsHtml(
        data,
      )}</div>
      <div class="filter-footer">
        <span class="checked-summary" id="${FILTER_DIALOG_IDS.checkedSummary}">${escapeHtml(
          data.checkedSummary,
        )}</span>
        <button type="button" class="filter-button" id="${FILTER_DIALOG_IDS.selectAll}">${escapeHtml(
          data.selectAllLabel,
        )}</button>
        <button type="button" class="filter-button" id="${FILTER_DIALOG_IDS.selectNone}">${escapeHtml(
          data.selectNoneLabel,
        )}</button>
      </div>
    </div>
  `;
}
