import type { FinancialRecord } from "@/types/finance";

/** Apply a remote deletion marker without discarding the locally retained transaction history. */
export function mergeRemoteFinancialTombstone(previous: FinancialRecord, remote: FinancialRecord): FinancialRecord {
  if (!remote.deletedAt) throw new Error("A deletion timestamp is required for a financial tombstone.");
  const auditById = new Map((previous.auditTrail ?? []).map((entry) => [entry.id, entry]));
  for (const entry of remote.auditTrail ?? []) auditById.set(entry.id, entry);
  return {
    ...previous,
    deletedAt: remote.deletedAt,
    updatedAt: remote.updatedAt || previous.updatedAt,
    revision: Math.max(previous.revision, remote.revision),
    auditTrail: [...auditById.values()],
  };
}
