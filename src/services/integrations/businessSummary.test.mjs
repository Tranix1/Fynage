import test from "node:test";
import assert from "node:assert/strict";
import { summarizeMurimi } from "./businessSummary.ts";

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
