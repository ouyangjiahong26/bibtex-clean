/**
 * 筛选删除编排：候选收集 → 对话框勾选 → 移入回收站 → 通知。
 *
 * 与清理流程（cleanSession）并列的第二条流程：清理规范化字段值并可撤销，
 * 筛选删除移除子条目且无插件内撤销，恢复入口是 Zotero 回收站。
 */

import type { Candidate } from "./filterCandidates";
import type { Locale } from "../utils/locale";

/** 可移入回收站的最小形状：删除管线按 library+key 反查条目。 */
export type Trashable = { libraryID: number; itemKey: string };

/** 删除一批候选项后的结果。 */
export type DeleteResult<T extends Trashable> = {
  succeeded: T[];
  failed: { candidate: T; error: Error }[];
};

/** 候选收集适配器。真实实现读 Zotero 的当前选中项。 */
export interface CandidateAdapter {
  collectCandidates(): Promise<Candidate[]>;
}

/** 筛选对话框适配器。真实实现使用 ztoolkit.Dialog。 */
export interface FilterDialogAdapter {
  /** 返回用户勾选并确认的候选项；取消时返回 undefined。 */
  choose(candidates: Candidate[]): Promise<Candidate[] | undefined>;
}

/** 删除写入适配器。真实实现把条目移入 Zotero 回收站。 */
export interface DeleteAdapter {
  moveToTrash(candidates: Candidate[]): Promise<DeleteResult<Candidate>>;
}

/** 通知适配器。`showInfo` 与清理流程共用。失败明细只读标题，供各流程共用。 */
export interface DeleteNotifierAdapter {
  showInfo(text: string): void;
  showError(text: string): void;
  showDeleteSuccess(text: string, detail?: string): void;
  showDeleteErrorDetails(
    failed: { candidate: { title: string }; error: Error }[],
  ): void;
}

export type FilterDeleteAdapters = {
  candidates: CandidateAdapter;
  dialog: FilterDialogAdapter;
  writer: DeleteAdapter;
  notifier: DeleteNotifierAdapter;
};

/**
 * 筛选删除当前选中的条目下的子条目。
 *
 * 无候选时不弹空对话框，告知用户即可；筛选后无命中的情况由对话框内的空状态
 * 呈现，因为用户此时正在改条件。
 */
export async function filterDeleteSelectedItems(
  adapters: FilterDeleteAdapters,
  locale: Locale,
): Promise<void> {
  const candidates = await adapters.candidates.collectCandidates();
  if (candidates.length === 0) {
    adapters.notifier.showInfo(locale.getString("message-no-candidates"));
    return;
  }

  const selected = await adapters.dialog.choose(candidates);
  if (!selected || selected.length === 0) {
    return;
  }

  const result = await adapters.writer.moveToTrash(selected);

  if (result.failed.length > 0) {
    adapters.notifier.showDeleteErrorDetails(result.failed);
  }

  if (result.succeeded.length === 0) {
    return;
  }

  const noteCount = result.succeeded.filter(
    (candidate) => candidate.kind === "note",
  ).length;
  const args = {
    count: String(result.succeeded.length),
    notes: String(noteCount),
  };
  const text =
    result.failed.length > 0
      ? locale.getString("message-success-partial-delete")
      : noteCount > 0
        ? locale.getString("message-success-deleted-with-notes", { args })
        : locale.getString("message-success-deleted", { args });
  const hasSnapshot = result.succeeded.some(
    (candidate) => candidate.snapshot === true,
  );

  adapters.notifier.showDeleteSuccess(
    text,
    hasSnapshot ? locale.getString("message-delete-snapshot-note") : undefined,
  );
}
