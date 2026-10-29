import { getDatabase, withDatabaseTransaction } from "@/db/database";
import { getSyncState, mergeRemoteFinancialCategories, mergeRemoteFinancialRecords, normalizeLedgerRecord } from "@/repositories/financialRecords";
import { dedupeLedgerRecords } from "@/services/finance/ledgerIdentity";
import type { FinancialCategory, FinancialRecord } from "@/types/finance";
import { collection, doc, getDocsFromServer, getFirestore, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, where } from "@react-native-firebase/firestore";

type QueueRow = { record_id: string; operation: "upsert" | "delete"; payload: string | null; revision: number; attempts: number };
const active = new Map<string, Promise<void>>();
const db = getFirestore();
const syncCollection = (uid: string) => collection(db, "users", uid, "financial_ledger");
const syncDoc = (uid: string, id: string) => doc(syncCollection(uid), id);
const categoryCollection = (uid: string) => collection(db, "users", uid, "financial_categories");

async function upload(uid: string, businessId: string, row: QueueRow): Promise<void> {
  const ref = syncDoc(uid, row.record_id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const remoteRevision = Number(snapshot.data()?.revision ?? 0);
    if (row.operation === "delete") {
      const deletedAt = new Date().toISOString();
      transaction.set(ref, { id: row.record_id, ownerId: uid, businessId, deletedAt, updatedAt: deletedAt, revision: Math.max(remoteRevision,row.revision) + 1 });
      return;
    }
    const record = JSON.parse(row.payload!) as FinancialRecord;
    const normalized = normalizeLedgerRecord(record, uid, businessId);
    const remoteUpdatedAt = String(snapshot.data()?.updatedAt ?? "");
    // Resolve concurrent edits by retaining the most recently edited payload.
    // Ties favor the existing cloud copy; clients never overwrite a newer copy.
    if (remoteRevision >= row.revision && remoteUpdatedAt >= normalized.updatedAt) return;
    transaction.set(ref, { ...normalized, sourceApp: normalized.sourceApp ?? "fynage", sourceRecordId: normalized.sourceRecordId ?? normalized.id, revision: Math.max(remoteRevision, row.revision) + 1, updatedAtServer: serverTimestamp() });
  });
}

async function retryLater(uid: string, businessId: string, row: QueueRow, message: string): Promise<void> {
  const attempts = row.attempts + 1;
  const retryAt = Date.now() + Math.min(60 * 60_000, 3_000 * (2 ** Math.min(attempts, 10)));
  await withDatabaseTransaction(async (local) => {
    await local.runAsync("UPDATE sync_queue SET attempts=?,retry_at=?,last_error=? WHERE owner_id=? AND business_id=? AND record_id=?", attempts,retryAt,message.slice(0,300),uid,businessId,row.record_id);
    await local.runAsync("UPDATE financial_records SET sync_status='failed' WHERE owner_id=? AND business_id=? AND record_id=?",uid,businessId,row.record_id);
    await local.runAsync("INSERT INTO sync_metadata(owner_id,business_id,last_successful_sync,last_error) VALUES(?,?,NULL,?) ON CONFLICT(owner_id,business_id) DO UPDATE SET last_error=excluded.last_error",uid,businessId,message.slice(0,300));
  });
}

