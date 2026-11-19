import test from "node:test";
import assert from "node:assert/strict";
import { appendDepreciationThrough, assertAllocationPercent, depreciationForPeriod, deriveAllocationValues, isMigratableLegacyAsset, legacyAssetId, netBookValue, recordAssetValuation, recordRecovery, recoveryOutstanding } from "./assetCalculations.ts";
import { calculateEstimatedNetWorth } from "../finance/calculations.ts";

const sample = (overrides = {}) => ({
  id: "asset_a", ownerId: "user_a", accountId: "personal", name: "Generator", category: "machinery_equipment",
  acquisitionDate: "2025-01-15", acquisitionCostMinor: 200000, currency: "USD", currentValuationMinor: 200000,
  valuationDate: "2025-01-15", legalOwner: "Me", status: "active", depreciationMethod: "straight_line",
  depreciationStartDate: "2025-01-15", usefulLifeYears: 5, residualValueMinor: 20000,
  accumulatedDepreciationMinor: 0, netBookValueMinor: 200000, allocations: [], valuationHistory: [], depreciationHistory: [], auditHistory: [],
  createdAt: "2025-01-15T12:00:00.000Z", updatedAt: "2025-01-15T12:00:00.000Z", revision: 1, ...overrides,
});

test("allocation caps active shares at 100 percent", () => {
  assertAllocationPercent([], 60);
  assert.throws(() => assertAllocationPercent([{ id: "a", status: "active", allocationPercent: 60 }], 41), /cannot exceed 100/);
  assertAllocationPercent([{ id: "a", status: "active", allocationPercent: 60 }], 60, "a");
});

test("a single asset can be allocated across two businesses and valuation refreshes derived shares", () => {
  const asset = sample({ allocations: [
    { id: "murimi", assetId: "asset_a", platform: "murimi", businessId: "farm_1", businessName: "Farm", allocationPercent: 60, allocatedValueMinor: 120000, allocationDate: "2025-01-15", status: "active", history: [], recoveryPayments: [] },
    { id: "tengesa", assetId: "asset_a", platform: "tengesa", businessId: "store_1", businessName: "Store", allocationPercent: 40, allocatedValueMinor: 80000, allocationDate: "2025-01-15", status: "active", history: [], recoveryPayments: [] },
  ] });
  const changed = recordAssetValuation(asset, 220000, "2025-06-01", "Market review", "user_a");
  assert.deepEqual(deriveAllocationValues(changed).map((row) => row.allocatedValueMinor), [132000, 88000]);
  assert.equal(changed.valuationHistory.length, 1);
  assert.equal(changed.valuationHistory[0].valueMinor, 220000);
  assert.equal(changed.allocations[0].history.at(-1).action, "valuation_rebased");
});

test("central asset links prevent counting the physical asset twice in ledger net worth", () => {
  const purchase = { type: "fixed_asset", direction: "out", amountMinor: 200000, assetValueMinor: 200000, currency: "USD" };
  assert.equal(calculateEstimatedNetWorth([{ ...purchase, centralAssetId: "asset_a" }]), -200000);
  assert.equal(calculateEstimatedNetWorth([purchase]), 0);
  assert.equal(calculateEstimatedNetWorth([{ ...purchase, centralAssetId: "asset_a" }]) + 200000, 0);
});

test("legacy asset migration is limited to reliably identified Fynage capital assets and has stable IDs", () => {
  const record = { id: "old_asset_tx", ownerId: "user_a", sourceApp: "fynage", type: "fixed_asset", amountMinor: 50000, assetValueMinor: 50000 };
  assert.equal(isMigratableLegacyAsset(record, "user_a"), true);
  assert.equal(legacyAssetId(record.id), legacyAssetId(record.id));
  assert.equal(legacyAssetId(record.id), "asset_legacy_old_asset_tx");
  assert.equal(isMigratableLegacyAsset({ ...record, assetValueMinor: undefined }, "user_a"), false);
  assert.equal(isMigratableLegacyAsset({ ...record, centralAssetId: "asset_already_registered" }, "user_a"), false);
  assert.equal(isMigratableLegacyAsset({ ...record, ownerId: "user_b" }, "user_a"), false);
});

test("straight-line depreciation caps at residual value and creates one period row", () => {
  const asset = sample();
  assert.equal(depreciationForPeriod(asset, "2025-01"), 3000);
  const depreciated = appendDepreciationThrough(asset, "2025-03-20", "user_a");
  assert.equal(depreciated.depreciationHistory.length, 3);
  assert.equal(depreciated.accumulatedDepreciationMinor, 9000);
  assert.equal(netBookValue(depreciated), 191000);
  assert.equal(appendDepreciationThrough(depreciated, "2025-03-20", "user_a").depreciationHistory.length, 3);
});

test("land is not depreciated when configured with the default no-depreciation method", () => {
  const land = sample({ category: "land", depreciationMethod: "none" });
  assert.equal(depreciationForPeriod(land, "2025-01"), 0);
  assert.equal(appendDepreciationThrough(land, "2025-12-31", "user_a").depreciationHistory.length, 0);
});

test("partial recovery is tracked separately and duplicate recovery IDs do not duplicate payment", () => {
  const allocation = { id: "alloc_a", recoveryTargetMinor: 70000, recoveryPayments: [] };
  const payment = { id: "payment_a", amountMinor: 25000, date: "2025-02-01" };
  const once = recordRecovery(allocation, payment);
  const twice = recordRecovery(once, payment);
  assert.equal(recoveryOutstanding(twice), 45000);
  assert.equal(twice.recoveryPayments.length, 1);
  assert.throws(() => recordRecovery(twice, { id: "too_much", amountMinor: 45001, date: "2025-02-02" }), /exceed/);
});
