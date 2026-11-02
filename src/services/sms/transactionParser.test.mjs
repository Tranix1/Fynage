import assert from "node:assert/strict";
import test from "node:test";
import { calculateAccountBalances, calculateEstimatedNetWorth, calculateMonthlyMovement } from "../finance/calculations.ts";
import { isReviewableFinancialSms, parseFinancialSms } from "./transactionParser.ts";
import { dedupeLedgerRecords, getSharedLedgerRecordId } from "../finance/ledgerIdentity.ts";
import { sharedLedgerId } from "../../types/armament.ts";
import { buildFinancialCsv } from "../export/csvExport.ts";
import { createBalanceAdjustment } from "../finance/reconciliation.ts";
import { mergeRemoteFinancialTombstone } from "../finance/tombstones.ts";

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

test("shared ledger IDs are stable across content edits and distinct across source accounts", () => {
  const source = record({
    id: "source-row-7", sourceApp: "murimi", sourceModule: "farm", sourceBusinessId: "farm-a",
    sourceAccountId: "farm-account-a", sourceCollection: "transactions", sourceDocumentId: "source-row-7",
  });
  const edited = { ...source, amountMinor: 2500, description: "Corrected description" };
  const otherAccount = { ...source, sourceAccountId: "farm-account-b" };
  assert.equal(getSharedLedgerRecordId(source), getSharedLedgerRecordId(edited));
  assert.notEqual(getSharedLedgerRecordId(source), getSharedLedgerRecordId(otherAccount));
});

test("all Armament apps derive the same canonical Fynage ledger document ID", () => {
  const row = { id: "txn-1", ownerId: "owner", businessId: "farm-a", sourceApp: "murimi", sourceBusinessId: "farm-a", sourceAccountId: "farm-a", sourceCollection: "transactions", sourceDocumentId: "txn-1" };
  assert.equal(sharedLedgerId({ sourceApp: row.sourceApp, ownerId: row.ownerId, businessId: row.sourceBusinessId, accountId: row.sourceAccountId, sourceCollection: row.sourceCollection, sourceDocumentId: row.sourceDocumentId }), getSharedLedgerRecordId(row));
});

test("sync deduplication does not collapse equal source document IDs from separate businesses", () => {
  const first = record({
    id: "first", sourceApp: "tengesa", sourceBusinessId: "business-a", sourceAccountId: "store-a",
    sourceCollection: "sales", sourceDocumentId: "sale-1", updatedAt: "2026-03-10T10:00:00.000Z",
  });
  const second = { ...first, id: "second", sourceBusinessId: "business-b", sourceAccountId: "store-b" };
  assert.equal(dedupeLedgerRecords([first, second]).length, 2);
});

test("remote deletion markers retain transaction amounts and audit history locally", () => {
  const previous = record({ amountMinor: 4250, revision: 3, auditTrail: [{ id: "created", action: "created", changedAt: "2026-03-10T10:00:00.000Z", actorId: "u" }] });
  const remote = record({ id: previous.id, amountMinor: 0, deletedAt: "2026-03-11T10:00:00.000Z", updatedAt: "2026-03-11T10:00:00.000Z", revision: 4, auditTrail: [{ id: "deleted", action: "deleted", changedAt: "2026-03-11T10:00:00.000Z", actorId: "u" }] });
  const merged = mergeRemoteFinancialTombstone(previous, remote);
  assert.equal(merged.amountMinor, 4250);
  assert.equal(merged.deletedAt, remote.deletedAt);
  assert.equal(merged.revision, 4);
  assert.deepEqual(merged.auditTrail?.map((entry) => entry.id), ["created", "deleted"]);
});

test("skips airtime, bundles, promotions, unrelated senders, and malformed amount messages", () => {
  assert.equal(parseFinancialSms({ id: "1", sender: "+263143", date: Date.now(), body: "Airtime purchase USD 5" }, "u", "b"), undefined);
  assert.equal(parseFinancialSms({ id: "2", sender: "+263143", date: Date.now(), body: "Data bundle purchase USD 5" }, "u", "b"), undefined);
  assert.equal(parseFinancialSms({ id: "3", sender: "Unknown", date: Date.now(), body: "Money received USD 5" }, "u", "b"), undefined);
  assert.equal(parseFinancialSms({ id: "4", sender: "+263164", date: Date.now(), body: "EcoCash received" }, "u", "b"), undefined);
});

