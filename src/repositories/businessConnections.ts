import { getDatabase, withDatabaseTransaction } from "@/db/database";
import type { BusinessConnection } from "@/types/business";

export async function listBusinessConnections(ownerId: string, appId?: string): Promise<BusinessConnection[]> {
  const db = await getDatabase();
  const rows = appId
    ? await db.getAllAsync<{ payload: string }>("SELECT payload FROM business_connections WHERE owner_id=? AND app_id=? ORDER BY updated_at DESC", ownerId, appId)
    : await db.getAllAsync<{ payload: string }>("SELECT payload FROM business_connections WHERE owner_id=? ORDER BY updated_at DESC", ownerId);
  return rows.flatMap(({ payload }) => {
    try { return [JSON.parse(payload) as BusinessConnection]; }
    catch { return []; }
  });
}

export async function saveBusinessConnection(connection: BusinessConnection): Promise<void> {
  await withDatabaseTransaction(async (db) => {
    const existing = await db.getFirstAsync<{ payload: string }>("SELECT payload FROM business_connections WHERE owner_id=? AND app_id=? AND source_business_id=?", connection.ownerId, connection.appId, connection.sourceBusinessId);
    let payloadConnection = connection;
    if (existing) {
      try {
        const previous = JSON.parse(existing.payload) as BusinessConnection;
        const history = new Map([...(previous.netWorthHistory ?? []), ...(connection.netWorthHistory ?? [])].map((point) => [point.id, point]));
        if (history.size > 0) payloadConnection = { ...connection, netWorthHistory: [...history.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-5000) };
      } catch { /* Keep the incoming snapshot if a previous local payload is corrupt. */ }
    }
    await db.runAsync(
      "INSERT INTO business_connections(owner_id,app_id,source_business_id,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id,app_id,source_business_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
      connection.ownerId, connection.appId, connection.sourceBusinessId, JSON.stringify(payloadConnection), connection.lastSyncedAt,
    );
  });
}

export async function updateBusinessConnectionStatus(ownerId: string, sourceBusinessId: string, status: BusinessConnection["status"]): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string }>("SELECT payload FROM business_connections WHERE owner_id=? AND app_id='murimi' AND source_business_id=?", ownerId, sourceBusinessId);
  if (!row) return;
  const previous = JSON.parse(row.payload) as BusinessConnection;
  await saveBusinessConnection({ ...previous, status });
}

export async function removeBusinessConnection(ownerId: string, sourceBusinessId: string): Promise<void> {
  await withDatabaseTransaction(async (db) => {
    await db.runAsync("DELETE FROM business_connections WHERE owner_id=? AND app_id='murimi' AND source_business_id=?", ownerId, sourceBusinessId);
  });
}
