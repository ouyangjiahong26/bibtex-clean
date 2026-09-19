/**
 * 子条目候选的读取与删除：耦合 Zotero 运行时，可通过 mock 测试。
 *
 * 删除指移入回收站（`deleted = true` + `saveTx()`），见
 * docs/adr/0003-filter-delete-moves-to-trash.md。不做插件内撤销。
 */

import { candidateKey, type Candidate } from "./filterCandidates";
import type { DeleteResult, Trashable } from "./filterDelete";
import { chunk } from "../utils/chunk";
import { config } from "../../package.json";

/** 删除并发数偏好键：前缀取自 package.json，构建时 prefs.js 用的是同一个前缀。 */
const DELETE_CONCURRENCY_PREF = `${config.prefsPrefix}.deleteConcurrency`;
const DEFAULT_DELETE_CONCURRENCY = 4;
const MAX_DELETE_CONCURRENCY = 20;

/** 链接附件：网页快照（imported_url）与网页链接（linked_url）。 */
export function isLinkAttachment(item: Zotero.Item): boolean {
  if (!item.isAttachment()) {
    return false;
  }
  // Zotero 的 linkMode 运行时是数字常量（LINK_MODE_*），而 attachmentLinkMode
  // 在类型里是枚举，直接与数字字面量比较会被判为无重叠，故先取数字。
  const mode: number = item.attachmentLinkMode;
  return (
    mode === Zotero.Attachments.LINK_MODE_IMPORTED_URL ||
    mode === Zotero.Attachments.LINK_MODE_LINKED_URL
  );
}

/** 笔记标题取不到时，退回正文首行。 */
function noteTitle(item: Zotero.Item): string {
  const title = item.getField("title") as string;
  if (title) {
    return title;
  }
  const firstLine = item
    .getNote()
    .split(/\r?\n/)
    .find((line) => line.trim() !== "");
  return firstLine?.trim() ?? item.key;
}

/**
 * 把一个条目转成候选项。不属于候选范围（普通附件、父条目本身等）时返回
 * undefined。`parentTitle` 只用于展示。
 */
export function toCandidate(
  item: Zotero.Item,
  parentTitle: string,
): Candidate | undefined {
  if (item.isNote()) {
    return {
      itemKey: item.key,
      libraryID: item.libraryID,
      kind: "note",
      title: noteTitle(item),
      parentTitle,
      noteText: item.getNote(),
    };
  }

  if (!isLinkAttachment(item)) {
    return undefined;
  }

  const url = (item.getField("url") as string) || undefined;
  const filePath = item.getFilePath();
  return {
    itemKey: item.key,
    libraryID: item.libraryID,
    kind: "link-attachment",
    title: (item.getField("title") as string) || url || item.key,
    parentTitle,
    url,
    path: typeof filePath === "string" ? filePath : undefined,
    snapshot:
      item.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_URL,
  };
}

function parentTitleOf(item: Zotero.Item): string {
  const parentID = item.parentItemID;
  if (!parentID) {
    return "";
  }
  const parent = Zotero.Items.get(parentID);
  return parent ? ((parent.getField("title") as string) ?? "") : "";
}

/**
 * 收集选中条目下的候选项。
 *
 * - 选中普通条目：取它的直接子附件与直接子笔记，不递归进子条目。
 * - 直接选中附件或笔记：候选就是被选中的项本身。
 * - 父条目永远不进入候选。
 */
export function collectCandidates(selectedItems: Zotero.Item[]): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  const push = (candidate: Candidate | undefined) => {
    if (!candidate) {
      return;
    }
    const key = candidateKey(candidate);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(candidate);
  };

  for (const item of selectedItems) {
    if (item.isNote() || item.isAttachment()) {
      push(toCandidate(item, parentTitleOf(item)));
      continue;
    }

    if (!item.isRegularItem()) {
      continue;
    }

    const parentTitle = (item.getField("title") as string) ?? "";
    for (const attachmentID of item.getAttachments()) {
      const attachment = Zotero.Items.get(attachmentID);
      if (attachment) {
        push(toCandidate(attachment, parentTitle));
      }
    }
    for (const noteID of item.getNotes()) {
      const note = Zotero.Items.get(noteID);
      if (note) {
        push(toCandidate(note, parentTitle));
      }
    }
  }

  return candidates;
}

/**
 * 删除并发数偏好：`extensions.zotero.bibtexclean.deleteConcurrency`。
 * 非数字或小于 1 时退回 1（逐个删除），上限 20。
 */
export function deleteConcurrency(): number {
  const pref = Zotero.Prefs.get(DELETE_CONCURRENCY_PREF, true);
  if (typeof pref !== "number" || !Number.isFinite(pref)) {
    return DEFAULT_DELETE_CONCURRENCY;
  }
  return Math.min(Math.max(Math.floor(pref), 1), MAX_DELETE_CONCURRENCY);
}

async function moveCandidateToTrash<T extends Trashable>(
  candidate: T,
): Promise<void> {
  const item = await Zotero.Items.getByLibraryAndKeyAsync(
    candidate.libraryID,
    candidate.itemKey,
  );
  if (!item) {
    throw new Error(`未找到条目 ${candidate.itemKey}`);
  }
  item.deleted = true;
  await item.saveTx();
}

/**
 * 把候选项移入 Zotero 回收站，按偏好里的并发数分批执行。
 * 单个条目失败不影响其余条目，失败明细交给通知层。
 * 泛型约束只要求 libraryID + itemKey，筛选删除与重复附件清理共用。
 */
export async function moveCandidatesToTrash<T extends Trashable>(
  candidates: T[],
): Promise<DeleteResult<T>> {
  const succeeded: T[] = [];
  const failed: { candidate: T; error: Error }[] = [];

  for (const batch of chunk(candidates, deleteConcurrency())) {
    const results = await Promise.allSettled(batch.map(moveCandidateToTrash));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        succeeded.push(batch[index]);
      } else {
        failed.push({ candidate: batch[index], error: result.reason as Error });
      }
    });
  }

  return { succeeded, failed };
}
