/**
 * 筛选删除对话框的窗口层：ztoolkit.Dialog + 事件绑定与重绘。
 *
 * 纯数据与 HTML 在 filterDialog.ts；这一层做 DOM 事件代理，只能在 Zotero
 * 运行时里验证。
 */

import type {
  Candidate,
  CandidateKind,
  FilterField,
  FilterOperator,
  MatchMode,
} from "./filterCandidates";
import {
  FILTER_DIALOG_DATA_KEYS,
  FILTER_DIALOG_IDS,
  FILTER_DIALOG_ROLES,
  renderCandidateRowsHtml,
  renderConditionRowsHtml,
  renderFilterDialog,
  renderFilterDialogHtml,
} from "./filterDialog";
import {
  addCondition,
  checkedCandidates,
  initialState,
  removeCondition,
  setAllChecked,
  toggleChecked,
  toggleKind,
  withCondition,
  withMatchMode,
  type FilterDialogState,
} from "./filterSelection";
import { getString, type StringGetter } from "../utils/locale";
import { waitForDialogClose } from "../utils/dialog";

// ── 对话框入口 ──────────────────────────────────────────────────

type FilterDialogDataObject = {
  _lastButtonId?: string;
  _result?: Candidate[];
  loadCallback?: () => void;
};

/** 从事件目标反查所在条件行的序号；找不到时返回 -1，纯函数会忽略它。 */
function conditionIndexOf(target: HTMLElement): number {
  const row = target.closest(".condition-row") as HTMLElement | null;
  return row?.dataset.index === undefined ? -1 : Number(row.dataset.index);
}

/**
 * 打开筛选删除对话框，返回用户勾选并确认的候选项。
 *
 * @returns 确认时的勾选集；取消或关闭窗口时返回 undefined
 */
export async function openFilterDeleteDialog(
  candidates: Candidate[],
  waitForClose?: (dialog: InstanceType<ZToolkit["Dialog"]>) => Promise<void>,
  getStringFn?: StringGetter,
): Promise<Candidate[] | undefined> {
  const fn = getStringFn ?? (getString as StringGetter);
  let state = initialState(candidates);

  const dialog = new ztoolkit.Dialog(1, 1);
  const dialogData: FilterDialogDataObject = {};

  dialog.addCell(
    0,
    0,
    {
      tag: "div",
      namespace: "html",
      id: "bibtex-clean-filter-content",
      styles: {
        width: "720px",
        maxHeight: "560px",
        overflowY: "auto",
        padding: "12px 16px",
      },
      properties: {
        innerHTML: renderFilterDialogHtml(
          renderFilterDialog(candidates, state, fn),
        ),
      },
    },
    true,
  );

  dialog
    .addButton(fn("dialog-button-cancel"), FILTER_DIALOG_IDS.cancelButton)
    .addButton(
      fn("dialog-button-delete-selected"),
      FILTER_DIALOG_IDS.confirmButton,
      {
        callback: () => {
          dialogData._result = checkedCandidates(candidates, state);
        },
      },
    );

  dialog.setDialogData(dialogData);

  dialogData.loadCallback = () => {
    const doc = dialog.window?.document;
    const root = doc?.getElementById(
      FILTER_DIALOG_IDS.root,
    ) as HTMLElement | null;
    const confirm = doc?.getElementById(
      FILTER_DIALOG_IDS.confirmButton,
    ) as HTMLButtonElement | null;
    if (!doc || !root || !confirm) {
      return;
    }
    const conditions = doc.getElementById(
      FILTER_DIALOG_IDS.conditions,
    ) as HTMLElement;
    const list = doc.getElementById(
      FILTER_DIALOG_IDS.candidateList,
    ) as HTMLElement;
    const summary = doc.getElementById(
      FILTER_DIALOG_IDS.checkedSummary,
    ) as HTMLElement;

    // 条件行只在增删时重绘：重绘输入框会丢焦点与光标位置。
    const repaint = (patchConditions: boolean) => {
      const data = renderFilterDialog(candidates, state, fn);
      list.innerHTML = renderCandidateRowsHtml(data);
      summary.textContent = data.checkedSummary;
      confirm.innerHTML = data.confirmLabel;
      confirm.disabled = data.checkedCount === 0;
      if (patchConditions) {
        conditions.innerHTML = renderConditionRowsHtml(data);
      }
    };

    const apply = (next: FilterDialogState, patchConditions = false) => {
      state = next;
      repaint(patchConditions);
    };

    root.addEventListener("change", (event: Event) => {
      const target = event.target as HTMLInputElement;
      const fields = target.dataset;
      const role = fields[FILTER_DIALOG_DATA_KEYS.role];
      const kind = fields[FILTER_DIALOG_DATA_KEYS.kind];
      const match = fields[FILTER_DIALOG_DATA_KEYS.match];
      const key = fields[FILTER_DIALOG_DATA_KEYS.candidate];
      if (kind !== undefined) {
        apply(toggleKind(state, kind as CandidateKind, candidates));
      } else if (match !== undefined) {
        apply(withMatchMode(state, match as MatchMode, candidates));
      } else if (key !== undefined) {
        apply(toggleChecked(state, key));
      } else if (role === FILTER_DIALOG_ROLES.field) {
        apply(
          withCondition(
            state,
            conditionIndexOf(target),
            { field: target.value as FilterField },
            candidates,
          ),
        );
      } else if (role === FILTER_DIALOG_ROLES.operator) {
        apply(
          withCondition(
            state,
            conditionIndexOf(target),
            { operator: target.value as FilterOperator },
            candidates,
          ),
        );
      }
    });

    root.addEventListener("input", (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (
        target.dataset[FILTER_DIALOG_DATA_KEYS.role] !==
        FILTER_DIALOG_ROLES.value
      ) {
        return;
      }
      apply(
        withCondition(
          state,
          conditionIndexOf(target),
          { value: target.value },
          candidates,
        ),
      );
    });

    root.addEventListener("click", (event: Event) => {
      const target = event.target as HTMLElement;
      switch (target.id) {
        case FILTER_DIALOG_IDS.addCondition:
          apply(addCondition(state, candidates), true);
          return;
        case FILTER_DIALOG_IDS.selectAll:
          apply(setAllChecked(state, candidates, true));
          return;
        case FILTER_DIALOG_IDS.selectNone:
          apply(setAllChecked(state, candidates, false));
          return;
      }
      if (
        target.dataset[FILTER_DIALOG_DATA_KEYS.role] ===
        FILTER_DIALOG_ROLES.removeCondition
      ) {
        apply(
          removeCondition(state, conditionIndexOf(target), candidates),
          true,
        );
      }
    });
  };

  dialog.open(fn("dialog-title-filter-delete"), {
    centerscreen: true,
    resizable: true,
    fitContent: true,
  });

  await (waitForClose ?? waitForDialogClose)(dialog);

  if (dialogData._lastButtonId !== FILTER_DIALOG_IDS.confirmButton) {
    return undefined;
  }
  return dialogData._result ?? [];
}
