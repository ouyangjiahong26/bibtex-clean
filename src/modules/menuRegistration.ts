/**
 * 菜单注册：负责右键菜单项的注册。
 */

import type { CleanSessionStore } from "./cleanSessionStore";
import type { Locale } from "../utils/locale";

/**
 * 注册 Zotero 条目右键菜单的"清理"、"撤销"和"筛选删除"项。
 * @param store 用于判断是否有可撤销操作
 * @param locale i18n 翻译接口
 * @param onClean 点击"清理"时的回调
 * @param onUndo 点击"撤销"时的回调
 * @param onFilterDelete 点击"筛选删除附件与笔记"时的回调
 */
export function registerItemMenu(
  store: CleanSessionStore,
  locale: Locale,
  onClean: () => void,
  onUndo: () => void,
  onFilterDelete: () => void,
): void {
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: "zotero-itemmenu-bibtexclean-clean",
    label: locale.getString("menuitem-clean-items"),
    commandListener: onClean,
  });

  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: "zotero-itemmenu-bibtexclean-undo",
    label: locale.getString("menuitem-undo-last-clean"),
    isDisabled: () => !store.hasUndo(),
    commandListener: onUndo,
  });

  // 筛选删除与清理语义不同、风险等级不同，独立入口，不并入清理流程
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: "zotero-itemmenu-bibtexclean-filter-delete",
    label: locale.getString("menuitem-filter-delete"),
    commandListener: onFilterDelete,
  });
}
