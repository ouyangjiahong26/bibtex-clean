/**
 * 清理重复附件对话框的纯数据层与元素树层。
 *
 * 1. renderDuplicateDialog — 纯数据：组标题、成员行、勾选计数与按钮文案
 * 2. buildDuplicateDialogContent / buildGroupItems — 生成 ztoolkit 的
 *    ElementProps 树
 *
 * 布局与命名空间分工沿用 filterDialog.ts 的实测结论：容器与文字用 XUL，
 * 控件用 HTML。打开对话框与事件绑定在 duplicateDialogWindow.ts。
 */

import type { TagElementProps } from "zotero-plugin-toolkit";
import {
  duplicateAttachmentKey,
  type DuplicateGroup,
  type DuplicateKind,
} from "./duplicateGroups";
import type { FluentMessageId } from "../../typings/i10n";
import { getString, type StringGetter } from "../utils/locale";

// ── 结构化数据类型 ──────────────────────────────────────────────

export type DuplicateMemberRow = {
  key: string;
  title: string;
  /** 添加日期（dateAdded 的日期部分）。 */
  dateLabel: string;
  /** 有批注时的 "N 条批注" 文案。 */
  annotationLabel?: string;
  /** 策略选出的默认保留者，显示"保留"徽章。 */
  keepLabel?: string;
  checked: boolean;
};

export type DuplicateGroupView = {
  /** 展示用分组键：文件名或 URL。 */
  groupKey: string;
  kindLabel: string;
  parentTitle: string;
  rows: DuplicateMemberRow[];
};

export type DuplicateDialogData = {
  title: string;
  intro: string;
  selectNoneLabel: string;
  checkedSummary: string;
  confirmLabel: string;
  checkedCount: number;
  groups: DuplicateGroupView[];
};

const KIND_KEYS: Record<DuplicateKind, FluentMessageId> = {
  "file-attachment": "dialog-duplicate-kind-file",
  "link-attachment": "dialog-duplicate-kind-link",
};

/** Zotero 的 dateAdded 是 "YYYY-MM-DD HH:MM:SS"，展示只留日期。 */
function dateLabelOf(dateAdded: string): string {
  return dateAdded.split(/\s+/)[0] || dateAdded;
}

/**
 * 从重复组与勾选状态计算对话框所需的全部文案与行数据。
 * 纯函数，不依赖 DOM，可直接快照测试。
 */
export function renderDuplicateDialog(
  groups: DuplicateGroup[],
  checkedKeys: string[],
  getStringFn: StringGetter = getString as StringGetter,
): DuplicateDialogData {
  const checked = new Set(checkedKeys);
  const views: DuplicateGroupView[] = groups.map((group) => ({
    groupKey: group.groupKey,
    kindLabel: getStringFn(KIND_KEYS[group.members[0].kind]),
    parentTitle: group.members[0].parentTitle,
    rows: group.members.map((member) => ({
      key: duplicateAttachmentKey(member),
      title: member.title,
      dateLabel: dateLabelOf(member.dateAdded),
      annotationLabel:
        member.annotationCount > 0
          ? getStringFn("dialog-duplicate-annotations", {
              args: { count: String(member.annotationCount) },
            })
          : undefined,
      keepLabel:
        duplicateAttachmentKey(member) === group.keepKey
          ? getStringFn("dialog-duplicate-keep-badge")
          : undefined,
      checked: checked.has(duplicateAttachmentKey(member)),
    })),
  }));
  const checkedCount = views
    .flatMap((view) => view.rows)
    .filter((row) => row.checked).length;

  return {
    title: getStringFn("dialog-title-duplicate-delete"),
    intro: getStringFn("dialog-duplicate-intro"),
    selectNoneLabel: getStringFn("dialog-duplicate-select-none"),
    checkedSummary: getStringFn("dialog-duplicate-checked-summary", {
      args: { count: String(checkedCount) },
    }),
    confirmLabel: getStringFn("dialog-button-confirm-delete", {
      args: { count: String(checkedCount) },
    }),
    checkedCount,
    groups: views,
  };
}

// ── 对话框 DOM 契约 ─────────────────────────────────────────────
//
// 事件绑定靠 id 与 data-* 定位元素，集中在这里，由 duplicateDialog.test.ts
// 断言元素树里确实存在这些标记。

export const DUPLICATE_DIALOG_IDS = {
  root: "bibtex-clean-duplicate-root",
  groupList: "bibtex-clean-duplicate-group-list",
  checkedSummary: "bibtex-clean-duplicate-checked-summary",
  selectNone: "bibtex-clean-duplicate-select-none",
  confirmButton: "duplicate-confirm-delete",
  cancelButton: "duplicate-cancel",
} as const;

