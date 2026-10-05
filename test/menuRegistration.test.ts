import { assert } from "chai";
import { registerItemMenu } from "../src/modules/menuRegistration";
import type { CleanSessionStore } from "../src/modules/cleanSessionStore";

/**
 * 面向 issue“右键菜单清理条目失效”的 hook 侧接缝测试。
 *
 * 此前没有测试覆盖右键菜单 hook 路径。本测试套件 mock 全局
 * `ztoolkit`，让 `registerItemMenu` 独立运行，再断言捕获的
 * `ztoolkit.Menu.register` 调用。
 *
 * 由于注入了 Locale，不需要 mock 全局 `addon`，假 locale 直接控制
 * 标签字符串。
 */
describe("menuRegistration（右键菜单 hook）", function () {
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

  it("在 item 上下文注册四个菜单项", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
      () => {},
    );

    assert.lengthOf(menuCalls, 4, "应恰好有四次 Menu.register 调用");
    assert.equal(menuCalls[0].target, "item");
    assert.equal(menuCalls[1].target, "item");
    assert.equal(menuCalls[2].target, "item");
    assert.equal(menuCalls[3].target, "item");
  });

  it("以预期的 id、tag 和 label 注册 clean 菜单项", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
      () => {},
    );

    const cleanItem = callsById("zotero-itemmenu-bibtexclean-clean");
    assert.isDefined(
      cleanItem,
      "应注册 id 为 'zotero-itemmenu-bibtexclean-clean' 的 clean 菜单项",
    );
    assert.equal(cleanItem!.options.tag, "menuitem");
    assert.equal(cleanItem!.options.label, "FAKE[menuitem-clean-items]");
    assert.isFunction(
      cleanItem!.options.commandListener,
      "clean 菜单项必须提供 commandListener",
    );
  });

  it("以预期的 id、tag 和 label 注册 undo 菜单项", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
      () => {},
    );

    const undoItem = callsById("zotero-itemmenu-bibtexclean-undo");
    assert.isDefined(
      undoItem,
      "应注册 id 为 'zotero-itemmenu-bibtexclean-undo' 的 undo 菜单项",
    );
    assert.equal(undoItem!.options.tag, "menuitem");
    assert.equal(undoItem!.options.label, "FAKE[menuitem-undo-last-clean]");
    assert.isFunction(
      undoItem!.options.commandListener,
      "undo 菜单项必须提供 commandListener",
    );
  });

  it("以预期的 id、tag 和 label 注册 filter delete 菜单项", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
      () => {},
    );

    const filterDeleteItem = callsById(
      "zotero-itemmenu-bibtexclean-filter-delete",
    );
    assert.isDefined(
      filterDeleteItem,
      "应注册 id 为 'zotero-itemmenu-bibtexclean-filter-delete' 的 filter delete 菜单项",
    );
    assert.equal(filterDeleteItem!.options.tag, "menuitem");
    assert.equal(
      filterDeleteItem!.options.label,
      "FAKE[menuitem-filter-delete]",
    );
    assert.isFunction(
      filterDeleteItem!.options.commandListener,
      "filter delete 菜单项必须提供 commandListener",
    );
  });

  it("以预期的 id、tag 和 label 注册 duplicate delete 菜单项", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
      () => {},
    );

    const duplicateDeleteItem = callsById(
      "zotero-itemmenu-bibtexclean-duplicate-delete",
    );
    assert.isDefined(
      duplicateDeleteItem,
      "应注册 id 为 'zotero-itemmenu-bibtexclean-duplicate-delete' 的 duplicate delete 菜单项",
    );
    assert.equal(duplicateDeleteItem!.options.tag, "menuitem");
    assert.equal(
      duplicateDeleteItem!.options.label,
      "FAKE[menuitem-duplicate-delete]",
    );
    assert.isFunction(
      duplicateDeleteItem!.options.commandListener,
      "duplicate delete 菜单项必须提供 commandListener",
    );
  });

  it("store 无可撤销操作时 undo 菜单项禁用", function () {
    const mockStore = { hasUndo: () => false } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
      () => {},
    );

    const undoItem = callsById("zotero-itemmenu-bibtexclean-undo");
    assert.isDefined(undoItem);
    assert.isFunction(
      undoItem!.options.isDisabled,
      "undo 菜单项必须提供 isDisabled 谓词",
    );
    assert.isTrue(
      undoItem!.options.isDisabled(),
      "store.hasUndo() 为 false 时 isDisabled() 必须返回 true",
    );
  });

  it("store 有可撤销操作时 undo 菜单项启用", function () {
    const mockStore = { hasUndo: () => true } as unknown as CleanSessionStore;
    const fakeLocale = createFakeLocale();
    registerItemMenu(
      mockStore,
      fakeLocale,
      () => {},
      () => {},
      () => {},
      () => {},
    );

    const undoItem = callsById("zotero-itemmenu-bibtexclean-undo");
    assert.isDefined(undoItem);
    assert.isFalse(
      undoItem!.options.isDisabled(),
      "store.hasUndo() 为 true 时 isDisabled() 必须返回 false",
    );
  });

  it("点击菜单项会调用各自的回调", function () {
    let cleanCalled = 0;
    let undoCalled = 0;
    let filterDeleteCalled = 0;
    let duplicateDeleteCalled = 0;
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
      () => {
        duplicateDeleteCalled += 1;
      },
    );

    const cleanItem = callsById("zotero-itemmenu-bibtexclean-clean");
    const undoItem = callsById("zotero-itemmenu-bibtexclean-undo");
    const filterDeleteItem = callsById(
      "zotero-itemmenu-bibtexclean-filter-delete",
    );
    const duplicateDeleteItem = callsById(
      "zotero-itemmenu-bibtexclean-duplicate-delete",
    );
    assert.isDefined(cleanItem);
    assert.isDefined(undoItem);
    assert.isDefined(filterDeleteItem);
    assert.isDefined(duplicateDeleteItem);

    cleanItem!.options.commandListener();
    undoItem!.options.commandListener();
    filterDeleteItem!.options.commandListener();
    duplicateDeleteItem!.options.commandListener();
    cleanItem!.options.commandListener();

    assert.equal(cleanCalled, 2, "每次点击都会触发 clean 回调");
    assert.equal(undoCalled, 1, "点击时触发 undo 回调");
    assert.equal(filterDeleteCalled, 1, "点击时触发 filter delete 回调");
    assert.equal(duplicateDeleteCalled, 1, "点击时触发 duplicate delete 回调");
  });
});
