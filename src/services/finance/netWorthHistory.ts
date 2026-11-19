import type { FinancialAccount, FinancialRecord } from "@/types/finance";
import type { AssetRecord } from "@/types/assets";

export type HistoryRange = "daily" | "monthly" | "yearly" | "all-time";
export type NetWorthSnapshot = {
  date: string; currency: string; netWorthMinor: number; cashMinor: number; physicalAssetsMinor: number;
  otherFinancialAssetsMinor: number; liabilitiesMinor: number; incomeMinor: number; expensesMinor: number;
  transfersMinor: number; assetPurchasesMinor: number; assetDisposalsMinor: number; loanMovementsMinor: number; assetValuationAdjustmentsMinor: number; depreciationMinor: number;
  businessBreakdown: { name: string; netWorthMinor: number }[]; carriedForward: boolean;
};
export type NetWorthActivity = Pick<NetWorthSnapshot, "incomeMinor" | "expensesMinor" | "transfersMinor" | "assetPurchasesMinor" | "assetDisposalsMinor" | "loanMovementsMinor">;
export type NetWorthBusinessHistory = { id: string; name: string; platform: string; history: { id: string; date: string; netWorthMinor: number }[] };
export type NetWorthSupplementalHistory = { id: string; name: string; date: string; amountMinor: number };
const dayOf = (date: string) => date.slice(0, 10);
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateAt = (day: string) => new Date(`${day}T23:59:59.999`);
const validDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value)));
const closingDay = (date: Date, range: HistoryRange) => {
  if (range === "monthly" || range === "all-time") return localDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  if (range === "yearly") return `${date.getFullYear()}-12-31`;
  return localDate(date);
};
const addPeriod = (date: Date, range: HistoryRange) => {
  const next = new Date(date);
  if (range === "monthly" || range === "all-time") next.setMonth(next.getMonth() + 1, 1);
  else if (range === "yearly") next.setFullYear(next.getFullYear() + 1, 0, 1);
  else next.setDate(next.getDate() + 1);
  return next;
};
const isValidRecord = (record: FinancialRecord) => !record.deletedAt && record.classificationStatus !== "dismissed" && record.classificationStatus !== "potential_duplicate" && record.classificationStatus !== "unreviewed";

export function summarizeNetWorthActivity(records: FinancialRecord[], currency: string, range: HistoryRange, date: string): NetWorthActivity {
  const end = dayOf(date);
  const start = range === "daily" ? end : range === "yearly" ? `${end.slice(0, 4)}-01-01` : `${end.slice(0, 7)}-01`;
  const period = records.filter((record) => isValidRecord(record) && record.currency === currency && (record.sourceApp ?? "fynage") === "fynage" && dayOf(record.occurredAt) >= start && dayOf(record.occurredAt) <= end);
  return {
    incomeMinor: period.filter((record) => record.type === "income" && record.direction === "in").reduce((sum, record) => sum + record.amountMinor, 0),
    expensesMinor: period.filter((record) => record.type === "expense" && record.direction === "out").reduce((sum, record) => sum + record.amountMinor, 0),
    transfersMinor: period.filter((record) => record.type === "transfer" || record.direction === "transfer").reduce((sum, record) => sum + record.amountMinor, 0),
    assetPurchasesMinor: period.filter((record) => record.type === "fixed_asset" && !record.category.toLowerCase().includes("disposal")).reduce((sum, record) => sum + record.amountMinor, 0),
    assetDisposalsMinor: period.filter((record) => record.type === "fixed_asset" && record.category.toLowerCase().includes("disposal")).reduce((sum, record) => sum + record.amountMinor, 0),
    loanMovementsMinor: period.filter((record) => record.type === "loan_received" || record.type === "loan_repayment").reduce((sum, record) => sum + (record.direction === "out" ? -record.amountMinor : record.amountMinor), 0),
  };
}

