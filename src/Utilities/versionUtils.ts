import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/db/fireBaseConfig";

export type ManagedAppId = "fynage" | "murimi" | "tengesa";
export interface AppVersionConfig { appId?: ManagedAppId; appName?: string; version: string; minVersion: string; updateMessage?: string; updateUrl?: string; androidUrl?: string; iosUrl?: string; enabled?: boolean; lastUpdated?: Date; }
const appNames: Record<ManagedAppId, string> = { fynage: "Fynage", murimi: "Murimi", tengesa: "Tengesa" };
const defaultVersion = (appId: ManagedAppId): AppVersionConfig => ({ appId, appName: appNames[appId], version: "1.0.0", minVersion: "1.0.0", updateMessage: `A new version of ${appNames[appId]} is available.`, enabled: true });

/** Reads one app's managed version from the shared Armament appVersions collection. */
export async function getAppVersion(appId: ManagedAppId = "fynage"): Promise<AppVersionConfig | null> {
  try { const snapshot = await getDoc(doc(db, "appVersions", appId)); return snapshot.exists() ? { ...defaultVersion(appId), ...snapshot.data(), appId } as AppVersionConfig : null; }
  catch (error) { console.warn(`Could not read ${appId} app version configuration.`, error); return null; }
}

export async function getSafeAppVersion(appId: ManagedAppId = "fynage"): Promise<AppVersionConfig> {
  const config = await getAppVersion(appId);
  return { ...(config ?? defaultVersion(appId)), updateMessage: config?.updateMessage?.trim() || `A new version of ${appNames[appId]} is available.`, enabled: config?.enabled !== false };
}

/** One-time administrator bootstrap. Run once, verify the documents, then remove this function from the build. */
export async function createInitialAppVersions(): Promise<void> {
  const batch = writeBatch(db); const now = new Date();
  (Object.keys(appNames) as ManagedAppId[]).forEach((appId) => batch.set(doc(db, "appVersions", appId), { ...defaultVersion(appId), lastUpdated: now }, { merge: true }));
  await batch.commit();
}

/** Admin-only helper for changing one app without touching the other apps. */
export async function setAppVersion(appId: ManagedAppId, versionConfig: Omit<AppVersionConfig, "appId" | "appName" | "lastUpdated">): Promise<void> {
  await setDoc(doc(db, "appVersions", appId), { ...versionConfig, appId, appName: appNames[appId], lastUpdated: new Date() }, { merge: true });
}

export type UpdateType = "force" | "optional" | "none";
export interface VersionInfo { currentVersion: string; minVersion: string; latestVersion: string; }
export function compareVersions(a: string, b: string): number { const aParts = a.split(".").map((n) => parseInt(n, 10) || 0); const bParts = b.split(".").map((n) => parseInt(n, 10) || 0); const length = Math.max(aParts.length, bParts.length); for (let i = 0; i < length; i += 1) { const aSeg = aParts[i] ?? 0; const bSeg = bParts[i] ?? 0; if (aSeg > bSeg) return 1; if (aSeg < bSeg) return -1; } return 0; }
export const isVersionLessThan = (a: string, b: string): boolean => compareVersions(a, b) < 0;
export const isVersionGreaterOrEqual = (a: string, b: string): boolean => compareVersions(a, b) >= 0;
export function getUpdateType({ currentVersion, minVersion, latestVersion }: VersionInfo): UpdateType { if (isVersionLessThan(currentVersion, minVersion)) return "force"; if (isVersionLessThan(currentVersion, latestVersion)) return "optional"; return "none"; }
