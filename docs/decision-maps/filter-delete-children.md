# Decision Map: 筛选删除附件与笔记

## Notes

- **Domain**: BibTeX Clean Zotero 插件，在「清理条目字段」之外新增「按条件筛选并删除条目的子条目（链接附件与笔记）」。
- **Consult**: `CONTEXT.md`, `docs/adr/0003-filter-delete-moves-to-trash.md`
- **Standing preferences**: 破坏性写操作必须先让用户看见后果（模拟运行 + 确认）；可撤销性优先，放弃撤销时必须有可恢复路径；一次菜单点击只做一件事，不复用语义不同的流程。

起点是一句需求：「把选中的题录里的 link 删掉」。追问后需求重画了两次——先是「link」被展开为两种附件加笔记的筛选，后是「关键词」被展开为条件行检索。本图记录的是重画后的设计。

## operation-scope: 这个操作到底删什么？

Blocked by:
Status: resolved
Type: Grilling

### Question

「删掉题录里的 link」中，「link」指什么？删的是附件条目本身，还是父条目某个字段里的网址文本？

### Answer

删的是**附件条目本身**，不触碰父条目字段。

链接附件的边界按 linkMode 与 contentType 细分：

- `imported_url` 且 contentType 为 `text/html`：库内保存了网页快照的附件（判定委托 Zotero 的 `isSnapshotAttachment()`）。
- `linked_url`：只保存外部地址的附件。

`imported_file`、`linked_file` 不属于链接附件。关键依据：Zotero 的翻译保存管线（`translate_item.js` 的 `_saveAttachment`）对带来源 URL 的下载文件统一以 `imported_url` 落库，因此 `imported_url` 还覆盖抓取器保存的 PDF/EPUB 全文（典型标题 "Full Text PDF"）——这些按 contentType 细分出去，不算网页快照。

此外，**笔记也进入候选**：除了链接附件，用户还要按关键词命中笔记。因此这个操作不是「删链接」，而是「按条件筛选条目的子条目并删除」。

## candidate-source: 候选从哪里来、钻多深？

Blocked by: operation-scope
Status: resolved
Type: Grilling

### Question

从选中的条目如何展开候选集？是否递归进子条目？直接选中的附件或笔记怎么算？父条目本身会不会被删？

### Answer

- 选中普通条目：候选是该条目的**直接子附件与直接子笔记**，不递归进子条目。
- 直接选中附件或笔记：候选就是被选中的项本身。
- **父条目永不进入候选**。关键词即使命中条目标题，也不会把题录本身列入待删。

## deletion-semantics: 「删掉」是哪种删？

Blocked by: operation-scope
Status: resolved
Type: Grilling

### Question

彻底删除、移入回收站，还是删除并同步删本地文件？

### Answer

**移入回收站**（Zotero 原生删除行为），与用户在 Zotero 里按 Delete 键的后果一致。

被拒绝的方案：彻底删除（不可恢复，且对链接附件而言没有换来的好处——它本来就不含需要清理的本地文件）；以及把删除与清理字段合并进一个流程（见 entry-point）。

**网页快照的磁盘文件**：`imported_url` 在 storage 里存了网页副本，而移入回收站不碰文件——文件要等用户清空回收站才释放。仍不加「同时删除本地快照」的开关：那会让一次操作里同时存在可恢复与不可恢复两种后果，同样的勾选动作在不同行上的含义不一致。改为在通知里写明「快照文件仍在磁盘，清空回收站后释放」。详见 `docs/adr/0003-filter-delete-moves-to-trash.md`。

## entry-point: 入口放哪？

Blocked by: operation-scope
Status: resolved
Type: Grilling

### Question

新增独立菜单项，还是并入现有「清理条目」流程？

### Answer

**新增独立右键菜单项**，与「清理条目」「撤销上次清理」并列。

独立入口的理由：语义不同（清理规范化字段值，本操作删除子条目）、风险等级不同、两者的确认与撤销机制也不同。合进清理流程会让「清理」一词同时指两件事，并迫使现有的「无需清理」判定与字段变更模型容纳条目删除。

命名定为 **「筛选删除附件与笔记」**。不另设「快捷直删链接附件」入口：一个筛选器已能表达该场景，两个入口意味着两套代码路径与两个确认流程。

