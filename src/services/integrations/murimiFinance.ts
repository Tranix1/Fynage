import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { BusinessConnection, MurimiFinanceSnapshot } from "@/types/business";
import { removeBusinessConnection, saveBusinessConnection, updateBusinessConnectionStatus } from "@/repositories/businessConnections";

const MURIMI_FUNCTIONS = "https://us-central1-armament-f5a0b.cloudfunctions.net";
const tokenKey = (ownerId: string, accountId: string) => `murimi_finance_${ownerId}_${accountId}`;

function isSnapshot(value: unknown): value is MurimiFinanceSnapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<MurimiFinanceSnapshot>;
  return data.schemaVersion === 1
    && typeof data.generatedAt === "string"
    && typeof data.business?.id === "string"
    && typeof data.business?.name === "string"
    && typeof data.business?.currency === "string"
    && typeof data.performance?.revenue === "number"
    && typeof data.performance?.operatingExpenses === "number"
    && typeof data.performance?.profitBeforeInventoryAndAssets === "number"
    && typeof data.balances?.customerReceivables === "number"
    && typeof data.balances?.supplierPayables === "number"
    && Array.isArray(data.assets)
    && Array.isArray(data.sales)
    && Array.isArray(data.purchases)
    && Array.isArray(data.expenses)
    && Array.isArray(data.transactions)
    && Array.isArray(data.batches)
    && Array.isArray(data.inventory)
    && Array.isArray(data.stockMovements)
    && Array.isArray(data.customerPayments);
}

async function exchangePairingCode(pairingCode: string): Promise<{ accessToken: string; accountId: string; clientName: string; dataUrl: string }> {
  const response = await fetch(`${MURIMI_FUNCTIONS}/exchangeMurimiFinancePairingCode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode }),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const reason = typeof body?.error === "string" ? body.error : `Murimi connection failed (${response.status}).`;
    throw new Error(reason);
  }
  if (typeof body?.accessToken !== "string" || typeof body.accountId !== "string" || typeof body.dataUrl !== "string" || !body.dataUrl.startsWith("https://us-central1-armament-f5a0b.cloudfunctions.net/")) {
    throw new Error("Murimi returned an invalid connection response.");
  }
  return { accessToken: body.accessToken, accountId: body.accountId, clientName: typeof body.clientName === "string" ? body.clientName : "Fynage", dataUrl: body.dataUrl };
}

async function downloadSnapshot(dataUrl: string, accessToken: string): Promise<MurimiFinanceSnapshot> {
  const response = await fetch(dataUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 401) throw Object.assign(new Error("This Murimi connection has expired or was revoked. Reconnect it from Murimi."), { code: "connection-expired" });
  if (!response.ok) throw new Error(`Could not refresh Murimi data (${response.status}).`);
  const body: unknown = await response.json();
  if (!isSnapshot(body)) throw new Error("Murimi returned financial data in an unsupported format.");
  return body;
}

export async function connectMurimiFinance(ownerId: string, pairingCodeInput: string): Promise<BusinessConnection> {
  if (Platform.OS === "web") throw new Error("Murimi pairing is available in the mobile app, where the access token can be stored securely.");
  const pairingCode = pairingCodeInput.trim();
  if (pairingCode.length < 30 || pairingCode.length > 80) throw new Error("Enter the one-time code shown in Murimi. It expires after 10 minutes.");
  const exchanged = await exchangePairingCode(pairingCode);
  const snapshot = await downloadSnapshot(exchanged.dataUrl, exchanged.accessToken);
  const connection: BusinessConnection = {
    id: `murimi_${exchanged.accountId}`,
    ownerId,
    appId: "murimi",
    sourceBusinessId: exchanged.accountId,
    businessName: snapshot.business.name,
    status: "connected",
    generatedAt: snapshot.generatedAt,
    lastSyncedAt: new Date().toISOString(),
    snapshot,
  };
  try {
    await SecureStore.setItemAsync(tokenKey(ownerId, exchanged.accountId), JSON.stringify({ accessToken: exchanged.accessToken, dataUrl: exchanged.dataUrl }));
    await saveBusinessConnection(connection);
  } catch (error) {
    await SecureStore.deleteItemAsync(tokenKey(ownerId, exchanged.accountId)).catch(() => undefined);
    throw error;
  }
  return connection;
}

export async function refreshMurimiFinance(ownerId: string, connection: BusinessConnection): Promise<BusinessConnection> {
  if (Platform.OS === "web") throw new Error("Refresh this Murimi connection from the Fynage mobile app.");
  const raw = await SecureStore.getItemAsync(tokenKey(ownerId, connection.sourceBusinessId));
  if (!raw) throw new Error("The secure connection token is unavailable on this device. Reconnect this farm from Murimi.");
  const stored = JSON.parse(raw) as { accessToken?: string; dataUrl?: string };
  if (!stored.accessToken || !stored.dataUrl) throw new Error("The secure connection is incomplete. Reconnect this farm from Murimi.");
  try {
    const snapshot = await downloadSnapshot(stored.dataUrl, stored.accessToken);
    const next: BusinessConnection = { ...connection, businessName: snapshot.business.name, status: "connected", generatedAt: snapshot.generatedAt, lastSyncedAt: new Date().toISOString(), snapshot };
    await saveBusinessConnection(next);
    return next;
  } catch (error) {
    if ((error as { code?: string })?.code === "connection-expired") await updateBusinessConnectionStatus(ownerId, connection.sourceBusinessId, "expired");
    else await updateBusinessConnectionStatus(ownerId, connection.sourceBusinessId, "sync_failed");
    throw error;
  }
}

/** Disconnects this local Fynage client. The farm owner can revoke the source token in Murimi. */
export async function disconnectMurimiFinance(ownerId: string, connection: BusinessConnection): Promise<void> {
  if (Platform.OS === "web") throw new Error("Remove this Murimi connection from the Fynage mobile app.");
  await SecureStore.deleteItemAsync(tokenKey(ownerId, connection.sourceBusinessId));
  await removeBusinessConnection(ownerId, connection.sourceBusinessId);
}

