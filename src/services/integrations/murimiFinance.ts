import { collection, getDocs, getDoc, getFirestore, doc } from "@react-native-firebase/firestore";
import type { BusinessConnection, FarmShareSummary, MurimiFinanceSnapshot } from "@/types/business";
import type { FinancialRecordWithSync } from "@/types/finance";
import { removeBusinessConnection, saveBusinessConnection, updateBusinessConnectionStatus } from "@/repositories/businessConnections";
import { callArmament } from "@/services/integrations/armamentApi";
import { summarizeMurimiBalanceSheet } from "@/services/integrations/businessSummary";

export type MurimiFarmOption = { id: string; name: string; number?: number };
const FARM_COLLECTIONS = ["sales", "purchases", "expenses", "transactions", "assets", "batches", "stock", "stockMovements", "payments"] as const;
const db = getFirestore();
const numberValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const rows = async (ownerId: string, accountId: string, name: string) => (await getDocs(collection(db, "users", ownerId, "farmAccounts", accountId, name))).docs.map((item) => ({ id: item.id, ...item.data() })) as Record<string, unknown>[];
const minor = (value: unknown) => { const amount = typeof value === "number" ? value : Number(value); return Number.isFinite(amount) ? Math.round(amount * 100) : 0; };
const farmDate = (value: unknown) => { const raw = typeof value === "string" && value.trim() ? value : new Date().toISOString(); return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00.000Z` : raw; };
const inventoryValue = (purchases: Record<string, unknown>[], movements: Record<string, unknown>[]) => {
  const purchaseValue = new Map<string, number>();
  for (const purchase of purchases) {
    if (purchase.inventoryTracked === false || purchase.financialClassification === "fixed_asset" || purchase.financialClassification === "operating_expense") continue;
    const total = numberValue(purchase.totalCost);
    const quantity = numberValue(purchase.quantity) || numberValue(purchase.itemCount);
    const allocated = Array.isArray(purchase.allocations) ? (purchase.allocations as Record<string, unknown>[]).reduce((sum, allocation) => sum + (numberValue(allocation.cost) || (quantity > 0 ? total * numberValue(allocation.quantity) / quantity : 0)), 0) : 0;
    purchaseValue.set(String(purchase.id), Math.max(0, total - allocated));
  }
  for (const movement of movements) {
    const id = typeof movement.purchaseId === "string" ? movement.purchaseId : undefined;
    if (!id || !purchaseValue.has(id)) continue;
    const amount = numberValue(movement.totalCost) || numberValue(movement.unitCost) * numberValue(movement.quantity);
    if (movement.type === "returned") purchaseValue.set(id, (purchaseValue.get(id) ?? 0) + amount);
    if (["consumed", "wasted", "sold"].includes(String(movement.type)) && !movement.batchId) purchaseValue.set(id, Math.max(0, (purchaseValue.get(id) ?? 0) - amount));
  }
  return [...purchaseValue.values()].reduce((sum, value) => sum + value, 0);
};

/** Reads Murimi's own farm collections directly. No Armament linking or
 * money-ledger projection is required because both apps share this Firebase
 * project and the authenticated owner can read these farm records. */
export async function listMurimiDirectFinancialRecords(ownerId: string): Promise<FinancialRecordWithSync[]> {
  const farms = await listMurimiFarmAccounts(ownerId);
  const records: FinancialRecordWithSync[] = [];
  for (const farm of farms) {
    const [transactions, purchases, assets, batches] = await Promise.all([
      rows(ownerId, farm.id, "transactions"),
      rows(ownerId, farm.id, "purchases"),
      rows(ownerId, farm.id, "assets"),
      rows(ownerId, farm.id, "batches"),
    ]);
    const purchasesById = new Map(purchases.map((purchase) => [String(purchase.id), purchase]));
    const transactionSourceIds = new Set<string>();
    for (const transaction of transactions) {
      const amountMinor = minor(transaction.amount);
      if (!amountMinor) continue;
      const sourceId = typeof transaction.sourceId === "string" ? transaction.sourceId : undefined;
      if (sourceId) transactionSourceIds.add(sourceId);
      const purchase = sourceId ? purchasesById.get(sourceId) ?? purchasesById.get(sourceId.replace(/^purchase_/, "")) : undefined;
      const fixedAsset = purchase?.financialClassification === "fixed_asset";
      const occurredAt = farmDate(transaction.date);
      records.push({
        id: `murimi_${farm.id}_transactions_${transaction.id}`,
        ownerId,
        businessId: farm.id,
        sourceApp: "murimi",
        sourceModule: "farm",
        sourceBusinessId: farm.id,
        sourceAccountId: farm.id,
        sourceDocumentId: String(transaction.id),
        sourceRecordId: String(transaction.id),
        sourceCollection: "transactions",
        type: fixedAsset ? "fixed_asset" : transaction.direction === "inflow" ? "income" : "expense",
        direction: transaction.direction === "inflow" ? "in" : "out",
        amountMinor,
        currency: typeof transaction.currency === "string" ? transaction.currency : "USD",
        category: String(transaction.category ?? "Murimi"),
        description: String(transaction.description ?? "Murimi transaction"),
        occurredAt,
        affectsBalance: false,
        account: farm.name,
        assetValueMinor: fixedAsset ? minor(purchase?.totalCost) || amountMinor : undefined,
        source: "murimi",
        classificationStatus: "reviewed",
        createdAt: farmDate(transaction.createdAt),
        updatedAt: farmDate(transaction.updatedAt),
        deletedAt: null,
        revision: 1,
        syncStatus: "synced",
      });
    }
    for (const asset of assets) {
      if (asset.purchaseId && (transactionSourceIds.has(String(asset.purchaseId)) || transactionSourceIds.has(`purchase_${asset.purchaseId}`))) continue;
      const amountMinor = minor(asset.originalCost);
      if (!amountMinor) continue;
      const occurredAt = farmDate(asset.purchaseDate ?? asset.inServiceDate ?? asset.createdAt);
      records.push({
        id: `murimi_${farm.id}_assets_${asset.id}`,
        ownerId,
        businessId: farm.id,
        sourceApp: "murimi",
        sourceModule: "farm",
        sourceBusinessId: farm.id,
        sourceAccountId: farm.id,
        sourceDocumentId: String(asset.id),
        sourceRecordId: String(asset.id),
        sourceCollection: "assets",
        type: "fixed_asset",
        direction: "out",
        amountMinor,
        currency: "USD",
        category: String(asset.category ?? "Fixed asset"),
        description: String(asset.name ?? asset.description ?? "Murimi fixed asset"),
        occurredAt,
        affectsBalance: false,
        account: farm.name,
        assetValueMinor: minor(asset.estimatedValue) || amountMinor,
        source: "murimi",
        classificationStatus: "reviewed",
        createdAt: farmDate(asset.createdAt),
        updatedAt: farmDate(asset.updatedAt),
        deletedAt: null,
        revision: 1,
        syncStatus: "synced",
      });
    }
    for (const batch of batches) {
      const status = String(batch.status ?? batch.state ?? "").toLowerCase();
      if (["disposed", "sold", "closed"].includes(status)) continue;
      const directValue = ["currentValue", "estimatedValue", "totalValue", "marketValue", "stockValue", "inventoryValue", "currentStockValue", "currentWorth", "valuation", "totalInvestment", "totalCost", "purchaseCost", "purchasePrice", "costValue", "totalAmount", "value"].map((key) => minor(batch[key])).find((value) => value > 0) ?? 0;
      const quantity = ["quantity", "count", "numberOfAnimals", "numberOfBirds", "numberOfChicks", "animalCount", "birdCount", "chickCount", "headCount", "totalChicks", "initialCount", "units"].map((key) => numberValue(batch[key])).find((value) => value > 0) ?? 0;
      const unitValue = ["unitValue", "unitCost", "costPerUnit", "pricePerUnit", "costPerAnimal", "costPerBird", "costPerChick", "pricePerAnimal", "pricePerBird", "pricePerChick", "averageCost", "unitPrice", "price"].map((key) => numberValue(batch[key])).find((value) => value > 0) ?? 0;
      const amountMinor = directValue || Math.round(quantity * unitValue * 100);
      if (!amountMinor) continue;
      const occurredAt = farmDate(batch.date ?? batch.startDate ?? batch.createdAt);
      records.push({
        id: `murimi_${farm.id}_batches_${batch.id}`,
        ownerId,
        businessId: farm.id,
        sourceApp: "murimi",
        sourceModule: "farm",
        sourceBusinessId: farm.id,
        sourceAccountId: farm.id,
        sourceDocumentId: String(batch.id),
        sourceRecordId: String(batch.id),
        sourceCollection: "batches",
        type: "fixed_asset",
        direction: "out",
        amountMinor,
        currency: typeof batch.currency === "string" ? batch.currency : "USD",
        category: "Murimi inventory",
        description: String(batch.name ?? batch.batchName ?? batch.type ?? `Batch ${batch.id}`),
        occurredAt,
        affectsBalance: false,
        account: farm.name,
        assetValueMinor: amountMinor,
        source: "murimi",
        classificationStatus: "reviewed",
        createdAt: farmDate(batch.createdAt),
        updatedAt: farmDate(batch.updatedAt),
        deletedAt: null,
        revision: 1,
        syncStatus: "synced",
      });
    }
  }
  return records;
}

export async function listMurimiFarmAccounts(ownerId: string): Promise<MurimiFarmOption[]> {
  const snapshot = await getDocs(collection(db, "users", ownerId, "farmAccounts"));
  return snapshot.docs.map((item) => { const data = item.data(); return { id: item.id, name: typeof data.name === "string" && data.name.trim() ? data.name : `Farm ${item.id}`, number: typeof data.number === "number" ? data.number : undefined }; }).sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
}

async function buildSnapshot(ownerId: string, accountId: string): Promise<MurimiFinanceSnapshot> {
  const account = await getDoc(doc(db, "users", ownerId, "farmAccounts", accountId));
  if (!account.exists() || account.data()?.ownerId !== ownerId) throw new Error("This farm is not available to your Fynage account.");
  const data = Object.fromEntries(await Promise.all(FARM_COLLECTIONS.map(async (name) => [name, await rows(ownerId, accountId, name)]))) as Record<string, Record<string, unknown>[]>;
  const sales = data.sales; const purchases = data.purchases; const expenses = data.expenses; const transactions = data.transactions;
  const revenue = sales.reduce((sum, row) => sum + numberValue(row.totalValue), 0); const receivables = sales.reduce((sum, row) => sum + numberValue(row.outstanding), 0); const operatingExpenses = expenses.reduce((sum, row) => sum + numberValue(row.amount), 0); const inflows = transactions.filter((row) => row.direction === "inflow").reduce((sum, row) => sum + numberValue(row.amount), 0); const outflows = transactions.filter((row) => row.direction === "outflow").reduce((sum, row) => sum + numberValue(row.amount), 0); const payables = purchases.reduce((sum, row) => sum + numberValue(row.outstanding), 0); const consumableInventory = inventoryValue(purchases, data.stockMovements); const workingCapital = inflows - outflows + receivables + consumableInventory - payables;
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), business: { id: accountId, name: typeof account.data()?.name === "string" ? account.data()?.name as string : `Farm ${accountId}`, currency: "USD" }, balances: { cashNetMovement: inflows - outflows, customerReceivables: receivables, supplierPayables: payables, consumableInventory, workingCapital }, performance: { revenue, operatingExpenses, profitBeforeInventoryAndAssets: revenue - operatingExpenses, cashInflows: inflows, cashOutflows: outflows }, sales, purchases, expenses, transactions, assets: data.assets as MurimiFinanceSnapshot["assets"], batches: data.batches, inventory: data.stock, stockMovements: data.stockMovements, customerPayments: data.payments };
}

export async function connectMurimiFinance(ownerId: string, accountId: string): Promise<BusinessConnection> {
  const snapshot = await buildSnapshot(ownerId, accountId);
  const shareSummary = await syncFarmShares(snapshot).catch(() => undefined);
  const connection: BusinessConnection = {
    id: `murimi_${accountId}`,
    ownerId,
    appId: "murimi",
    sourceBusinessId: accountId,
    businessName: snapshot.business.name,
    status: "connected",
    generatedAt: snapshot.generatedAt,
    lastSyncedAt: new Date().toISOString(),
    snapshot,
    shareSummary,
  };
  try {
    await saveBusinessConnection(connection);
  } catch (error) { throw error; }
  return connection;
}

export async function refreshMurimiFinance(ownerId: string, connection: BusinessConnection): Promise<BusinessConnection> {
  try {
    const snapshot = await buildSnapshot(ownerId, connection.sourceBusinessId);
    const shareSummary = await syncFarmShares(snapshot).catch(() => connection.shareSummary);
    const next: BusinessConnection = { ...connection, businessName: snapshot.business.name, status: "connected", generatedAt: snapshot.generatedAt, lastSyncedAt: new Date().toISOString(), snapshot, shareSummary };
    await saveBusinessConnection(next);
    return next;
  } catch (error) {
    await updateBusinessConnectionStatus(ownerId, connection.sourceBusinessId, "sync_failed");
    throw error;
  }
}

async function syncFarmShares(snapshot: MurimiFinanceSnapshot): Promise<FarmShareSummary> {
  const business = await callArmament<{ businessId: string }>("registerArmamentBusiness", { sourceApp: "murimi", sourceId: snapshot.business.id });
  const balanceSheet = summarizeMurimiBalanceSheet({ id: `murimi_${snapshot.business.id}`, ownerId: "", appId: "murimi", sourceBusinessId: snapshot.business.id, businessName: snapshot.business.name, status: "connected", generatedAt: snapshot.generatedAt, lastSyncedAt: snapshot.generatedAt, snapshot });
  await callArmament("updateArmamentBusinessValuation", { businessId: business.businessId, farmValueMinor: Math.max(0, Math.round(balanceSheet.netWorth * 100)), currency: snapshot.business.currency });
  return callArmament<FarmShareSummary>("getArmamentShareSummary", { businessId: business.businessId });
}

/** Disconnects this local Fynage client. The farm owner can revoke the source token in Murimi. */
export async function disconnectMurimiFinance(ownerId: string, connection: BusinessConnection): Promise<void> {
  await removeBusinessConnection(ownerId, connection.sourceBusinessId);
}

