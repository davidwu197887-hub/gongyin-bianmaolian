// 模拟可信登记：对关键对象生成确定性摘要（FNV-1a 32bit），
// 仅用于“版本校验 / 模拟可信登记”，不代表接入真实联盟链。

export function digest(input: unknown): string {
  const str = typeof input === 'string' ? input : stableStringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 转为 8 位十六进制
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  return `0x${hex}`;
}

/** 稳定序列化：键排序，保证相同内容得到相同摘要 */
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}
