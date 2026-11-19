import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { listFinancialRecords, saveFinancialRecord, deleteFinancialRecord } from "@/repositories/financialRecords";
import { isOnline, subscribeToConnectivity } from "@/services/network/connectivity";
import { synchronizeFinancialRecords } from "@/services/sync/financialSync";
import { listMurimiDirectFinancialRecords } from "@/services/integrations/murimiFinance";
import type { FinancialRecord, FinancialRecordWithSync } from "@/types/finance";

export function useFinancialRecords(businessId = "personal") {
  const { user, activeAccountId } = useAuth();
  const uid = user?.uid;
  const scope = activeAccountId ?? businessId;
  // Before account switching was introduced, personal records used the
  // businessId directly. Keep those records visible for the restored first
  // account, while leaving acc2 and later accounts isolated.
  const legacyScope = activeAccountId === "acc1" && scope !== businessId ? businessId : null;
  const recordScopeKey = `${uid ?? ""}:${scope}`;
  const [recordState, setRecordState] = useState<{ key: string; records: FinancialRecordWithSync[]; loaded: boolean }>({ key: "", records: [], loaded: false });
  const records = useMemo(() => recordState.key === recordScopeKey ? recordState.records : [], [recordState, recordScopeKey]);
  const loaded = recordState.key === recordScopeKey && recordState.loaded;
  const syncInFlight = useRef<Promise<void> | null>(null);
  const refresh = useCallback(async () => {
    if (!uid) {
      setRecordState({ key: recordScopeKey, records: [], loaded: true });
      return;
    }
    const scopes = legacyScope ? [scope, legacyScope] : [scope];
    const loaded = (await Promise.all(scopes.map((item) => listFinancialRecords(uid, item)))).flat();
    let murimi: FinancialRecordWithSync[] = [];
    try { murimi = await listMurimiDirectFinancialRecords(uid); } catch { /* Murimi collections may be unavailable while offline */ }
    const unique = [...new Map([...loaded, ...murimi].map((record) => [record.id, record])).values()];
    setRecordState({ key: recordScopeKey, records: unique, loaded: true });
  },[uid,scope,legacyScope,recordScopeKey]);
  const sync = useCallback(async () => {
    if (!uid || !(await isOnline())) return;
    if (syncInFlight.current) return syncInFlight.current;
    const task = (async () => {
      const scopes = legacyScope ? [scope, legacyScope] : [scope];
      await Promise.all(scopes.map((item) => synchronizeFinancialRecords(uid, item).catch(() => undefined)));
      await refresh();
    })();
    syncInFlight.current = task;
    try {
      await task;
    } finally {
      if (syncInFlight.current === task) syncInFlight.current = null;
    }
  },[uid,scope,legacyScope,refresh]);
  useEffect(() => { const task = setTimeout(() => { void refresh(); },0); return () => clearTimeout(task); },[refresh]);
  useFocusEffect(useCallback(() => { const task = setTimeout(() => { void refresh(); }, 250); return () => clearTimeout(task); }, [refresh]));
  useEffect(() => {
    if (!uid) return;
    // A Firebase session can be restored before the local SQLite cache has
    // anything in it. Reconcile this account immediately so a returning user
    // sees their cloud history during the first authenticated render.
    const task = setTimeout(() => { void sync(); }, 0);
    return () => clearTimeout(task);
  },[uid, scope, sync]);
  useEffect(() => subscribeToConnectivity((online) => { if (online) void sync(); }),[sync]);
  useEffect(() => {
    if (!uid) return;
    const timer = setInterval(() => { void sync(); }, 15_000);
    return () => clearInterval(timer);
  },[uid,sync]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener("change",(state) => {
      if (state !== "active") return;
      if (timer) clearTimeout(timer);
      // Let the first screen finish its interactions before starting network
      // reconciliation when the app returns to the foreground.
      timer = setTimeout(() => { void sync(); }, 1200);
    });
    return () => { sub.remove(); if (timer) clearTimeout(timer); };
  },[sync]);
  const save = useCallback(async (record: Omit<FinancialRecord,"ownerId"|"businessId"|"createdAt"|"updatedAt"|"revision">) => {
    if (!uid) throw new Error("Sign in before adding a financial record.");
    const prior = records.find((item) => item.id === record.id);
    const saved = await saveFinancialRecord({ ...record, ownerId:uid, businessId:scope, createdAt:prior?.createdAt ?? new Date().toISOString(), updatedAt:new Date().toISOString(), revision:prior?.revision ?? 0 });
    await refresh(); void sync(); return saved;
  },[uid,scope,records,refresh,sync]);
  const remove = useCallback(async (id: string) => {
    if (!uid) return;
    await deleteFinancialRecord(uid,scope,id); await refresh(); void sync();
  },[uid,scope,refresh,sync]);
  return { records, loaded, refresh, sync, save, remove };
}
