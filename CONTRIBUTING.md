# 贡献指南

本仓库接受人工与 AI agent 的贡献。因为 AI 参与开发，仓库对 AI 生成内容有强制的标记要求（见 [AI 贡献](#ai-贡献) 一节）。

## 开发环境

- Node.js 18+
- npm
- Zotero 桌面客户端

复制 `.env.example` 为 `.env`，填入本地路径：

```ini
ZOTERO_PLUGIN_ZOTERO_BIN_PATH=/path/to/zotero
ZOTERO_PLUGIN_PROFILE_PATH=/path/to/profile
```

## 常用命令

| 命令                 | 作用                                                          |
| -------------------- | ------------------------------------------------------------- |
| `npm install`        | 安装依赖                                                      |
| `npm start`          | 启动 Zotero 并开启热重载                                      |
| `npm run build`      | 构建 XPI 到 `.scaffold/build`，并跑 `tsc --noEmit` 做类型检查 |
| `npm run lint:check` | Prettier 格式检查 + ESLint                                    |
| `npm run lint:fix`   | 自动修复格式与可修复的 lint 问题                              |
| `npm test`           | 在真实 Zotero 中运行 `test/*.test.ts`（需要图形界面）         |

提交前至少跑通 `npm run lint:check` 和 `npm run build`。改动运行期行为时，在本地跑 `npm test`，并在 PR 里说明结果。

## 提交与 PR 规范

- 提交信息用 Conventional Commits，描述用中文，例如：

  ```
  fix(zoteroWriter): formatAuthors 在 firstName 为空时不应产生末尾逗号
  feat(zoteroWriter): 支持专利条目的 inventor 创作者类型
  ```

- 一个 PR 只做一件事。PR 标题与提交信息同格式，AI 生成的内容则在最前面加 `[AI Generated] `（见下节）。正文按 `.github/PULL_REQUEST_TEMPLATE.md` 填写：关联 issue、改了什么、如何验证。
- 改动接口或行为时，同步更新调用方、测试和文档，不保留无需求的兼容层。

## CI 会检查什么

| 检查        | 内容                          |
| ----------- | ----------------------------- |
| `lint` job  | `npm run lint:check`          |
| `build` job | `npm run build`（含类型检查） |

CI 不跑 `npm test`：`zotero-plugin test` 需要图形界面，在无头 runner 上会卡在启动 Zotero 实例（原因见 [#34](https://github.com/ouyangjiahong26/bibtex-clean/pull/34)）。测试由贡献者在本地执行。

## AI 贡献

### 适用范围

issue、PR、评论的内容由 AI 生成，或经 AI 辅助生成，都适用本节。AI 辅助指 AI 产出了你无法逐行确认的文本；只用于查文档、改错别字的不算。

### 标记方式

**issue 与 PR 的标题最开头必须是 `[AI Generated] `**，并打上 `ai-generated` 标签：

```
[AI Generated] fix(zoteroWriter): 过滤作者解析中的空段
```

**AI 生成的评论，正文第一个非空行必须是 AI 标记行**：

```
> [AI Generated] 本评论由 AI 生成
```

标记行必须在开头，正文中间出现的 `[AI Generated]` 不算声明。

### 责任与审查

- 标记只声明来源，AI 不承担责任。提交者——人或 agent 的运营者——对内容负责：能复现、能解释、能应答 review。
- 维护者按普通 PR 审查 AI 产出的 PR，且必须自己跑通验证步骤，不以 AI 的自我声明替代验证。
- 未声明的内容一旦被发现，维护者可以要求补标记，或直接关闭 issue / PR。

## 发布

发布由 CI 驱动，本地只负责改版本号和打标签，步骤见 `docs/agents/release-process.md`。
