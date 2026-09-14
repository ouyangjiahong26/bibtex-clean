/**
 * Zotero 条目读写：耦合 Zotero 运行时，可通过 mock 测试。
 */

import type { CleanableItem, FieldChange } from "./changes";
import { chunk } from "../utils/chunk";

/**
 * 从 Zotero Item 提取可清理字段。
 * 只处理普通文献条目（regular item），忽略笔记、附件等。
 *
 * 注意：Zotero 中作者信息存储在 creators 而非单一字段中，
 * 这里将 creatorType 为 author 或 inventor 的创作者合并为便于清理的字符串。
 */
export function toCleanableItem(item: Zotero.Item): CleanableItem | undefined {
  if (!item.isRegularItem()) {
    return undefined;
  }
  return {
    key: item.key,
    libraryID: item.libraryID,
    title: item.getField("title") as string,
    author: formatAuthors(item.getCreatorsJSON()),
    issue: (item.getField("issue") as string) || undefined,
    volume: (item.getField("volume") as string) || undefined,
  };
}

/**
 * 将变更写回 Zotero 条目。
 */
export async function applyChanges(changes: FieldChange[]): Promise<{
  succeeded: FieldChange[];
  failed: { change: FieldChange; error: Error }[];
}> {
  return applyChangeValues(changes, (change) => change.newValue);
}

/**
 * 撤销一组变更，将字段恢复到清理前的值。
 */
export async function undoChanges(changes: FieldChange[]): Promise<{
  succeeded: FieldChange[];
  failed: { change: FieldChange; error: Error }[];
}> {
  return applyChangeValues(changes, (change) => change.oldValue);
}

/** 并发写入的批次大小。 */
const BATCH_SIZE = 20;

async function applyChangeValues(
  changes: FieldChange[],
  valueSelector: (change: FieldChange) => string,
): Promise<{
  succeeded: FieldChange[];
  failed: { change: FieldChange; error: Error }[];
}> {
  const groups = groupChangesByItem(changes);
  const batches = chunk(groups, BATCH_SIZE);

  const succeeded: FieldChange[] = [];
  const failed: { change: FieldChange; error: Error }[] = [];

  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map((group) => applyGroup(group, valueSelector)),
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        succeeded.push(...result.value);
      } else {
        // 整个条目分组失败时，该组内所有变更都标记为失败
        failed.push(
          ...result.reason.changes.map((change: FieldChange) => ({
            change,
            error: result.reason.error,
          })),
        );
      }
    }
  }

  return { succeeded, failed };
}

/** 将变更按 (libraryID, itemKey) 分组。 */
function groupChangesByItem(changes: FieldChange[]): FieldChange[][] {
  const map = new Map<string, FieldChange[]>();
  for (const change of changes) {
    const key = `${change.libraryID}\x00${change.itemKey}`;
    const group = map.get(key);
    if (group) {
      group.push(change);
    } else {
      map.set(key, [change]);
    }
  }
  return [...map.values()];
}

/** 对一个条目的所有变更一次性写入。 */
async function applyGroup(
  group: FieldChange[],
  valueSelector: (change: FieldChange) => string,
): Promise<FieldChange[]> {
  try {
    const first = group[0];
    const item = await Zotero.Items.getByLibraryAndKeyAsync(
      first.libraryID,
      first.itemKey,
    );
    if (!item) {
      throw new Error(`Item ${first.itemKey} not found`);
    }

    for (const change of group) {
      const value = valueSelector(change);
      if (change.field === "author") {
        applyAuthorChange(item, value);
      } else {
        // zotero-types 将 setField 声明为 void，运行时实际返回 boolean（false 表示字段对该条目类型无效）
        const ok = item.setField(
          change.field as any,
          value,
        ) as unknown as boolean;
        if (!ok) {
          throw new Error(
            `无法将字段 ${change.field} 写入条目 ${first.itemKey}（字段对该条目类型无效）`,
          );
        }
      }
    }

    await item.saveTx();
    return group;
  } catch (error) {
    throw { error: error as Error, changes: group };
  }
}

export function applyAuthorChange(item: Zotero.Item, newValue: string): void {
  const newAuthors = parseAuthors(newValue);
  const creators = item.getCreatorsJSON();
  const nonAuthors = creators.filter(
    (creator) =>
      creator.creatorType !== "author" && creator.creatorType !== "inventor",
  );
  item.setCreators([...newAuthors, ...nonAuthors]);
}

/**
 * 将 Zotero creator 数组合并为可清理的 author 字符串。
 */
export function formatAuthors(
  creators: _ZoteroTypes.Item.CreatorJSON[],
): string | undefined {
  const authors = creators
    .filter(
      (creator) =>
        creator.creatorType === "author" || creator.creatorType === "inventor",
    )
    .map((creator) => {
      if (creator.name) return creator.name;
      if (creator.firstName) return `${creator.lastName}, ${creator.firstName}`;
      return creator.lastName;
    });
  return authors.length > 0 ? authors.join("; ") : undefined;
}

/**
 * 将 author 字符串解析为 Zotero creator 数组。
 *
 * 输入可能是清理前的 "Smith, John; Doe, Jane" 或清理后的
 * "Smith, John and Doe, Jane"，因此按 ";" 或 " and " 拆分。
 *
 * 已知限制：
 * - 含逗号的机构名（如 "ACME, Inc."）会被拆成 lastName/firstName，
 *   当前仅处理个人作者常见的 "Last, First" 格式。
 */
export function parseAuthors(value: string): _ZoteroTypes.Item.CreatorJSON[] {
  const separator = value.includes(";") ? ";" : " and ";
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter((trimmed) => trimmed !== "")
    .map((trimmed) => {
      const commaIndex = trimmed.indexOf(",");
      if (commaIndex > 0) {
        return {
          creatorType: "author",
          lastName: trimmed.slice(0, commaIndex).trim(),
          firstName: trimmed.slice(commaIndex + 1).trim(),
        };
      }
      return {
        creatorType: "author",
        name: trimmed,
      };
    });
}
