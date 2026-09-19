/**
 * 重复附件的分组与保留策略：纯数据形状 + 纯函数，不依赖 Zotero 运行时。
 *
 * 术语见 CONTEXT.md：重复附件、重复组、保留者。判定标准与取舍见
 * docs/adr/0004-duplicate-attachments-grouped-by-filename.md。
 */

/** 参与重复判定的两类附件：文件附件与链接附件。 */
export type DuplicateKind = "file-attachment" | "link-attachment";

/**
 * 一次清理中可能被删除的附件。`filename` / `url` / `dateAdded` /
 * `annotationCount` 只服务分组、保留策略与展示。
 */
export type DuplicateAttachment = {
  itemKey: string;
  libraryID: number;
  kind: DuplicateKind;
  title: string;
  parentTitle: string;
  /** 父条目标识（`libraryID\x00key`）：重复只在同一父条目内判定。 */
  parentKey: string;
  /** 文件附件的文件名，保留原始大小写用于展示。 */
  filename?: string;
  /** 链接附件的 URL。 */
  url?: string;
  /** Zotero 的 dateAdded（"YYYY-MM-DD HH:MM:SS"），固定宽度，字典序即时间序。 */
  dateAdded: string;
  annotationCount: number;
  /** 网页快照（imported_url）：移入回收站不会释放它的磁盘文件。 */
  snapshot?: boolean;
};

/** 一组重复附件：分组键相同、成员 ≥ 2。 */
export type DuplicateGroup = {
  /** 展示用分组键：文件名（原始大小写）或 URL。 */
  groupKey: string;
  /** 保留者排在最前，其余按添加时间升序。 */
  members: DuplicateAttachment[];
  /** 默认保留者的 key。 */
  keepKey: string;
};

/** 附件的稳定标识，勾选状态按它记录。格式与 Candidate 的 key 一致。 */
export function duplicateAttachmentKey(
  attachment: Pick<DuplicateAttachment, "libraryID" | "itemKey">,
): string {
  return `${attachment.libraryID}\x00${attachment.itemKey}`;
}

function byDateAdded(a: DuplicateAttachment, b: DuplicateAttachment): number {
  if (a.dateAdded < b.dateAdded) {
    return -1;
  }
  return a.dateAdded > b.dateAdded ? 1 : 0;
}

/** 码点序比较：确定的排序，不随运行环境的本地化排序规则变化。 */
function byCodepoint(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/**
 * 选出组内默认保留者：批注最多的优先（删除带批注的附件会连带丢失批注），
 * 批注数并列时取添加最早的。
 */
export function pickKeep(members: DuplicateAttachment[]): DuplicateAttachment {
  const sorted = [...members].sort((a, b) => {
    if (a.annotationCount !== b.annotationCount) {
      return b.annotationCount - a.annotationCount;
    }
    return byDateAdded(a, b);
  });
  return sorted[0];
}

/**
 * 分组键。文件附件按文件名（小写：Windows/macOS 文件系统大小写不敏感，
 * 合并来的同名文件大小写也可能不一致）；链接附件按 URL 精确匹配（路径
 * 大小写不同的 URL 是不同页面）。父条目 + kind 作前缀：重复只在同一
 * 父条目内判定，且文件附件与链接附件的键不会互相撞车。
 * 文件名或 URL 缺失时返回空串，该附件不参与分组。
 */
function groupingKey(attachment: DuplicateAttachment): string {
  const scope = `${attachment.parentKey}\x00`;
  if (attachment.kind === "file-attachment") {
    const filename = attachment.filename?.trim().toLowerCase();
    return filename ? `${scope}file\x00${filename}` : "";
  }
  const url = attachment.url?.trim();
  return url ? `${scope}url\x00${url}` : "";
}

/**
 * 按分组键把附件聚成重复组，只保留成员 ≥ 2 的组。
 * 组按父条目标题 + 分组键排序，组内保留者在最前。
 */
export function toDuplicateGroups(
  attachments: DuplicateAttachment[],
): DuplicateGroup[] {
  const buckets = new Map<string, DuplicateAttachment[]>();
  for (const attachment of attachments) {
    const key = groupingKey(attachment);
    if (key === "") {
      continue;
    }
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(attachment);
    } else {
      buckets.set(key, [attachment]);
    }
  }

  return [...buckets.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([key, members]) => {
      const keep = pickKeep(members);
      const rest = members
        .filter((member) => member !== keep)
        .sort(byDateAdded);
      return {
        groupKey:
          keep.kind === "file-attachment"
            ? (keep.filename ?? key)
            : (keep.url ?? key),
        members: [keep, ...rest],
        keepKey: duplicateAttachmentKey(keep),
      };
    })
    .sort((a, b) => {
      // 码点序而非 localeCompare：后者随运行环境的排序规则变化（如中文
      // 拼音序），这里只需要一个确定的稳定顺序。
      const byParent = byCodepoint(
        a.members[0].parentTitle,
        b.members[0].parentTitle,
      );
      return byParent !== 0 ? byParent : byCodepoint(a.groupKey, b.groupKey);
    });
}

/** 每组中除保留者外的全部附件 key：对话框的默认勾选集。 */
export function defaultTrashKeys(groups: DuplicateGroup[]): string[] {
  return groups.flatMap((group) =>
    group.members
      .filter((member) => duplicateAttachmentKey(member) !== group.keepKey)
      .map(duplicateAttachmentKey),
  );
}

/** 勾选或取消一个附件。 */
export function toggleCheckedKey(checkedKeys: string[], key: string): string[] {
  return checkedKeys.includes(key)
    ? checkedKeys.filter((checked) => checked !== key)
    : [...checkedKeys, key];
}

/** 按组序返回当前勾选的附件，删除按这个顺序执行。 */
export function checkedAttachments(
  groups: DuplicateGroup[],
  checkedKeys: string[],
): DuplicateAttachment[] {
  const checked = new Set(checkedKeys);
  return groups.flatMap((group) =>
    group.members.filter((member) =>
      checked.has(duplicateAttachmentKey(member)),
    ),
  );
}
