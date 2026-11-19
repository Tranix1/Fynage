import test from "node:test";
import assert from "node:assert/strict";
import { buildNetWorthHistory, getNetWorthSnapshotAt } from "./netWorthHistory.ts";

const account = (id, openingBalanceMinor = 100000) => ({ id, ownerId: "u1", businessId: "personal", name: id, type: "cash", currency: "USD", openingBalanceMinor, openingBalanceDate: "2025-01-01", archived: false, updatedAt: "2025-01-01", revision: 1 });
const record = (id, type, direction, amountMinor, occurredAt, extra = {}) => ({ id, ownerId: "u1", businessId: "personal", sourceApp: "fynage", type, direction, amountMinor, currency: "USD", category: "test", description: id, occurredAt: `${occurredAt}T12:00:00.000Z`, accountId: "cash", createdAt: `${occurredAt}T12:00:00.000Z`, updatedAt: `${occurredAt}T12:00:00.000Z`, revision: 1, ...extra });
const asset = (overrides = {}) => ({ id: "g1", ownerId: "u1", accountId: "personal", name: "Generator", category: "machinery_equipment", acquisitionDate: "2025-01-05", acquisitionCostMinor: 200000, currency: "USD", currentValuationMinor: 220000, valuationDate: "2025-06-01", legalOwner: "Me", status: "active", depreciationMethod: "straight_line", residualValueMinor: 0, accumulatedDepreciationMinor: 10000, netBookValueMinor: 190000, allocations: [{ id: "m", assetId: "g1", platform: "murimi", businessId: "farm", businessName: "Farm", allocationPercent: 60, allocatedValueMinor: 132000, allocationDate: "2025-01-05", status: "active", history: [], recoveryPayments: [] }, { id: "t", assetId: "g1", platform: "tengesa", businessId: "store", businessName: "Store", allocationPercent: 40, allocatedValueMinor: 88000, allocationDate: "2025-01-05", status: "active", history: [], recoveryPayments: [] }], valuationHistory: [{ id: "v0", date: "2025-01-05", valueMinor: 200000, reason: "Initial", recordedAt: "2025-01-05T12:00:00.000Z" }, { id: "v1", date: "2025-06-01", valueMinor: 220000, reason: "Revaluation", recordedAt: "2025-06-01T12:00:00.000Z" }], depreciationHistory: [{ id: "d1", period: "2025-01", amountMinor: 10000, recordedAt: "2025-01-31T12:00:00.000Z" }], auditHistory: [], createdAt: "2025-01-05T12:00:00.000Z", updatedAt: "2025-06-01T12:00:00.000Z", revision: 2, ...overrides });

test("empty financial history returns no fabricated graph points", () => {
  assert.deepEqual(buildNetWorthHistory({ uid: "u1", currency: "USD", records: [], accounts: [], assets: [], range: "daily", throughDate: "2025-01-01" }), []);
});

test("income and expenses change dated balances while transfers remain neutral", () => {
  const rows = [
    record("in", "income", "in", 10000, "2025-01-02"),
    record("out", "expense", "out", 5000, "2025-01-03"),
    record("move", "transfer", "transfer", 20000, "2025-01-04", { accountId: "cash", toAccountId: "bank" }),
  ];
  const history = buildNetWorthHistory({ uid: "u1", currency: "USD", records: rows, accounts: [account("cash"), account("bank")], assets: [], range: "daily", throughDate: "2025-01-04" });
  assert.equal(history.find((item) => item.date === "2025-01-01")?.netWorthMinor, 200000);
  assert.equal(history.find((item) => item.date === "2025-01-02")?.netWorthMinor, 210000);
  assert.equal(history.find((item) => item.date === "2025-01-03")?.netWorthMinor, 205000);
  assert.equal(history.find((item) => item.date === "2025-01-04")?.netWorthMinor, 205000);
  assert.equal(history.find((item) => item.date === "2025-01-04")?.carriedForward, false);
});

