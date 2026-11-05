import type { FinancialRecord } from "@/types/finance";

export function createBalanceAdjustment(input: {
  id: string;
  ownerId: string;
  businessId: string;
  accountId: string;
  account: string;
  currency: string;
  recordedMinor: number;
  actualMinor: number;
  reason: string;
  occurredAt?: string;
}): FinancialRecord | undefined {
  if (!Number.isSafeInteger(input.recordedMinor) || !Number.isSafeInteger(input.actualMinor)) throw new Error("Balances must be whole minor currency units.");
  if (!input.reason.trim()) throw new Error("Explain the balance difference before saving it.");
  const difference = input.actualMinor - input.recordedMinor;
  if (!difference) return undefined;
  const timestamp = input.occurredAt ?? new Date().toISOString();
  return {
    id: input.id, ownerId: input.ownerId, businessId: input.businessId, sourceApp: "fynage", sourceRecordId: input.id,
    type: "adjustment", direction: difference > 0 ? "in" : "out", amountMinor: Math.abs(difference), currency: input.currency,
    category: "Balance adjustment", description: `Reconcile ${input.account}`, occurredAt: timestamp,
    accountId: input.accountId, account: input.account, reconciliationDifferenceMinor: difference,
    notes: `Recorded ${(input.recordedMinor / 100).toFixed(2)}; actual ${(input.actualMinor / 100).toFixed(2)}. ${input.reason.trim()}`,
    source: "manual", classificationStatus: "reviewed", createdAt: timestamp, updatedAt: timestamp, revision: 1,
  };
}
