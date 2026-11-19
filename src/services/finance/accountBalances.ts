import type { FinancialAccount, FinancialRecord } from "@/types/finance";

export type AccountBalance = FinancialAccount & { balanceMinor: number };

/** Rebuild dated account balances from opening balances and ledger movements. */
export function calculateAccountBalances(accounts: FinancialAccount[], records: FinancialRecord[], asOf = new Date().toISOString()): AccountBalance[] {
  const balances = new Map(accounts.map((account) => [account.id, account.openingBalanceDate <= asOf ? account.openingBalanceMinor : 0]));
  for (const record of records) {
    if (record.deletedAt || record.classificationStatus === "dismissed" || record.classificationStatus === "potential_duplicate" || record.classificationStatus === "unreviewed") continue;
    if (record.affectsBalance === false || record.occurredAt > asOf || record.type === "opening_balance") continue;
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
