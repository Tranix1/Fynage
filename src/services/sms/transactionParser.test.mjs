import assert from "node:assert/strict";
import test from "node:test";
import { calculateEstimatedNetWorth, calculateMonthlyMovement } from "../finance/calculations.ts";
import { parseFinancialSms } from "./transactionParser.ts";
import { dedupeLedgerRecords } from "../finance/ledgerIdentity.ts";

const record = (overrides = {}) => ({
  id: "r", ownerId: "u", businessId: "personal", type: "expense", direction: "out",
  amountMinor: 1000, currency: "USD", category: "General", description: "Entry",
  occurredAt: "2026-03-10T10:00:00.000Z", createdAt: "2026-03-10T10:00:00.000Z",
  updatedAt: "2026-03-10T10:00:00.000Z", revision: 1, ...overrides,
});

test("parses an EcoCash incoming movement with amount, reference, and stable source key", () => {
  const sms = { id: "234", sender: "+263143", date: Date.parse("2026-03-10T10:00:00Z"), body: "EcoCash received USD 25.50 from Jane Doe. Ref: AB12345" };
  const parsed = parseFinancialSms(sms, "user-1", "business-1");
  assert.ok(parsed);
  assert.equal(parsed.direction, "in");
  assert.equal(parsed.type, "income");
  assert.equal(parsed.amountMinor, 2550);
  assert.equal(parsed.reference, "AB12345");
  assert.equal(parsed.sourceKey, parseFinancialSms(sms, "user-1", "business-1")?.sourceKey);
  assert.equal(parsed.classificationStatus, "unreviewed");
});

test("uses the provider reference rather than the device SMS row ID as the stable identifier", () => {
  const first = parseFinancialSms({ id: "local-row-1", sender: "+263143", date: Date.parse("2026-03-10T10:00:00Z"), body: "EcoCash sent USD 7.00 to John. Ref: TXN-99123" }, "u", "b");
  const second = parseFinancialSms({ id: "local-row-99", sender: "+263143", date: Date.parse("2026-03-10T10:00:00Z"), body: "EcoCash sent USD 7.00 to John. Ref: TXN-99123" }, "u", "b");
  assert.equal(first?.id, "sms_263143_ref_txn99123");
  assert.equal(first?.id, second?.id);
});

test("deduplicates ledger rows by shared source identity and keeps the newer revision", () => {
  const first = { ...record({ id: "local-a", sourceApp: "murimi", sourceRecordId: "txn-1", updatedAt: "2026-03-10T10:00:00.000Z", revision: 1 }) };
  const later = { ...first, id: "local-b", description: "Updated", updatedAt: "2026-03-10T11:00:00.000Z", revision: 2 };
  const result = dedupeLedgerRecords([first, later]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "local-b");
});

test("skips airtime, bundles, promotions, unrelated senders, and malformed amount messages", () => {
  assert.equal(parseFinancialSms({ id: "1", sender: "+263143", date: Date.now(), body: "Airtime purchase USD 5" }, "u", "b"), undefined);
  assert.equal(parseFinancialSms({ id: "2", sender: "+263143", date: Date.now(), body: "Data bundle purchase USD 5" }, "u", "b"), undefined);
  assert.equal(parseFinancialSms({ id: "3", sender: "Unknown", date: Date.now(), body: "Money received USD 5" }, "u", "b"), undefined);
  assert.equal(parseFinancialSms({ id: "4", sender: "+263164", date: Date.now(), body: "EcoCash received" }, "u", "b"), undefined);
});

test("records money sent as an expense and avoids counting transfers as monthly movement", () => {
  const sent = parseFinancialSms({ id: "5", sender: "+263164", date: Date.now(), body: "EcoCash sent USD 10 to John Doe" }, "u", "b");
  assert.equal(sent?.direction, "out");
  const monthly = calculateMonthlyMovement([
    record({ direction: "in", type: "income", amountMinor: 5000 }),
    record({ direction: "out", amountMinor: 1200 }),
    record({ direction: "transfer", type: "transfer", amountMinor: 9000 }),
    record({ occurredAt: "2026-02-01T10:00:00.000Z", direction: "in", amountMinor: 7000 }),
  ], "2026-03");
  assert.deepEqual(monthly, { moneyIn: 5000, moneyOut: 1200, net: 3800, profitLoss: 3800 });
});

test("keeps monthly summaries separated by currency", () => {
  const usd = record({ direction: "in", type: "income", amountMinor: 5000, currency: "USD" });
  const zwg = record({ direction: "in", type: "income", amountMinor: 7000, currency: "ZWG" });
  assert.deepEqual(calculateMonthlyMovement([usd, zwg], "2026-03", "USD"), { moneyIn: 5000, moneyOut: 0, net: 5000, profitLoss: 5000 });
  assert.deepEqual(calculateMonthlyMovement([usd, zwg], "2026-03", "ZWG"), { moneyIn: 7000, moneyOut: 0, net: 7000, profitLoss: 7000 });
});

test("estimates net worth with recorded assets and liabilities without treating loans as income", () => {
  const amount = calculateEstimatedNetWorth([
    record({ direction: "in", type: "income", amountMinor: 10000 }),
    record({ direction: "in", type: "loan_received", amountMinor: 5000, liabilityMinor: 5000 }),
    record({ direction: "out", type: "fixed_asset", amountMinor: 3000, assetValueMinor: 3000 }),
    record({ direction: "out", type: "loan_repayment", amountMinor: 1200, principalMinor: 1000, interestMinor: 200 }),
    record({ direction: "transfer", type: "transfer", amountMinor: 9000 }),
  ]);
  assert.equal(amount, 9800);
});
