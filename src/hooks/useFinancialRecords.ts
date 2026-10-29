import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { listFinancialRecords, saveFinancialRecord, deleteFinancialRecord } from "@/repositories/financialRecords";
import { isOnline, subscribeToConnectivity } from "@/services/network/connectivity";
import { synchronizeFinancialRecords } from "@/services/sync/financialSync";
import type { FinancialRecord, FinancialRecordWithSync } from "@/types/finance";

export function useFinancialRecords(businessId = "personal") {
  const { user, activeAccountId } = useAuth();
  const uid = user?.uid;
  const scope = activeAccountId ?? businessId;
  const [records,setRecords] = useState<FinancialRecordWithSync[]>([]);
  const refresh = useCallback(async () => {
    if (uid) setRecords(await listFinancialRecords(uid,scope));
    else setRecords([]);
  },[uid,scope]);
  const sync = useCallback(async () => {
    if (!uid || !(await isOnline())) return;
    await synchronizeFinancialRecords(uid,scope).catch(() => undefined);
    await refresh();
  },[uid,scope,refresh]);
  useEffect(() => { const task = setTimeout(() => { void refresh(); },0); return () => clearTimeout(task); },[refresh]);
  useEffect(() => subscribeToConnectivity((online) => { if (online) void sync(); }),[sync]);
  useEffect(() => {
    if (!uid) return;
    const timer = setInterval(() => { void sync(); }, 15_000);
    return () => clearInterval(timer);
  },[uid,sync]);
  useEffect(() => {
    const sub = AppState.addEventListener("change",(state) => { if (state === "active") void sync(); });
    return () => sub.remove();
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
  return { records, refresh, sync, save, remove };
}
