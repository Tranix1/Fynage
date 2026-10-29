import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "fynage.db";
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const row = await database.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const version = row?.user_version ?? 0;
  if (version < 1) {
    await database.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(`
        CREATE TABLE financial_records (
          owner_id TEXT NOT NULL, business_id TEXT NOT NULL, record_id TEXT NOT NULL,
          record_type TEXT NOT NULL CHECK (record_type IN ('income','expense')),
          payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
          sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','failed','synced')),
          updated_at TEXT NOT NULL, PRIMARY KEY(owner_id,business_id,record_id)
        );
        CREATE INDEX financial_records_scope_date ON financial_records(owner_id,business_id,updated_at DESC);
        CREATE TABLE sync_queue (
          owner_id TEXT NOT NULL,business_id TEXT NOT NULL,record_id TEXT NOT NULL,
          operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')), payload TEXT,
          revision INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,queued_at TEXT NOT NULL,PRIMARY KEY(owner_id,business_id,record_id)
        );
        CREATE INDEX sync_queue_due ON sync_queue(owner_id,business_id,retry_at,queued_at);
        CREATE TABLE sync_metadata (
          owner_id TEXT NOT NULL,business_id TEXT NOT NULL,last_successful_sync TEXT,last_error TEXT,
          PRIMARY KEY(owner_id,business_id)
        );
        PRAGMA user_version = 1;
      `);
    });
  }
  if (version < 2) {
    await database.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(`
        CREATE TABLE financial_categories (
          owner_id TEXT NOT NULL, business_id TEXT NOT NULL, category_id TEXT NOT NULL,
          payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
          sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','failed','synced')),
          updated_at TEXT NOT NULL, PRIMARY KEY(owner_id,business_id,category_id)
        );
        CREATE TABLE category_sync_queue (
          owner_id TEXT NOT NULL, business_id TEXT NOT NULL, category_id TEXT NOT NULL,
          payload TEXT NOT NULL, revision INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
          retry_at INTEGER NOT NULL DEFAULT 0, queued_at TEXT NOT NULL,
          PRIMARY KEY(owner_id,business_id,category_id)
        );
        CREATE INDEX category_sync_queue_due ON category_sync_queue(owner_id,business_id,retry_at,queued_at);
        PRAGMA user_version = 2;
      `);
    });
  }
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME)
    .then(async (db) => { await migrate(db); return db; })
    .catch((error) => { databasePromise = undefined; throw error; });
  return databasePromise;
}

export async function withDatabaseTransaction<T>(work: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const db = await getDatabase(); let result!: T;
  await db.withExclusiveTransactionAsync(async (tx) => { result = await work(tx); });
  return result;
}
