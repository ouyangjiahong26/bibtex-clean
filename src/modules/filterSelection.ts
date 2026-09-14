/**
 * 筛选对话框的勾选状态：纯函数推进，不依赖 DOM。
 *
 * 对话框即模拟运行：条件一变，勾选按新的可见集重算，用户此前的勾选与
 * 取消都作废。这样点击删除前，屏幕上的勾选集就是待删集。
 */

import {
  candidateKey,
  defaultCheckedKeys,
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

function stateFor(
  candidates: Candidate[],
  filter: CandidateFilter,
): FilterDialogState {
  const visible = filterCandidates(candidates, filter);
  return {
    filter,
    checkedKeys: defaultCheckedKeys(visible, filter.conditions),
  };
}

export function initialState(candidates: Candidate[]): FilterDialogState {
  return stateFor(candidates, {
    kinds: ["link-attachment", "note"],
    match: "all",
    conditions: [emptyCondition()],
  });
}

/** 勾选或取消一类候选项。 */
export function toggleKind(
  state: FilterDialogState,
  kind: CandidateKind,
  candidates: Candidate[],
): FilterDialogState {
  const kinds = state.filter.kinds.includes(kind)
    ? state.filter.kinds.filter((selected) => selected !== kind)
    : [...state.filter.kinds, kind];
  return stateFor(candidates, { ...state.filter, kinds });
}

/** 切换条件行之间的组合方式。 */
export function withMatchMode(
  state: FilterDialogState,
  match: MatchMode,
  candidates: Candidate[],
): FilterDialogState {
  return stateFor(candidates, { ...state.filter, match });
}

/** 修改一行条件的字段范围、运算符或值。 */
export function withCondition(
  state: FilterDialogState,
  index: number,
  patch: Partial<FilterCondition>,
  candidates: Candidate[],
): FilterDialogState {
  const conditions = state.filter.conditions.map((condition, position) =>
    position === index ? { ...condition, ...patch } : condition,
  );
  return stateFor(candidates, { ...state.filter, conditions });
}

/** 末尾追加一行空条件。 */
export function addCondition(
  state: FilterDialogState,
  candidates: Candidate[],
): FilterDialogState {
  return stateFor(candidates, {
    ...state.filter,
    conditions: [...state.filter.conditions, emptyCondition()],
  });
}

/** 移除一行条件；移除最后一行时补回一行空条件。 */
export function removeCondition(
  state: FilterDialogState,
  index: number,
  candidates: Candidate[],
): FilterDialogState {
  const remaining = state.filter.conditions.filter(
    (_condition, position) => position !== index,
  );
  return stateFor(candidates, {
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
