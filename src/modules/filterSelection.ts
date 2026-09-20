/**
 * 筛选对话框的勾选状态：纯函数推进，不依赖 DOM。
 *
 * 对话框即模拟运行：条件一变，勾选清空，用户此前的勾选与取消都作废，
 * 点击删除前屏幕上的勾选集就是待删集。默认一律不勾选——默认全勾时，
 * 一次误点「删除选中」就会删光全部可见行；批量勾选由「全选」按钮承担。
 */

import {
  candidateKey,
  filterCandidates,
  type Candidate,
  type CandidateFilter,
  type CandidateKind,
  type FilterCondition,
  type MatchMode,
} from "./filterCandidates";

export type FilterDialogState = {
  filter: CandidateFilter;
  checkedKeys: string[];
};

/** 默认条件行：任意字段、包含、空值（空值行被忽略）。每次都返回新实例。 */
export function emptyCondition(): FilterCondition {
  return { field: "any", operator: "contains", value: "" };
}

function stateFor(filter: CandidateFilter): FilterDialogState {
  return { filter, checkedKeys: [] };
}

export function initialState(): FilterDialogState {
  return stateFor({
    kinds: ["link-attachment", "note"],
    match: "all",
    conditions: [emptyCondition()],
  });
}

/** 勾选或取消一类候选项。 */
export function toggleKind(
  state: FilterDialogState,
  kind: CandidateKind,
): FilterDialogState {
  const kinds = state.filter.kinds.includes(kind)
    ? state.filter.kinds.filter((selected) => selected !== kind)
    : [...state.filter.kinds, kind];
  return stateFor({ ...state.filter, kinds });
}

/** 切换条件行之间的组合方式。 */
export function withMatchMode(
  state: FilterDialogState,
  match: MatchMode,
): FilterDialogState {
  return stateFor({ ...state.filter, match });
}

/** 修改一行条件的字段范围、运算符或值。 */
export function withCondition(
  state: FilterDialogState,
  index: number,
  patch: Partial<FilterCondition>,
): FilterDialogState {
  const current = state.filter.conditions[index];
  const changed =
    current !== undefined &&
    Object.entries(patch).some(
      ([name, value]) => current[name as keyof FilterCondition] !== value,
    );
  // 条件没变就不重算：重算等于清空勾选，而焦点进出下拉框会用同一个值
  // 再走一遍这里（Zotero 7 上 ztoolkit 的自绘下拉改值后只 blur）。越界的索引同此。
  if (!changed) {
    return state;
  }

  const conditions = state.filter.conditions.map((condition, position) =>
    position === index ? { ...condition, ...patch } : condition,
  );
  return stateFor({ ...state.filter, conditions });
}

/** 末尾追加一行空条件。 */
export function addCondition(state: FilterDialogState): FilterDialogState {
  return stateFor({
    ...state.filter,
    conditions: [...state.filter.conditions, emptyCondition()],
  });
}

/** 移除一行条件；移除最后一行时补回一行空条件。 */
export function removeCondition(
  state: FilterDialogState,
  index: number,
): FilterDialogState {
  const remaining = state.filter.conditions.filter(
    (_condition, position) => position !== index,
  );
  return stateFor({
    ...state.filter,
    conditions: remaining.length > 0 ? remaining : [emptyCondition()],
  });
}

/** 手动勾选或取消一行，不改变筛选条件。 */
export function toggleChecked(
  state: FilterDialogState,
  key: string,
): FilterDialogState {
  const checkedKeys = state.checkedKeys.includes(key)
    ? state.checkedKeys.filter((checked) => checked !== key)
    : [...state.checkedKeys, key];
  return { ...state, checkedKeys };
}

/** 全选或全不选当前可见的行。 */
export function setAllChecked(
  state: FilterDialogState,
  candidates: Candidate[],
  checked: boolean,
): FilterDialogState {
  const visible = filterCandidates(candidates, state.filter);
  return { ...state, checkedKeys: checked ? visible.map(candidateKey) : [] };
}

/** 当前勾选的候选项（只可能是可见行）。 */
export function checkedCandidates(
  candidates: Candidate[],
  state: FilterDialogState,
): Candidate[] {
  const visible = filterCandidates(candidates, state.filter);
  return visible.filter((candidate) =>
    state.checkedKeys.includes(candidateKey(candidate)),
  );
}
