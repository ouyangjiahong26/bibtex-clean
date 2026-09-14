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
import { createLocale, initLocale, type Locale } from "./utils/locale";
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
  };
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
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
