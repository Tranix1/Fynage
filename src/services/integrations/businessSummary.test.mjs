import test from "node:test";
import assert from "node:assert/strict";
import { estimateMurimiBatchValue, summarizeMurimi } from "./businessSummary.ts";

test("Murimi summary uses source values and excludes unvalued or disposed assets", () => {
  const connection = {
    snapshot: {
      performance: { revenue: 1200, operatingExpenses: 750, profitBeforeInventoryAndAssets: 450 },
      balances: { customerReceivables: 90, supplierPayables: 40 },
      assets: [
        { id: "asset-a", estimatedValue: 500, status: "active" },
        { id: "asset-b", originalCost: 300, status: "active" },
        { id: "asset-c", estimatedValue: 200, status: "disposed" },
      ],
    },
  };

  assert.deepEqual(summarizeMurimi(connection), {
    revenue: 1200,
    expenses: 750,
    operatingResult: 450,
    receivables: 90,
    payables: 40,
    valuedFixedAssets: 500,
    assetsWithoutCurrentValuation: 1,
  });
});

test("values active Murimi batches from direct value or livestock count and unit cost", () => {
  const connection = { snapshot: { batches: [
    { id: "chicks", numberOfChicks: 100, costPerChick: 2.5, status: "active" },
    { id: "stock", inventoryValue: 400, status: "active" },
    { id: "sold", totalValue: 900, status: "sold" },
  ] } };

  assert.equal(estimateMurimiBatchValue(connection), 650);
});

test("central asset purchase mirrors are excluded from farm assets to avoid consolidated double counting", () => {
  const connection = { snapshot: {
    performance: { revenue: 0, operatingExpenses: 0, profitBeforeInventoryAndAssets: 0 },
    balances: { customerReceivables: 0, supplierPayables: 0 },
    purchases: [{ id: "purchase-a", centralAssetId: "asset-a" }],
    assets: [
      { id: "farm-mirror-a", purchaseId: "purchase-a", estimatedValue: 500, status: "active" },
      { id: "farm-asset-b", estimatedValue: 125, status: "active" },
    ],
  } };
  assert.equal(summarizeMurimi(connection).valuedFixedAssets, 125);
});