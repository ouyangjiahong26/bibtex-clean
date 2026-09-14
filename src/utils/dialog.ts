/**
 * 对话框等待：轮询窗口关闭，两个对话框共用。
 * 作为 seam 可被注入的 fake 替换。
 */
export function waitForDialogClose(
  dialog: InstanceType<ZToolkit["Dialog"]>,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (dialog.window?.closed) {
        resolve();
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}
