/**
 * 筛选删除对话框的窗口层：ztoolkit.Dialog + 事件绑定与重绘。
 *
 * 纯数据与元素树在 filterDialog.ts；这一层用 ztoolkit.createElement 建树，
 * 事件代理读 data-* 属性与控件的 value，控件为 HTML，因此只能在 Zotero 运行时里验证。
 */

import type { TagElementProps } from "zotero-plugin-toolkit";
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
  buildCandidateRowItems,
  buildConditionRowItems,
  buildFilterDialogContent,
  renderFilterDialog,
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

type FilterDialogDataObject = {
  _lastButtonId?: string;
  _result?: Candidate[];
  loadCallback?: () => void;
};

/** menulist 与 textbox 都用 value 承载当前值。 */
type ValueElement = Element & { value: string };

/** 从事件目标反查所在条件行的序号；找不到时返回 -1，纯函数会忽略它。 */
function conditionIndexOf(target: Element): number {
  const index = target.closest(".condition-row")?.getAttribute("data-index");
  return index === null || index === undefined ? -1 : Number(index);
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
    buildFilterDialogContent(renderFilterDialog(candidates, state, fn)),
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
    if (!doc) {
      Zotero.debug("[BibTeX Clean] 筛选删除对话框没有 document，跳过事件绑定");
      return;
    }
    const root = doc.getElementById(FILTER_DIALOG_IDS.root);
    const confirm = doc.getElementById(
      FILTER_DIALOG_IDS.confirmButton,
    ) as HTMLButtonElement | null;
    const conditions = doc.getElementById(FILTER_DIALOG_IDS.conditions);
    const list = doc.getElementById(FILTER_DIALOG_IDS.candidateList);
    const summary = doc.getElementById(FILTER_DIALOG_IDS.checkedSummary);
    if (!root || !confirm || !conditions || !list || !summary) {
      Zotero.debug(
        `[BibTeX Clean] 筛选删除对话框元素缺失：root=${!!root} confirm=${!!confirm} conditions=${!!conditions} list=${!!list} summary=${!!summary}`,
      );
      return;
    }

    // 条件行只在增删时重绘：重绘输入框会丢焦点与光标位置。
    const repaint = (patchConditions: boolean) => {
      const data = renderFilterDialog(candidates, state, fn);
      const rows = ztoolkit.UI.createElement(doc, "fragment", {
        children: buildCandidateRowItems(data) as TagElementProps[],
      });
      list.replaceChildren(rows);
      summary.setAttribute("value", data.checkedSummary);
      confirm.innerHTML = data.confirmLabel;
      confirm.disabled = data.checkedCount === 0;
      if (patchConditions) {
        const conditionRows = ztoolkit.UI.createElement(doc, "fragment", {
          children: buildConditionRowItems(data) as TagElementProps[],
        });
        conditions.replaceChildren(conditionRows);
      }
    };

    const apply = (next: FilterDialogState, patchConditions = false) => {
      state = next;
      repaint(patchConditions);
    };

    const readValue = (target: Element): string =>
      (target as ValueElement).value ?? "";

    // HTML 控件：勾选/单选/下拉用 change，文本用 input，按钮用 click
    root.addEventListener("change", (event: Event) => {
      const target = event.target as Element;
      const role = target.getAttribute(FILTER_DIALOG_DATA_KEYS.role);
      const kind = target.getAttribute(FILTER_DIALOG_DATA_KEYS.kind);
      const match = target.getAttribute(FILTER_DIALOG_DATA_KEYS.match);
      const key = target.getAttribute(FILTER_DIALOG_DATA_KEYS.candidate);

      if (kind !== null) {
        apply(toggleKind(state, kind as CandidateKind, candidates));
      } else if (match !== null) {
        apply(withMatchMode(state, match as MatchMode, candidates));
      } else if (key !== null) {
        apply(toggleChecked(state, key));
      } else if (role === FILTER_DIALOG_ROLES.field) {
        apply(
          withCondition(
            state,
            conditionIndexOf(target),
            { field: readValue(target) as FilterField },
            candidates,
          ),
        );
      } else if (role === FILTER_DIALOG_ROLES.operator) {
        apply(
          withCondition(
            state,
            conditionIndexOf(target),
            { operator: readValue(target) as FilterOperator },
            candidates,
          ),
        );
      }
    });

    const onValueChanged = (event: Event) => {
      const target = event.target as Element;
      if (
        target.getAttribute(FILTER_DIALOG_DATA_KEYS.role) !==
        FILTER_DIALOG_ROLES.value
      ) {
        return;
      }
      apply(
        withCondition(
          state,
          conditionIndexOf(target),
          { value: readValue(target) },
          candidates,
        ),
      );
    };
    root.addEventListener("input", onValueChanged);

    root.addEventListener("click", (event: Event) => {
      const target = event.target as Element;
      const role = target.getAttribute(FILTER_DIALOG_DATA_KEYS.role);

      if (target.id === FILTER_DIALOG_IDS.addCondition) {
        apply(addCondition(state, candidates), true);
      } else if (target.id === FILTER_DIALOG_IDS.selectAll) {
        apply(setAllChecked(state, candidates, true));
      } else if (target.id === FILTER_DIALOG_IDS.selectNone) {
        apply(setAllChecked(state, candidates, false));
      } else if (role === FILTER_DIALOG_ROLES.removeCondition) {
        apply(
          removeCondition(state, conditionIndexOf(target), candidates),
          true,
        );
      }
    });

    // Zotero 7（Gecko 115）上 ztoolkit 会把 select 换成 div 自绘下拉：点击选项时
    // 它直接改 select.value 再 blur，不派发 change。focusout 会冒泡，在这里补读值。
    root.addEventListener("focusout", (event: Event) => {
      const target = event.target as Element;
      const role = target.getAttribute(FILTER_DIALOG_DATA_KEYS.role);
      if (
        role !== FILTER_DIALOG_ROLES.field &&
        role !== FILTER_DIALOG_ROLES.operator
      ) {
        return;
      }
      apply(
        withCondition(
          state,
          conditionIndexOf(target),
          role === FILTER_DIALOG_ROLES.field
            ? { field: readValue(target) as FilterField }
            : { operator: readValue(target) as FilterOperator },
          candidates,
        ),
      );
    });

    repaint(false);
  };

  dialog.open(fn("dialog-title-filter-delete"), {
    centerscreen: true,
    resizable: true,
    // 不用 fitContent：XUL 盒子在 sizeToContent 下会算成很小的高度，文字显示不全
    width: 760,
    height: 560,
  });

  await (waitForClose ?? waitForDialogClose)(dialog);

  if (dialogData._lastButtonId !== FILTER_DIALOG_IDS.confirmButton) {
    return undefined;
  }
  return dialogData._result ?? [];
}
