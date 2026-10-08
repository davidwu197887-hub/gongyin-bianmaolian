// ============================================================================
// mockBankApi —— 模拟向工行既有金融能力提交金融需求包
// 只返回等待银行独立审核状态。
// ============================================================================

import { FinancialNeed, BankApiResponse } from '../types';
import { digest } from './hash';

/** 模拟 POST /mock-bank-api/financial-needs */
export function submitFinancialNeed(need: FinancialNeed): BankApiResponse {
  if (!Number.isFinite(need.amount) || need.amount <= 0 || !need.createsNewFinancialNeed) throw new Error('无有效金融需求，不能提交银行接口');
  return {
    received: true,
    status: 'PENDING_BANK_REVIEW',
    message: '金融需求材料已提交，最终产品适配与授信由银行独立审核',
    requestId: `REQ-${digest({ id: need.needId, t: need.startDay })}`,
    submittedAt: new Date().toISOString(),
    echo: {
      subject: need.subject,
      amount: need.amount,
      startDay: need.startDay,
      category: need.suggestedNeedCategory,
    },
  };
}

export const MOCK_ENDPOINT = 'POST /mock-bank-api/financial-needs';
