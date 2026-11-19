export type AssetCategory = "land" | "buildings" | "vehicles" | "machinery_equipment" | "solar_electrical" | "furniture_fittings" | "agricultural_infrastructure" | "livestock_infrastructure" | "other";
export type DepreciationMethod = "none" | "straight_line" | "declining_balance";
export type AssetStatus = "active" | "inactive" | "disposed";
export type AssetPlatform = "fynage" | "murimi" | "tengesa" | "transix" | "other";

export type AssetValuation = { id: string; valueMinor: number; date: string; reason: string; recordedAt: string };
export type AssetDepreciation = { id: string; period: string; amountMinor: number; recordedAt: string; note?: string; allocationAmounts?: { allocationId: string; percent: number; amountMinor: number }[] };
export type AssetAllocation = {
  id: string; assetId: string; platform: AssetPlatform; businessId: string; businessName: string;
  allocationPercent: number; allocatedValueMinor: number; allocationDate: string;
  status: "active" | "removed" | "reallocated"; notes?: string; history: { id: string; date: string; percent: number; valueMinor: number; action: string }[];
  recoveryTargetMinor?: number; recoveryStartDate?: string; recoveryMethod?: "manual" | "equal_monthly";
  recoveryTargetHistory?: { id: string; date: string; targetMinor: number; reason: string }[];
  recoveryPayments: { id: string; amountMinor: number; date: string; note?: string }[];
};
export type AssetAudit = { id: string; date: string; actorId: string; action: string; changes?: Record<string, unknown> };
export type AssetRecord = {
  id: string; ownerId: string; accountId: string; name: string; description?: string; category: AssetCategory;
  acquisitionDate: string; acquisitionCostMinor: number; currency: string; currentValuationMinor: number;
  valuationDate: string; legalOwner: string; status: AssetStatus; location?: string; usefulLifeYears?: number;
  depreciationMethod: DepreciationMethod; depreciationStartDate?: string; residualValueMinor: number;
  accumulatedDepreciationMinor: number; netBookValueMinor: number; notes?: string;
  allocations: AssetAllocation[]; valuationHistory: AssetValuation[]; depreciationHistory: AssetDepreciation[];
  auditHistory: AssetAudit[]; acquisitionRecordId?: string; sourceRecordId?: string;
  createdAt: string; updatedAt: string; revision: number; deletedAt?: string | null;
};
