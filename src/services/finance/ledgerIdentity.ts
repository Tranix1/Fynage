import type { FinancialRecord } from "@/types/finance";

type LedgerIdentityFields = Pick<FinancialRecord, "id" | "ownerId" | "businessId" | "sourceApp" | "sourceRecordId" | "sourceDocumentId" | "sourceCollection" | "sourceBusinessId" | "sourceAccountId" | "accountId">;

export function getSharedLedgerRecordId(record: LedgerIdentityFields): string {
  // Identity is derived only from stable ownership and source-document scope;
  // transaction prose or monetary values are never identity components.
  const sourceDocumentId = record.sourceDocumentId ?? record.sourceRecordId ?? record.id;
  const identity = [
    record.ownerId,
    record.sourceApp ?? "fynage",
    record.sourceBusinessId ?? record.businessId,
    record.sourceAccountId ?? record.accountId ?? "",
    record.sourceCollection ?? "",
    sourceDocumentId,
  ];
  return `ledger_${encodeURIComponent(JSON.stringify(identity))}`;
}

export function getLedgerIdentity(record: LedgerIdentityFields): string {
  const sourceDocumentId = record.sourceDocumentId ?? record.sourceRecordId;
  if (record.sourceApp && sourceDocumentId) {
    return getSharedLedgerRecordId({ ...record, sourceDocumentId });
  }
  return JSON.stringify([record.ownerId, record.businessId, record.id]);
}

export function dedupeLedgerRecords<T extends LedgerIdentityFields & Pick<FinancialRecord, "updatedAt" | "revision">>(records: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const record of records) {
    const key = getLedgerIdentity(record);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      continue;
    }
    const existingUpdated = Date.parse(existing.updatedAt);
    const candidateUpdated = Date.parse(record.updatedAt);
    if (candidateUpdated > existingUpdated || (candidateUpdated === existingUpdated && record.revision > existing.revision)) byKey.set(key, record);
  }
  return [...byKey.values()];
}
