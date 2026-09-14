/**
 * HTML 拼装工具：两个对话框共用。
 */

/** 转义 HTML 特殊字符，避免条目标题等内容破坏对话框结构。 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
