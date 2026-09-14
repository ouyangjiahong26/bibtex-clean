/**
 * 数组切块：字段写入与条目删除都按固定批次并发处理。
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
