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
import type { FluentMessageId } from "../../typings/i10n";
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

const FIELD_KEYS: Record<FilterField, FluentMessageId> = {
  any: "dialog-filter-field-any",
  title: "dialog-filter-field-title",
  url: "dialog-filter-field-url",
  path: "dialog-filter-field-path",
  note: "dialog-filter-field-note",
};

const OPERATOR_KEYS: Record<FilterOperator, FluentMessageId> = {
  contains: "dialog-filter-operator-contains",
  notContains: "dialog-filter-operator-not-contains",
};

const KIND_KEYS: Record<CandidateKind, FluentMessageId> = {
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

/**
 * 递归补上命名空间：容器用 XUL，控件用 HTML。
 *
 * 两条实测结论决定了这个分工：
 * 1. ztoolkit 在 tag 同时属于 HTML 与 XUL 时优先 HTML，label 与 button 因此会被
 *    建成 HTML 元素；XUL 的容器文字元素（label）必须显式写 xul 才会渲染。
 * 2. Zotero 的 XUL 控件（checkbox / radio / menulist）在插件对话框文档里不渲染
 *    自身文字（只有框），而 HTML 控件与其 innerHTML 文字正常——ztoolkit 自己的
 *    对话框按钮就是 HTML button + innerHTML。
 *
 * 所以：文字用 XUL label 的 value 或 HTML 的 innerHTML，控件一律 HTML。
 */
function withNamespace(props: TagElementProps): TagElementProps {
  return {
    ...props,
    namespace: props.namespace ?? "xul",
    children: props.children?.map(withNamespace),
  };
}

/** 纯文字：XUL label 的 value，实测在这个对话框里渲染正常。 */
function textLabel(
  value: string,
  options: { classList?: string[]; flex?: string; crop?: boolean } = {},
): TagElementProps {
  return {
    tag: "label",
    namespace: "xul",
    classList: options.classList,
    attributes: {
      value,
      ...(options.flex ? { flex: options.flex } : {}),
      ...(options.crop ? { crop: "end" } : {}),
    },
  };
}

/** HTML 复选框 + 旁边的文字，避免依赖 XUL 控件的 label 渲染。 */
function checkboxWithLabel(options: {
  label: string;
  checked: boolean;
  dataName: string;
  dataValue: string;
}): TagElementProps[] {
  return [
    {
      tag: "input",
      namespace: "html",
      attributes: { type: "checkbox", [options.dataName]: options.dataValue },
      properties: { checked: options.checked },
    },
    textLabel(options.label),
  ];
}

/** HTML 单选钮（同一 name 一组）+ 文字。 */
function radioWithLabel(options: {
  label: string;
  group: string;
  checked: boolean;
  dataName: string;
  dataValue: string;
}): TagElementProps[] {
  return [
    {
      tag: "input",
      namespace: "html",
      attributes: {
        type: "radio",
        name: options.group,
        [options.dataName]: options.dataValue,
      },
      properties: { checked: options.checked },
    },
    textLabel(options.label),
  ];
}

/** HTML 下拉：文字走 option 的 innerHTML；Zotero 7 上由 ztoolkit 补下拉弹层。 */
function selectControl(
  role: string,
  options: { value: string; label: string }[],
  selected: string,
): TagElementProps {
  return {
    tag: "select",
    namespace: "html",
    classList: ["filter-select"],
    attributes: { [FILTER_DIALOG_DATA_KEYS.role]: role },
    children: options.map((option) => ({
      tag: "option",
      namespace: "html",
      attributes: { value: option.value, selected: option.value === selected },
      properties: { innerHTML: option.label },
    })),
  };
}

/** HTML 按钮：文字走 innerHTML，与 ztoolkit 的对话框按钮一致。 */
function htmlButton(options: {
  label: string;
  id?: string;
  role?: string;
}): TagElementProps {
  return {
    tag: "button",
    namespace: "html",
    id: options.id,
    classList: ["filter-button"],
    attributes: {
      type: "button",
      ...(options.role ? { [FILTER_DIALOG_DATA_KEYS.role]: options.role } : {}),
    },
    properties: { innerHTML: options.label },
  };
}

/** 条件区：每行是 字段范围 × 运算符 × 值。 */
export function buildConditionRows(data: FilterDialogData): TagElementProps {
  return withNamespace({
    tag: "vbox",
    id: FILTER_DIALOG_IDS.conditions,
    children: buildConditionRowItems(data),
  });
}

/** 条件行本身，供重绘时替换容器内容。 */
export function buildConditionRowItems(
  data: FilterDialogData,
): TagElementProps[] {
  const items: TagElementProps[] = data.conditions.map((condition, index) => ({
    tag: "hbox",
    classList: ["condition-row"],
    attributes: { "data-index": String(index), align: "center" },
    children: [
      selectControl(FILTER_DIALOG_ROLES.field, data.fields, condition.field),
      selectControl(
        FILTER_DIALOG_ROLES.operator,
        data.operators,
        condition.operator,
      ),
      {
        tag: "input",
        namespace: "html",
        classList: ["filter-input"],
        attributes: {
          type: "text",
          [FILTER_DIALOG_DATA_KEYS.role]: FILTER_DIALOG_ROLES.value,
          placeholder: data.valuePlaceholder,
          flex: "1",
        },
        properties: { value: condition.value },
      },
      htmlButton({
        label: data.removeConditionLabel,
        role: FILTER_DIALOG_ROLES.removeCondition,
      }),
    ],
  }));
  return items.map(withNamespace);
}

/** 候选列表：勾选框 + 类型徽标 + 子项标题 + 父条目标题。 */
export function buildCandidateRows(data: FilterDialogData): TagElementProps {
  return withNamespace({
    tag: "vbox",
    id: FILTER_DIALOG_IDS.candidateList,
    classList: ["candidate-list"],
    // flex 1 让列表占满剩余高度并自己滚动，页脚与窗口按钮才不会被挤出可视区
    attributes: { flex: "1" },
    styles: { overflowY: "auto", minHeight: "0" },
    children: buildCandidateRowItems(data),
  });
}

/** 候选行本身，供重绘时替换容器内容。 */
export function buildCandidateRowItems(
  data: FilterDialogData,
): TagElementProps[] {
  if (data.rows.length === 0) {
    return [withNamespace(textLabel(data.emptyText, { flex: "1" }))];
  }

  const items: TagElementProps[] = data.rows.map((row) => ({
    tag: "hbox",
    classList: ["candidate-row"],
    attributes: { align: "center" },
    children: [
      {
        tag: "input",
        namespace: "html",
        attributes: {
          type: "checkbox",
          [FILTER_DIALOG_DATA_KEYS.candidate]: row.key,
          "aria-label": row.title,
        },
        properties: { checked: row.checked },
      },
      textLabel(row.kindLabel, { classList: ["candidate-badge"] }),
      textLabel(row.title, {
        classList: ["candidate-title"],
        flex: "1",
        crop: true,
      }),
      textLabel(row.parentTitle, {
        classList: ["candidate-parent"],
        crop: true,
      }),
    ],
  }));
  return items.map(withNamespace);
}

/** 完整对话框内容：条件区 + 候选列表 + 底部计数与批量勾选。 */
export function buildFilterDialogContent(
  data: FilterDialogData,
): TagElementProps {
  return withNamespace({
    tag: "vbox",
    id: FILTER_DIALOG_IDS.root,
    classList: ["bibtex-clean-filter"],
    attributes: { flex: "1" },
    // 外层不滚动：只有候选列表滚动，页脚与窗口按钮始终可见
    styles: { padding: "12px 16px", overflow: "hidden", minHeight: "0" },
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
              textLabel(data.typeLabel, { classList: ["filter-label"] }),
              ...data.kinds.flatMap((kind) =>
                checkboxWithLabel({
                  label: kind.label,
                  checked: kind.checked,
                  dataName: FILTER_DIALOG_DATA_KEYS.kind,
                  dataValue: kind.value,
                }),
              ),
            ],
          },
          {
            tag: "hbox",
            classList: ["filter-line"],
            attributes: { align: "center" },
            children: [
              textLabel(data.matchLabel, { classList: ["filter-label"] }),
              ...data.matchModes.flatMap((mode) =>
                radioWithLabel({
                  label: mode.label,
                  group: "bibtex-clean-match",
                  checked: mode.checked,
                  dataName: FILTER_DIALOG_DATA_KEYS.match,
                  dataValue: mode.value,
                }),
              ),
            ],
          },
          buildConditionRows(data),
          htmlButton({
            label: data.addConditionLabel,
            id: FILTER_DIALOG_IDS.addCondition,
          }),
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
            namespace: "xul",
            id: FILTER_DIALOG_IDS.checkedSummary,
            classList: ["checked-summary"],
            attributes: { value: data.checkedSummary, flex: "1" },
          },
          { tag: "spacer", namespace: "xul", attributes: { flex: "1" } },
          htmlButton({
            label: data.selectAllLabel,
            id: FILTER_DIALOG_IDS.selectAll,
          }),
          htmlButton({
            label: data.selectNoneLabel,
            id: FILTER_DIALOG_IDS.selectNone,
          }),
        ],
      },
    ],
  });
}
