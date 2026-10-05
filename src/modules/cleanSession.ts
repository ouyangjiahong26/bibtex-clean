/**
 * 清理会话编排：将选择、计算、确认、写入、通知的完整流程
 * 建模为显式状态机，并通过适配器隔离真实副作用。
 */

import type { Change, CleanableItem, FieldChange } from "./changes";
import { changesToFieldChanges, computeChanges } from "./changes";
import type { CleanSessionStore } from "./cleanSessionStore";
import type { Locale } from "../utils/locale";

/**
 * 写入一批变更后的结果（展示数据，供通知适配器消费）。
 */
export type ApplyResult = {
  succeeded: Change[];
  failed: { change: Change; error: Error }[];
};

/**
 * 写入一批字段变更后的结果（纯数据载荷，writer 返回）。
 */
export type FieldApplyResult = {
  succeeded: FieldChange[];
  failed: { change: FieldChange; error: Error }[];
};

/**
 * 确认对话框适配器。真实实现使用 ztoolkit.Dialog。
 */
export interface DialogAdapter {
  confirm(changes: Change[], totalItemCount: number): Promise<boolean>;
}

/**
 * Zotero 条目写入适配器。真实实现耦合 Zotero 运行时。
 */
export interface WriterAdapter {
  toCleanableItem(item: Zotero.Item): CleanableItem | undefined;
  applyChanges(changes: FieldChange[]): Promise<FieldApplyResult>;
  undoChanges(changes: FieldChange[]): Promise<FieldApplyResult>;
}

/**
 * 用户通知适配器。真实实现使用 ztoolkit.ProgressWindow。
 */
export interface NotifierAdapter {
  showInfo(text: string): void;
  showSuccess(text: string): void;
  showErrorDetails(failed: { change: Change; error: Error }[]): void;
  showUndoableSuccess(text: string, onUndo: () => void): void;
}

/**
 * 清理流程所需的完整适配器集合。
 */
export type CleanWorkflowAdapters = {
  dialog: DialogAdapter;
  writer: WriterAdapter;
  notifier: NotifierAdapter;
};

/**
 * 撤销流程所需的适配器集合。
 */
export type UndoAdapters = {
  writer: WriterAdapter;
  notifier: NotifierAdapter;
};

type CleanWorkflowState =
  | { kind: "Idle" }
  | { kind: "ItemsSelected"; items: Zotero.Item[] }
  | {
      kind: "ChangesComputed";
      cleanableItems: CleanableItem[];
      changes: Change[];
      totalItemCount: number;
    }
  | {
      kind: "Confirmed";
      cleanableItems: CleanableItem[];
      changes: Change[];
      totalItemCount: number;
    }
  | {
      kind: "Applied";
      cleanableItems: CleanableItem[];
      changes: Change[];
      totalItemCount: number;
      result: ApplyResult;
    }
  | {
      kind: "Notified";
      cleanableItems: CleanableItem[];
      changes: Change[];
      totalItemCount: number;
      result: ApplyResult;
      recorded: boolean;
    }
  | { kind: "Cancelled" }
  | { kind: "NoCleanableItems" }
  | { kind: "NoChanges" };

/**
 * 清理工作流状态机。
 *
 * 每个状态转换方法都是纯函数式推进：接收输入/适配器结果，返回下一个状态
 * 的新实例。真实副作用（对话框、Zotero 写入、通知）全部通过注入的适配器完成。
 */
export class CleanWorkflow {
  private constructor(public readonly state: CleanWorkflowState) {}

  static fromIdle(): CleanWorkflow {
    return new CleanWorkflow({ kind: "Idle" });
  }

  /**
   * 从空闲状态进入已选条目状态。
   */
  selectItems(items: Zotero.Item[]): CleanWorkflow {
    if (this.state.kind !== "Idle") {
      throw new Error(`Cannot selectItems from state ${this.state.kind}`);
    }
    return new CleanWorkflow({ kind: "ItemsSelected", items });
  }

  /**
   * 从当前选中条目计算出可清理条目与变更。
   * 若无可清理条目或无实际变更，则进入对应的终止状态。
   */
  compute(writer: WriterAdapter): CleanWorkflow {
    if (this.state.kind !== "ItemsSelected") {
      throw new Error(`Cannot compute from state ${this.state.kind}`);
    }

    const cleanableItems = this.state.items
      .map((item) => writer.toCleanableItem(item))
      .filter((item): item is CleanableItem => item !== undefined);

    if (cleanableItems.length === 0) {
      return new CleanWorkflow({ kind: "NoCleanableItems" });
    }

    const changes = computeChanges(cleanableItems);
    if (changes.length === 0) {
      return new CleanWorkflow({ kind: "NoChanges" });
    }

    return new CleanWorkflow({
      kind: "ChangesComputed",
      cleanableItems,
      changes,
      totalItemCount: cleanableItems.length,
    });
  }