export function summarizeAssetHistoryActivity(assets: AssetRecord[], range: HistoryRange, date: string) {
  const end = dayOf(date);
  const start = range === "yearly" ? `${end.slice(0, 4)}-01-01` : `${end.slice(0, 7)}-01`;
  let assetValuationAdjustmentsMinor = 0; let depreciationMinor = 0;
  for (const asset of assets) {
    const valuations = [...(asset.valuationHistory ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    let previousValue = asset.acquisitionCostMinor;
    for (const valuation of valuations) {
      const delta = valuation.valueMinor - previousValue;
      previousValue = valuation.valueMinor;
      if (valuation.date >= start && valuation.date <= end && !valuation.reason.toLowerCase().includes("initial")) assetValuationAdjustmentsMinor += delta;
    }
    for (const depreciation of asset.depreciationHistory ?? []) {
      const periodStart = `${depreciation.period}-01`;
      if (periodStart < start || periodStart > end.slice(0, 7) + "-01") continue;
      if (range === "daily") {
        const lastDay = localDate(new Date(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0));
        if (end >= lastDay) depreciationMinor += depreciation.amountMinor;
      } else depreciationMinor += depreciation.amountMinor;
    }
  }
  return { assetValuationAdjustmentsMinor, depreciationMinor };
}

export function buildNetWorthHistory(input: {
  uid: string; currency: string; records: FinancialRecord[]; accounts: FinancialAccount[]; assets: AssetRecord[];
  range: HistoryRange; throughDate?: string; businessHistories?: NetWorthBusinessHistory[];
  supplementalHistory?: NetWorthSupplementalHistory[]; currentNetWorthMinor?: number;
}): NetWorthSnapshot[] {
  const { currency, range } = input;
  const records = input.records.filter((record) => isValidRecord(record) && record.currency === currency && (record.sourceApp ?? "fynage") === "fynage");
  const accounts = input.accounts.filter((account) => account.currency === currency && !account.archived);
  const assets = input.assets.filter((asset) => asset.currency === currency && asset.status !== "inactive");
  const dates = [
    ...accounts.map((account) => account.openingBalanceDate), ...records.map((record) => record.occurredAt),
    ...assets.map((asset) => asset.acquisitionDate), ...assets.flatMap((asset) => (asset.valuationHistory ?? []).map((item) => item.date)),
    ...assets.flatMap((asset) => (asset.depreciationHistory ?? []).map((item) => `${item.period}-01`)),
    ...assets.flatMap((asset) => asset.auditHistory.filter((entry) => entry.action === "disposed").map((entry) => entry.date)),
    ...(input.businessHistories ?? []).flatMap((business) => business.history.map((item) => item.date)),
    ...(input.supplementalHistory ?? []).map((item) => item.date),
  ].filter(validDate).map(dayOf).sort();
  if (dates.length === 0) return [];
  const start = new Date(`${dates[0]}T12:00:00`);
  const endDay = input.throughDate && validDate(input.throughDate) ? dayOf(input.throughDate) : localDate(new Date());
  const end = new Date(`${endDay}T12:00:00`);
  if (start > end) return [];

  // Index activity once. The old version filtered the complete ledger for
  // every graph point, making work grow as (periods × transactions).
  const emptyActivity = (): NetWorthActivity => ({ incomeMinor: 0, expensesMinor: 0, transfersMinor: 0, assetPurchasesMinor: 0, assetDisposalsMinor: 0, loanMovementsMinor: 0 });
  const dailyActivity = new Map<string, NetWorthActivity>();
  const monthlyActivity = new Map<string, NetWorthActivity>(); const yearlyActivity = new Map<string, NetWorthActivity>();
  const addActivity = (map: Map<string, NetWorthActivity>, key: string, row: NetWorthActivity) => {
    const total = map.get(key) ?? emptyActivity();
    total.incomeMinor += row.incomeMinor; total.expensesMinor += row.expensesMinor; total.transfersMinor += row.transfersMinor;
    total.assetPurchasesMinor += row.assetPurchasesMinor; total.assetDisposalsMinor += row.assetDisposalsMinor; total.loanMovementsMinor += row.loanMovementsMinor;
    map.set(key, total);
  };
  for (const record of records) {
    const key = dayOf(record.occurredAt); const row = dailyActivity.get(key) ?? emptyActivity();
    if (record.type === "income" && record.direction === "in") row.incomeMinor += record.amountMinor;
    if (record.type === "expense" && record.direction === "out") row.expensesMinor += record.amountMinor;
    if (record.type === "transfer" || record.direction === "transfer") row.transfersMinor += record.amountMinor;
    if (record.type === "fixed_asset" && record.category.toLowerCase().includes("disposal")) row.assetDisposalsMinor += record.amountMinor;
    if (record.type === "fixed_asset" && !record.category.toLowerCase().includes("disposal")) row.assetPurchasesMinor += record.amountMinor;
    if (record.type === "loan_received" || record.type === "loan_repayment") row.loanMovementsMinor += record.direction === "out" ? -record.amountMinor : record.amountMinor;
    dailyActivity.set(key, row);
    addActivity(monthlyActivity, key.slice(0, 7), row); addActivity(yearlyActivity, key.slice(0, 4), row);
  }
  const activityForPeriod = (day: string): NetWorthActivity => {
    if (range === "daily") return dailyActivity.get(day) ?? emptyActivity();
    const yearly = range === "yearly"; const key = yearly ? day.slice(0, 4) : day.slice(0, 7);
    const total = { ...(yearly ? yearlyActivity : monthlyActivity).get(key) ?? emptyActivity() };
    const periodEnd = yearly ? `${key}-12-31` : localDate(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0));
    if (day === periodEnd) return total;
    for (const [eventDay, row] of dailyActivity) {
      if (eventDay <= day || (yearly ? !eventDay.startsWith(`${key}-`) : !eventDay.startsWith(`${key}-`))) continue;
      total.incomeMinor -= row.incomeMinor; total.expensesMinor -= row.expensesMinor; total.transfersMinor -= row.transfersMinor;
      total.assetPurchasesMinor -= row.assetPurchasesMinor; total.assetDisposalsMinor -= row.assetDisposalsMinor; total.loanMovementsMinor -= row.loanMovementsMinor;
    }
    return total;
  };
  const assetEventMap = new Map<string, { id: string; phase: number; delta?: number; dispose?: boolean }[]>();
  const assetEvents = (date: string) => { const rows = assetEventMap.get(date) ?? []; assetEventMap.set(date, rows); return rows; };
  const dailyAssetActivity = new Map<string, { assetValuationAdjustmentsMinor: number; depreciationMinor: number }>();
  const monthlyAssetActivity = new Map<string, { assetValuationAdjustmentsMinor: number; depreciationMinor: number }>(); const yearlyAssetActivity = new Map<string, { assetValuationAdjustmentsMinor: number; depreciationMinor: number }>();
  for (const asset of assets) {
    assetEvents(asset.acquisitionDate).push({ id: asset.id, phase: 0, delta: asset.acquisitionCostMinor });
    const valuations = [...(asset.valuationHistory ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    let priorValuation = asset.acquisitionCostMinor;
    for (const valuation of valuations) {
      const date = dayOf(valuation.date); const delta = valuation.valueMinor - priorValuation; priorValuation = valuation.valueMinor;
      if (date < asset.acquisitionDate) continue;
      assetEvents(date).push({ id: asset.id, phase: 1, delta });
      if (!valuation.reason.toLowerCase().includes("initial")) {
        const row = dailyAssetActivity.get(date) ?? { assetValuationAdjustmentsMinor: 0, depreciationMinor: 0 };
        row.assetValuationAdjustmentsMinor += delta; dailyAssetActivity.set(date, row);
      }
    }
    for (const depreciation of asset.depreciationHistory ?? []) {
      const lastDay = localDate(new Date(Number(depreciation.period.slice(0, 4)), Number(depreciation.period.slice(5, 7)), 0));
      if (lastDay < asset.acquisitionDate) continue;
      assetEvents(lastDay).push({ id: asset.id, phase: 2, delta: -depreciation.amountMinor });
      const row = dailyAssetActivity.get(lastDay) ?? { assetValuationAdjustmentsMinor: 0, depreciationMinor: 0 };
      row.depreciationMinor += depreciation.amountMinor; dailyAssetActivity.set(lastDay, row);
    }
    if (asset.status === "disposed") {
      const disposedAt = asset.auditHistory.find((entry) => entry.action === "disposed")?.date ?? asset.updatedAt;
      assetEvents(dayOf(disposedAt)).push({ id: asset.id, phase: 3, dispose: true });
    }
  }
  for (const [date, row] of dailyAssetActivity) {
    const monthKey = date.slice(0, 7); const yearKey = date.slice(0, 4);
    const monthRow = monthlyAssetActivity.get(monthKey) ?? { assetValuationAdjustmentsMinor: 0, depreciationMinor: 0 };
    const yearRow = yearlyAssetActivity.get(yearKey) ?? { assetValuationAdjustmentsMinor: 0, depreciationMinor: 0 };
    monthRow.assetValuationAdjustmentsMinor += row.assetValuationAdjustmentsMinor; monthRow.depreciationMinor += row.depreciationMinor;
    yearRow.assetValuationAdjustmentsMinor += row.assetValuationAdjustmentsMinor; yearRow.depreciationMinor += row.depreciationMinor;
    monthlyAssetActivity.set(monthKey, monthRow); yearlyAssetActivity.set(yearKey, yearRow);
  }
  const sortedAssetEvents = [...assetEventMap.entries()].flatMap(([date, rows]) => rows.map((event) => ({ ...event, date }))).sort((a, b) => a.date.localeCompare(b.date) || a.phase - b.phase);
  const assetActivityForPeriod = (day: string) => {
    if (range === "daily") return dailyAssetActivity.get(day) ?? { assetValuationAdjustmentsMinor: 0, depreciationMinor: 0 };
    const yearly = range === "yearly"; const key = yearly ? day.slice(0, 4) : day.slice(0, 7);
    const total = { ...(yearly ? yearlyAssetActivity : monthlyAssetActivity).get(key) ?? { assetValuationAdjustmentsMinor: 0, depreciationMinor: 0 } };
    const periodEnd = yearly ? `${key}-12-31` : localDate(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0));
    if (day === periodEnd) return total;
    for (const [eventDay, row] of dailyAssetActivity) {
      if (eventDay <= day || (yearly ? !eventDay.startsWith(`${key}-`) : !eventDay.startsWith(`${key}-`))) continue;
      total.assetValuationAdjustmentsMinor -= row.assetValuationAdjustmentsMinor; total.depreciationMinor -= row.depreciationMinor;
    }
    return total;
  };

  const sortedRecords = [...records].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const businessHistories = (input.businessHistories ?? []).map((business) => ({ ...business, history: [...business.history].filter((item) => validDate(item.date)).sort((a, b) => a.date.localeCompare(b.date)) }));
  const supplementalHistory = [...(input.supplementalHistory ?? [])].filter((item) => validDate(item.date)).sort((a, b) => a.date.localeCompare(b.date));
  const businessHistoryPositions = new Map(businessHistories.map((business) => [business.id, 0]));
  const currentBusinessPoints = new Map<string, { id: string; name: string; platform: string; value: number }>();
  let supplementalPosition = 0;
  const currentSupplemental = new Map<string, NetWorthSupplementalHistory>();
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const cashByAccount = new Map(accounts.map((account) => [account.id, 0]));
  const openedAccounts = new Set<string>();
  const assetValues = new Map<string, number>();
  const result: NetWorthSnapshot[] = [];
  let recordIndex = 0; let assetEventIndex = 0; let cashMinor = 0; let physicalAssetsMinor = 0; let otherFinancialAssetsMinor = 0; let liabilitiesMinor = 0;
  let cursor = start;
  while (cursor <= end) {
    const day = [closingDay(cursor, range), endDay].sort()[0];
    const asOf = dateAt(day).toISOString();
    for (const account of accounts) {
      if (!openedAccounts.has(account.id) && account.openingBalanceDate <= day) {
        openedAccounts.add(account.id); cashByAccount.set(account.id, account.openingBalanceMinor); cashMinor += account.openingBalanceMinor;
      }
    }
    while (recordIndex < sortedRecords.length && sortedRecords[recordIndex].occurredAt <= asOf) {
      const record = sortedRecords[recordIndex++];
      if (record.affectsBalance !== false) {
        const source = record.accountId ? accountById.get(record.accountId) : undefined;
        const destination = record.toAccountId ? accountById.get(record.toAccountId) : undefined;
        if ((record.type === "transfer" || record.direction === "transfer") && source && openedAccounts.has(source.id) && record.occurredAt >= source.openingBalanceDate) {
          const change = -record.amountMinor - (record.feeMinor ?? 0); cashByAccount.set(source.id, (cashByAccount.get(source.id) ?? 0) + change); cashMinor += change;
        } else if (record.type !== "transfer" && record.direction !== "transfer" && source && openedAccounts.has(source.id) && record.occurredAt >= source.openingBalanceDate) {
          const change = (record.direction === "in" ? record.amountMinor : -record.amountMinor) - (record.feeMinor ?? 0); cashByAccount.set(source.id, (cashByAccount.get(source.id) ?? 0) + change); cashMinor += change;
        }
        if ((record.type === "transfer" || record.direction === "transfer") && destination && openedAccounts.has(destination.id) && record.occurredAt >= destination.openingBalanceDate) {
          cashByAccount.set(destination.id, (cashByAccount.get(destination.id) ?? 0) + record.amountMinor); cashMinor += record.amountMinor;
        }
      }
      if (record.type === "investment") otherFinancialAssetsMinor += record.assetValueMinor ?? record.amountMinor;
      if (record.type === "loan_received") liabilitiesMinor += record.liabilityMinor ?? record.principalMinor ?? record.amountMinor;
      if (record.type === "loan_repayment") liabilitiesMinor = Math.max(0, liabilitiesMinor - (record.principalMinor ?? Math.max(0, record.amountMinor - (record.interestMinor ?? 0) - (record.feeMinor ?? 0))));
    }
    while (assetEventIndex < sortedAssetEvents.length && sortedAssetEvents[assetEventIndex].date <= day) {
      const event = sortedAssetEvents[assetEventIndex++];
      const previousValue = assetValues.get(event.id) ?? 0;
      const nextValue = event.dispose ? 0 : previousValue + (event.delta ?? 0);
      assetValues.set(event.id, nextValue); physicalAssetsMinor += Math.max(0, nextValue) - Math.max(0, previousValue);
    }
    const activity = activityForPeriod(day);
    const localNetWorthMinor = cashMinor + physicalAssetsMinor + otherFinancialAssetsMinor - liabilitiesMinor;
    for (const business of businessHistories) {
      let position = businessHistoryPositions.get(business.id) ?? 0;
      while (position < business.history.length && dayOf(business.history[position].date) <= day) {
        const point = business.history[position++];
        currentBusinessPoints.set(business.id, { id: business.id, name: business.name, platform: business.platform, value: point.netWorthMinor });
      }
      businessHistoryPositions.set(business.id, position);
    }
    const externalValues = [...currentBusinessPoints.values()];
    const externalNetWorthMinor = externalValues.reduce((sum, row) => sum + row.value, 0);
    while (supplementalPosition < supplementalHistory.length && dayOf(supplementalHistory[supplementalPosition].date) <= day) {
      const item = supplementalHistory[supplementalPosition++];
      currentSupplemental.set(item.id, item);
    }
    const supplementalNetWorthMinor = [...currentSupplemental.values()].reduce((sum, row) => sum + row.amountMinor, 0);
    let netWorthMinor = localNetWorthMinor + externalNetWorthMinor + supplementalNetWorthMinor;
    const breakdown = new Map<string, { name: string; netWorthMinor: number }>();
    const addBreakdown = (key: string, name: string, value: number) => { const current = breakdown.get(key); if (current) current.netWorthMinor += value; else breakdown.set(key, { name, netWorthMinor: value }); };
    for (const business of externalValues) addBreakdown(`${business.platform}:${business.id}`, `${business.platform === "murimi" ? "Murimi" : business.platform === "tengesa" ? "Tengesa" : business.platform} · ${business.name}`, business.value);
    for (const item of currentSupplemental.values()) addBreakdown(`supplemental:${item.id}`, item.name, item.amountMinor);
    let allocatedAssetMinor = 0;
    for (const asset of assets) {
      const value = Math.max(0, assetValues.get(asset.id) ?? 0);
      let remaining = value;
      for (const allocation of asset.allocations) {
        const history = [...allocation.history].filter((entry) => dayOf(entry.date) <= day).sort((a, b) => a.date.localeCompare(b.date));
        const historicalPercent = history.length ? history[history.length - 1].percent : allocation.allocationDate <= day && allocation.status === "active" ? allocation.allocationPercent : 0;
        const percent = Math.min(100, Math.max(0, historicalPercent));
        const allocated = Math.min(remaining, Math.round(value * percent / 100));
        if (allocated <= 0) continue;
        remaining -= allocated; allocatedAssetMinor += allocated;
        addBreakdown(`${allocation.platform}:${allocation.businessId}`, `${allocation.platform === "murimi" ? "Murimi" : allocation.platform === "tengesa" ? "Tengesa" : allocation.platform} · ${allocation.businessName}`, allocated);
      }
    }
    addBreakdown("fynage", "Fynage", localNetWorthMinor - allocatedAssetMinor);
    if (day === endDay && input.currentNetWorthMinor !== undefined) {
      const correction = input.currentNetWorthMinor - netWorthMinor;
      netWorthMinor = input.currentNetWorthMinor;
      addBreakdown("fynage", "Fynage", correction);
    }
    const previous = result.at(-1);
    const assetActivity = assetActivityForPeriod(day);
    result.push({ date: day, currency, netWorthMinor, cashMinor, physicalAssetsMinor, otherFinancialAssetsMinor, liabilitiesMinor, ...activity, ...assetActivity, businessBreakdown: [...breakdown.values()], carriedForward: Boolean(previous && previous.netWorthMinor === netWorthMinor && activity.incomeMinor === 0 && activity.expensesMinor === 0 && activity.transfersMinor === 0 && activity.loanMovementsMinor === 0 && activity.assetPurchasesMinor === 0 && activity.assetDisposalsMinor === 0 && assetActivity.assetValuationAdjustmentsMinor === 0 && assetActivity.depreciationMinor === 0) });
    cursor = addPeriod(cursor, range);
  }
  return result;
}

export function getNetWorthSnapshotAt(input: Parameters<typeof buildNetWorthHistory>[0], date: string): NetWorthSnapshot | undefined {
  if (!validDate(date)) return undefined;
  return buildNetWorthHistory({ ...input, range: "daily", throughDate: dayOf(date), currentNetWorthMinor: undefined }).find((point) => point.date === dayOf(date));
}
