import type { FinancialRecord, TransactionDirection } from "@/types/finance";

export type MonthlyMovement = { moneyIn: number; moneyOut: number; net: number; profitLoss: number };

export function calculateMonthlyMovement(records: FinancialRecord[], month: string, currency?: string): MonthlyMovement {
  const totals = records.reduce((sum, record) => {
    if (record.occurredAt.slice(0, 7) !== month || (currency && record.currency !== currency)) return sum;
    if (record.direction === "in") sum.moneyIn += record.amountMinor;
    if (record.direction === "out") sum.moneyOut += record.amountMinor;
    if (record.type === "income" && record.direction === "in") sum.profitLoss += record.amountMinor;
    if (record.type === "expense" && record.direction === "out") sum.profitLoss -= record.amountMinor;
    if (record.type === "loan_repayment" && record.direction === "out") sum.profitLoss -= (record.interestMinor ?? 0) + (record.feeMinor ?? 0);
    return sum;
  }, { moneyIn: 0, moneyOut: 0, net: 0, profitLoss: 0 });
  totals.net = totals.moneyIn - totals.moneyOut;
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
    if (record.type === "fixed_asset" || record.type === "investment") assets += record.assetValueMinor ?? record.amountMinor;
    if (record.type === "loan_received") liabilities += record.liabilityMinor ?? record.amountMinor;
    if (record.type === "loan_repayment") liabilities = Math.max(0, liabilities - (record.principalMinor ?? Math.max(0, record.amountMinor - (record.interestMinor ?? 0) - (record.feeMinor ?? 0))));
  }
  return cash + assets - liabilities;
}

export function isCashDirection(direction: TransactionDirection): direction is "in" | "out" {
  return direction !== "transfer";
}