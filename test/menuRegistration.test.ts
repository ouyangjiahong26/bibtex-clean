import { assert } from "chai";
import { registerItemMenu } from "../src/modules/menuRegistration";
import type { CleanSessionStore } from "../src/modules/cleanSessionStore";

/**
 * Hook-side seam for "右键菜单清理条目失效".
 *
 * No existing test exercises the right-click menu hook path. This suite
 * mocks the global `ztoolkit` so `registerItemMenu` runs in isolation,
 * then asserts the captured `ztoolkit.Menu.register` calls.
 *
 * With the Locale injection, no `addon` global mock is needed — the fake
 * locale controls the label strings directly.
 */
describe("menuRegistration (right-click menu hook)", function () {
  type MenuCall = { target: string; options: any };

  let menuCalls: MenuCall[];
  let originalZtoolkitDesc: PropertyDescriptor | undefined;

  function createFakeLocale() {
    return {
      getString: (key: string) => `FAKE[${key}]`,
    };
  }

  beforeEach(function () {
    menuCalls = [];
    originalZtoolkitDesc = Object.getOwnPropertyDescriptor(
      globalThis,
      "ztoolkit",
    );

    // Capture Menu.register calls instead of touching real Zotero chrome.
    Object.defineProperty(globalThis, "ztoolkit", {
      value: {
        Menu: {
          register: (target: string, options: any) => {
            menuCalls.push({ target, options });
          },
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(function () {
    if (originalZtoolkitDesc) {
      Object.defineProperty(globalThis, "ztoolkit", originalZtoolkitDesc);
    } else {
      delete (globalThis as any).ztoolkit;
    }
  });

  function callsById(id: string): MenuCall | undefined {
    return menuCalls.find((c) => c.options && c.options.id === id);
  }

  it("registers three menu items under the 'item' context", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
    );

    assert.lengthOf(menuCalls, 3, "expected exactly three Menu.register calls");
    assert.equal(menuCalls[0].target, "item");
    assert.equal(menuCalls[1].target, "item");
    assert.equal(menuCalls[2].target, "item");
  });

  it("registers 'clean' menu item with the expected id, tag, and label", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
    );

    const cleanItem = callsById("zotero-itemmenu-bibtexclean-clean");
    assert.isDefined(
      cleanItem,
      "clean menu item with id 'zotero-itemmenu-bibtexclean-clean' must be registered",
    );
    assert.equal(cleanItem!.options.tag, "menuitem");
    assert.equal(cleanItem!.options.label, "FAKE[menuitem-clean-items]");
    assert.isFunction(
      cleanItem!.options.commandListener,
      "clean menu item must expose a commandListener",
    );
  });

  it("registers 'undo' menu item with the expected id, tag, and label", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
    );

    const undoItem = callsById("zotero-itemmenu-bibtexclean-undo");
    assert.isDefined(
      undoItem,
      "undo menu item with id 'zotero-itemmenu-bibtexclean-undo' must be registered",
    );
    assert.equal(undoItem!.options.tag, "menuitem");
    assert.equal(undoItem!.options.label, "FAKE[menuitem-undo-last-clean]");
    assert.isFunction(
      undoItem!.options.commandListener,
      "undo menu item must expose a commandListener",
    );
  });

  it("registers 'filter delete' menu item with the expected id, tag, and label", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
    );

    const filterDeleteItem = callsById(
      "zotero-itemmenu-bibtexclean-filter-delete",
    );
    assert.isDefined(
      filterDeleteItem,
      "filter delete menu item with id 'zotero-itemmenu-bibtexclean-filter-delete' must be registered",
    );
    assert.equal(filterDeleteItem!.options.tag, "menuitem");
    assert.equal(
      filterDeleteItem!.options.label,
      "FAKE[menuitem-filter-delete]",
    );
    assert.isFunction(
      filterDeleteItem!.options.commandListener,
      "filter delete menu item must expose a commandListener",
    );
  });

  it("'undo' menu item is disabled when store has no undo", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
    );

    const undoItem = callsById("zotero-itemmenu-bibtexclean-undo");
    assert.isDefined(undoItem);
    assert.isFunction(
      undoItem!.options.isDisabled,
      "undo menu item must expose an isDisabled predicate",
    );
    assert.isTrue(
      undoItem!.options.isDisabled(),
      "isDisabled() must return true when store.hasUndo() is false",
    );
  });

  it("'undo' menu item is enabled when store has undo", function () {
    const mockStore = { hasUndo: () => true } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
    );

    const undoItem = callsById("zotero-itemmenu-bibtexclean-undo");
    assert.isDefined(undoItem);
    assert.isFalse(
      undoItem!.options.isDisabled(),
      "isDisabled() must return false when store.hasUndo() is true",
    );
  });

  it("clicking the menu items invokes their callbacks", function () {
    let cleanCalled = 0;
    let undoCalled = 0;
    let filterDeleteCalled = 0;
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();

    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {
        cleanCalled += 1;
      },
      () => {
        undoCalled += 1;
      },
      () => {
        filterDeleteCalled += 1;
      },
    );

    const cleanItem = callsById("zotero-itemmenu-bibtexclean-clean");
    const undoItem = callsById("zotero-itemmenu-bibtexclean-undo");
    const filterDeleteItem = callsById(
      "zotero-itemmenu-bibtexclean-filter-delete",
    );
    assert.isDefined(cleanItem);
    assert.isDefined(undoItem);
    assert.isDefined(filterDeleteItem);

    cleanItem!.options.commandListener();
    undoItem!.options.commandListener();
    filterDeleteItem!.options.commandListener();
    cleanItem!.options.commandListener();

    assert.equal(cleanCalled, 2, "clean callback should fire on each click");
    assert.equal(undoCalled, 1, "undo callback should fire on click");
    assert.equal(
      filterDeleteCalled,
      1,
      "filter delete callback should fire on click",
    );
  });
});
