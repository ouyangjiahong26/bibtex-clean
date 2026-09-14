/**
 * 筛选删除的候选与条件：纯数据形状 + 纯函数，不依赖 Zotero 运行时。
 *
 * 术语见 CONTEXT.md：候选项（Candidate）、链接附件、笔记、筛选删除。
 */

/** 候选项的两类：链接附件与笔记。 */
export type CandidateKind = "link-attachment" | "note";

/** 条件行的字段范围。`any` 表示在该候选项的每个字段里各试一次。 */
export type FilterField = "any" | "title" | "url" | "path" | "note";

/** 条件行的运算符。不提供正则，见 docs/decision-maps/filter-delete-children.md。 */
export type FilterOperator = "contains" | "notContains";

/** 条件行之间的组合方式。 */
export type MatchMode = "all" | "any";

export type FilterCondition = {
  field: FilterField;
  operator: FilterOperator;
  value: string;
};

export type CandidateFilter = {
  kinds: CandidateKind[];
  match: MatchMode;
  conditions: FilterCondition[];
};

/**
 * 一次筛选删除中可能被删除的子条目。
 *
 * `parentTitle` 只用于列表中区分候选从哪条题录来，不参与条件匹配——
 * 字段范围里没有「父条目标题」这一项。
 */
export type Candidate = {
  itemKey: string;
  libraryID: number;
  kind: CandidateKind;
  title: string;
  parentTitle: string;
  url?: string;
  /** 本地路径：网页快照在 storage 里的文件。 */
  path?: string;
  noteText?: string;
  /** 网页快照（imported_url）：移入回收站不会释放它的磁盘文件。 */
  snapshot?: boolean;
};

/** 候选项的稳定标识，勾选状态按它记录。 */
export function candidateKey(candidate: Candidate): string {
  return `${candidate.libraryID}\x00${candidate.itemKey}`;
}

/**
 * 取出有效的条件行：值为空的行被忽略。
 * 空值行当作恒真会在「任一」模式下命中全部候选。
 */
export function activeConditions(
  conditions: FilterCondition[],
): FilterCondition[] {
  return conditions.filter((condition) => condition.value.trim() !== "");
}

function haystacks(candidate: Candidate, field: FilterField): string[] {
  const texts =
    field === "any"
      ? [candidate.title, candidate.url, candidate.path, candidate.noteText]
      : [candidateValues[field](candidate)];
  return texts.filter((text): text is string => typeof text === "string");
}

const candidateValues: Record<
  Exclude<FilterField, "any">,
  (candidate: Candidate) => string | undefined
> = {
  title: (candidate) => candidate.title,
  url: (candidate) => candidate.url,
  path: (candidate) => candidate.path,
  note: (candidate) => candidate.noteText,
};

/**
 * 单个条件行是否命中候选项。
 * 子串包含、大小写不敏感；候选项没有该字段时，`包含` 不命中，`不包含` 命中。
 */
export function matchesCondition(
  candidate: Candidate,
  condition: FilterCondition,
): boolean {
  const needle = condition.value.trim().toLowerCase();
  const found = haystacks(candidate, condition.field).some((text) =>
    text.toLowerCase().includes(needle),
  );
  return condition.operator === "contains" ? found : !found;
}

/**
 * 按类型与条件行筛选候选项：类型 AND 条件行。
 * 条件为空时退化为按类型全选。
 */
export function filterCandidates(
  candidates: Candidate[],
  filter: CandidateFilter,
): Candidate[] {
  const conditions = activeConditions(filter.conditions);
  return candidates.filter((candidate) => {
    if (!filter.kinds.includes(candidate.kind)) {
      return false;
    }
    if (conditions.length === 0) {
      return true;
    }
    return filter.match === "all"
      ? conditions.every((condition) => matchesCondition(candidate, condition))
      : conditions.some((condition) => matchesCondition(candidate, condition));
  });
}

/**
 * 可见行的默认勾选状态。
 *
 * 含「不包含」条件时默认不勾选：否则「标题 不包含 扫描版」这类条件会把
 * 几乎所有候选标成可见并勾上，一键删除面极大。
 */
export function defaultCheckedKeys(
  visible: Candidate[],
  conditions: FilterCondition[],
): string[] {
  const hasNegation = activeConditions(conditions).some(
    (condition) => condition.operator === "notContains",
  );
  return hasNegation ? [] : visible.map(candidateKey);
}
