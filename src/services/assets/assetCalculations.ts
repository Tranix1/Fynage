import type { AssetAllocation, AssetDepreciation, AssetRecord } from "@/types/assets";
import type { FinancialRecord } from "@/types/finance";

export function isMigratableLegacyAsset(record: FinancialRecord, ownerId: string): boolean {
  return record.ownerId === ownerId && record.sourceApp === "fynage" && record.type === "fixed_asset" && !record.centralAssetId && Number.isSafeInteger(record.assetValueMinor) && (record.assetValueMinor ?? 0) > 0 && record.amountMinor > 0 && !record.deletedAt;
}

export function legacyAssetId(recordId: string): string {
  return `asset_legacy_${recordId}`;
}

export function activeAllocationPercent(allocations: AssetAllocation[], exceptId?: string): number {
  return allocations.filter((row) => row.status === "active" && row.id !== exceptId).reduce((sum, row) => sum + row.allocationPercent, 0);
}

export function assertAllocationPercent(allocations: AssetAllocation[], percent: number, replacingId?: string): void {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error("Allocation must be between 0.01% and 100%.");
  if (activeAllocationPercent(allocations, replacingId) + percent > 100.000001) throw new Error("Active allocations cannot exceed 100%.");
}

export function deriveAllocationValues(asset: AssetRecord): AssetAllocation[] {
  return asset.allocations.map((row) => row.status !== "active" ? row : { ...row, allocatedValueMinor: Math.round(asset.currentValuationMinor * row.allocationPercent / 100) });
}

export function recordAssetValuation(asset: AssetRecord, valueMinor: number, date: string, reason: string, actorId: string): AssetRecord {
  if (!Number.isSafeInteger(valueMinor) || valueMinor < 0) throw new Error("Enter a valid valuation of zero or more.");
  const recordedAt = new Date().toISOString();
  const idSuffix = Date.now();
  const valueReason = reason.trim() || "Valuation update";
  const allocations = deriveAllocationValues({ ...asset, currentValuationMinor: valueMinor }).map((row) => row.status !== "active" ? row : { ...row, history: [...row.history, { id: `alloc_hist_${row.id}_${idSuffix}`, date: recordedAt, percent: row.allocationPercent, valueMinor: row.allocatedValueMinor, action: "valuation_rebased" }] });
  return { ...asset, currentValuationMinor: valueMinor, valuationDate: date, valuationHistory: [...asset.valuationHistory, { id: `val_${asset.id}_${idSuffix}`, valueMinor, date, reason: valueReason, recordedAt }], allocations, auditHistory: [...asset.auditHistory, { id: `audit_${asset.id}_${idSuffix}`, date: recordedAt, actorId, action: "valuation_changed", changes: { fromMinor: asset.currentValuationMinor, toMinor: valueMinor, date, reason: valueReason } }], updatedAt: recordedAt, revision: asset.revision + 1 };
}

export function accumulatedDepreciation(history: AssetDepreciation[]): number {
  return history.reduce((sum, row) => sum + row.amountMinor, 0);
}

export function netBookValue(asset: Pick<AssetRecord, "acquisitionCostMinor" | "residualValueMinor" | "depreciationHistory">): number {
  return Math.max(Math.min(asset.acquisitionCostMinor, asset.residualValueMinor), asset.acquisitionCostMinor - accumulatedDepreciation(asset.depreciationHistory));
}

const monthKey = (value: string) => value.slice(0, 7);
const monthDate = (value: string) => new Date(`${value}-01T12:00:00Z`);

export function depreciationForPeriod(asset: AssetRecord, period: string): number {
  if (asset.depreciationMethod === "none" || !asset.usefulLifeYears || asset.usefulLifeYears <= 0) return 0;
  const start = asset.depreciationStartDate ?? asset.acquisitionDate;
  if (monthKey(period) < monthKey(start)) return 0;
  const depreciable = Math.max(0, asset.acquisitionCostMinor - asset.residualValueMinor);
  const remaining = Math.max(0, depreciable - accumulatedDepreciation(asset.depreciationHistory));
  if (remaining === 0) return 0;
  const lifeMonths = Math.max(1, Math.round((asset.usefulLifeYears ?? 1) * 12));
  if (asset.depreciationMethod === "straight_line") return Math.min(remaining, Math.ceil(depreciable / lifeMonths));
  const book = Math.max(asset.residualValueMinor, asset.acquisitionCostMinor - accumulatedDepreciation(asset.depreciationHistory));
  const monthlyRate = Math.min(1, 2 / lifeMonths);
  return Math.min(remaining, Math.max(1, Math.round(book * monthlyRate)));
}

export function appendDepreciationThrough(asset: AssetRecord, throughDate: string, actorId: string): AssetRecord {
  if (asset.depreciationMethod === "none") return asset;
  const start = monthDate(monthKey(asset.depreciationStartDate ?? asset.acquisitionDate));
  const through = monthDate(monthKey(throughDate));
  if (through < start) return asset;
  const existing = new Set(asset.depreciationHistory.map((row) => row.period));
  const history = [...asset.depreciationHistory];
  const cursor = new Date(start);
  while (cursor <= through) {
    const period = monthKey(cursor.toISOString());
    if (!existing.has(period)) {
      const amountMinor = depreciationForPeriod({ ...asset, depreciationHistory: history }, period);
      if (amountMinor > 0) history.push({ id: `dep_${asset.id}_${period}`, period, amountMinor, recordedAt: new Date().toISOString(), note: `Recorded by ${actorId}`, allocationAmounts: asset.allocations.filter((allocation) => allocation.status === "active").map((allocation) => ({ allocationId: allocation.id, percent: allocation.allocationPercent, amountMinor: Math.round(amountMinor * allocation.allocationPercent / 100) })) });
      existing.add(period);
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return { ...asset, depreciationHistory: history, accumulatedDepreciationMinor: accumulatedDepreciation(history), netBookValueMinor: netBookValue({ ...asset, depreciationHistory: history }) };
}

export function recoveryOutstanding(allocation: AssetAllocation): number {
  return Math.max(0, (allocation.recoveryTargetMinor ?? 0) - allocation.recoveryPayments.reduce((sum, row) => sum + row.amountMinor, 0));
}

export function recordRecovery(allocation: AssetAllocation, payment: { id: string; amountMinor: number; date: string; note?: string }): AssetAllocation {
  if (!allocation.recoveryTargetMinor || allocation.recoveryTargetMinor <= 0) throw new Error("Set a recovery target before recording a recovery payment.");
  if (!Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0) throw new Error("Recovery amount must be greater than zero.");
  if (allocation.recoveryPayments.some((row) => row.id === payment.id)) return allocation;
  if (payment.amountMinor > recoveryOutstanding(allocation)) throw new Error("Recovery payment cannot exceed the outstanding target.");
  return { ...allocation, recoveryPayments: [...allocation.recoveryPayments, payment] };
}
