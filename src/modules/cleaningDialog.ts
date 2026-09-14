/**
 * 条目清理确认对话框。
 *
 * 三层结构：
 * 1. renderDialog — 纯数据，可快照测试
 * 2. renderDialogHtml — 消费结构化数据，拼装 HTML
 * 3. openCleaningConfirmationDialog — toolkit 对话框 + waitForClose seam
 */

import type { Change } from "./changes";
import type { FluentMessageId } from "../../typings/i10n";
import { getString, type StringGetter } from "../utils/locale";
import { escapeHtml } from "../utils/html";
import { waitForDialogClose } from "../utils/dialog";

// ── 结构化数据类型 ──────────────────────────────────────────────

export type DialogRow = {
  itemTitle: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
};

const FIELD_NAME_KEYS: Record<string, FluentMessageId | undefined> = {
  author: "field-author",
  issue: "field-issue",
  volume: "field-volume",
};

export type DialogData = {
  summary: string;
  columns: [string, string, string];
  rows: DialogRow[];
};

// ── 纯数据渲染 ──────────────────────────────────────────────────

/**
 * 从变更列表计算对话框所需的结构化数据。
 * 纯函数，不依赖 DOM，可直接快照测试。
 *
 * @param getStringFn 可注入的 i18n 函数，默认使用全局 getString
 */
export function renderDialog(
  changes: Change[],
  totalItemCount: number,
  getStringFn: StringGetter = getString as StringGetter,
): DialogData {
  const changedItemCount = new Set(changes.map((c) => c.itemKey)).size;
  const unchangedItemCount = totalItemCount - changedItemCount;

  return {
    summary: getStringFn("dialog-summary-clean-items", {
      args: {
        total: String(totalItemCount),
        changes: String(changes.length),
        unchanged: String(unchangedItemCount),
      },
    }),
    columns: [
      getStringFn("dialog-column-item"),
      getStringFn("dialog-column-field"),
      getStringFn("dialog-column-change"),
    ],
    rows: changes.map((change) => {
      // 规则里的字段都有对应文案；万一出现新字段，退回显示字段 id
      const fieldKey = FIELD_NAME_KEYS[change.field];
      return {
        itemTitle: change.itemTitle,
        fieldName: fieldKey ? getStringFn(fieldKey) : change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      };
    }),
  };
}

// ── HTML 拼装 ───────────────────────────────────────────────────

/**
 * 将结构化对话框数据渲染为 HTML 字符串。
 * 只做 HTML 拼装，不包含业务逻辑。
 */
export function renderDialogHtml(data: DialogData): string {
  const [colItem, colField, colChange] = data.columns;

  const rows = data.rows
    .map(
      (row) => `
    <tr>
      <td class="item-title">${escapeHtml(row.itemTitle)}</td>
      <td class="field-name">${escapeHtml(row.fieldName)}</td>
      <td>
        <span class="old-value">${escapeHtml(row.oldValue)}</span>
        <span class="arrow">→</span>
        <span class="new-value">${escapeHtml(row.newValue)}</span>
      </td>
    </tr>
  `,
    )
    .join("");

  return `
    <style>
      .bibtex-clean-summary {
        padding: 8px 0 12px;
        color: #666;
        font-size: 13px;
        border-bottom: 1px solid #eee;
        margin-bottom: 12px;
      }
      .bibtex-clean-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .bibtex-clean-table th,
      .bibtex-clean-table td {
        text-align: left;
        padding: 8px 10px;
        border-bottom: 1px solid #eee;
        vertical-align: top;
      }
      .bibtex-clean-table th {
        color: #666;
        font-weight: 600;
        background: #fafafa;
      }
      .bibtex-clean-table .item-title {
        font-weight: 600;
      }
      .bibtex-clean-table .field-name {
        color: #666;
        font-family: monospace;
        font-size: 12px;
      }
      .bibtex-clean-table .old-value {
        color: #d93025;
        text-decoration: line-through;
      }
      .bibtex-clean-table .new-value {
        color: #188038;
      }
      .bibtex-clean-table .arrow {
        color: #666;
        padding: 0 4px;
      }
    </style>
    <div class="bibtex-clean-summary">
      ${escapeHtml(data.summary)}
    </div>
    <table class="bibtex-clean-table">
      <thead>
        <tr>
          <th>${escapeHtml(colItem)}</th>
          <th>${escapeHtml(colField)}</th>
          <th>${escapeHtml(colChange)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// ── 对话框入口 ──────────────────────────────────────────────────

/**
 * 打开条目清理确认对话框。
 *
 * @param changes 要展示的变更列表
 * @param totalItemCount 选中的可清理条目总数（含无需清理的条目）
 * @param waitForClose 可注入的关闭等待函数，默认轮询 dialog.window.closed
 * @param getStringFn 可注入的 i18n 函数，默认使用全局 getString
 * @returns 'confirm' 或 'cancel'
 */
export async function openCleaningConfirmationDialog(
  changes: Change[],
  totalItemCount: number,
  waitForClose?: (dialog: InstanceType<ZToolkit["Dialog"]>) => Promise<void>,
  getStringFn?: StringGetter,
): Promise<"confirm" | "cancel"> {
  const fn = getStringFn ?? (getString as StringGetter);
  const data = renderDialog(changes, totalItemCount, fn);
  const html = renderDialogHtml(data);

  const dialog = new ztoolkit.Dialog(1, 1);

  dialog.addCell(
    0,
    0,
    {
      tag: "div",
      namespace: "html",
      id: "bibtex-clean-dialog-content",
      styles: {
        width: "600px",
        maxHeight: "400px",
        overflowY: "auto",
        padding: "12px 16px",
      },
      properties: { innerHTML: html },
    },
    true,
  );

  dialog
    .addButton(fn("dialog-button-cancel"), "cancel")
    .addButton(fn("dialog-button-confirm-clean"), "confirm-clean");

  const dialogData: { _lastButtonId?: string } = {};
  dialog.setDialogData(dialogData);

  dialog.open(fn("dialog-title-clean-items"), {
    centerscreen: true,
    resizable: true,
    fitContent: true,
  });

  await (waitForClose ?? waitForDialogClose)(dialog);

  return dialogData._lastButtonId === "confirm-clean" ? "confirm" : "cancel";
}
