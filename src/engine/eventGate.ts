/** 按业务事件身份去重；同步登记，阻止连续点击在 React 提交状态前重复执行。 */
export class EventGate {
  private processed = new Set<string>();
  accept(key: string): boolean {
    if (this.processed.has(key)) return false;
    this.processed.add(key);
    return true;
  }
  clear(): void { this.processed.clear(); }
}