test("records money sent as an expense and keeps transfers out of net cash flow", () => {
  const sent = parseFinancialSms({ id: "5", sender: "+263164", date: Date.now(), body: "EcoCash sent USD 10 to John Doe" }, "u", "b");
  assert.equal(sent?.direction, "out");
  const monthly = calculateMonthlyMovement([
    record({ direction: "in", type: "income", amountMinor: 5000 }),
    record({ direction: "out", amountMinor: 1200 }),
    record({ direction: "transfer", type: "transfer", amountMinor: 9000 }),
    record({ occurredAt: "2026-02-01T10:00:00.000Z", direction: "in", amountMinor: 7000 }),
  ], "2026-03");
  assert.deepEqual(monthly, { moneyIn: 5000, moneyOut: 1200, income: 5000, expenses: 1200, transfersIn: 9000, transfersOut: 9000, charges: 0, net: 3800, profitLoss: 3800 });
});

test("keeps monthly summaries separated by currency", () => {
  const usd = record({ direction: "in", type: "income", amountMinor: 5000, currency: "USD" });
  const zwg = record({ direction: "in", type: "income", amountMinor: 7000, currency: "ZWG" });
  assert.deepEqual(calculateMonthlyMovement([usd, zwg], "2026-03", "USD"), { moneyIn: 5000, moneyOut: 0, income: 5000, expenses: 0, transfersIn: 0, transfersOut: 0, charges: 0, net: 5000, profitLoss: 5000 });
  assert.deepEqual(calculateMonthlyMovement([usd, zwg], "2026-03", "ZWG"), { moneyIn: 7000, moneyOut: 0, income: 7000, expenses: 0, transfersIn: 0, transfersOut: 0, charges: 0, net: 7000, profitLoss: 7000 });
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

test("reconciles the cash and EcoCash example while keeping transfers neutral", () => {
  const accounts = [
    { id: "cash", ownerId: "u", businessId: "b", name: "Cash", type: "cash", currency: "USD", openingBalanceMinor: 10000, openingBalanceDate: "2025-10-01T00:00:00.000Z", archived: false, updatedAt: "2025-10-01T00:00:00.000Z", revision: 1 },
    { id: "eco", ownerId: "u", businessId: "b", name: "EcoCash", type: "mobile_money", currency: "USD", openingBalanceMinor: 0, openingBalanceDate: "2025-10-01T00:00:00.000Z", archived: false, updatedAt: "2025-10-01T00:00:00.000Z", revision: 1 },
  ];
  const activity = [
    record({ id: "receive-200", amountMinor: 20000, direction: "in", type: "income", accountId: "eco", occurredAt: "2025-10-02T00:00:00.000Z" }),
    record({ id: "withdraw-100", amountMinor: 10000, direction: "transfer", type: "transfer", accountId: "eco", toAccountId: "cash", occurredAt: "2025-10-03T00:00:00.000Z" }),
    record({ id: "spend-60", amountMinor: 6000, direction: "out", type: "expense", accountId: "cash", occurredAt: "2025-10-04T00:00:00.000Z" }),
    record({ id: "receive-50", amountMinor: 5000, direction: "in", type: "income", accountId: "eco", occurredAt: "2025-10-05T00:00:00.000Z" }),
    record({ id: "spend-30", amountMinor: 3000, direction: "out", type: "expense", accountId: "cash", occurredAt: "2025-10-06T00:00:00.000Z" }),
  ];
  const balances = calculateAccountBalances(accounts, activity, "2025-10-31T23:59:59.999Z");
  assert.equal(balances.find((account) => account.id === "cash")?.balanceMinor, 11000);
  assert.equal(balances.find((account) => account.id === "eco")?.balanceMinor, 15000);
});

test("treats a withdrawal SMS as a transfer and extracts common fee and balance fields", () => {
  const parsed = parseFinancialSms({ id: "sms-1", sender: "+263143", body: "You have withdrawn USD 10.00. Fee USD 0.25. Available balance USD 12.50. Ref ABC12345", date: Date.parse("2025-10-03T00:00:00.000Z") }, "u", "b");
  assert.equal(parsed?.type, "transfer");
  assert.equal(parsed?.accountId, "account_ecocash");
  assert.equal(parsed?.feeMinor, 25);
  assert.equal(parsed?.availableBalanceMinor, 1250);
});

test("account adjustments change the balance without becoming income or expenses", () => {
  const account = { id: "cash", ownerId: "u", businessId: "b", name: "Cash", type: "cash", currency: "USD", openingBalanceMinor: 10000, openingBalanceDate: "2025-10-01T00:00:00.000Z", archived: false, updatedAt: "2025-10-01T00:00:00.000Z", revision: 1 };
  const adjustment = record({ id: "adjust", type: "adjustment", direction: "in", amountMinor: 1500, accountId: "cash", description: "Found cash during count", occurredAt: "2025-10-02T00:00:00.000Z" });
  assert.equal(calculateAccountBalances([account], [adjustment], "2025-10-31T00:00:00.000Z")[0]?.balanceMinor, 11500);
  assert.deepEqual(calculateMonthlyMovement([adjustment], "2025-10", "USD"), { moneyIn: 1500, moneyOut: 0, income: 0, expenses: 0, transfersIn: 0, transfersOut: 0, charges: 0, net: 1500, profitLoss: 0 });
});

test("parses InnBucks and supported bank messages to the right financial account", () => {
  const innbucks = parseFinancialSms({ id: "i1", sender: "InnBucks", date: Date.parse("2026-03-10T10:00:00Z"), body: "InnBucks received USD 25.00 from Jane. Ref: INB123456" }, "u", "b");
  const bank = parseFinancialSms({ id: "b1", sender: "CBZ Bank", date: Date.parse("2026-03-10T10:00:00Z"), body: "CBZ debit USD 12.50 to ABC Stores. Ref: CBZ123456" }, "u", "b");
  assert.equal(innbucks?.provider, "InnBucks");
  assert.equal(innbucks?.accountId, "account_innbucks");
  assert.equal(bank?.provider, "CBZ");
  assert.equal(bank?.accountId, "account_bank");
  assert.equal(bank?.direction, "out");
});

test("recognizes supported financial messages that need manual parsing review", () => {
  const message = { id: "u1", sender: "InnBucks", date: Date.now(), body: "InnBucks transaction completed, reference INB998877" };
  assert.equal(isReviewableFinancialSms(message), true);
  assert.equal(parseFinancialSms(message, "u", "b"), undefined);
  assert.equal(isReviewableFinancialSms({ ...message, body: "InnBucks 1 GB bundle purchase USD 2" }), false);
});

test("exports transaction and account data as escaped CSV", () => {
  const exportRecords = [record({ id: "csv1", description: 'Shop, "Main"', amountMinor: 1250, notes: "first line\nsecond line" })];
  const csv = buildFinancialCsv(exportRecords, [
    { id: "cash", ownerId: "u", businessId: "b", name: "Cash", type: "cash", currency: "USD", openingBalanceMinor: 0, openingBalanceDate: "2026-01-01T00:00:00.000Z", archived: false, updatedAt: "2026-01-01T00:00:00.000Z", revision: 1, balanceMinor: 900 },
  ], [{ month: "2026-03", currency: "USD", totals: calculateMonthlyMovement(exportRecords, "2026-03", "USD") }]);
  assert.match(csv, /"Shop, ""Main"""/);
  assert.match(csv, /"first line\nsecond line"/);
  assert.match(csv, /account_balance,cash/);
  assert.match(csv, /monthly_summary,,2026-03/);
});

test("creates a reviewed reconciliation adjustment whose UI workflow corrects only balance", () => {
  const adjustment = createBalanceAdjustment({ id: "recon1", ownerId: "u", businessId: "b", accountId: "cash", account: "Cash", currency: "USD", recordedMinor: 10000, actualMinor: 9250, reason: "Cash count was lower", occurredAt: "2026-03-10T10:00:00.000Z" });
  assert.equal(adjustment?.direction, "out");
  assert.equal(adjustment?.amountMinor, 750);
  assert.equal(adjustment?.classificationStatus, "reviewed");
  assert.equal(calculateAccountBalances([{ id: "cash", ownerId: "u", businessId: "b", name: "Cash", type: "cash", currency: "USD", openingBalanceMinor: 10000, openingBalanceDate: "2026-03-01T00:00:00.000Z", archived: false, updatedAt: "2026-03-01T00:00:00.000Z", revision: 1 }], [adjustment], "2026-03-31T00:00:00.000Z")[0]?.balanceMinor, 9250);
  assert.equal(calculateMonthlyMovement([adjustment], "2026-03", "USD").expenses, 0);
  assert.equal(calculateMonthlyMovement([adjustment], "2026-03", "USD").income, 0);
  assert.equal(createBalanceAdjustment({ id: "recon2", ownerId: "u", businessId: "b", accountId: "cash", account: "Cash", currency: "USD", recordedMinor: 1, actualMinor: 1, reason: "No variance" }), undefined);
});
