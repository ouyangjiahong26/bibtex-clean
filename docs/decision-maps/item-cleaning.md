# Decision Map: 条目清理功能

## Notes

- Domain: BibTeX Clean Zotero 插件，从"导出清理后的 BibTeX"扩展为"直接清理 Zotero 条目字段"。
- Consult: `CONTEXT.md`, `docs/adr/0001-clean-items-in-place.md`
- Standing preferences: 破坏性写操作必须可预览、可撤销。用户可见术语统一为“清理”。

## clean-direction: 是否直接修改 Zotero 条目字段？

Blocked by:
Status: resolved
Type: Grilling

### Question

清理操作应该保持只读（导出到剪贴板），还是直接写回 Zotero 条目？

### Answer

直接修改原始 Zotero 条目字段。这是破坏性写操作，因此必须通过确认对话框展示变更，并提供撤销能力。

理由：插件的核心价值从"导出干净的 BibTeX"转向"帮助用户整理条目元数据"，直接修改能让清理结果持久化。

## clean-scope: 清理哪些字段和规则？

Blocked by: clean-direction
Status: resolved
Type: Grilling

### Question

清理规则覆盖哪些字段？是否提供规则开关？

### Answer

当前规则固定启用，不提供开关：

1. `author` 字段：将 `;` 替换为 `and`。
2. `issue` 字段：移除 `No.` 前缀与汉字 `第`、`期`。
3. `volume` 字段：移除 `Vol.` 前缀。

未来规则扩展时再考虑配置面板和开关。

## batch-confirmation: 批量确认对话框如何设计？

Blocked by: clean-scope
Status: resolved
Type: Grilling

### Question

用户选中多个条目时，如何提示"清理操作会导致什么变化"？

### Answer

使用汇总确认对话框：

- 先对目标条目做模拟运行（dry run），计算所有变更。
- 对话框只展示会发生变更的条目。
- 每行展示：条目标题、字段名、原值与新值。
- 顶部摘要：总数、变更数、无需清理数，以及"此操作可撤销最近一次"。
- 按钮：`确认清理`、`取消`。
- 执行策略为部分成功：成功条目保留修改，失败条目单独报错。

## undo-strategy: 撤销如何实现？

Blocked by: clean-direction, batch-confirmation
Status: resolved
Type: Grilling

### Question

破坏性操作需要提供怎样的撤销能力？

### Answer

- 在内存中保留最近一次清理操作的原始字段值。
- 撤销入口两处：右键菜单"撤销上次清理"、成功通知弹窗中的"撤销"按钮。
- 撤销范围：仅当前 Zotero 会话有效。只能撤销最近一次完整的批量清理操作。
- 新的清理操作会覆盖旧的撤销记录。

## dialog-implementation: 确认对话框用什么技术实现？

Blocked by: batch-confirmation
Status: resolved
Type: Prototype

### Question

确认对话框应该使用 Zotero 原生 XUL 对话框、HTML 弹窗，还是 ztoolkit 提供的辅助方法？需要考虑：

- 展示多行变更列表（条目标题、字段、原值与新值）的可读性。
- 中英文 locale 的渲染。
- 与 Zotero 主题/样式的协调性。
- 实现和维护成本。

### Answer

使用 ztoolkit DialogHelper + 自定义 HTML 内容。

- DialogHelper 已经封装了 `openDialog`、窗口生命周期、按钮回调和 `data-l10n-id` 国际化机制，与项目现有依赖一致。
- 不采用 DialogHelper 的网格布局，而是在单个 cell 中放置一个 HTML `div`，内部用 HTML table 渲染变更列表，以获得足够的布局灵活性。
- 不采用原生 XUL dialog：开发和维护成本更高，布局能力弱于 HTML。
- 不采用 VirtualizedTable：变更数量通常有限，普通 HTML table 足够。引入虚拟化表格反而增加复杂度。

