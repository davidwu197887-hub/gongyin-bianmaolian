// ============================================================================
// auditTrail —— 审计与版本记录
// 记录规则版本、事件、FinancialNeed 生成与银行回执，并给出模拟可信登记摘要。
// ============================================================================

import { AuditEntry } from '../types';
import { digest } from './hash';

export class AuditTrail {
  private entries: AuditEntry[] = [];
  private seq = 0;

  add(type: string, ref: string, detail: string): AuditEntry {
    this.seq += 1;
    const base = { seq: this.seq, type, ref, detail, at: new Date().toISOString() };
    const entry: AuditEntry = { ...base, hash: digest(base) };
    this.entries.push(entry);
    return entry;
  }

  list(): AuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.seq = 0;
  }
}
