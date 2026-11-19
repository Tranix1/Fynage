import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDocs, getFirestore, setDoc } from "@react-native-firebase/firestore";
import type { FinancialRecord } from "@/types/finance";
import type { AssetAllocation, AssetAudit, AssetRecord } from "@/types/assets";
import { deriveAllocationValues, isMigratableLegacyAsset, legacyAssetId, recordAssetValuation } from "@/services/assets/assetCalculations";

const key = (uid: string) => `fynage.assets.${uid}`;
const now = () => new Date().toISOString();
async function localList(uid: string): Promise<AssetRecord[]> { try { return JSON.parse(await AsyncStorage.getItem(key(uid)) ?? "[]") as AssetRecord[]; } catch { return []; } }

export async function listAssets(uid: string): Promise<AssetRecord[]> {
  const local = await localList(uid);
  try {
    const remote = await getDocs(collection(getFirestore(), "users", uid, "assets"));
    const rows = remote.docs.map((item) => ({ ...item.data(), id: item.id }) as AssetRecord).filter((item) => item.ownerId === uid);
    const merged = new Map(rows.map((row) => [row.id, row]));
    for (const row of local) if (row.ownerId === uid && (merged.get(row.id)?.updatedAt ?? "") <= row.updatedAt) merged.set(row.id, row);
    const result = [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    await AsyncStorage.setItem(key(uid), JSON.stringify(result));
    return result;
  } catch {
    return local.filter((row) => row.ownerId === uid && !row.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export async function saveAsset(asset: AssetRecord): Promise<AssetRecord> {
  const normalized: AssetRecord = { ...asset, allocations: deriveAllocationValues(asset), revision: Math.max(1, asset.revision), updatedAt: now() };
  const rows = await localList(asset.ownerId);
  await AsyncStorage.setItem(key(asset.ownerId), JSON.stringify([normalized, ...rows.filter((row) => row.id !== normalized.id)]));
  try { await setDoc(doc(collection(getFirestore(), "users", asset.ownerId, "assets"), asset.id), normalized, { merge: true }); } catch { /* local record is retained; native Firestore queues/retries when online */ }
  return normalized;
}

export function createAssetRecord(input: {
  id: string; ownerId: string; accountId: string; name: string; description?: string; category: AssetRecord["category"];
  acquisitionDate: string; acquisitionCostMinor: number; currency: string; currentValuationMinor?: number; valuationDate?: string;
  legalOwner?: string; location?: string; usefulLifeYears?: number; depreciationMethod?: AssetRecord["depreciationMethod"];
  depreciationStartDate?: string; residualValueMinor?: number; notes?: string; acquisitionRecordId?: string; sourceRecordId?: string;
}): AssetRecord {
  const timestamp = now();
  const value = input.currentValuationMinor ?? input.acquisitionCostMinor;
  const record: AssetRecord = {
    ...input, currentValuationMinor: value, valuationDate: input.valuationDate ?? input.acquisitionDate,
    legalOwner: input.legalOwner ?? "Me", status: "active", depreciationMethod: input.depreciationMethod ?? (input.category === "land" ? "none" : "straight_line"),
    depreciationStartDate: input.depreciationStartDate ?? input.acquisitionDate, residualValueMinor: input.residualValueMinor ?? 0,
    accumulatedDepreciationMinor: 0, netBookValueMinor: input.acquisitionCostMinor, allocations: [],
    valuationHistory: [{ id: `val_${input.id}_initial`, valueMinor: value, date: input.valuationDate ?? input.acquisitionDate, reason: "Initial valuation", recordedAt: timestamp }],
    depreciationHistory: [], auditHistory: [{ id: `audit_${input.id}_created`, date: timestamp, actorId: input.ownerId, action: "created" }],
    createdAt: timestamp, updatedAt: timestamp, revision: 1,
  };
  return record;
}

export function changeAssetValuation(asset: AssetRecord, valueMinor: number, date: string, reason: string, actorId: string): AssetRecord {
  return recordAssetValuation(asset, valueMinor, date, reason, actorId);
}

export function appendAssetAudit(asset: AssetRecord, actorId: string, action: string, changes?: Record<string, unknown>): AssetRecord {
  const audit: AssetAudit = { id: `audit_${asset.id}_${Date.now()}`, date: now(), actorId, action, changes };
  return { ...asset, auditHistory: [...asset.auditHistory, audit], revision: asset.revision + 1 };
}

export function replaceAllocation(asset: AssetRecord, next: AssetAllocation): AssetRecord {
  const at = now();
  const prior = asset.allocations.find((row) => row.id === next.id);
  const history = [...(prior?.history ?? []), { id: `alloc_hist_${next.id}_${Date.now()}`, date: at, percent: next.allocationPercent, valueMinor: Math.round(asset.currentValuationMinor * next.allocationPercent / 100), action: prior ? "updated" : "created" }];
  const targetChanged = prior?.recoveryTargetMinor !== next.recoveryTargetMinor;
  const recoveryTargetHistory = [...(prior?.recoveryTargetHistory ?? []), ...(targetChanged && next.recoveryTargetMinor !== undefined ? [{ id: `recovery_target_${next.id}_${Date.now()}`, date: at, targetMinor: next.recoveryTargetMinor, reason: next.notes ?? "Recovery target configured or adjusted" }] : [])];
  const allocations = deriveAllocationValues({ ...asset, allocations: [...asset.allocations.filter((row) => row.id !== next.id), { ...prior, ...next, assetId: asset.id, history, recoveryTargetMinor: next.recoveryTargetMinor ?? prior?.recoveryTargetMinor, recoveryPayments: next.recoveryPayments ?? prior?.recoveryPayments ?? [], recoveryTargetHistory }] });
  return { ...asset, allocations, auditHistory: [...asset.auditHistory, { id: `audit_${asset.id}_${Date.now()}`, date: at, actorId: asset.ownerId, action: prior ? "allocation_updated" : "allocation_created", changes: { allocationId: next.id, percent: next.allocationPercent } }], revision: asset.revision + 1 };
}

export async function migrateLegacyAssets(uid: string, records: FinancialRecord[], saveLinkedRecord: (record: FinancialRecord) => Promise<unknown>): Promise<number> {
  const assets = await listAssets(uid);
  const bySource = new Map(assets.filter((asset) => asset.sourceRecordId).map((asset) => [asset.sourceRecordId!, asset]));
  let migrated = 0;
  for (const record of records) {
    if (!isMigratableLegacyAsset(record, uid)) continue;
    const id = legacyAssetId(record.id);
    const existing = bySource.get(record.id) ?? assets.find((asset) => asset.id === id);
    const asset = existing ?? createAssetRecord({ id, ownerId: uid, accountId: record.businessId, name: record.description || "Imported asset", description: record.notes, category: "other", acquisitionDate: record.occurredAt.slice(0, 10), acquisitionCostMinor: record.amountMinor, currency: record.currency, currentValuationMinor: record.assetValueMinor, valuationDate: record.occurredAt.slice(0, 10), sourceRecordId: record.id, acquisitionRecordId: record.id });
    if (!existing) { await saveAsset(asset); migrated += 1; }
    if (record.centralAssetId !== asset.id) await saveLinkedRecord({ ...record, centralAssetId: asset.id, updatedAt: now(), revision: record.revision + 1 });
    bySource.set(record.id, asset);
  }
  return migrated;
}