  /**
   * 弹出确认对话框，根据用户选择进入 Confirmed 或 Cancelled 状态。
   */
  async confirm(dialog: DialogAdapter): Promise<CleanWorkflow> {
    if (this.state.kind !== "ChangesComputed") {
      throw new Error(`Cannot confirm from state ${this.state.kind}`);
    }

    const confirmed = await dialog.confirm(
      this.state.changes,
      this.state.totalItemCount,
    );

    if (!confirmed) {
      return new CleanWorkflow({ kind: "Cancelled" });
    }

    return new CleanWorkflow({
      kind: "Confirmed",
      cleanableItems: this.state.cleanableItems,
      changes: this.state.changes,
      totalItemCount: this.state.totalItemCount,
    });
  }

  /**
   * 将已确认的变更写回 Zotero，进入 Applied 状态。
   */
  async apply(writer: WriterAdapter): Promise<CleanWorkflow> {
    if (this.state.kind !== "Confirmed") {
      throw new Error(`Cannot apply from state ${this.state.kind}`);
    }

    const fieldChanges = changesToFieldChanges(this.state.changes);
    const fieldResult = await writer.applyChanges(fieldChanges);

    // 将 writer 返回的 FieldChange 映射回原 Change，以保留 itemTitle 供通知使用
    const changeByKey = new Map(
      this.state.changes.map((c) => [`${c.itemKey}\x00${c.field}`, c]),
    );
    const toChange = (fc: FieldChange): Change =>
      changeByKey.get(`${fc.itemKey}\x00${fc.field}`)!;

    const result: ApplyResult = {
      succeeded: fieldResult.succeeded.map(toChange),
      failed: fieldResult.failed.map(({ change, error }) => ({
        change: toChange(change),
        error,
      })),
    };

    return new CleanWorkflow({
      kind: "Applied",
      cleanableItems: this.state.cleanableItems,
      changes: this.state.changes,
      totalItemCount: this.state.totalItemCount,
      result,
    });
  }

  /**
   * 根据应用结果发送用户通知，并记录可撤销操作。
   */
  notify(
    store: CleanSessionStore,
    notifier: NotifierAdapter,
    undoAdapters: UndoAdapters,
    locale: Locale,
  ): CleanWorkflow {
    if (this.state.kind !== "Applied") {
      throw new Error(`Cannot notify from state ${this.state.kind}`);
    }

    const { changes, cleanableItems, totalItemCount, result } = this.state;

    if (result.failed.length > 0) {
      notifier.showErrorDetails(result.failed);
    }

    let recorded = false;
    if (result.succeeded.length > 0) {
      store.record(result.succeeded);
      recorded = true;

      if (result.failed.length > 0) {
        notifier.showInfo(locale.getString("message-success-partial"));
      } else {
        notifier.showUndoableSuccess(
          locale.getString("message-success-cleaned"),
          () => {
            undoLastCleanOperation(store, undoAdapters, locale);
          },
        );
      }
    }

    return new CleanWorkflow({
      kind: "Notified",
      cleanableItems,
      changes,
      totalItemCount,
      result,
      recorded,
    });
  }
}

/**
 * 清理当前选中的 Zotero 条目。
 */
export async function cleanSelectedItems(
  store: CleanSessionStore,
  adapters: CleanWorkflowAdapters,
  locale: Locale,
): Promise<void> {
  const items = Zotero.getActiveZoteroPane()!.getSelectedItems();
  const workflow = CleanWorkflow.fromIdle()
    .selectItems(items)
    .compute(adapters.writer);

  if (
    workflow.state.kind === "NoCleanableItems" ||
    workflow.state.kind === "NoChanges"
  ) {
    adapters.notifier.showInfo(locale.getString("message-no-changes"));
    return;
  }

  const confirmed = await workflow.confirm(adapters.dialog);
  if (confirmed.state.kind === "Cancelled") {
    return;
  }

  const applied = await confirmed.apply(adapters.writer);
  applied.notify(
    store,
    adapters.notifier,
    {
      writer: adapters.writer,
      notifier: adapters.notifier,
    },
    locale,
  );
}

/**
 * 撤销最近一次清理操作。
 */
export async function undoLastCleanOperation(
  store: CleanSessionStore,
  adapters: UndoAdapters,
  locale: Locale,
): Promise<void> {
  const operation = store.consume();
  if (!operation) {
    return;
  }

  const fieldChanges = changesToFieldChanges(operation.changes);
  const { succeeded, failed } = await adapters.writer.undoChanges(fieldChanges);

  // 将 writer 返回的 FieldChange 映射回原 Change，以保留 itemTitle 供通知使用
  const changeByKey = new Map(
    operation.changes.map((c) => [`${c.itemKey}\x00${c.field}`, c]),
  );
  const toChange = (fc: FieldChange): Change =>
    changeByKey.get(`${fc.itemKey}\x00${fc.field}`)!;

  if (failed.length > 0) {
    adapters.notifier.showErrorDetails(
      failed.map(({ change, error }) => ({ change: toChange(change), error })),
    );
  }

  if (succeeded.length > 0) {
    adapters.notifier.showSuccess(locale.getString("message-success-undone"));
  }
}
