import type { FinancialAccount, FinancialRecord, TransactionDirection } from "@/types/finance";
import { calculateAccountBalances } from "./accountBalances.ts";
export { calculateAccountBalances } from "./accountBalances.ts";

export type MonthlyMovement = { moneyIn: number; moneyOut: number; income: number; expenses: number; investments: number; fixedAssets: number; untracked: number; transfersIn: number; transfersOut: number; charges: number; net: number; profitLoss: number };

export function calculateMonthlyMovement(records: FinancialRecord[], month: string, currency?: string): MonthlyMovement {
  const totals = records.reduce((sum, record) => {
    if (record.occurredAt.slice(0, 7) !== month || (currency && record.currency !== currency)) return sum;
    if (record.type !== "opening_balance" && record.direction === "in") sum.moneyIn += record.amountMinor;
    if (record.type !== "opening_balance" && record.direction === "out") sum.moneyOut += record.amountMinor;
    if (record.type === "income" && record.direction === "in") sum.income += record.amountMinor;
    if (record.type === "expense" && record.direction === "out") sum.expenses += record.amountMinor;
    if (record.type === "investment") sum.investments += record.amountMinor;
    if (record.type === "fixed_asset") sum.fixedAssets += record.amountMinor;
    if (record.reconciliationDifferenceMinor !== undefined) sum.untracked += Math.abs(record.reconciliationDifferenceMinor);
    if (record.type === "transfer" && record.direction === "transfer") {
      sum.transfersOut += record.amountMinor;
      sum.transfersIn += record.amountMinor;
    }
    // Transfers are tracked separately. Their fees are real money out, but
    // the transferred principal must never inflate income or spending.
    if (record.type !== "opening_balance" && (record.direction === "out" || record.direction === "transfer")) sum.charges += record.feeMinor ?? 0;
    if (record.type === "income" && record.direction === "in") sum.profitLoss += record.amountMinor;
    if (record.type === "expense" && record.direction === "out") sum.profitLoss -= record.amountMinor;
    if (record.type === "loan_repayment" && record.direction === "out") sum.profitLoss -= record.interestMinor ?? 0;
    if (record.type !== "opening_balance") sum.profitLoss -= record.feeMinor ?? 0;
    return sum;
  }, { moneyIn: 0, moneyOut: 0, income: 0, expenses: 0, investments: 0, fixedAssets: 0, untracked: 0, transfersIn: 0, transfersOut: 0, charges: 0, net: 0, profitLoss: 0 });
  totals.net = totals.moneyIn - totals.moneyOut - totals.charges;
  return totals;
}

export function calculateEstimatedNetWorth(records: FinancialRecord[], currency?: string): number {
  let cash = 0;
  let assets = 0;
  let liabilities = 0;
  for (const record of records) {
    if (currency && record.currency !== currency) continue;
    if (record.direction === "in") cash += record.amountMinor;
    if (record.direction === "out") cash -= record.amountMinor;
    if ((record.type === "fixed_asset" && !record.centralAssetId) || record.type === "investment") assets += record.assetValueMinor ?? record.amountMinor;
    if (record.type === "loan_received") liabilities += record.liabilityMinor ?? record.amountMinor;
    if (record.type === "loan_repayment") liabilities = Math.max(0, liabilities - (record.principalMinor ?? Math.max(0, record.amountMinor - (record.interestMinor ?? 0) - (record.feeMinor ?? 0))));
  }
  return cash + assets - liabilities;
}

export function calculateAccountNetWorth(accounts: FinancialAccount[], records: FinancialRecord[], currency = "USD", asOf = new Date().toISOString()): number {
  const selectedAccounts = accounts.filter((account) => account.currency === currency && !account.archived);
  const cash = calculateAccountBalances(selectedAccounts, records, asOf).reduce((sum, account) => sum + account.balanceMinor, 0);
  let assets = 0;
  let liabilities = 0;
  for (const record of records) {
    if (record.deletedAt || record.classificationStatus === "dismissed" || record.classificationStatus === "potential_duplicate" || record.classificationStatus === "unreviewed" || record.currency !== currency || record.occurredAt > asOf) continue;
    if ((record.type === "fixed_asset" && !record.centralAssetId) || record.type === "investment") assets += record.assetValueMinor ?? record.amountMinor;
    if (record.type === "loan_received") liabilities += record.liabilityMinor ?? record.amountMinor;
    if (record.type === "loan_repayment") liabilities = Math.max(0, liabilities - (record.principalMinor ?? Math.max(0, record.amountMinor - (record.interestMinor ?? 0) - (record.feeMinor ?? 0))));
  }
  return cash + assets - liabilities;
}

export function isCashDirection(direction: TransactionDirection): direction is "in" | "out" {
  return direction !== "transfer";
}
