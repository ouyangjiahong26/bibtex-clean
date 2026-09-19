/**
 * 清理重复附件编排：收集重复组 → 对话框勾选 → 移入回收站 → 通知。
 *
 * 与筛选删除（filterDelete）并列的第三条流程，同样不做插件内撤销，
 * 恢复入口是 Zotero 回收站。判定标准见
 * docs/adr/0004-duplicate-attachments-grouped-by-filename.md。
 */

import type {
  DeleteNotifierAdapter,
  DeleteResult,
  Trashable,
} from "./filterDelete";
import type { DuplicateAttachment, DuplicateGroup } from "./duplicateGroups";
import type { Locale } from "../utils/locale";

/** 扫描进度的句柄：扫描期间更新进度，结束时关闭。 */
export interface ScanProgressHandle {
  update(processed: number, total: number): void;
  close(): void;
}

/** 扫描进度适配器。真实实现用 Zotero ProgressWindow 展示进度条。 */
export interface ScanProgressAdapter {
  startScan(): ScanProgressHandle;
}

/** 重复组收集适配器。真实实现读 Zotero 的当前选中项。 */
export interface DuplicateCollectAdapter {
  collectGroups(
    onProgress?: (done: number, total: number) => void,
  ): Promise<DuplicateGroup[]>;
}

/** 重复附件对话框适配器。真实实现使用 ztoolkit.Dialog。 */
export interface DuplicateDialogAdapter {
  /** 返回用户勾选并确认要删除的附件；取消时返回 undefined。 */
  choose(groups: DuplicateGroup[]): Promise<DuplicateAttachment[] | undefined>;
}

/** 删除写入适配器。真实实现复用筛选删除的移入回收站管线。 */
export interface DuplicateDeleteWriterAdapter {
  moveToTrash<T extends Trashable>(candidates: T[]): Promise<DeleteResult<T>>;
}

export type DuplicateDeleteAdapters = {
  collect: DuplicateCollectAdapter;
  dialog: DuplicateDialogAdapter;
  writer: DuplicateDeleteWriterAdapter;
  notifier: DeleteNotifierAdapter;
  progress: ScanProgressAdapter;
};

/**
 * 清理当前选中条目下的重复附件。
 *
 * 没有重复组时不弹空对话框，告知用户即可。收集是异步分批的并展示进度，
 * 任何一步抛错都以失败通知告知，不让菜单点击无声失败。
 */
export async function duplicateDeleteSelectedItems(
  adapters: DuplicateDeleteAdapters,
  locale: Locale,
): Promise<void> {
  const scan = adapters.progress.startScan();
  try {
    const groups = await adapters.collect.collectGroups((done, total) =>
      scan.update(done, total),
    );
    scan.close();

    if (groups.length === 0) {
      adapters.notifier.showInfo(locale.getString("message-no-duplicates"));
      return;
    }

    const chosen = await adapters.dialog.choose(groups);
    if (!chosen || chosen.length === 0) {
      return;
    }

    const result = await adapters.writer.moveToTrash(chosen);

    if (result.failed.length > 0) {
      adapters.notifier.showDeleteErrorDetails(result.failed);
    }

    if (result.succeeded.length === 0) {
      return;
    }

    const args = { count: String(result.succeeded.length) };
    const text =
      result.failed.length > 0
        ? locale.getString("message-success-partial-delete")
        : locale.getString("message-success-duplicates-deleted", { args });

    const details: string[] = [];
    const annotationCount = result.succeeded.reduce(
      (sum, attachment) => sum + attachment.annotationCount,
      0,
    );
    if (annotationCount > 0) {
      details.push(
        locale.getString("message-delete-annotations-note", {
          args: { count: String(annotationCount) },
        }),
      );
    }
    if (result.succeeded.some((attachment) => attachment.snapshot === true)) {
      details.push(locale.getString("message-delete-snapshot-note"));
    }

    adapters.notifier.showDeleteSuccess(
      text,
      details.length > 0 ? details.join(" ") : undefined,
    );
  } catch (error) {
    scan.close();
    const message = error instanceof Error ? error.message : String(error);
    adapters.notifier.showError(
      locale.getString("message-error-unexpected", {
        args: { message },
      }),
    );
  }
}
