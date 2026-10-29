import type { FinancialRecord } from "@/types/finance";

export function getLedgerIdentity(record: Pick<FinancialRecord, "id" | "ownerId" | "businessId" | "sourceApp" | "sourceRecordId">): string {
  return record.sourceApp && record.sourceRecordId
    ? `${record.sourceApp}:${record.sourceRecordId}`
    : `${record.ownerId}:${record.businessId}:${record.id}`;
}

export function dedupeLedgerRecords<T extends Pick<FinancialRecord, "id" | "ownerId" | "businessId" | "sourceApp" | "sourceRecordId" | "updatedAt" | "revision">>(records: T[]): T[] {
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