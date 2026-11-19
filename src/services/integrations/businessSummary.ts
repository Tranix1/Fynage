import type { BusinessConnection } from "@/types/business";

export type MurimiSummary = { revenue: number; expenses: number; operatingResult: number; receivables: number; payables: number; valuedFixedAssets: number; assetsWithoutCurrentValuation: number };
export type MurimiBalanceSheet = { workingCapital: number; currentAssets: number; nonCurrentAssets: number; totalAssets: number; liabilities: number; netWorth: number; batchAssets: number; consumableInventory: number; cashMovement: number; receivables: number };

const numeric = (value: unknown) => { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const batchValue = (batch: Record<string, unknown>) => {
  const direct = ["currentValue", "estimatedValue", "totalValue", "marketValue", "stockValue", "inventoryValue", "currentStockValue", "currentWorth", "valuation", "totalInvestment", "totalCost", "purchaseCost", "purchasePrice", "costValue", "totalAmount", "value"].map((key) => numeric(batch[key])).find((value) => value > 0);
  if (direct) return direct;
  const quantity = ["quantity", "count", "numberOfAnimals", "numberOfBirds", "numberOfChicks", "animalCount", "birdCount", "chickCount", "headCount", "totalChicks", "initialCount", "units"].map((key) => numeric(batch[key])).find((value) => value > 0) ?? 0;
  const unitValue = ["unitValue", "unitCost", "costPerUnit", "pricePerUnit", "costPerAnimal", "costPerBird", "costPerChick", "pricePerAnimal", "pricePerBird", "pricePerChick", "averageCost", "unitPrice", "price"].map((key) => numeric(batch[key])).find((value) => value > 0) ?? 0;
  return quantity * unitValue;
};

export function estimateMurimiBatchValue(connection: BusinessConnection): number {
  return connection.snapshot.batches.filter((batch) => !["disposed", "sold", "closed"].includes(String(batch.status ?? batch.state ?? "").toLowerCase())).reduce((sum, batch) => sum + batchValue(batch), 0);
}

export function summarizeMurimiBalanceSheet(connection: BusinessConnection): MurimiBalanceSheet {
  const summary = summarizeMurimi(connection);
  const { balances } = connection.snapshot;
  const batchAssets = estimateMurimiBatchValue(connection);
  const consumableInventory = balances.consumableInventory ?? 0;
  const cashMovement = balances.cashNetMovement;
  const loanReceivables = connection.snapshot.transactions.reduce((sum, row) => sum + numeric(row.loanReceivableChange), 0);
  const loanPayables = connection.snapshot.transactions.reduce((sum, row) => sum + numeric(row.loanPayableChange), 0);
  const currentAssets = cashMovement + balances.customerReceivables + consumableInventory + batchAssets + loanReceivables;
  const liabilities = balances.supplierPayables + loanPayables;
  const nonCurrentAssets = summary.valuedFixedAssets;
  const totalAssets = currentAssets + nonCurrentAssets;
  return { workingCapital: balances.workingCapital, currentAssets, nonCurrentAssets, totalAssets, liabilities, netWorth: totalAssets - liabilities, batchAssets, consumableInventory, cashMovement, receivables: balances.customerReceivables };
}

export function summarizeMurimi(connection: BusinessConnection): MurimiSummary {
  const { snapshot } = connection;
  const centrallyRegisteredPurchaseIds = new Set((snapshot.purchases ?? []).filter((purchase) => typeof purchase.centralAssetId === "string" && purchase.centralAssetId).map((purchase) => String(purchase.id)));
  const assets = snapshot.assets.filter((asset) => !asset.centralAssetId && !(asset.purchaseId && centrallyRegisteredPurchaseIds.has(asset.purchaseId)));
  const valued = assets.filter((asset) => asset.status !== "disposed" && typeof asset.estimatedValue === "number" && Number.isFinite(asset.estimatedValue));
  const unknown = assets.filter((asset) => asset.status !== "disposed" && !(typeof asset.estimatedValue === "number" && Number.isFinite(asset.estimatedValue)));
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