## match-fields: 关键词在哪些文本里找？

Blocked by: candidate-source
Status: resolved
Type: Grilling

### Question

匹配范围是标题、URL、本地路径、笔记正文，还是别的？

### Answer

条件行可选字段范围：

- 任意字段（各项都试一遍）
- 标题
- URL
- 本地路径
- 笔记正文

匹配方式为大小写不敏感的子串包含。

## filter-logic: 类型筛选与关键词怎么组合？

Blocked by: match-fields
Status: resolved
Type: Grilling

### Question

类型复选框与条件行之间是 AND 还是 OR？

### Answer

**类型 AND 关键词**：先由类型圈定范围，再在范围内按条件行过滤。条件为空时退化为「按类型全选」。

类型选项只有一个复选框「链接附件」和一个复选框「笔记」，默认都勾选。`imported_url` 与 `linked_url` 由同一个复选框覆盖，不再拆分——拆分对用户是多余的判断，而两者的处理后果相同。

## advanced-search: 「高级检索」做成什么形态？

Blocked by: match-fields
Status: resolved
Type: Grilling

### Question

单个关键词框、单框加字段范围多选，还是条件行构建器？

### Answer

**单模式的条件行列表**：对话框顶部始终是条件区，默认一行「任意字段 包含 [____]」。简单场景一次输入即可，需要时加行、改字段范围、改组合方式。不做「简单模式 / 高级模式」两套显示状态。

- 运算符：**包含 / 不包含**。不提供正则——URL 与笔记正文确实能靠正则精确抽取，但写错时的表现是整批行悄悄出现或消失，代价高于收益。
- 多条件组合：顶部「匹配 全部 / 任一」开关，条件行平铺。**不做括号嵌套分组**，对齐 Zotero 原生高级搜索的心智模型。
- **不保存、不命名检索条件**，每次打开重置。
- 值为空的条件行**被忽略**（等价于该行不存在）。若把空行当作恒真，在「任一」模式下它会命中全部候选。

## dialog-shape: 筛选器的交互形态？

Blocked by: entry-point, advanced-search
Status: resolved
Type: Grilling

### Question

单对话框实时过滤，还是先条件后确认的两步流程，还是不弹对话框？

### Answer

**单对话框**：顶部条件区与类型复选框，下方实时过滤的候选列表，底部按钮。对话框本身就是模拟运行——用户点击删除前，屏幕上看到的勾选集就是将要删除的全部。

不弹对话框的方案被拒（与既有的「破坏性操作先模拟运行再确认」偏好直接冲突）。

## selection-semantics: 勾选状态与筛选条件怎么互动？

Blocked by: dialog-shape
Status: resolved
Type: Grilling

### Question

条件变化时，勾选状态如何变化？用户手改过的勾选会不会被冲掉？

### Answer

**可见行默认一律不勾选**，由用户手动勾或点全选。条件一变，勾选清空，用户此前的勾选与取消都作废。

修订记录：初版是可见行默认勾选，结果发生真实事故——条件为空时所有可见行全被勾上，一次误点删除选中即删光全部子条目。改为默认不勾选后，删除永远需要显式动作；批量勾选由全选按钮承担。

这个取舍可接受，因为对话框即模拟运行：点击删除前，屏幕上的勾选集就是将要删除的全部集合，用户最后一眼能核对到全部后果。若改成手动改动永久保留，反而会出现看不见的行其实已被勾选的隐性状态。

配套提供全选 / 全不选按钮与实时计数（已勾选 N 项）。初版含否定条件时默认不勾选的特例随之取消：默认既已不勾，不再需要按运算符分流。

## row-content: 每行显示什么？

Blocked by: dialog-shape
Status: resolved
Type: Grilling

### Question

候选列表的每一行展示哪些文字？

### Answer

勾选框 + **类型徽标**（链接附件 / 笔记）+ **子项标题** + **父条目标题**。

父条目标题不可省：一次可以选中多个条目，没有它就分不清待删项从哪个题录来。不显示命中片段——超星那类长 URL 会把列撑爆，需要截断逻辑，收益不足。

## note-risk: 笔记要不要特殊对待？

Blocked by: selection-semantics
Status: resolved
Type: Grilling