async function syncCategories(uid: string, businessId: string): Promise<void> {
  const local = await getDatabase();
  const rows = await local.getAllAsync<{ category_id: string; payload: string; revision: number; attempts: number }>("SELECT category_id,payload,revision,attempts FROM category_sync_queue WHERE owner_id=? AND business_id=? AND retry_at<=? ORDER BY queued_at LIMIT 50", uid, businessId, Date.now());
  for (const row of rows) {
    const category = JSON.parse(row.payload) as FinancialCategory;
    try {
      await setDoc(doc(categoryCollection(uid), row.category_id), { ...category, updatedAtServer: serverTimestamp() }, { merge: true });
      await withDatabaseTransaction(async (tx) => {
        await tx.runAsync("DELETE FROM category_sync_queue WHERE owner_id=? AND business_id=? AND category_id=? AND revision=?", uid, businessId, row.category_id, row.revision);
        await tx.runAsync("UPDATE financial_categories SET sync_status='synced' WHERE owner_id=? AND business_id=? AND category_id=? AND revision=?", uid, businessId, row.category_id, row.revision);
      });
    } catch {
      const attempts = row.attempts + 1;
      await withDatabaseTransaction(async (tx) => {
        await tx.runAsync("UPDATE category_sync_queue SET attempts=?,retry_at=? WHERE owner_id=? AND business_id=? AND category_id=?", attempts, Date.now() + Math.min(3600000, 3000 * (2 ** Math.min(attempts, 10))), uid, businessId, row.category_id);
        await tx.runAsync("UPDATE financial_categories SET sync_status='failed' WHERE owner_id=? AND business_id=? AND category_id=?", uid, businessId, row.category_id);
      });
    }
  }
  try {
    const remote = await getDocsFromServer(categoryCollection(uid));
    const categories = remote.docs.map((entry) => ({ ...entry.data(), id: entry.id }) as FinancialCategory).filter((entry) => entry.businessId === businessId);
    await mergeRemoteFinancialCategories(uid, businessId, categories);
  } catch {
    // Category sync must not block transaction uploads or downloads.
  }
}

async function sync(uid: string,businessId: string): Promise<void> {
  await syncCategories(uid, businessId);
  const dbLocal = await getDatabase();
  while (true) {
    const rows = await dbLocal.getAllAsync<QueueRow>("SELECT record_id,operation,payload,revision,attempts FROM sync_queue WHERE owner_id=? AND business_id=? AND retry_at<=? ORDER BY queued_at LIMIT 50",uid,businessId,Date.now());
    if (!rows.length) break;
    for (const row of rows) {
      try {
        await upload(uid,businessId,row);
        await withDatabaseTransaction(async (local) => {
          await local.runAsync("DELETE FROM sync_queue WHERE owner_id=? AND business_id=? AND record_id=? AND revision=?",uid,businessId,row.record_id,row.revision);
          await local.runAsync("UPDATE financial_records SET sync_status='synced' WHERE owner_id=? AND business_id=? AND record_id=? AND revision=?",uid,businessId,row.record_id,row.revision);
        });
      } catch (error) {
        await retryLater(uid,businessId,row,error instanceof Error ? error.message : "Cloud sync failed.");
        return;
      }
    }
  }

  const state = await getSyncState(uid,businessId);
  const cursor = state.lastSuccessfulSync ? new Date(Date.parse(state.lastSuccessfulSync) - 1000).toISOString() : "1970-01-01T00:00:00.000Z";
  let last: Awaited<ReturnType<typeof getDocsFromServer>>["docs"][number] | undefined;
  do {
    const constraints = [where("updatedAt", ">", cursor), orderBy("updatedAt"), limit(100)];
    const page = await getDocsFromServer(query(syncCollection(uid), where("businessId", "==", businessId), ...(last ? [...constraints,startAfter(last)] : constraints)));
    const records = dedupeLedgerRecords(page.docs.flatMap((entry) => {
      const data = entry.data() as FinancialRecord;
      return [{ ...normalizeLedgerRecord(data, uid, businessId), id: entry.id, sourceApp: data.sourceApp ?? "fynage", sourceRecordId: data.sourceRecordId ?? entry.id }];
    }));
    await mergeRemoteFinancialRecords(uid,businessId,records);
    last = page.docs.length === 100 ? page.docs[page.docs.length - 1] : undefined;
  } while (last);
  const timestamp = new Date().toISOString();
  await withDatabaseTransaction(async (local) => {
    await local.runAsync("INSERT INTO sync_metadata(owner_id,business_id,last_successful_sync,last_error) VALUES(?,?,?,NULL) ON CONFLICT(owner_id,business_id) DO UPDATE SET last_successful_sync=excluded.last_successful_sync,last_error=NULL",uid,businessId,timestamp);
  });
}

export function synchronizeFinancialRecords(uid: string,businessId: string): Promise<void> {
  const key = `${uid}:${businessId}`;
  const pending = active.get(key);
  if (pending) return pending;
  const job = sync(uid,businessId).finally(() => active.delete(key));
  active.set(key,job);
  return job;
}
