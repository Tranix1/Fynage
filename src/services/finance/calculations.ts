import type { FinancialAccount, FinancialRecord, TransactionDirection } from "@/types/finance";

export type MonthlyMovement = { moneyIn: number; moneyOut: number; income: number; expenses: number; transfersIn: number; transfersOut: number; charges: number; net: number; profitLoss: number };

export function calculateMonthlyMovement(records: FinancialRecord[], month: string, currency?: string): MonthlyMovement {
  const totals = records.reduce((sum, record) => {
    if (record.occurredAt.slice(0, 7) !== month || (currency && record.currency !== currency)) return sum;
    if (record.type !== "opening_balance" && record.direction === "in") sum.moneyIn += record.amountMinor;
    if (record.type !== "opening_balance" && record.direction === "out") sum.moneyOut += record.amountMinor;
    if (record.type === "income" && record.direction === "in") sum.income += record.amountMinor;
    if (record.type === "expense" && record.direction === "out") sum.expenses += record.amountMinor;
    if (record.type === "transfer" && record.direction === "transfer") {
      sum.transfersOut += record.amountMinor;
      sum.transfersIn += record.amountMinor;
    }
    if (record.type !== "opening_balance" && (record.direction === "out" || record.direction === "transfer")) sum.charges += record.feeMinor ?? 0;
    if (record.type === "income" && record.direction === "in") sum.profitLoss += record.amountMinor;
    if (record.type === "expense" && record.direction === "out") sum.profitLoss -= record.amountMinor;
    if (record.type === "loan_repayment" && record.direction === "out") sum.profitLoss -= record.interestMinor ?? 0;
    if (record.type !== "opening_balance") sum.profitLoss -= record.feeMinor ?? 0;
    return sum;
  }, { moneyIn: 0, moneyOut: 0, income: 0, expenses: 0, transfersIn: 0, transfersOut: 0, charges: 0, net: 0, profitLoss: 0 });
  totals.net = totals.moneyIn - totals.moneyOut - totals.charges;
  return totals;
}

export type AccountBalance = FinancialAccount & { balanceMinor: number };

/**
 * Rebuild balances from the account's opening balance and ledger movements.
 * Legacy records without stable account IDs are intentionally not guessed into
 * an account; they remain visible for the user to classify/reconcile.
 */
export function calculateAccountBalances(accounts: FinancialAccount[], records: FinancialRecord[], asOf = new Date().toISOString()): AccountBalance[] {
  const balances = new Map(accounts.map((account) => [account.id, account.openingBalanceMinor]));
  for (const record of records) {
    if (record.deletedAt || record.classificationStatus === "dismissed" || record.classificationStatus === "potential_duplicate" || record.classificationStatus === "unreviewed") continue;
    if (record.affectsBalance === false) continue;
    if (record.occurredAt > asOf) continue;
    if (record.type === "opening_balance") continue;
    if (record.type === "transfer" || record.direction === "transfer") {
      const source = accounts.find((account) => account.id === record.accountId);
      const destination = accounts.find((account) => account.id === record.toAccountId);
      if (source && balances.has(source.id) && record.occurredAt >= source.openingBalanceDate) balances.set(source.id, balances.get(source.id)! - record.amountMinor - (record.feeMinor ?? 0));
      if (destination && balances.has(destination.id) && record.occurredAt >= destination.openingBalanceDate) balances.set(destination.id, balances.get(destination.id)! + record.amountMinor);
      continue;
    }
    const account = accounts.find((entry) => entry.id === record.accountId);
    if (!account || !balances.has(account.id) || record.occurredAt < account.openingBalanceDate) continue;
    const movement = record.direction === "in" ? record.amountMinor : -record.amountMinor;
    balances.set(account.id, balances.get(account.id)! + movement - (record.feeMinor ?? 0));
  }
  return accounts.map((account) => ({ ...account, balanceMinor: balances.get(account.id) ?? account.openingBalanceMinor }));
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

export function calculateAccountNetWorth(accounts: FinancialAccount[], records: FinancialRecord[], currency = "USD", asOf = new Date().toISOString()): number {
  const selectedAccounts = accounts.filter((account) => account.currency === currency && !account.archived);
  const cash = calculateAccountBalances(selectedAccounts, records, asOf).reduce((sum, account) => sum + account.balanceMinor, 0);
  let assets = 0;
  let liabilities = 0;
  for (const record of records) {
    if (record.deletedAt || record.classificationStatus === "dismissed" || record.classificationStatus === "potential_duplicate" || record.classificationStatus === "unreviewed" || record.currency !== currency || record.occurredAt > asOf) continue;
    if (record.type === "fixed_asset" || record.type === "investment") assets += record.assetValueMinor ?? record.amountMinor;
    if (record.type === "loan_received") liabilities += record.liabilityMinor ?? record.amountMinor;
    if (record.type === "loan_repayment") liabilities = Math.max(0, liabilities - (record.principalMinor ?? Math.max(0, record.amountMinor - (record.interestMinor ?? 0) - (record.feeMinor ?? 0))));
  }
  return cash + assets - liabilities;
}

export function isCashDirection(direction: TransactionDirection): direction is "in" | "out" {
  return direction !== "transfer";
}