/** 事件代理读取的 data-* 属性名。 */
export const DUPLICATE_DIALOG_DATA_KEYS = {
  member: "data-key",
} as const;

// ── 元素树 ──────────────────────────────────────────────────────

/**
 * 递归补上命名空间：容器用 XUL，控件用 HTML。
 * 理由见 filterDialog.ts 的同名函数注释。
 */
function withNamespace(props: TagElementProps): TagElementProps {
  return {
    ...props,
    namespace: props.namespace ?? "xul",
    children: props.children?.map(withNamespace),
  };
}

/** 纯文字：XUL label 的 value。 */
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

/** HTML 按钮：文字走 innerHTML，与 ztoolkit 的对话框按钮一致。 */
function htmlButton(options: { label: string; id?: string }): TagElementProps {
  return {
    tag: "button",
    namespace: "html",
    id: options.id,
    classList: ["filter-button"],
    attributes: { type: "button" },
    properties: { innerHTML: options.label },
  };
}

/** 组的成员行：勾选框（待删）+ 标题 + 批注数 + 保留徽章 + 日期。 */
function buildMemberRow(row: DuplicateMemberRow): TagElementProps {
  return withNamespace({
    tag: "hbox",
    classList: ["duplicate-member-row"],
    attributes: { align: "center" },
    children: [
      {
        tag: "input",
        namespace: "html",
        attributes: {
          type: "checkbox",
          [DUPLICATE_DIALOG_DATA_KEYS.member]: row.key,
          "aria-label": row.title,
        },
        properties: { checked: row.checked },
      },
      textLabel(row.title, {
        classList: ["duplicate-member-title"],
        flex: "1",
        crop: true,
      }),
      textLabel(row.annotationLabel ?? "", {
        classList: ["duplicate-member-annotations"],
      }),
      textLabel(row.keepLabel ?? "", { classList: ["duplicate-keep-badge"] }),
      textLabel(row.dateLabel, { classList: ["duplicate-member-date"] }),
    ],
  });
}

/** 一个重复组：标题行（类型 + 分组键 + 父条目）+ 成员行。 */
function buildGroupItem(view: DuplicateGroupView): TagElementProps {
  return withNamespace({
    tag: "vbox",
    classList: ["duplicate-group"],
    children: [
      {
        tag: "hbox",
        classList: ["duplicate-group-header"],
        attributes: { align: "center" },
        children: [
          textLabel(view.kindLabel, { classList: ["candidate-badge"] }),
          textLabel(view.groupKey, {
            classList: ["duplicate-group-key"],
            flex: "1",
            crop: true,
          }),
          textLabel(view.parentTitle, {
            classList: ["candidate-parent"],
            crop: true,
          }),
        ],
      },
      ...view.rows.map(buildMemberRow),
    ],
  });
}

/** 组列表内容，供重绘时替换容器子节点。 */
export function buildGroupItems(data: DuplicateDialogData): TagElementProps[] {
  return data.groups.map(buildGroupItem);
}

/** 组列表容器：占满剩余高度并自己滚动。 */
function buildGroupList(data: DuplicateDialogData): TagElementProps {
  return withNamespace({
    tag: "vbox",
    id: DUPLICATE_DIALOG_IDS.groupList,
    classList: ["duplicate-group-list"],
    attributes: { flex: "1" },
    styles: { overflowY: "auto", minHeight: "0" },
    children: buildGroupItems(data),
  });
}

/** 完整对话框内容：说明 + 组列表 + 底部计数与全不选。 */
export function buildDuplicateDialogContent(
  data: DuplicateDialogData,
): TagElementProps {
  return withNamespace({
    tag: "vbox",
    id: DUPLICATE_DIALOG_IDS.root,
    classList: ["bibtex-clean-duplicate"],
    attributes: { flex: "1" },
    // 外层不滚动：只有组列表滚动，页脚与窗口按钮始终可见
    styles: { padding: "12px 16px", overflow: "hidden", minHeight: "0" },
    children: [
      textLabel(data.intro, { classList: ["duplicate-intro"] }),
      buildGroupList(data),
      {
        tag: "hbox",
        classList: ["filter-footer"],
        attributes: { align: "center" },
        children: [
          {
            tag: "label",
            namespace: "xul",
            id: DUPLICATE_DIALOG_IDS.checkedSummary,
            classList: ["checked-summary"],
            attributes: { value: data.checkedSummary, flex: "1" },
          },
          { tag: "spacer", namespace: "xul", attributes: { flex: "1" } },
          htmlButton({
            label: data.selectNoneLabel,
            id: DUPLICATE_DIALOG_IDS.selectNone,
          }),
        ],
      },
    ],
  });
}
