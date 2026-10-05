# 发布流程

本仓库使用 CI 驱动的发布模型。GitHub Release 与 XPI 附件由 GitHub Actions 自动创建，本地只负责准备版本号变更与推送标签。

## 触发

推送匹配 `v**` 的标签会触发 `.github/workflows/release.yml`，后者调用 `zotero-plugin-dev/workflows/.github/workflows/release-plugin.yml@main`。

## 本地步骤

1. 确认 `main` 处于绿色状态：`npm run build && npm run lint:check && npm test`
2. 在 `package.json` 与 `package-lock.json` 里更新版本号
3. 提交版本变更，例如 `chore(release): bump version to X.Y.Z`
4. 推送提交：`git push origin main`
5. 创建并推送标签：`git tag vX.Y.Z && git push origin vX.Y.Z`

不要在本地运行 `npm run release`，也不要用 `gh release create` 手动创建 GitHub Release。CI 工作流会在 `zotero-plugin-scaffold` 判定为 CI 的环境里运行 `npm run release` 并创建 release。

## CI 行为

- 用 `npm run build` 构建插件
- 为推送的标签创建 GitHub Release
- 上传生成的 XPI 作为 release 附件
- 从 conventional commits 生成 release notes

## 恢复

若 release 工作流因 GitHub Release 已存在而失败（例如此前手动发布过一次），删除手动创建的 release 后重跑失败的工作流，标签保持不动。
