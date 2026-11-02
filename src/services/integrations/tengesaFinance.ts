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
  role: string;
  subscriptionActive: boolean;
  financialAccess: boolean;
};

const firestore = getFirestore();

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
    return {
      id: business.id,
      name: business.name || "Tengesa store",
      currency,
      connected,
      incomeMinor: currencyEntries.reduce((sum, row) => sum + (row.direction === "in" ? Number(row.amountMinor) || 0 : 0), 0),
      expenseMinor: currencyEntries.reduce((sum, row) => sum + (row.direction === "out" ? Number(row.amountMinor) || 0 : 0), 0),
      transactionCount: currencyEntries.length,
      role: business.role,
      subscriptionActive,
      financialAccess: ["owner", "admin", "investor"].includes(business.role),
    };
  }));
}

export async function setTengesaFinanceConnection(uid: string, businessId: string, connected: boolean): Promise<void> {
  void uid;
  await callArmament("setArmamentBusinessConnection", { businessId, connected });
}
