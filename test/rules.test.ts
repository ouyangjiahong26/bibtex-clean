import { assert } from "chai";
import { applyRule } from "../src/modules/rules";

describe("rules", function () {
  describe("applyRule", function () {
    it("author 中把分号替换为 ' and '", function () {
      assert.equal(
        applyRule("author", "Smith, John; Doe, Jane"),
        "Smith, John and Doe, Jane",
      );
    });

    it("author 不含分号时返回 undefined", function () {
      assert.isUndefined(applyRule("author", "Smith, John and Doe, Jane"));
    });

    it("不支持的字段返回 undefined", function () {
      assert.isUndefined(applyRule("title", "第三期"));
    });

    it("去掉期号中的中文“第”和“期”", function () {
      assert.equal(applyRule("issue", "第3期"), "3");
    });

    it("去掉中文“第”和“期”并保留周围内容", function () {
      assert.equal(applyRule("issue", "第三期"), "三");
    });

    it("去掉“第”和“期”后修剪空白", function () {
      assert.equal(applyRule("issue", "第 3 期"), "3");
    });

    it("期号已干净时返回 undefined", function () {
      assert.isUndefined(applyRule("issue", "3"));
    });

    it("去掉期号前缀 'No.'", function () {
      assert.equal(applyRule("issue", "No.10"), "10");
    });

    it("去掉期号带尾随空格的前缀 'No.'", function () {
      assert.equal(applyRule("issue", "No. 10"), "10");
    });

    it("忽略大小写去掉期号前缀 'No.'", function () {
      assert.equal(applyRule("issue", "no.10"), "10");
    });

    it("去掉 volume 前缀 'Vol.'", function () {
      assert.equal(applyRule("volume", "Vol.12"), "12");
    });

    it("去掉 volume 带尾随空格的前缀 'Vol.'", function () {
      assert.equal(applyRule("volume", "Vol. 12"), "12");
    });

    it("忽略大小写去掉 volume 前缀 'Vol.'", function () {
      assert.equal(applyRule("volume", "vol.12"), "12");
    });

    it("volume 已干净时返回 undefined", function () {
      assert.isUndefined(applyRule("volume", "12"));
    });

    it("合并连续分号且不产生空作者", function () {
      assert.equal(applyRule("author", "闻国光;;过仕宁"), "闻国光 and 过仕宁");
    });

    it("处理开头的分号且不产生空作者", function () {
      assert.equal(applyRule("author", ";闻国光"), "闻国光");
    });

    it("处理结尾的分号且不产生空作者", function () {
      assert.equal(applyRule("author", "闻国光;"), "闻国光");
    });

    it("处理多个连续分号", function () {
      assert.equal(applyRule("author", "A;;;B"), "A and B");
    });
  });
});
