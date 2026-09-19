/**
 * 重复附件的读取：耦合 Zotero 运行时，可通过 mock 测试。
 *
 * 只负责采集数据，分组与保留策略在 duplicateGroups.ts 的纯函数里。
 * 删除复用 zoteroChildren.ts 的移入回收站管线。
 */

import { isLinkAttachment } from "./zoteroChildren";
import {
  toDuplicateGroups,
  type DuplicateAttachment,
  type DuplicateGroup,
} from "./duplicateGroups";

/** 文件附件：导入文件（imported_file）与链接文件（linked_file）。 */
function isFileAttachment(item: Zotero.Item): boolean {
  // linkMode 运行时是数字常量，先取数字再比较，理由同 isLinkAttachment。
  const mode: number = item.attachmentLinkMode;
  return (
    mode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE ||
    mode === Zotero.Attachments.LINK_MODE_LINKED_FILE
  );
}

/**
 * 把附件转成重复判定的输入。不属于参与范围（笔记、无文件名的文件附件、
 * 无 URL 的链接附件）时返回 undefined。`parentTitle` 与 `parentKey`
 * （`libraryID\x00key`）来自所属父条目，重复只在同一父条目内判定。
 */
export function toDuplicateAttachment(
  item: Zotero.Item,
  parentTitle: string,
  parentKey: string,
): DuplicateAttachment | undefined {
  if (!item.isAttachment()) {
    return undefined;
  }

  const dateAdded = item.dateAdded ?? "";

  if (isFileAttachment(item)) {
    const filename = item.attachmentFilename?.trim();
    if (!filename) {
      return undefined;
    }
    return {
      itemKey: item.key,
      libraryID: item.libraryID,
      kind: "file-attachment",
      title: (item.getField("title") as string) || filename,
      parentTitle,
      parentKey,
      filename,
      dateAdded,
      // numAnnotations() 只能用于文件附件，链接附件调用会抛错
      annotationCount: item.numAnnotations(),
    };
  }

  if (isLinkAttachment(item)) {
    const url = ((item.getField("url") as string) || "").trim();
    if (!url) {
      return undefined;
    }
    return {
      itemKey: item.key,
      libraryID: item.libraryID,
      kind: "link-attachment",
      title: (item.getField("title") as string) || url,
      parentTitle,
      parentKey,
      url,
      dateAdded,
      // 链接附件不承载批注；numAnnotations() 对它抛错，直接记 0
      annotationCount: 0,
      snapshot:
        item.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_URL,
    };
  }

  return undefined;
}

/** 每处理多少个条目向 UI 让出一次主线程，避免大量选中条目时冻结界面。 */
const YIELD_EVERY = 50;

/** 向 UI 让出主线程一次。默认用宏任务队列，可注入以便测试。 */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export type CollectProgress = {
  /** 每批让出时与全部结束时回调（已处理数，总数）。 */
  onProgress?: (done: number, total: number) => void;
  /** 测试注入用；真实运行用 setTimeout。 */
  wait?: () => Promise<void>;
};

/**
 * 收集选中普通条目下的重复附件组。
 *
 * 只看每个父条目自己的直接附件：重复是合并重复条目留下的同父条目现象，
 * 不同父条目下的同名附件不算。getAttachments() 默认不含回收站中的项。
 * 选中的附件、笔记等非普通条目跳过——单独一个附件无从重复。
 *
 * 异步分批执行并定期让出主线程，选中大量条目时界面保持响应、进度可报。
 */
export async function collectDuplicateGroups(
  selectedItems: Zotero.Item[],
  progress: CollectProgress = {},
): Promise<DuplicateGroup[]> {
  const attachments: DuplicateAttachment[] = [];
  const total = selectedItems.length;

  for (let index = 0; index < selectedItems.length; index++) {
    const item = selectedItems[index];
    if (item.isRegularItem()) {
      const parentTitle = (item.getField("title") as string) ?? "";
      const parentKey = `${item.libraryID}\x00${item.key}`;
      for (const attachmentID of item.getAttachments()) {
        const attachment = Zotero.Items.get(attachmentID);
        if (attachment) {
          const candidate = toDuplicateAttachment(
            attachment,
            parentTitle,
            parentKey,
          );
          if (candidate) {
            attachments.push(candidate);
          }
        }
      }
    }

    const done = index + 1;
    if (done % YIELD_EVERY === 0) {
      progress.onProgress?.(done, total);
      await (progress.wait ?? yieldToUI)();
    }
  }

  progress.onProgress?.(total, total);
  return toDuplicateGroups(attachments);
}