布局采用表格布局（Variant A）。信息密度最高，条目、字段、原值与新值一目了然，适合在有限对话框空间内展示批量变更。

原型文件：`prototype/confirmation-dialog.html`（可直接在浏览器中打开预览三种变体）。

关键实现点：

- 通过 `dialogData.l10nFiles` 加载 FTL locale 文件。
- 通过 `dialogData._lastButtonId` 判断用户点击了"确认清理"还是"取消"。
- 对话框主体通过 HTML table 动态渲染变更列表，过长时启用垂直滚动。

## testing-seams: 测试 seam 在哪里？

Blocked by: clean-scope
Status: resolved
Type: Research

### Question

如何在不依赖 Zotero 运行时的前提下测试清理逻辑？需要确定：

- 纯函数 seam 的输入/输出边界（例如 `computeChanges(items)`）。
- 是否需要从现有 `bibtexClean.ts` 的"文本行处理"重构为"字段对象处理"。
- 现有测试基础设施（`test/startup.test.ts`）支持何种测试类型。

### Answer

核心 seam 是一个纯函数 `computeChanges(items)`，输入输出完全基于普通 JavaScript 对象，不依赖 Zotero 运行时。

#### 测试基础设施现状

- 测试框架：Mocha + Chai（`package.json` 已声明依赖）。
- 运行方式：`npm test` 会执行 `zotero-plugin test`，启动一个真实的 Zotero 实例并在其中运行 `test/` 下的测试文件。
- 现有测试：`test/startup.test.ts` 是一个集成测试，验证 `Zotero[config.addonInstance]` 已定义。

#### 推荐 seams

把清理逻辑拆到一个新的 `itemCleaning` 模块，只暴露纯函数接口。UI 层负责把 Zotero item 转换为普通对象后传入，核心逻辑完全不接触 `Zotero` 全局或 ztoolkit。

Seam 1：单字段规则 `applyRule(field, value)`

```ts
function applyRule(field: string, value: string): string | undefined;
```

- 输入：字段名、字段原值。
- 输出：如果规则触发了变更，返回新值。否则返回 `undefined`。
- 测试覆盖：author 分号替换、number 移除"第/期"、未触发规则返回 undefined。

Seam 2：批量变更计算 `computeChanges(items)`

```ts
type CleanableItem = {
  key: string;
  title: string;
  author?: string;
  number?: string;
};

type Change = {
  itemKey: string;
  itemTitle: string;
  field: string;
  oldValue: string;
  newValue: string;
};

function computeChanges(items: CleanableItem[]): Change[];
```

- 输入：普通对象数组，每个对象代表一个目标条目的关键字段。
- 输出：变更数组，只包含实际会发生变更的字段。
- 测试覆盖：单条目多字段变更、多条目部分变更、无变更返回空数组、空输入。

#### 关于 `bibtexClean.ts`

现有 `bibtexClean.ts` 是面向"BibTeX 文本行"的处理逻辑。新功能直接操作条目字段，因此需要把规则重构为"字段对象处理"。

推荐做法：

- 新建 `src/modules/itemCleaning.ts`，以数据驱动方式定义规则（`RULES` 数组 + `applyRule`）。
- 规则正则可从 `bibtexClean.ts` 复用，但语义从"匹配文本行"改为"对字段值做转换"。
- 旧功能"复制清理后的 BibTeX"已决定移除，因此 `bibtexClean.ts` / `bibtexExport.ts` 可整体删除，避免 dead code。

#### 测试文件

新增 `test/itemCleaning.test.ts`，使用 Mocha + Chai 测试 `applyRule` 和 `computeChanges`。虽然测试仍通过 `zotero-plugin test` 启动，但测试内容只依赖纯函数，不调用任何 Zotero API。

## implementation-plan: 综合实现计划

Blocked by: dialog-implementation, testing-seams
Status: resolved
Type: Research

### Question

在对话框技术和测试 seam 确定后，如何划分实现阶段、模块和接口？