test("capital purchase, depreciation, revaluation and shared allocation count one central asset", () => {
  const rows = [record("purchase", "fixed_asset", "out", 200000, "2025-01-05", { centralAssetId: "g1", assetValueMinor: 200000 })];
  const history = buildNetWorthHistory({ uid: "u1", currency: "USD", records: rows, accounts: [account("cash")], assets: [asset()], range: "monthly", throughDate: "2025-06-30" });
  assert.equal(history.find((item) => item.date === "2025-01-31")?.netWorthMinor, 90000);
  assert.equal(history.find((item) => item.date === "2025-05-31")?.netWorthMinor, 90000);
  assert.equal(history.find((item) => item.date === "2025-06-30")?.netWorthMinor, 110000);
  assert.equal(history.find((item) => item.date === "2025-06-30")?.physicalAssetsMinor, 210000);
});

test("loan proceeds and repayments affect cash and liability together", () => {
  const rows = [
    record("loan", "loan_received", "in", 50000, "2025-01-02", { liabilityMinor: 50000 }),
    record("repay", "loan_repayment", "out", 20000, "2025-02-02", { principalMinor: 18000, interestMinor: 2000 }),
  ];
  const history = buildNetWorthHistory({ uid: "u1", currency: "USD", records: rows, accounts: [account("cash")], assets: [], range: "monthly", throughDate: "2025-02-28" });
  assert.equal(history.find((item) => item.date === "2025-01-31")?.netWorthMinor, 100000);
  assert.equal(history.find((item) => item.date === "2025-02-28")?.netWorthMinor, 98000);
  assert.equal(history.find((item) => item.date === "2025-02-28")?.liabilitiesMinor, 32000);
});

test("monthly and yearly points close at the period end and manual dates are local calendar dates", () => {
  const rows = [record("income", "income", "in", 10000, "2025-02-15")];
  const input = { uid: "u1", currency: "USD", records: rows, accounts: [account("cash")], assets: [], throughDate: "2025-03-01" };
  const monthly = buildNetWorthHistory({ ...input, range: "monthly" });
  assert.equal(monthly.find((item) => item.date === "2025-02-28")?.netWorthMinor, 110000);
  assert.equal(getNetWorthSnapshotAt({ ...input, range: "daily" }, "2025-02-15")?.netWorthMinor, 110000);
  const yearly = buildNetWorthHistory({ ...input, range: "yearly" });
  assert.equal(yearly.at(-1)?.date, "2025-03-01");
});

test("edits and tombstones update reconstructed history and duplicate shared sources are not counted", () => {
  const input = { uid: "u1", currency: "USD", accounts: [account("cash")], assets: [], range: "daily", throughDate: "2025-01-03" };
  const row = record("shared", "income", "in", 5000, "2025-01-02");
  assert.equal(getNetWorthSnapshotAt({ ...input, records: [row] }, "2025-01-02")?.netWorthMinor, 105000);
  assert.equal(getNetWorthSnapshotAt({ ...input, records: [{ ...row, amountMinor: 7000, revision: 2 }] }, "2025-01-02")?.netWorthMinor, 107000);
  assert.equal(getNetWorthSnapshotAt({ ...input, records: [{ ...row, deletedAt: "2025-01-03T00:00:00.000Z" }] }, "2025-01-02")?.netWorthMinor, 100000);
  assert.equal(getNetWorthSnapshotAt({ ...input, records: [{ ...row, sourceApp: "murimi" }] }, "2025-01-02")?.netWorthMinor, 100000);
});

test("large daily history builds all periods from a multi-year ledger", () => {
  const rows = Array.from({ length: 2400 }, (_, index) => {
    const day = new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10);
    return record(`event_${index}`, "income", "in", 1, day);
  });
  const throughDate = rows.at(-1).occurredAt.slice(0, 10);
  const history = buildNetWorthHistory({ uid: "u1", currency: "USD", records: rows, accounts: [{ ...account("cash"), openingBalanceDate: "2020-01-01" }], assets: [], range: "daily", throughDate });
  assert.equal(history.length, 2400);
  assert.equal(history.at(-1).netWorthMinor, 102400);
});
