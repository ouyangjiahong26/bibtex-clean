/**
 * 通知工具：通过 Zotero ProgressWindow 展示用户通知。
 */

import type { Change } from "../modules/changes";
import type { NotifierAdapter } from "../modules/cleanSession";
import type { Candidate } from "../modules/filterCandidates";
import type { DeleteNotifierAdapter } from "../modules/filterDelete";
import type { Locale } from "./locale";

/**
 * 创建真实的 NotifierAdapter，底层使用 ztoolkit.ProgressWindow。
 * 同时满足清理流程与筛选删除流程的通知接口。
 */
export function createNotifier(
  locale: Locale,
): NotifierAdapter & DeleteNotifierAdapter {
  const addonName = addon.data.config.addonName;

  function showSuccess(text: string): void {
    new ztoolkit.ProgressWindow(addonName)
      .createLine({ text, type: "success" })
      .show();
  }

  function showInfo(text: string): void {
    new ztoolkit.ProgressWindow(addonName)
      .createLine({ text, type: "default" })
      .show();
  }

  function showErrorDetails(failed: { change: Change; error: Error }[]): void {
    const progressWindow = new ztoolkit.ProgressWindow(addonName);
    progressWindow.createLine({
      text: locale.getString("message-error-clean-failed", {
        args: { count: String(failed.length) },
      }),
      type: "fail",
    });
    for (const { change, error } of failed) {
      progressWindow.createLine({
        text: `${change.itemTitle}: ${error.message}`,
        type: "default",
      });
    }
    progressWindow.show();
  }

  function showUndoableSuccess(text: string, onUndo: () => void): void {
    const linkId = "bibtex-clean-undo-link";
    const progressWindow = new ztoolkit.ProgressWindow(addonName, {
      closeOnClick: false,
      closeTime: 8000,
    });
    progressWindow
      .createLine({ text, type: "success" })
      .addDescription(
        `<a id="${linkId}" href="#">${locale.getString("message-undo")}</a>`,
      )
      .show();

    // 内部挂载撤销链接的点击事件，调用方无需知道 ProgressWindow 的内部 DOM 结构。
    setTimeout(() => {
      try {
        // @ts-expect-error — ProgressWindow.win 内部 _window 属性未公开类型
        const win = progressWindow.win?._window as Window | undefined;
        if (!win) return;
        const link = win.document.getElementById(linkId);
        if (!link) return;
        link.addEventListener("click", (event: Event) => {
          event.preventDefault();
          onUndo();
          progressWindow.close();
        });
      } catch {
        // 忽略访问内部 DOM 时的错误。
      }
    }, 100);
  }

  function showDeleteSuccess(text: string, detail?: string): void {
    const progressWindow = new ztoolkit.ProgressWindow(addonName);
    progressWindow.createLine({ text, type: "success" });
    if (detail) {
      progressWindow.createLine({ text: detail, type: "default" });
    }
    progressWindow.show();
  }

  function showDeleteErrorDetails(
    failed: { candidate: Candidate; error: Error }[],
  ): void {
    const progressWindow = new ztoolkit.ProgressWindow(addonName);
    progressWindow.createLine({
      text: locale.getString("message-error-delete-failed", {
        args: { count: String(failed.length) },
      }),
      type: "fail",
    });
    for (const { candidate, error } of failed) {
      progressWindow.createLine({
        text: `${candidate.title}: ${error.message}`,
        type: "default",
      });
    }
    progressWindow.show();
  }

  return {
    showInfo,
    showSuccess,
    showErrorDetails,
    showUndoableSuccess,
    showDeleteSuccess,
    showDeleteErrorDetails,
  };
}