### Question

链接附件删了能重新添加，笔记是用户创作的内容、没有外部来源可重建。是否在删除前额外拦截？

### Answer

**不拦截**，但删除按钮直接写明构成：「删除选中（N 项，含 M 条笔记）」。

用户认为关键词约束已能圈定要删的笔记，不额外加一次点击。而按钮文案是零成本的：它把「待删集里有笔记」这件事摆在点击前，不需要用户另外核对。

## undo: 删除需要插件级撤销吗？

Blocked by: deletion-semantics
Status: resolved
Type: Grilling

### Question

删除既已移入回收站，是否还要新增「撤销上次删除」，或与现有「撤销上次清理」合并为「撤销上次操作」？

### Answer

**不做插件内撤销**，通知中写明「已移入回收站」，由 Zotero 回收站承担恢复路径。

理由：回收站本身就是可恢复路径，再维护一套删除记录是用两套机制做同一件事。而且现有 `CleanSessionStore` 记录的是字段旧值，与「一批被删除的条目」形状不同；合并成「撤销上次操作」会模糊「上次」指哪次。

## empty-states: 无候选与无命中怎么处理？

Blocked by: filter-logic
Status: resolved
Type: Grilling

### Question

选中的条目没有任何子附件与子笔记时弹不弹框？条件筛完是 0 行时呢？

### Answer

- **无候选**：不弹空对话框，提示「选中条目没有链接附件或笔记」，沿用现有 `NoCleanableItems` 的处理方式。
- **筛选后 0 行**：照常弹对话框，框内显示空状态。用户此时正在改条件，关闭对话框反而打断操作。

## terminology: 术语怎么定？

Blocked by: operation-scope, candidate-source, deletion-semantics
Status: resolved
Type: Domain modeling

### Question

新增哪几个领域术语？它们与「清理」「变更」的边界在哪？

### Answer

`CONTEXT.md` 新增：**子条目**、**链接附件**、**笔记**、**候选项**、**筛选删除**，并明确「删除」在本插件中的含义是移入回收站。核心区分是：

- **清理**作用于字段值，产生**变更**，可撤销。
- **筛选删除**作用于子条目集合，把条目移入回收站，无插件内撤销。

## doc-outputs: 本次产出哪些文档？

Blocked by: terminology
Status: resolved
Type: Grilling

### Question

决策地图、术语表、ADR 要不要都写？

### Answer

三者都写：

- 本决策地图。
- `CONTEXT.md` 增补术语。
- ADR 0003 记录「删除 = 移入回收站，不做插件内撤销」。它满足 ADR 的三条判据：事后改代价高（改为彻底删除就是不可逆操作）、缺上下文会让未来读者困惑（为什么一个可撤销的插件在这里放弃撤销）、源于真实权衡（彻底删除 / 回收站 / 插件撤销记录三选一）。

## implementation-plan: 怎么落地？

Blocked by: dialog-shape, selection-semantics, undo
Status: resolved
Type: Research

### Question

在既有模块结构下，新功能如何分阶段实现？

### Answer

沿用既有三层结构与适配器注入范式：

1. **纯函数层**（可无 Zotero 运行时测试，照 `renderDialog` 的范式）：条件求值 `matchesCondition`、候选筛选 `filterCandidates`、按当前可见集计算默认勾选 `defaultChecked`、对话框结构化数据 `renderFilterDialog`。
2. **HTML 层**：`renderFilterDialogHtml` 拼装条件区、列表与按钮，与现有 `renderDialogHtml` 同构。
3. **对话框层**：`ztoolkit.Dialog` + `dialogData.loadCallback`（`window` load 后触发）注入 DOM 并绑定 `input` / `change` 事件；`ElementProps.listeners` 是声明式替代方案。`input` 事件 → 重渲染这一层无法在 Node 环境中测试，属手工验证。
4. **写入层**：新增 Zotero 适配器，把选中的子条目移入回收站，返回成功/失败明细，沿用现有「部分成功」通知策略。
5. **接线**：`hooks.ts` 注册第三个菜单项，locale 新增 key 并同步 `typings/i10n.d.ts`。

不做：插件内撤销记录、条件持久化、括号嵌套分组、正则、快捷直删入口。
