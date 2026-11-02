import type { BusinessConnection } from "@/types/business";

export type MurimiSummary = { revenue: number; expenses: number; operatingResult: number; receivables: number; payables: number; valuedFixedAssets: number; assetsWithoutCurrentValuation: number };

export function summarizeMurimi(connection: BusinessConnection): MurimiSummary {
  const { snapshot } = connection;
  const valued = snapshot.assets.filter((asset) => asset.status !== "disposed" && typeof asset.estimatedValue === "number" && Number.isFinite(asset.estimatedValue));
  const unknown = snapshot.assets.filter((asset) => asset.status !== "disposed" && !(typeof asset.estimatedValue === "number" && Number.isFinite(asset.estimatedValue)));
  return {
    revenue: snapshot.performance.revenue,
    expenses: snapshot.performance.operatingExpenses,
    operatingResult: snapshot.performance.profitBeforeInventoryAndAssets,
    receivables: snapshot.balances.customerReceivables,
    payables: snapshot.balances.supplierPayables,
    valuedFixedAssets: valued.reduce((sum, asset) => sum + asset.estimatedValue!, 0),
    assetsWithoutCurrentValuation: unknown.length,
  };
}
