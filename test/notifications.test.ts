import { assert } from "chai";
import { createNotifier } from "../src/utils/notifications";
import type { NotifierAdapter } from "../src/modules/cleanSession";
import type { Change } from "../src/modules/changes";
import type { Candidate } from "../src/modules/filterCandidates";
import type { Locale } from "../src/utils/locale";

/** 通知文案由注入的 Locale 提供，测试里回显 key 以便断言。 */
const fakeLocale = {
  getString: (key: string) => `MOCK[${key}]`,
} satisfies Locale;

/**
 * 验证 createNotifier() 返回 NotifierAdapter，且各方法通过 ProgressWindow
 * 发出通知。showUndoableSuccess 的撤销回调绑定逻辑属于 ProgressWindow 内部
 * DOM 操作，此处仅验证回调被传递到 window builder 的 addDescription 调用中。
 */

describe("createNotifier", function () {
  let originalZtoolkit: PropertyDescriptor | undefined;
  let originalAddon: PropertyDescriptor | undefined;
  let createdWindows: MockProgressWindow[];

  beforeEach(function () {
    createdWindows = [];

    originalZtoolkit = Object.getOwnPropertyDescriptor(globalThis, "ztoolkit");
    originalAddon = Object.getOwnPropertyDescriptor(globalThis, "addon");

    Object.defineProperty(globalThis, "ztoolkit", {
      value: {
        ProgressWindow: function (name: string, opts?: any) {
          const pw = new MockProgressWindow(name, opts);
          createdWindows.push(pw);
          return pw;
        },
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, "addon", {
      value: {
        data: {
          config: { addonName: "BibTeX Clean" },
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(function () {
    if (originalZtoolkit) {
      Object.defineProperty(globalThis, "ztoolkit", originalZtoolkit);
    } else {
      delete (globalThis as any).ztoolkit;
    }
    if (originalAddon) {
      Object.defineProperty(globalThis, "addon", originalAddon);
    } else {
      delete (globalThis as any).addon;
    }
  });

  it("返回的对象满足 NotifierAdapter 接口", function () {
    const notifier = createNotifier(fakeLocale);
    assert.isFunction(notifier.showSuccess);
    assert.isFunction(notifier.showInfo);
    assert.isFunction(notifier.showErrorDetails);
    assert.isFunction(notifier.showUndoableSuccess);
  });

  it("showSuccess 使用 recognised progress type", function () {
    const notifier = createNotifier(fakeLocale);
    notifier.showSuccess("Done");
    assert.lengthOf(createdWindows, 1);
    assert.deepEqual(createdWindows[0].createLineCalls, [
      { text: "Done", type: "success" },
    ]);
  });

  it("showInfo 使用 recognised progress type", function () {
    const notifier = createNotifier(fakeLocale);
    notifier.showInfo("No changes");
    assert.lengthOf(createdWindows, 1);
    const call = createdWindows[0].createLineCalls[0];
    assert.isDefined(call);
    assert.isTrue(
      isRecognisedProgressType(call.type, call.icon),
      `type=${call.type} icon=${call.icon} should not fall back to empty icon`,
    );
  });

  it("showErrorDetails 只使用 recognised progress types", function () {
    const notifier = createNotifier(fakeLocale);
    const failed = [
      {
        change: {
          itemKey: "A1",
          itemLibraryID: 1,
          itemTitle: "Paper One",
          field: "issue",
          oldValue: "第3期",
          newValue: "3",
        } as Change,
        error: new Error("save failed"),
      },
    ];

    notifier.showErrorDetails(failed);

    assert.lengthOf(createdWindows, 1);
    for (const call of createdWindows[0].createLineCalls) {
      assert.isTrue(
        isRecognisedProgressType(call.type, call.icon),
        `type=${call.type} icon=${call.icon} should not fall back to empty icon`,
      );
    }
  });

  it("showUndoableSuccess 使用 recognised progress type 并传递 undo 描述", function () {
    let undoCalled = false;
    const onUndo = () => {
      undoCalled = true;
    };

    const notifier = createNotifier(fakeLocale);
    notifier.showUndoableSuccess("Cleaned", onUndo);

    assert.lengthOf(createdWindows, 1);
    const win = createdWindows[0];

    // 验证窗口配置（closeOnClick / closeTime）
    assert.deepEqual(win.options, { closeOnClick: false, closeTime: 8000 });

    // 验证 createLine 使用了 recognised type
    const call = win.createLineCalls[0];
    assert.isDefined(call);
    assert.isTrue(
      isRecognisedProgressType(call.type, call.icon),
      `type=${call.type} icon=${call.icon} should not fall back to empty icon`,
    );

    // 验证 addDescription 被调用，说明 undo 链接已注入
    assert.isNotEmpty(win.descriptionTexts);
    assert.match(win.descriptionTexts[0], /message-undo/);
  });

  it("返回的对象同时满足筛选删除流程的通知接口", function () {
    const notifier = createNotifier(fakeLocale);
    assert.isFunction(notifier.showDeleteSuccess);
    assert.isFunction(notifier.showDeleteErrorDetails);
  });

  it("showDeleteSuccess 在给定 detail 时追加一行说明", function () {
    const notifier = createNotifier(fakeLocale);
    notifier.showDeleteSuccess("Deleted 2 items", "Snapshot stays on disk");

    assert.lengthOf(createdWindows, 1);
    assert.deepEqual(
      createdWindows[0].createLineCalls.map((call) => call.text),
      ["Deleted 2 items", "Snapshot stays on disk"],
    );
    assert.equal(createdWindows[0].createLineCalls[0].type, "success");
  });

  it("showDeleteSuccess 不带 detail 时只输出一行", function () {
    const notifier = createNotifier(fakeLocale);
    notifier.showDeleteSuccess("Deleted 1 item");

    assert.lengthOf(createdWindows, 1);
    assert.lengthOf(createdWindows[0].createLineCalls, 1);
  });

  it("showDeleteErrorDetails 逐条列出失败的子条目，且只用 recognised progress type", function () {
    const candidate: Candidate = {
      itemKey: "NOTE1",
      libraryID: 1,
      kind: "note",
      title: "阅读笔记",
      parentTitle: "论文一",
    };
    const notifier = createNotifier(fakeLocale);
    notifier.showDeleteErrorDetails([
      { candidate, error: new Error("save failed") },
    ]);

    assert.lengthOf(createdWindows, 1);
    const texts = createdWindows[0].createLineCalls.map((call) => call.text);
    assert.equal(texts[0], "MOCK[message-error-delete-failed]");
    assert.match(texts[1] ?? "", /阅读笔记: save failed/);
    for (const call of createdWindows[0].createLineCalls) {
      assert.isTrue(
        isRecognisedProgressType(call.type, call.icon),
        `type=${call.type} icon=${call.icon} should not fall back to empty icon`,
      );
    }
  });
});

function isRecognisedProgressType(
  type: string | undefined,
  icon: string | undefined,
): boolean {
  // 显式 icon 优先；否则 type 必须是内置类型（success/fail/default）
  if (icon) return true;
  return type === "success" || type === "fail" || type === "default";
}

class MockProgressWindow {
  public createLineCalls: Array<{
    text?: string;
    type?: string;
    icon?: string;
  }> = [];
  public descriptionTexts: string[] = [];
  public options: Record<string, unknown>;

  constructor(_name: string, opts?: Record<string, unknown>) {
    this.options = opts ?? {};
  }

  createLine(options: { text?: string; type?: string; icon?: string }): this {
    this.createLineCalls.push(options);
    return this;
  }

  addDescription(text: string): this {
    this.descriptionTexts.push(text);
    return this;
  }

  show(): this {
    return this;
  }
}
