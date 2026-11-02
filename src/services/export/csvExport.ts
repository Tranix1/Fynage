import type { FinancialAccount, FinancialRecord } from "@/types/finance";
import type { MonthlyMovement } from "../finance/calculations";

export type MonthlyCsvSummary = { month: string; currency: string; totals: MonthlyMovement };

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildFinancialCsv(records: FinancialRecord[], accounts: (FinancialAccount & { balanceMinor: number })[], summaries: MonthlyCsvSummary[] = []): string {
  const rows: unknown[][] = [
    ["Record type", "ID", "Date", "Description", "Direction", "Type", "Amount", "Currency", "Category", "Account", "Destination account", "Reference", "Counterparty", "Charges", "Notes", "Status", "Income total", "Expense total", "Transfer in", "Transfer out", "Net change", "Profit/loss"],
    ...records.map((record) => ["transaction", record.id, record.occurredAt, record.description, record.direction, record.type, (record.amountMinor / 100).toFixed(2), record.currency, record.category, record.account ?? "", record.toAccount ?? "", record.reference ?? "", record.counterparty ?? "", ((record.feeMinor ?? 0) / 100).toFixed(2), record.notes ?? "", record.classificationStatus ?? "reviewed", "", "", "", "", "", ""]),
    ...summaries.map(({ month, currency, totals }) => {
      return ["monthly_summary", "", month, month, "", "", "", currency, "", "", "", "", "", "", "", "", (totals.income / 100).toFixed(2), (totals.expenses / 100).toFixed(2), (totals.transfersIn / 100).toFixed(2), (totals.transfersOut / 100).toFixed(2), (totals.net / 100).toFixed(2), (totals.profitLoss / 100).toFixed(2)];
    }),
    ...accounts.map((account) => ["account_balance", account.id, "", account.name, "", account.type, (account.balanceMinor / 100).toFixed(2), account.currency, "", account.name, "", "", "", "", "", account.archived ? "archived" : "active"]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