### Answer

按以下 4 个阶段实现，每阶段独立可验证，且尽量保持旧功能在过渡期可用。

#### 阶段 1：核心清理逻辑与测试

目标：在不依赖 Zotero 运行时的前提下，实现可测试的纯函数清理逻辑。

1. 新建 `src/modules/itemCleaning.ts`，导出：
   - `applyRule(field: string, value: string): string | undefined`：单字段规则。
   - `computeChanges(items: CleanableItem[]): Change[]`：批量变更计算。
   - `RULES: CleaningRule[]`：数据驱动的规则数组，当前包含 `author` 与 `number` 两条规则。
2. 规则实现复用 `bibtexClean.ts` 中的正则语义，但改为对字段值做转换：
   - `author`：`value.replace(/;/g, " and ")`。
   - `number`：`value.replace(/[第期]/g, "")`。
3. 新增 `test/itemCleaning.test.ts`，使用 Mocha + Chai 覆盖：
   - `applyRule`：author 分号替换、number 移除汉字、未触发返回 `undefined`。
   - `computeChanges`：单条目多字段、多条目部分变更、无变更返回空数组、空输入。
4. 运行 `npm test` 验证纯函数测试通过。

#### 阶段 2：确认对话框 UI

目标：用 ztoolkit DialogHelper + HTML table 实现批量确认对话框。

1. 新建 `src/modules/cleaningDialog.ts`，导出：
   - `openCleaningConfirmationDialog(changes: Change[]): Promise<boolean>`：返回用户是否点击“确认清理”。
2. 对话框实现要点：
   - 使用 `new ztoolkit.Dialog(1, 1)`，在唯一 cell 中放置 HTML `div`（`namespace: "html"`，`tag: "div"`）。
   - 通过 `dialogData.l10nFiles` 加载 FTL 文件，支持 `data-l10n-id` 国际化。
   - 通过 `dialogData._lastButtonId` 判断用户点击了“确认清理”还是“取消”。
   - 对话框主体用 HTML table 动态渲染变更列表，过长时启用垂直滚动。
   - 顶部摘要显示：总数、变更数、无需清理数，以及“此操作可撤销最近一次”。
3. 新增 locale 条目到 `addon/locale/en-US/addon.ftl` 和 `addon/locale/zh-CN/addon.ftl`：
   - `dialog-title-clean-items`、`dialog-summary-clean-items`、`dialog-button-confirm-clean`、`dialog-button-cancel`。
   - `dialog-column-item`、`dialog-column-field`、`dialog-column-change`。
   - `notification-success-cleaned`、`notification-undo`、`menuitem-undo-last-clean`。
4. 更新 `typings/i10n.d.ts`，将新增 FTL key 加入 `FluentMessageId` 联合类型（该文件由 scaffold 生成，可手动同步或重新生成）。
5. 在浏览器中打开 `prototype/confirmation-dialog.html` 确认 Variant A 表格布局，并将最终样式收敛到对话框实现中。

#### 阶段 3：条目写入、撤销与菜单集成

目标：把清理结果写回 Zotero 条目，提供撤销能力，并替换右键菜单入口。

1. 在 `src/modules/itemCleaning.ts` 中新增：
   - `toCleanableItem(item: Zotero.Item): CleanableItem`：从 Zotero item 提取 key、title、author、number。
   - `applyChanges(changes: Change[]): Promise<{ succeeded: Change[]; failed: { change: Change; error: Error }[] }>`：按部分成功策略写入字段。
2. 在 `src/addon.ts` 的 `data` 中新增 `lastCleanOperation?: LastCleanOperation`，用于内存中保存最近一次清理的原始值，支持撤销。
3. 新增 `undoLastClean()`：
   - 检查 `addon.data.lastCleanOperation` 是否存在。
   - 将保存的原始字段值写回对应条目。
   - 清理 `lastCleanOperation`，避免重复撤销。
