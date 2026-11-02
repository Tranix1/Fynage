import { callArmament } from "@/services/integrations/armamentApi";

export type SharedFarmEntry = {
  id: string;
  transactionType: string;
  direction: "in" | "out" | "transfer";
  amountMinor: number;
  currency: string;
  category: string;
  transactionAt: string;
  status: string;
};

export type SharedFarmLedger = {
  businessId: string;
  sourceId: string;
  name: string;
  role: string;
  entries: SharedFarmEntry[];
};

/** Loads only ledgers returned by the trusted membership, subscription and role checks. */
export async function listMurimiSharedLedgers(): Promise<SharedFarmLedger[]> {
  const { businesses } = await callArmament<{ businesses: { id: string; name: string; sourceApp: string; sourceId: string; role: string }[] }>("listArmamentBusinesses");
  const farms = businesses.filter((business) => business.sourceApp === "murimi");
  return Promise.all(farms.map(async (business) => {
    const entitlement = await callArmament<{ active: boolean }>("getArmamentEntitlement", { businessId: business.id });
    let entries: SharedFarmEntry[] = [];
    if (entitlement.active && ["owner", "admin", "investor"].includes(business.role)) {
      const result = await callArmament<{ entries: SharedFarmEntry[] }>("readArmamentBusinessLedger", { businessId: business.id });
      entries = result.entries.filter((entry) => entry.status === "posted");
    }
    return { businessId: business.id, sourceId: business.sourceId, name: business.name, role: business.role, entries };
  }));
}
