import { assert } from "chai";
import { config } from "../package.json";

interface RealZoteroSource {
  importESModule(uri: string): { Zotero?: unknown };
}

/**
 * Zotero 10 起，测试页的全局 `Zotero` 与主进程的 Zotero 对象不再是同一个
 * （窗口侧 importESModule 会重新求值 zotero.mjs），全局上查不到插件实例。
 * 因此优先向模块取真实实例，取不到（旧版 Zotero 无该模块）时退回全局。
 */
function getRuntimeZotero(): unknown {
  const globals = globalThis as unknown as Record<string, unknown>;
  const chromeUtils = globals["ChromeUtils"] as RealZoteroSource | undefined;
  try {
    const fromModule = chromeUtils?.importESModule(
      "chrome://zotero/content/zotero.mjs",
    ).Zotero;
    if (fromModule) return fromModule;
  } catch {
    // 旧版 Zotero 没有该模块，走全局。
  }
  return globals["Zotero"];
}

describe("startup", function () {
  it("should have plugin instance defined", function () {
    const zotero = getRuntimeZotero() as Record<string, unknown> | undefined;
    assert.isNotEmpty(zotero?.[config.addonInstance]);
  });
});
