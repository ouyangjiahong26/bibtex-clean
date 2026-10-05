# Domain Docs

工程技能在探索代码库时应如何消费本仓库的领域文档。

## 探索前先读这些

- 仓库根目录的 `CONTEXT.md`，或
- 仓库根目录的 `CONTEXT-MAP.md`（如果存在）。它指向每个上下文的 `CONTEXT.md`，阅读与主题相关的每一个。
- `docs/adr/`：阅读与你即将改动区域相关的 ADR。在多上下文仓库中，还要检查 `src/<context>/docs/adr/` 中的上下文级决策。

如果这些文件不存在，静默继续。不要指出它们的缺失，也不要主动建议创建。`/domain-modeling` 技能（通过 `/grill-with-docs` 和 `/improve-codebase-architecture` 进入）会在术语或决策真正被确定时惰性创建它们。

## 文件结构

单上下文仓库（大多数仓库）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 全系统决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文特定决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用词汇表的术语

当你的输出命名一个领域概念（issue 标题、重构提案、假设、测试名）时，使用 `CONTEXT.md` 中定义的术语。不要漂移向词汇表明确避免的同义词。

如果你需要的概念尚未出现在词汇表中，这是一个信号：要么你发明了项目不使用的语言（请重新考虑），要么确实存在缺口（记下来，供 `/domain-modeling` 处理）。

## 标出 ADR 冲突

如果你的输出与现有 ADR 矛盾，请显式指出，而不是悄悄覆盖：

> _与 ADR-0007（event-sourced orders）矛盾，但值得重新讨论，因为……_