4. 修改 `src/hooks.ts`：
   - 将右键菜单项从“复制清理后的 BibTeX”改为“清理条目”。
   - 新增“撤销上次清理”菜单项（仅在 `lastCleanOperation` 存在时启用）。
   - 菜单点击流程：获取选中条目并用 `toCleanableItem` 转换，再用 `computeChanges` 计算变更。结果为空则提示无需清理。否则打开确认对话框，用户确认后用 `applyChanges` 写入，把原始值保存到 `lastCleanOperation`，显示含撤销按钮的成功通知。
5. 成功通知使用 `ztoolkit.ProgressWindow`，并在其中添加“撤销”按钮回调。

#### 阶段 4：移除旧功能与清理

目标：删除已废弃的“复制清理后的 BibTeX”相关 dead code。

1. 删除 `src/modules/bibtexClean.ts` 和 `src/modules/bibtexExport.ts`。
2. 从 `src/hooks.ts` 中移除对 `copyCleanBibTeXToClipboard` 的引用。
3. 从 FTL 文件中移除旧 key：`menuitem-copy-cleaned-bibtex`、`message-success-copied`、`message-error-export-failed`。
4. 更新 `typings/i10n.d.ts` 移除已删除的 key。
5. 运行 `npm run build`、`npm run lint:check`、`npm test` 确保全部通过。

#### 接口草图

```ts
// src/modules/itemCleaning.ts
export type CleanableItem = {
  key: string;
  title: string;
  author?: string;
  number?: string;
};

export type Change = {
  itemKey: string;
  itemTitle: string;
  field: string;
  oldValue: string;
  newValue: string;
};

export type CleaningRule = {
  field: "author" | "issue";
  apply: (value: string) => string | undefined;
};

export function applyRule(field: string, value: string): string | undefined;
export function computeChanges(items: CleanableItem[]): Change[];
export function toCleanableItem(item: Zotero.Item): CleanableItem;
export function applyChanges(
  changes: Change[],
): Promise<{ succeeded: Change[]; failed: { change: Change; error: Error }[] }>;
export function undoLastClean(): Promise<void>;
```

```ts
// src/modules/cleaningDialog.ts
export function openCleaningConfirmationDialog(
  changes: Change[],
  summary: { total: number; changed: number; unchanged: number },
): Promise<boolean>;
```

```ts
// src/addon.ts 中扩展 data
lastCleanOperation?: {
  changes: Change[];
  originalValues: Map<string, Record<string, string>>;
};
```

#### 验证清单

- [ ] `npm test` 通过，包括新的 `test/itemCleaning.test.ts`。
- [ ] `npm run build` 通过，TypeScript 无错误。
- [ ] `npm run lint:check` 通过。
- [ ] 在 Zotero 中右键选中条目，能看到“清理条目”菜单项。
- [ ] 选中包含可清理字段的条目时，弹出确认对话框并正确展示变更列表。
- [ ] 点击确认后，条目字段被修改，并显示含“撤销”按钮的成功通知。
- [ ] 点击撤销后，字段恢复到清理前的值。
- [ ] 选中无变更条目时，提示无需清理，不弹出空对话框。
- [ ] 多选条目时，部分写入失败仅影响失败条目，成功条目保持修改。

#### 风险与注意事项

- `Zotero.Item` 的字段写入是异步操作，需确认 `item.setField` + `item.saveTx()` 的正确用法。建议在写入失败时捕获异常并单独报错。
- DialogHelper 的 HTML cell 中无法直接使用 Vue/React 等框架，只能用原生 DOM 操作渲染表格。
- 撤销仅在当前 Zotero 会话有效，重启后丢失。如需持久化撤销，需要额外设计，但不在本次范围内。
- 旧功能移除后，若用户依赖“复制清理后的 BibTeX”，需考虑版本升级说明。当前决定是直接替换，不再保留旧入口。
