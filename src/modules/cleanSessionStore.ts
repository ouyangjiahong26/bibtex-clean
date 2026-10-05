/**
 * 清理会话存储：管理最近一次清理操作的变更记录。
 *
 * 在 record 时一次性深克隆，后续读取不会被外部修改影响。
 */

import type { Change } from "./changes";

export type LastCleanOperation = {
  changes: Change[];
};

export class CleanSessionStore {
  private _operation: LastCleanOperation | undefined;

  /**
   * 记录一次成功的清理操作。深克隆变更列表以防后续修改。
   */
  record(changes: Change[]): void {
    this._operation = {
      changes: changes.map((change) => ({ ...change })),
    };
  }

  /**
   * 返回当前记录的操作（如有），不清除。
   */
  current(): LastCleanOperation | undefined {
    return this._operation;
  }

  /**
   * 取出并清除当前记录的操作。用于撤销流程。
   */
  consume(): LastCleanOperation | undefined {
    const operation = this._operation;
    this._operation = undefined;
    return operation;
  }

  /**
   * 是否有可撤销的操作。
   */
  hasUndo(): boolean {
    return this._operation !== undefined;
  }
}
