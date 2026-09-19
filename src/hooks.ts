import { CleanSessionStore } from "./modules/cleanSessionStore";
import {
  cleanSelectedItems,
  undoLastCleanOperation,
  type DialogAdapter,
  type WriterAdapter,
} from "./modules/cleanSession";
import { openCleaningConfirmationDialog } from "./modules/cleaningDialog";
import {
  filterDeleteSelectedItems,
  type FilterDeleteAdapters,
} from "./modules/filterDelete";
import { openFilterDeleteDialog } from "./modules/filterDialogWindow";
import {
  duplicateDeleteSelectedItems,
  type DuplicateDeleteAdapters,
} from "./modules/duplicateDelete";
import { openDuplicateDeleteDialog } from "./modules/duplicateDialogWindow";
import { collectDuplicateGroups } from "./modules/duplicateAttachments";
import { registerItemMenu } from "./modules/menuRegistration";
import {
  applyChanges,
  toCleanableItem,
  undoChanges,
} from "./modules/zoteroWriter";
import {
  collectCandidates,
  moveCandidatesToTrash,
} from "./modules/zoteroChildren";
import {
  createLocale,
  getString,
  initLocale,
  type Locale,
} from "./utils/locale";
import { createNotifier } from "./utils/notifications";
import { createZToolkit } from "./utils/ztoolkit";

const store = new CleanSessionStore();

function createAdapters(locale: Locale) {
  const notifier = createNotifier(locale);
  return {
    clean: {
      dialog: {
        confirm: async (changes, totalItemCount) => {
          const result = await openCleaningConfirmationDialog(
            changes,
            totalItemCount,
            undefined,
            locale.getString,
          );
          return result === "confirm";
        },
      } satisfies DialogAdapter,
      writer: {
        toCleanableItem,
        applyChanges,
        undoChanges,
      } satisfies WriterAdapter,
      notifier,
    },
    filterDelete: {
      candidates: {
        collectCandidates: async () =>
          collectCandidates(Zotero.getActiveZoteroPane().getSelectedItems()),
      },
      dialog: {
        choose: (candidates) =>
          openFilterDeleteDialog(candidates, undefined, locale.getString),
      },
      writer: { moveToTrash: moveCandidatesToTrash },
      notifier,
    } satisfies FilterDeleteAdapters,
    duplicateDelete: {
      collect: {
        collectGroups: async (onProgress) =>
          collectDuplicateGroups(
            Zotero.getActiveZoteroPane().getSelectedItems(),
            { onProgress },
          ),
      },
      dialog: {
        choose: (groups) =>
          openDuplicateDeleteDialog(groups, undefined, locale.getString),
      },
      writer: { moveToTrash: moveCandidatesToTrash },
      notifier,
      progress: notifier,
    } satisfies DuplicateDeleteAdapters,
  };
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  await registerPreferencesPane();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

/**
 * 注册设置页：删除的并行数量在这里调整。
 * 注册失败只记录，不让插件启动失败——设置页缺失不影响清理与删除本身。
 */
async function registerPreferencesPane(): Promise<void> {
  try {
    await Zotero.PreferencePanes.register({
      pluginID: addon.data.config.addonID,
      src: "content/preferences.xhtml",
      label: getString("preferences-pane-title"),
      image: "content/icons/favicon.png",
    });
  } catch (error) {
    Zotero.debug(`[${addon.data.config.addonName}] 设置页注册失败：${error}`);
  }
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  const locale = createLocale();
  const adapters = createAdapters(locale);

  registerItemMenu(
    store,
    locale,
    () => cleanSelectedItems(store, adapters.clean, locale),
    () => undoLastCleanOperation(store, adapters.clean, locale),
    () => filterDeleteSelectedItems(adapters.filterDelete, locale),
    () => duplicateDeleteSelectedItems(adapters.duplicateDelete, locale),
  );
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  _event: string,
  _type: string,
  _ids: Array<string | number>,
  _extraData: { [key: string]: any },
) {}

async function onPrefsEvent(_type: string, _data: { [key: string]: any }) {}

function onShortcuts(_type: string) {}

function onDialogEvents(_type: string) {}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
