import { getDatabase, withDatabaseTransaction } from "@/db/database";
import type { FinancialAccount, FinancialAuditEntry, FinancialCategory, FinancialCategoryWithSync, FinancialRecord, FinancialRecordWithSync, TransactionDirection, TransactionKind } from "@/types/finance";
import { dedupeLedgerRecords, getSharedLedgerRecordId } from "@/services/finance/ledgerIdentity";
import { mergeRemoteFinancialTombstone } from "@/services/finance/tombstones";
export { dedupeLedgerRecords } from "@/services/finance/ledgerIdentity";

export type FinancialAccountWithSync = FinancialAccount & { syncStatus: FinancialRecordWithSync["syncStatus"] };

export function normalizeLedgerRecord(input: Partial<FinancialRecord>, fallbackOwnerId: string, fallbackBusinessId: string): FinancialRecord {
  const sourceApp = input.sourceApp ?? "fynage";
  const providedSourceDocumentId = input.sourceDocumentId ?? input.sourceRecordId ?? (sourceApp === "fynage" ? input.id : undefined);
  if (sourceApp !== "fynage" && !providedSourceDocumentId) {
    throw new Error(`A stable source document ID is required for ${sourceApp} financial records.`);
  }
  const sourceRecordId = providedSourceDocumentId ?? `${sourceApp}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const sourceBusinessId = input.sourceBusinessId ?? (sourceApp === "fynage" ? null : input.businessId ?? fallbackBusinessId);
  const sourceAccountId = input.sourceAccountId ?? input.accountId ?? null;
  const sourceCollection = input.sourceCollection ?? (sourceApp === "fynage" ? "users/{uid}/financial_ledger" : "users/{uid}/transactions");
  const identityFields = { id: input.id ?? sourceRecordId, ownerId: input.ownerId ?? fallbackOwnerId, businessId: input.businessId ?? fallbackBusinessId, sourceApp, sourceBusinessId, sourceAccountId, sourceCollection, sourceDocumentId: sourceRecordId };
  const id = sourceApp === "fynage" ? input.id ?? sourceRecordId : getSharedLedgerRecordId(identityFields);
  const record: FinancialRecord = {
    id,
    ownerId: input.ownerId ?? fallbackOwnerId,
    businessId: input.businessId ?? fallbackBusinessId,
    sourceApp,
    sourceModule: input.sourceModule ?? (sourceApp === "murimi" ? "farm" : sourceApp === "tengesa" ? "store" : "personal"),
    sourceBusinessId,
    sourceAccountId,
    sourceDocumentId: sourceRecordId,
    sourceRecordId,
    sourceCollection,
    type: input.type === "income" ? "income" : input.type ?? "expense",
    direction: input.direction ?? (input.type === "income" ? "in" : "out"),
    amountMinor: input.amountMinor ?? 0,
    currency: input.currency ?? "USD",
    category: input.category ?? "General",
    description: input.description ?? "Shared ledger entry",
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    deletedAt: input.deletedAt ?? null,
    revision: input.revision ?? 0,
    source: input.source ?? (sourceApp === "murimi" ? "murimi" : "manual"),
    classificationStatus: input.classificationStatus ?? "reviewed",
    userEditedFields: input.userEditedFields ?? [],
  };
  if (!record.deletedAt && record.amountMinor <= 0) throw new Error("Amount must be positive minor currency units.");
  return record;
}

type Row = { payload: string; sync_status: FinancialRecordWithSync["syncStatus"] };
const now = () => new Date().toISOString();
function validate(record: FinancialRecord): void {
  if (!record.id || !record.ownerId || !record.businessId) throw new Error("Record identity and owner are required.");
  if (!Number.isSafeInteger(record.amountMinor) || record.amountMinor <= 0) throw new Error("Amount must be positive minor currency units.");
  if (!/^[A-Z]{3}$/.test(record.currency)) throw new Error("Currency must be a three-letter ISO code.");
  if (!record.category.trim() || !record.description.trim() || !Number.isFinite(Date.parse(record.occurredAt))) throw new Error("Enter a category, description, and valid date.");
}

const accountingType = (type: TransactionKind): "income" | "expense" => type === "income" ? "income" : "expense";

export async function listFinancialAccounts(ownerId: string, businessId: string): Promise<FinancialAccountWithSync[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string; sync_status: FinancialAccountWithSync["syncStatus"] }>("SELECT payload,sync_status FROM financial_accounts WHERE owner_id=? AND business_id=? ORDER BY updated_at", ownerId, businessId);
  return rows.map((row) => ({ ...JSON.parse(row.payload) as FinancialAccount, syncStatus: row.sync_status }));
}

export async function ensureDefaultFinancialAccounts(ownerId: string, businessId: string): Promise<void> {
  const current = await listFinancialAccounts(ownerId, businessId);
  const defaults: { id: string; name: string; type: FinancialAccount["type"] }[] = [
    { id: "account_cash", name: "Cash", type: "cash" },
    { id: "account_ecocash", name: "EcoCash", type: "mobile_money" },
    { id: "account_innbucks", name: "InnBucks", type: "mobile_money" },
    { id: "account_bank", name: "Bank", type: "bank" },
  ];
  for (const item of defaults) {
    if (!current.some((account) => account.id === item.id)) await saveFinancialAccount(ownerId, businessId, { ...item, openingBalanceDate: "1970-01-01T00:00:00.000Z" });
  }
}

export async function saveFinancialAccount(ownerId: string, businessId: string, input: { name: string; type: FinancialAccount["type"]; currency?: string; id?: string; openingBalanceMinor?: number; openingBalanceDate?: string }): Promise<FinancialAccount> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const currency = (input.currency ?? "USD").toUpperCase();
  if (!name || name.length > 48 || !/^[A-Z]{3}$/.test(currency)) throw new Error("Enter an account name and a valid three-letter currency code.");
  const timestamp = now();
  const id = input.id ?? `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return withDatabaseTransaction(async (db) => {
    const existing = await db.getFirstAsync<{ account_id: string }>("SELECT account_id FROM financial_accounts WHERE owner_id=? AND business_id=? AND lower(json_extract(payload,'$.name'))=lower(?) AND json_extract(payload,'$.currency')=? AND json_extract(payload,'$.archived')=0 LIMIT 1", ownerId, businessId, name, currency);
    if (existing && existing.account_id !== id) throw new Error("An active account with this name and currency already exists.");
    const old = await db.getFirstAsync<{ payload: string; revision: number }>("SELECT payload,revision FROM financial_accounts WHERE owner_id=? AND business_id=? AND account_id=?", ownerId, businessId, id);
    const previous = old ? JSON.parse(old.payload) as FinancialAccount : undefined;
    const openingBalanceMinor = previous?.openingBalanceMinor ?? input.openingBalanceMinor ?? 0;
    if (!Number.isSafeInteger(openingBalanceMinor)) throw new Error("Opening balance must be a valid amount.");
    const account: FinancialAccount = { id, ownerId, businessId, name, type: input.type, currency, openingBalanceMinor, openingBalanceDate: previous?.openingBalanceDate ?? input.openingBalanceDate ?? timestamp, openingBalanceAudit: previous?.openingBalanceAudit, archived: previous?.archived ?? false, updatedAt: timestamp, revision: (old?.revision ?? 0) + 1 };
    const payload = JSON.stringify(account);
    await db.runAsync("INSERT INTO financial_accounts(owner_id,business_id,account_id,payload,revision,sync_status,updated_at) VALUES(?,?,?,?,?,'pending',?) ON CONFLICT(owner_id,business_id,account_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,sync_status='pending',updated_at=excluded.updated_at", ownerId, businessId, id, payload, account.revision, timestamp);
    await db.runAsync("INSERT INTO account_sync_queue(owner_id,business_id,account_id,payload,revision,attempts,retry_at,queued_at) VALUES(?,?,?,?,?,0,0,?) ON CONFLICT(owner_id,business_id,account_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,attempts=0,retry_at=0,queued_at=excluded.queued_at", ownerId, businessId, id, payload, account.revision, timestamp);
    return account;
  });
}

