/**
 * 清理重复附件对话框的窗口层：ztoolkit.Dialog + 事件绑定与重绘。
 *
 * 纯数据与元素树在 duplicateDialog.ts；这一层用 ztoolkit.createElement
 * 建树，事件代理读 data-* 属性，控件为 HTML，因此只能在 Zotero 运行时验证。
 */

import type { TagElementProps } from "zotero-plugin-toolkit";
import type { DuplicateAttachment, DuplicateGroup } from "./duplicateGroups";
import {
  checkedAttachments,
  defaultTrashKeys,
  toggleCheckedKey,
} from "./duplicateGroups";
import {
  DUPLICATE_DIALOG_DATA_KEYS,
  DUPLICATE_DIALOG_IDS,
  buildDuplicateDialogContent,
  buildGroupItems,
  renderDuplicateDialog,
} from "./duplicateDialog";
import { getString, type StringGetter } from "../utils/locale";
import { waitForDialogClose } from "../utils/dialog";

type DuplicateDialogDataObject = {
  _lastButtonId?: string;
  _result?: DuplicateAttachment[];
  loadCallback?: () => void;
};

/**
 * 打开清理重复附件对话框，返回用户勾选并确认要删除的附件。
 *
 * @returns 确认时的勾选集；取消或关闭窗口时返回 undefined
 */
export async function openDuplicateDeleteDialog(
  groups: DuplicateGroup[],
  waitForClose?: (dialog: InstanceType<ZToolkit["Dialog"]>) => Promise<void>,
  getStringFn?: StringGetter,
): Promise<DuplicateAttachment[] | undefined> {
  const fn = getStringFn ?? (getString as StringGetter);
  let checkedKeys = defaultTrashKeys(groups);

  const dialog = new ztoolkit.Dialog(1, 1);
  const dialogData: DuplicateDialogDataObject = {};

  dialog.addCell(
    0,
    0,
    buildDuplicateDialogContent(renderDuplicateDialog(groups, checkedKeys, fn)),
    true,
  );

  dialog
    .addButton(fn("dialog-button-cancel"), DUPLICATE_DIALOG_IDS.cancelButton)
    .addButton(
      fn("dialog-button-delete-selected"),
      DUPLICATE_DIALOG_IDS.confirmButton,
      {
        callback: () => {
          dialogData._result = checkedAttachments(groups, checkedKeys);
        },
      },
    );

  dialog.setDialogData(dialogData);

  dialogData.loadCallback = () => {
    const doc = dialog.window?.document;
    if (!doc) {
      Zotero.debug("[BibTeX Clean] 重复附件对话框没有 document，跳过事件绑定");
      return;
    }
    const root = doc.getElementById(DUPLICATE_DIALOG_IDS.root);
    const confirm = doc.getElementById(
      DUPLICATE_DIALOG_IDS.confirmButton,
    ) as HTMLButtonElement | null;
    const groupList = doc.getElementById(DUPLICATE_DIALOG_IDS.groupList);
    const summary = doc.getElementById(DUPLICATE_DIALOG_IDS.checkedSummary);
    if (!root || !confirm || !groupList || !summary) {
      Zotero.debug(
        `[BibTeX Clean] 重复附件对话框元素缺失：root=${!!root} confirm=${!!confirm} groupList=${!!groupList} summary=${!!summary}`,
      );
      return;
    }

    const repaint = () => {
      const data = renderDuplicateDialog(groups, checkedKeys, fn);
      const rows = ztoolkit.UI.createElement(doc, "fragment", {
        children: buildGroupItems(data) as TagElementProps[],
      });
      groupList.replaceChildren(rows);
      summary.setAttribute("value", data.checkedSummary);
      confirm.innerHTML = data.confirmLabel;
      confirm.disabled = data.checkedCount === 0;
    };

    // HTML 控件：勾选用 change，按钮用 click
    root.addEventListener("change", (event: Event) => {
      const target = event.target as Element;
      const key = target.getAttribute(DUPLICATE_DIALOG_DATA_KEYS.member);
      if (key !== null) {
        checkedKeys = toggleCheckedKey(checkedKeys, key);
        repaint();
      }
    });

    root.addEventListener("click", (event: Event) => {
      const target = event.target as Element;
      if (target.id === DUPLICATE_DIALOG_IDS.selectNone) {
        checkedKeys = [];
        repaint();
      }
    });

    repaint();
  };

  dialog.open(fn("dialog-title-duplicate-delete"), {
    centerscreen: true,
    resizable: true,
    // 不用 fitContent：理由同 filterDialogWindow.ts
    width: 720,
    height: 560,
  });

  await (waitForClose ?? waitForDialogClose)(dialog);

  if (dialogData._lastButtonId !== DUPLICATE_DIALOG_IDS.confirmButton) {
    return undefined;
  }
  return dialogData._result ?? [];
}
