# Issue tracker: GitHub

本仓库的 issue 和 PRD 以 GitHub issue 形式存在。所有操作使用 `gh` CLI。

## 约定

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行正文使用 heredoc。
- **读取 issue**：`gh issue view <number> --comments`，通过 `jq` 过滤评论，同时获取标签。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，并配合适当的 `--label` 和 `--state` 过滤条件。
- **评论 issue**：`gh issue comment <number> --body "..."`
- **添加 / 移除标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <number> --comment "..."`

仓库从 `git remote -v` 推断——在克隆目录内运行 `gh` 时会自动完成。

## AI 生成的 issue、PR 与评论

AI 创建的内容必须带 `[AI Generated]` 标记，规范全文见 `CONTRIBUTING.md` 的「AI 贡献」。

- **创建 issue 或 PR**：标题最开头加 `[AI Generated] `，并加 `ai-generated` 标签。

  ```bash
  gh issue create --title "[AI Generated] ..." --body "..." --label ai-generated
  gh pr create --title "[AI Generated] ..." --body "..." --label ai-generated
  ```

- **评论 issue 或 PR**：正文第一个非空行写 `> [AI Generated] 本评论由 AI 生成`。

  ```bash
  gh issue comment <number> --body "> [AI Generated] 本评论由 AI 生成

  ..."
  ```

- 编辑标题或评论时保留标记。去掉标记等于把内容伪装成人工产出。

## 将 Pull request 作为分流入口

**PR 作为请求入口：是。**

外部 PR 与 issue 使用相同的标签和状态进行处理，使用 `gh pr` 的对应命令：

- **读取 PR**：`gh pr view <number> --comments`，并用 `gh pr diff <number>` 查看 diff。
- **列出待分流的外部 PR**：`gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，然后只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的项（排除 `OWNER`/`MEMBER`/`COLLABORATOR`）。
- **评论 / 打标签 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 和 PR 共享同一个编号空间，因此 bare `#42` 可能是任意一种——先用 `gh pr view 42` 解析，失败时回退到 `gh issue view 42`。

## 当技能要求“发布到 issue tracker”

创建一个 GitHub issue。

## 当技能要求“获取相关工单”

运行 `gh issue view <number> --comments`。