export async function setFinancialAccountOpeningBalance(ownerId: string, businessId: string, accountId: string, amountMinor: number, occurredAt: string, reason: string): Promise<void> {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Opening balance must be a whole number of minor currency units.");
  if (!Number.isFinite(Date.parse(occurredAt))) throw new Error("Enter a valid opening balance date.");
  if (!reason.trim()) throw new Error("Explain why the opening balance is being changed.");
  const timestamp = now();
  await withDatabaseTransaction(async (db) => {
    const row = await db.getFirstAsync<{ payload: string; revision: number }>("SELECT payload,revision FROM financial_accounts WHERE owner_id=? AND business_id=? AND account_id=?", ownerId, businessId, accountId);
    if (!row) throw new Error("Account not found.");
    const previous = JSON.parse(row.payload) as FinancialAccount;
    const changed = previous.openingBalanceMinor !== amountMinor || previous.openingBalanceDate !== occurredAt;
    const openingBalanceAudit = changed ? [...(previous.openingBalanceAudit ?? []), { id: `opening_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, changedAt: timestamp, actorId: ownerId, fromMinor: previous.openingBalanceMinor, fromDate: previous.openingBalanceDate, toMinor: amountMinor, toDate: occurredAt, reason: reason.trim() }] : previous.openingBalanceAudit;
    const account = { ...previous, openingBalanceMinor: amountMinor, openingBalanceDate: occurredAt, openingBalanceAudit, updatedAt: timestamp, revision: row.revision + 1 };
    const payload = JSON.stringify(account);
    await db.runAsync("UPDATE financial_accounts SET payload=?,revision=?,sync_status='pending',updated_at=? WHERE owner_id=? AND business_id=? AND account_id=?", payload, account.revision, timestamp, ownerId, businessId, accountId);
    await db.runAsync("INSERT INTO account_sync_queue(owner_id,business_id,account_id,payload,revision,attempts,retry_at,queued_at) VALUES(?,?,?,?,?,0,0,?) ON CONFLICT(owner_id,business_id,account_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,attempts=0,retry_at=0,queued_at=excluded.queued_at", ownerId, businessId, accountId, payload, account.revision, timestamp);
  });
}

export async function mergeRemoteFinancialAccounts(ownerId: string, businessId: string, accounts: FinancialAccount[]): Promise<void> {
  await withDatabaseTransaction(async (db) => {
    for (const account of accounts) {
      if (account.ownerId !== ownerId || account.businessId !== businessId) continue;
      const [queued, local] = await Promise.all([
        db.getFirstAsync("SELECT account_id FROM account_sync_queue WHERE owner_id=? AND business_id=? AND account_id=?", ownerId, businessId, account.id),
        db.getFirstAsync<{ revision: number }>("SELECT revision FROM financial_accounts WHERE owner_id=? AND business_id=? AND account_id=?", ownerId, businessId, account.id),
      ]);
      if (queued || (local && local.revision > account.revision)) continue;
      await db.runAsync("INSERT INTO financial_accounts(owner_id,business_id,account_id,payload,revision,sync_status,updated_at) VALUES(?,?,?,?,?,'synced',?) ON CONFLICT(owner_id,business_id,account_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,sync_status='synced',updated_at=excluded.updated_at WHERE financial_accounts.revision<=excluded.revision AND NOT EXISTS(SELECT 1 FROM account_sync_queue WHERE owner_id=? AND business_id=? AND account_id=?)", ownerId, businessId, account.id, JSON.stringify(account), account.revision, account.updatedAt, ownerId, businessId, account.id);
    }
  });
}

export async function listFinancialRecords(ownerId: string, businessId: string): Promise<FinancialRecordWithSync[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>("SELECT payload,sync_status FROM financial_records WHERE owner_id=? AND business_id=? AND json_extract(payload,'$.deletedAt') IS NULL ORDER BY updated_at DESC", ownerId, businessId);
  return rows.map((row) => ({ ...normalizeLedgerRecord(JSON.parse(row.payload) as FinancialRecord, ownerId, businessId), syncStatus: row.sync_status }));
}

export async function saveFinancialRecord(input: FinancialRecord): Promise<FinancialRecord> {
  const timestamp = now(); const record = normalizeLedgerRecord({ ...input, sourceApp: input.sourceApp ?? "fynage", sourceRecordId: input.sourceRecordId ?? input.id, updatedAt: timestamp }, input.ownerId, input.businessId);
  record.category = record.category.trim();
  record.description = record.description.trim();
  record.updatedAt = timestamp;
  validate(record);
  const saved = await withDatabaseTransaction(async (db) => {
    const old = await db.getFirstAsync<{ revision: number; payload: string }>("SELECT revision,payload FROM financial_records WHERE owner_id=? AND business_id=? AND record_id=?", record.ownerId, record.businessId, record.id);
    let classificationStatus = record.classificationStatus;
    if (!old && record.source === "manual") {
      const recent = await db.getAllAsync<{ record_id: string; payload: string }>("SELECT record_id,payload FROM financial_records WHERE owner_id=? AND business_id=? AND json_extract(payload,'$.amountMinor')=? AND json_extract(payload,'$.direction')=? AND json_extract(payload,'$.source')='manual' AND json_extract(payload,'$.deletedAt') IS NULL", record.ownerId, record.businessId, record.amountMinor, record.direction);
      const duplicate = recent.find(({ payload: existingPayload }) => {
        const existing = JSON.parse(existingPayload) as FinancialRecord;
        const sameText = existing.description.trim().toLowerCase() === record.description.toLowerCase();
        const sameAccount = (existing.account ?? "").trim().toLowerCase() === (record.account ?? "").trim().toLowerCase();
        return sameText && sameAccount && Math.abs(Date.parse(existing.occurredAt) - Date.parse(record.occurredAt)) <= 120000;
      });
      if (duplicate) { classificationStatus = "potential_duplicate"; record.potentialDuplicateOf = duplicate.record_id; }
    }
    const oldRecord = old ? JSON.parse(old.payload) as FinancialRecord : undefined;
    const auditFields: (keyof FinancialRecord)[] = ["type", "direction", "amountMinor", "currency", "category", "description", "occurredAt", "accountId", "toAccountId", "account", "toAccount", "counterparty", "reference", "notes", "principalMinor", "interestMinor", "feeMinor", "assetValueMinor", "liabilityMinor", "classificationStatus"];
    const changes = oldRecord ? auditFields.filter((field) => JSON.stringify(oldRecord[field]) !== JSON.stringify(record[field])).map((field) => ({ field, ...(oldRecord[field] !== undefined ? { from: oldRecord[field] } : {}), ...(record[field] !== undefined ? { to: record[field] } : {}) })) : [];
    const auditEntry: FinancialAuditEntry | undefined = !oldRecord
      ? { id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, action: "created", changedAt: timestamp, actorId: record.ownerId, reason: record.notes }
      : classificationStatus === "dismissed" && oldRecord.classificationStatus !== "dismissed"
        ? { id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, action: "dismissed", changedAt: timestamp, actorId: record.ownerId, reason: record.notes }
        : changes.length ? { id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, action: "edited", changedAt: timestamp, actorId: record.ownerId, reason: record.notes, changes } : undefined;
    const next = { ...record, classificationStatus, auditTrail: auditEntry ? [...(oldRecord?.auditTrail ?? record.auditTrail ?? []), auditEntry] : oldRecord?.auditTrail ?? record.auditTrail, revision: (old?.revision ?? 0) + 1 }; const payload = JSON.stringify(next);
    await db.runAsync(`INSERT INTO financial_records(owner_id,business_id,record_id,record_type,payload,revision,sync_status,updated_at) VALUES(?,?,?,?,?,?,'pending',?) ON CONFLICT(owner_id,business_id,record_id) DO UPDATE SET record_type=excluded.record_type,payload=excluded.payload,revision=excluded.revision,sync_status='pending',updated_at=excluded.updated_at`, record.ownerId, record.businessId, record.id, accountingType(record.type), payload, next.revision, timestamp);
    await db.runAsync(`INSERT INTO sync_queue(owner_id,business_id,record_id,operation,payload,revision,attempts,retry_at,last_error,queued_at) VALUES(?,?,?,'upsert',?,?,0,0,NULL,?) ON CONFLICT(owner_id,business_id,record_id) DO UPDATE SET operation='upsert',payload=excluded.payload,revision=excluded.revision,attempts=0,retry_at=0,last_error=NULL,queued_at=excluded.queued_at`, record.ownerId, record.businessId, record.id, payload, next.revision, timestamp);
    return next;
  });
  return saved;
}

export async function importFinancialRecords(inputs: FinancialRecord[]): Promise<{ inserted: number; duplicates: number }> {
  if (!inputs.length) return { inserted: 0, duplicates: 0 };
  let inserted = 0;
  let duplicates = 0;
  await withDatabaseTransaction(async (db) => {
    for (const input of inputs) {
      const record = normalizeLedgerRecord(input, input.ownerId, input.businessId);
      validate(record);
      const existing = await db.getFirstAsync<{ record_id: string; payload: string }>(
        `SELECT record_id,payload FROM financial_records
         WHERE owner_id=? AND business_id=? AND (
           record_id=? OR
           (json_extract(payload,'$.sourceApp')=?
             AND COALESCE(json_extract(payload,'$.sourceBusinessId'),json_extract(payload,'$.businessId'))=?
             AND COALESCE(json_extract(payload,'$.sourceAccountId'),json_extract(payload,'$.accountId'),'')=?
             AND COALESCE(json_extract(payload,'$.sourceCollection'),'')=?
             AND COALESCE(json_extract(payload,'$.sourceDocumentId'),json_extract(payload,'$.sourceRecordId'))=?) OR
           (json_extract(payload,'$.sourceApp')=?
             AND COALESCE(json_extract(payload,'$.sourceBusinessId'),json_extract(payload,'$.businessId'))=?
             AND COALESCE(json_extract(payload,'$.sourceAccountId'),json_extract(payload,'$.accountId'),'')=?
             AND COALESCE(json_extract(payload,'$.sourceCollection'),'')=?
             AND json_extract(payload,'$.sourceKey')=?)
         ) LIMIT 1`,
        record.ownerId, record.businessId, record.id,
        record.sourceApp ?? "fynage", record.sourceBusinessId ?? record.businessId, record.sourceAccountId ?? record.accountId ?? "",
        record.sourceCollection ?? "", record.sourceDocumentId ?? record.sourceRecordId ?? record.id,
        record.sourceApp ?? "fynage", record.sourceBusinessId ?? record.businessId, record.sourceAccountId ?? record.accountId ?? "",
        record.sourceCollection ?? "", record.sourceKey ?? "",
      );
      if (existing) {
        duplicates += 1;
        if (record.source === "sms") {
          const previous = JSON.parse(existing.payload) as FinancialRecord;
          const edited = new Set(previous.userEditedFields ?? []);
          const canEnrich = (!previous.sourceDetails && Boolean(record.sourceDetails))
            || (!previous.reference && Boolean(record.reference))
            || (!previous.counterparty && !edited.has("counterparty") && Boolean(record.counterparty))
            || (!previous.sourceFingerprint && Boolean(record.sourceFingerprint));
          if (canEnrich) {
            const enriched: FinancialRecord = {
              ...previous,
              sourceDetails: previous.sourceDetails ?? record.sourceDetails,
              reference: previous.reference ?? record.reference,
              counterparty: !edited.has("counterparty") ? previous.counterparty ?? record.counterparty : previous.counterparty,
              sourceFingerprint: previous.sourceFingerprint ?? record.sourceFingerprint,
              updatedAt: now(),
              revision: previous.revision + 1,
            };
            const timestamp = enriched.updatedAt;
            const payload = JSON.stringify(enriched);
            await db.runAsync("UPDATE financial_records SET payload=?,revision=?,sync_status='pending',updated_at=? WHERE owner_id=? AND business_id=? AND record_id=?", payload, enriched.revision, timestamp, record.ownerId, record.businessId, existing.record_id);
            await db.runAsync("INSERT INTO sync_queue(owner_id,business_id,record_id,operation,payload,revision,attempts,retry_at,last_error,queued_at) VALUES(?,?,?,'upsert',?,?,0,0,NULL,?) ON CONFLICT(owner_id,business_id,record_id) DO UPDATE SET operation='upsert',payload=excluded.payload,revision=excluded.revision,attempts=0,retry_at=0,last_error=NULL,queued_at=excluded.queued_at", record.ownerId, record.businessId, existing.record_id, payload, enriched.revision, timestamp);
          }
        }
        continue;
      }
      if (record.source === "sms") {
        const recordTime = Date.parse(record.occurredAt);
        const nearStart = new Date(recordTime - 120000).toISOString();
        const nearEnd = new Date(recordTime + 120000).toISOString();
        const candidates = await db.getAllAsync<{ record_id: string; payload: string }>(
          "SELECT record_id,payload FROM financial_records WHERE owner_id=? AND business_id=? AND json_extract(payload,'$.source')='sms' AND json_extract(payload,'$.amountMinor')=? AND json_extract(payload,'$.direction')=? AND json_extract(payload,'$.occurredAt')>=? AND json_extract(payload,'$.occurredAt')<=? LIMIT 50",
          record.ownerId, record.businessId, record.amountMinor, record.direction, nearStart, nearEnd,
        );
        const nearMatch = candidates.find(({ payload }) => {
          const previous = JSON.parse(payload) as FinancialRecord;
          const sameSender = previous.sourceDetails?.sender?.replace(/\D/g, "") === record.sourceDetails?.sender?.replace(/\D/g, "");
          // This is only a review suggestion. It never defines identity or suppresses an import.
          return previous.source === "sms" && previous.amountMinor === record.amountMinor && previous.direction === record.direction && Math.abs(Date.parse(previous.occurredAt) - Date.parse(record.occurredAt)) <= 120000 && sameSender;
        });
        if (nearMatch) { record.classificationStatus = "potential_duplicate"; record.potentialDuplicateOf = nearMatch.record_id; }
      }
      const timestamp = now();
      const payload = JSON.stringify(record);
      await db.runAsync("INSERT INTO financial_records(owner_id,business_id,record_id,record_type,payload,revision,sync_status,updated_at) VALUES(?,?,?,?,?,1,'pending',?)", record.ownerId, record.businessId, record.id, accountingType(record.type), payload, timestamp);
      await db.runAsync("INSERT INTO sync_queue(owner_id,business_id,record_id,operation,payload,revision,attempts,retry_at,last_error,queued_at) VALUES(?,?,?,'upsert',?,1,0,0,NULL,?)", record.ownerId, record.businessId, record.id, payload, timestamp);
      inserted += 1;
    }
  });
  return { inserted, duplicates };
}

export async function mergePotentialDuplicate(ownerId: string, businessId: string, duplicateId: string): Promise<void> {
  const timestamp = now();
  await withDatabaseTransaction(async (db) => {
    const duplicateRow = await db.getFirstAsync<{ payload: string; revision: number }>("SELECT payload,revision FROM financial_records WHERE owner_id=? AND business_id=? AND record_id=?", ownerId, businessId, duplicateId);
    if (!duplicateRow) return;
    const duplicate = JSON.parse(duplicateRow.payload) as FinancialRecord;
    const targetId = duplicate.potentialDuplicateOf;
    if (!targetId || targetId === duplicateId) throw new Error("This duplicate no longer points to a matching transaction.");
    const targetRow = await db.getFirstAsync<{ payload: string; revision: number }>("SELECT payload,revision FROM financial_records WHERE owner_id=? AND business_id=? AND record_id=?", ownerId, businessId, targetId);
    if (!targetRow) throw new Error("The matching transaction could not be found. Keep or dismiss this record instead.");
    const target = JSON.parse(targetRow.payload) as FinancialRecord;
    const matchedAudit: FinancialAuditEntry = { id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, action: "matched", changedAt: timestamp, actorId: ownerId, reason: "User confirmed a possible duplicate match." };
    const merged = {
      ...target,
      sourceDetails: target.sourceDetails ?? duplicate.sourceDetails,
      reference: target.reference ?? duplicate.reference,
      counterparty: target.counterparty ?? duplicate.counterparty,
      mergedSources: [...(target.mergedSources ?? []), { source: duplicate.source ?? "manual", sourceKey: duplicate.sourceKey, sourceDetails: duplicate.sourceDetails }],
      auditTrail: [...(target.auditTrail ?? []), matchedAudit],
      classificationStatus: "reviewed" as const,
      updatedAt: timestamp,
      revision: targetRow.revision + 1,
    };
    const mergedPayload = JSON.stringify(merged);
    await db.runAsync("UPDATE financial_records SET payload=?,revision=?,sync_status='pending',updated_at=? WHERE owner_id=? AND business_id=? AND record_id=?", mergedPayload, merged.revision, timestamp, ownerId, businessId, targetId);
    await db.runAsync("INSERT INTO sync_queue(owner_id,business_id,record_id,operation,payload,revision,attempts,retry_at,last_error,queued_at) VALUES(?,?,?,'upsert',?,?,0,0,NULL,?) ON CONFLICT(owner_id,business_id,record_id) DO UPDATE SET operation='upsert',payload=excluded.payload,revision=excluded.revision,attempts=0,retry_at=0,last_error=NULL,queued_at=excluded.queued_at", ownerId, businessId, targetId, mergedPayload, merged.revision, timestamp);
    const tombstone = { ...duplicate, deletedAt: timestamp, updatedAt: timestamp, revision: duplicateRow.revision + 1, auditTrail: [...(duplicate.auditTrail ?? []), { id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, action: "matched" as const, changedAt: timestamp, actorId: ownerId, reason: `Linked to ${targetId} after user confirmation.` }] };
    await db.runAsync("UPDATE financial_records SET payload=?,revision=?,sync_status='pending',updated_at=? WHERE owner_id=? AND business_id=? AND record_id=?", JSON.stringify(tombstone), tombstone.revision, timestamp, ownerId, businessId, duplicateId);
    await db.runAsync("INSERT INTO sync_queue(owner_id,business_id,record_id,operation,payload,revision,attempts,retry_at,last_error,queued_at) VALUES(?,?,?,'delete',?,?,0,0,NULL,?) ON CONFLICT(owner_id,business_id,record_id) DO UPDATE SET operation='delete',payload=excluded.payload,revision=excluded.revision,attempts=0,retry_at=0,last_error=NULL,queued_at=excluded.queued_at", ownerId, businessId, duplicateId, JSON.stringify(tombstone), tombstone.revision, timestamp);
  });
}

export async function listFinancialCategories(ownerId: string, businessId: string): Promise<FinancialCategoryWithSync[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string; sync_status: FinancialCategoryWithSync["syncStatus"] }>("SELECT payload,sync_status FROM financial_categories WHERE owner_id=? AND business_id=? ORDER BY updated_at", ownerId, businessId);
  return rows.map((row) => ({ ...JSON.parse(row.payload) as FinancialCategory, syncStatus: row.sync_status }));
}

export async function saveFinancialCategory(ownerId: string, businessId: string, name: string, direction: Exclude<TransactionDirection, "transfer">, id?: string): Promise<FinancialCategory> {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (!normalizedName || normalizedName.length > 48) throw new Error("Category name must be between 1 and 48 characters.");
  const timestamp = now();
  const categoryKey = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const categoryId = id ?? `${businessId}_${direction}_cat_${categoryKey}`;
  return withDatabaseTransaction(async (db) => {
    const old = await db.getFirstAsync<{ payload: string; revision: number }>("SELECT payload,revision FROM financial_categories WHERE owner_id=? AND business_id=? AND category_id=?", ownerId, businessId, categoryId);
    const previous = old ? JSON.parse(old.payload) as FinancialCategory : undefined;
    const category: FinancialCategory = { id: categoryId, ownerId, businessId, name: normalizedName, direction, archived: previous?.archived ?? false, updatedAt: timestamp, revision: (old?.revision ?? 0) + 1 };
    const payload = JSON.stringify(category);
    await db.runAsync("INSERT INTO financial_categories(owner_id,business_id,category_id,payload,revision,sync_status,updated_at) VALUES(?,?,?,?,?,'pending',?) ON CONFLICT(owner_id,business_id,category_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,sync_status='pending',updated_at=excluded.updated_at", ownerId, businessId, categoryId, payload, category.revision, timestamp);
    await db.runAsync("INSERT INTO category_sync_queue(owner_id,business_id,category_id,payload,revision,attempts,retry_at,queued_at) VALUES(?,?,?,?,?,0,0,?) ON CONFLICT(owner_id,business_id,category_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,attempts=0,retry_at=0,queued_at=excluded.queued_at", ownerId, businessId, categoryId, payload, category.revision, timestamp);
    return category;
  });
}

export async function archiveFinancialCategory(ownerId: string, businessId: string, categoryId: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string }>("SELECT payload FROM financial_categories WHERE owner_id=? AND business_id=? AND category_id=?", ownerId, businessId, categoryId);
  if (!row) return;
  const category = { ...JSON.parse(row.payload) as FinancialCategory, archived: true, updatedAt: now(), revision: (JSON.parse(row.payload) as FinancialCategory).revision + 1 };
  const payload = JSON.stringify(category);
  await withDatabaseTransaction(async (tx) => {
    await tx.runAsync("UPDATE financial_categories SET payload=?,revision=?,sync_status='pending',updated_at=? WHERE owner_id=? AND business_id=? AND category_id=?", payload, category.revision, category.updatedAt, ownerId, businessId, categoryId);
    await tx.runAsync("INSERT INTO category_sync_queue(owner_id,business_id,category_id,payload,revision,attempts,retry_at,queued_at) VALUES(?,?,?,?,?,0,0,?) ON CONFLICT(owner_id,business_id,category_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,attempts=0,retry_at=0,queued_at=excluded.queued_at", ownerId, businessId, categoryId, payload, category.revision, category.updatedAt);
  });
}

export async function mergeRemoteFinancialCategories(ownerId: string, businessId: string, categories: FinancialCategory[]): Promise<void> {
  await withDatabaseTransaction(async (db) => {
    for (const category of categories) {
      if (category.ownerId !== ownerId || category.businessId !== businessId) continue;
      const [queued, local] = await Promise.all([
        db.getFirstAsync("SELECT category_id FROM category_sync_queue WHERE owner_id=? AND business_id=? AND category_id=?", ownerId, businessId, category.id),
        db.getFirstAsync<{ revision: number }>("SELECT revision FROM financial_categories WHERE owner_id=? AND business_id=? AND category_id=?", ownerId, businessId, category.id),
      ]);
      if (queued || (local && local.revision > category.revision)) continue;
      await db.runAsync("INSERT INTO financial_categories(owner_id,business_id,category_id,payload,revision,sync_status,updated_at) VALUES(?,?,?,?,?,'synced',?) ON CONFLICT(owner_id,business_id,category_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,sync_status='synced',updated_at=excluded.updated_at WHERE financial_categories.revision<=excluded.revision AND NOT EXISTS(SELECT 1 FROM category_sync_queue WHERE owner_id=? AND business_id=? AND category_id=?)", ownerId, businessId, category.id, JSON.stringify(category), category.revision, category.updatedAt, ownerId, businessId, category.id);
    }
  });
}

export async function deleteFinancialRecord(ownerId: string, businessId: string, id: string): Promise<void> {
  const timestamp = now();
  await withDatabaseTransaction(async (db) => {
    const old = await db.getFirstAsync<{ payload: string; revision: number }>("SELECT payload,revision FROM financial_records WHERE owner_id=? AND business_id=? AND record_id=?", ownerId, businessId, id);
    if (!old) return;
    const previous = JSON.parse(old.payload) as FinancialRecord;
    const audit: FinancialAuditEntry = { id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, action: "deleted", changedAt: timestamp, actorId: ownerId, reason: previous.notes };
    const record = { ...previous, deletedAt: timestamp, updatedAt: timestamp, revision: old.revision + 1, auditTrail: [...(previous.auditTrail ?? []), audit] };
    await db.runAsync("UPDATE financial_records SET payload=?,revision=?,sync_status='pending',updated_at=? WHERE owner_id=? AND business_id=? AND record_id=?", JSON.stringify(record), record.revision, timestamp, ownerId, businessId, id);
    await db.runAsync(`INSERT INTO sync_queue(owner_id,business_id,record_id,operation,payload,revision,attempts,retry_at,last_error,queued_at) VALUES(?,?,?,'delete',?,?,0,0,NULL,?) ON CONFLICT(owner_id,business_id,record_id) DO UPDATE SET operation='delete',payload=excluded.payload,revision=excluded.revision,attempts=0,retry_at=0,last_error=NULL,queued_at=excluded.queued_at`, ownerId, businessId, id, JSON.stringify(record), record.revision, timestamp);
  });
}

export async function getSyncState(ownerId: string, businessId: string) {
  const db = await getDatabase();
  const [ledger, categories, accounts, metadata] = await Promise.all([
    db.getFirstAsync<{ pending: number; failed: number }>("SELECT COUNT(*) AS pending,COALESCE(SUM(CASE WHEN attempts>0 THEN 1 ELSE 0 END),0) AS failed FROM sync_queue WHERE owner_id=? AND business_id=?", ownerId, businessId),
    db.getFirstAsync<{ pending: number; failed: number }>("SELECT COUNT(*) AS pending,COALESCE(SUM(CASE WHEN attempts>0 THEN 1 ELSE 0 END),0) AS failed FROM category_sync_queue WHERE owner_id=? AND business_id=?", ownerId, businessId),
    db.getFirstAsync<{ pending: number; failed: number }>("SELECT COUNT(*) AS pending,COALESCE(SUM(CASE WHEN attempts>0 THEN 1 ELSE 0 END),0) AS failed FROM account_sync_queue WHERE owner_id=? AND business_id=?", ownerId, businessId),
    db.getFirstAsync<{ last_successful_sync: string | null; last_error: string | null }>("SELECT last_successful_sync,last_error FROM sync_metadata WHERE owner_id=? AND business_id=?", ownerId, businessId),
  ]);
  return { pending: (ledger?.pending ?? 0) + (categories?.pending ?? 0) + (accounts?.pending ?? 0), failed: (ledger?.failed ?? 0) + (categories?.failed ?? 0) + (accounts?.failed ?? 0), lastSuccessfulSync: metadata?.last_successful_sync ?? null, lastError: metadata?.last_error ?? null };
}

export async function mergeRemoteFinancialRecords(ownerId: string, businessId: string, records: FinancialRecord[]): Promise<void> {
  const deduped = dedupeLedgerRecords(records.filter((record) => record.ownerId === ownerId && record.businessId === businessId));
  await withDatabaseTransaction(async (db) => {
    for (const record of deduped) {
      const recordSource = record.sourceApp ?? "fynage";
      const sourceRef = record.sourceRecordId ?? record.id;
      const [queued, local] = await Promise.all([
        db.getFirstAsync<{ record_id: string }>("SELECT record_id FROM sync_queue WHERE owner_id=? AND business_id=? AND record_id=?", ownerId, businessId, record.id),
        db.getFirstAsync<{ revision: number }>("SELECT revision FROM financial_records WHERE owner_id=? AND business_id=? AND record_id=?", ownerId, businessId, record.id),
      ]);
      const sharedCollision = await db.getFirstAsync<{ record_id: string }>(
        `SELECT record_id FROM financial_records WHERE owner_id=? AND business_id=?
         AND json_extract(payload,'$.sourceApp')=?
         AND COALESCE(json_extract(payload,'$.sourceBusinessId'),json_extract(payload,'$.businessId'))=?
         AND COALESCE(json_extract(payload,'$.sourceAccountId'),json_extract(payload,'$.accountId'),'')=?
         AND COALESCE(json_extract(payload,'$.sourceCollection'),'')=?
         AND COALESCE(json_extract(payload,'$.sourceDocumentId'),json_extract(payload,'$.sourceRecordId'))=? LIMIT 1`,
        ownerId, businessId, recordSource, record.sourceBusinessId ?? record.businessId,
        record.sourceAccountId ?? record.accountId ?? "", record.sourceCollection ?? "", sourceRef,
      );
      if (sharedCollision && sharedCollision.record_id !== record.id) continue;
      if (queued || (local && local.revision > record.revision)) continue;
      if (record.deletedAt) {
        const previousRow = await db.getFirstAsync<{ payload: string; revision: number }>("SELECT payload,revision FROM financial_records WHERE owner_id=? AND business_id=? AND record_id=?", ownerId, businessId, record.id);
        if (!previousRow || queued || previousRow.revision > record.revision) continue;
        const previous = JSON.parse(previousRow.payload) as FinancialRecord;
        const tombstone = mergeRemoteFinancialTombstone({ ...previous, revision: previousRow.revision }, record);
        await db.runAsync("UPDATE financial_records SET payload=?,revision=?,sync_status='synced',updated_at=? WHERE owner_id=? AND business_id=? AND record_id=?", JSON.stringify(tombstone), tombstone.revision, tombstone.updatedAt, ownerId, businessId, record.id);
        continue;
      }
      const normalized = normalizeLedgerRecord(record, ownerId, businessId);
      if (normalized.sourceApp !== "fynage" && normalized.sourceApp !== "murimi" && normalized.sourceApp !== "tengesa") {
        continue;
      }
      validate(normalized);
      await db.runAsync(`INSERT INTO financial_records(owner_id,business_id,record_id,record_type,payload,revision,sync_status,updated_at) VALUES(?,?,?,?,?,?,'synced',?) ON CONFLICT(owner_id,business_id,record_id) DO UPDATE SET record_type=excluded.record_type,payload=excluded.payload,revision=excluded.revision,sync_status='synced',updated_at=excluded.updated_at WHERE financial_records.revision<=excluded.revision AND NOT EXISTS(SELECT 1 FROM sync_queue WHERE owner_id=? AND business_id=? AND record_id=?)`, ownerId, businessId, record.id, accountingType(normalized.type), JSON.stringify(normalized), normalized.revision, normalized.updatedAt, ownerId, businessId, record.id);
    }
  });
}
