# 0002 CleanSessionStore 提取撤销状态

## 状态

已接受

## 背景

撤销目标（`LastCleanOperation`）原先挂在 `addon.data.lastCleanOperation` 这个 free-form 对象上，从菜单谓词到编排函数都直接读写。`cloneChanges` workaround 存在于 `hooks.ts` 中，因为 `applyChanges` 返回的是传入引用，作者通过浅拷贝修补而非修复 seam。

## 决策

引入 `CleanSessionStore` 模块，封装 `record` / `current` / `consume` / `hasUndo` 四个方法。`record()` 内部一次性深克隆变更数组，消除 `cloneChanges` workaround。

## 影响

- 撤销状态不再污染 `addon.data` 类型
- 深克隆语义和 store 放在一起，不再分散
- 菜单谓词通过 `hasUndo()` 查询，依赖更清晰
- 为后续拆分 `hooks.ts` 提供显式依赖注入点
