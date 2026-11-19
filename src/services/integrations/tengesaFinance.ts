import { collection, getDocs, getFirestore } from "@react-native-firebase/firestore";
import { callArmament } from "@/services/integrations/armamentApi";

export type TengesaStoreSummary = {
  id: string;
  name: string;
  currency: string;
  connected: boolean;
  incomeMinor: number;
  expenseMinor: number;
  transactionCount: number;
  netWorthMinor: number;
  role: string;
  subscriptionActive: boolean;
  financialAccess: boolean;
  /** Cumulative posted-ledger value (inflows minus outflows) at recorded dates. */
  history: { id: string; date: string; netWorthMinor: number }[];
};

const firestore = getFirestore();
const localFinancialDate = (value: string) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const netWorthDelta = (entry: Record<string, unknown>) => {
  const amount = Number(entry.amountMinor) || 0;
  const direction = entry.direction;
  const cash = direction === "in" ? amount : direction === "out" ? -amount : 0;
  const type = String(entry.type ?? entry.transactionType ?? entry.kind ?? "").toLowerCase();
  if (type === "loan_received") return cash - (Number(entry.liabilityMinor) || (direction === "in" ? amount : 0));
  if (type === "loan_repayment") return cash + (direction === "in" ? -1 : 1) * (Number(entry.principalMinor) || 0);
  if (type === "investment") return cash + (Number(entry.assetValueMinor) || (direction === "out" ? amount : 0));
  if (type === "fixed_asset") return cash + (entry.centralAssetId ? 0 : Number(entry.assetValueMinor) || amount);
  return cash;
};

/** Reads only businesses and ledger rows returned by the trusted membership/entitlement service. */
export async function listTengesaFinance(uid: string): Promise<TengesaStoreSummary[]> {
  void uid;
  type BusinessList = { businesses: { id: string; name: string; sourceApp: string; sourceId: string; role: string }[] };
  type ConnectionList = { docs: { data(): Record<string, unknown> }[] };
  const [shared, connections] = await Promise.all([
    callArmament<BusinessList>("listArmamentBusinesses"),
    getDocs(collection(firestore, "users", uid, "connectedApps")) as unknown as Promise<ConnectionList>,
  ]);
  const connectedIds = new Set(connections.docs.flatMap((item) => item.data().status === "connected" ? [String(item.data().businessId)] : []));
  return Promise.all(shared.businesses.filter((business) => business.sourceApp === "tengesa").map(async (business) => {
    const connected = connectedIds.has(business.id);
    let entries: Record<string, unknown>[] = [];
    let subscriptionActive = false;
    if (connected) {
      const entitlement = await callArmament<{ active: boolean }>("getArmamentEntitlement", { businessId: business.id });
      subscriptionActive = entitlement.active;
      if (entitlement.active && ["owner", "admin", "investor"].includes(business.role)) {
        const result = await callArmament<{ entries: Record<string, unknown>[] }>("readArmamentBusinessLedger", { businessId: business.id });
        entries = result.entries.filter((entry) => entry.status === "posted");
      }
    }
    const currency = String(entries[0]?.currency ?? "USD").toUpperCase();
    const currencyEntries = entries.filter((entry) => String(entry.currency ?? "USD").toUpperCase() === currency);
    const daily = new Map<string, number>();
    for (const entry of currencyEntries) {
      const rawDate = [entry.occurredAt, entry.transactionDate, entry.date, entry.postedAt].find((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) as string | undefined;
      if (!rawDate) continue;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : localFinancialDate(rawDate);
      daily.set(date, (daily.get(date) ?? 0) + netWorthDelta(entry));
    }
    let running = 0;
    const history = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, delta]) => {
      running += delta;
      return { id: `tengesa_${business.id}_${date}`, date, netWorthMinor: running };
    });
    const currentValue = currencyEntries.reduce((sum, row) => sum + netWorthDelta(row), 0);
    const observedAt = localFinancialDate(new Date().toISOString());
    if (history.length === 0 || history[history.length - 1].netWorthMinor !== currentValue || history[history.length - 1].date !== observedAt) history.push({ id: `tengesa_${business.id}_${observedAt}`, date: observedAt, netWorthMinor: currentValue });
    return {
      id: business.id,
      name: business.name || "Tengesa store",
      currency,
      connected,
      incomeMinor: currencyEntries.reduce((sum, row) => sum + (row.direction === "in" ? Number(row.amountMinor) || 0 : 0), 0),
      expenseMinor: currencyEntries.reduce((sum, row) => sum + (row.direction === "out" ? Number(row.amountMinor) || 0 : 0), 0),
      transactionCount: currencyEntries.length,
      netWorthMinor: currentValue,
      role: business.role,
      subscriptionActive,
      financialAccess: ["owner", "admin", "investor"].includes(business.role),
      history,
    };
  }));
}

export async function setTengesaFinanceConnection(uid: string, businessId: string, connected: boolean): Promise<void> {
  void uid;
  await callArmament("setArmamentBusinessConnection", { businessId, connected });
}
