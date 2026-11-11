import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { listSavings, saveSavings } from "@/services/finance/moneyGoals";
import { listMurimiFarmAccounts } from "@/services/integrations/murimiFinance";
import { listPlanningRecords } from "@/services/planning/planningRecords";
import { listTengesaFinance } from "@/services/integrations/tengesaFinance";
import type { SavingsEntry } from "@/types/moneyGoals";

type TargetType = NonNullable<SavingsEntry["targetType"]>;
type Target = { id: string; name: string; type: TargetType };
const money = (minor: number, currency = "USD") => `${currency} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const targetLabel = (row: SavingsEntry) => row.targetType === "murimiFarm" ? `Murimi · ${row.targetName ?? "Farm"}` : row.targetType === "tengesaStore" ? `Tengesa · ${row.targetName ?? "Store"}` : row.targetName ?? "Fynage personal";
const rowPlatform = (row: SavingsEntry) => row.platform ?? (row.targetType === "murimiFarm" ? "murimi" : row.targetType === "tengesaStore" ? "tengesa" : "fynage");
const newSavingsId = () => `saving_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function Savings() {
  const { user, activeAccountId } = useAuth();
  const { platform: platformParam } = useLocalSearchParams<{ platform?: string }>();
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const borderColor = border; const muted = useThemeColor("textlight"); const input = useThemeColor("input"); const text = useThemeColor("text");
  const [allRows, setAllRows] = useState<SavingsEntry[]>([]); const [targets, setTargets] = useState<Target[]>([]); const [targetType, setTargetType] = useState<TargetType>("personal"); const [targetId, setTargetId] = useState("personal"); const [amount, setAmount] = useState(""); const [interest, setInterest] = useState(""); const [note, setNote] = useState("");
  const load = useCallback(async () => {
    if (!user?.uid) return;
    const [saved, farms, plans, stores] = await Promise.all([listSavings(user.uid), listMurimiFarmAccounts(user.uid).catch(() => []), listPlanningRecords(user.uid, activeAccountId ?? "personal").catch(() => []), listTengesaFinance(user.uid).catch(() => [])]);
    setAllRows(saved);
    setTargets([{ id: "personal", name: "Fynage personal", type: "personal" }, ...farms.map((farm) => ({ id: farm.id, name: farm.name, type: "murimiFarm" as const })), ...stores.filter((store) => store.connected).map((store) => ({ id: store.id, name: store.name, type: "tengesaStore" as const })), ...plans.filter((plan) => plan.kind === "project").map((plan) => ({ id: plan.id, name: plan.name, type: "project" as const })), ...plans.filter((plan) => plan.kind === "plan").map((plan) => ({ id: plan.id, name: plan.name, type: "plan" as const }))]);
  }, [user, activeAccountId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const visibleRows = platformParam === "murimi" || platformParam === "tengesa" || platformParam === "fynage" ? allRows.filter((row) => rowPlatform(row) === platformParam) : allRows;
  const targetOptions = targets.filter((target) => target.type === targetType);
  const selectedTarget = targetOptions.find((target) => target.id === targetId) ?? targetOptions[0];
  const totals = useMemo(() => {
    const grouped = new Map<string, { label: string; total: number; platform: string }>();
    for (const row of visibleRows) { const key = `${row.targetType ?? "personal"}:${row.targetId ?? "personal"}`; const current = grouped.get(key) ?? { label: targetLabel(row), total: 0, platform: rowPlatform(row) }; current.total += row.amountMinor; grouped.set(key, current); }
    return [...grouped.values()];
  }, [visibleRows]);
  const save = async () => {
    if (!user?.uid || !selectedTarget) return;
    const value = Number(amount.replace(",", ".")); const rate = Number(interest.replace(",", ".") || 0);
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(rate) || rate < 0) { Alert.alert("Check savings", "Enter a saved amount and an optional interest percentage."); return; }
    const now = new Date().toISOString();
    await saveSavings({ id: newSavingsId(), ownerId: user.uid, businessId: activeAccountId ?? "personal", kind: targetType === "personal" ? "personal" : "business", amountMinor: Math.round(value * 100), interestBps: Math.round(rate * 100), note: note.trim() || undefined, targetType, targetId: selectedTarget.id, targetName: selectedTarget.name, platform: targetType === "murimiFarm" ? "murimi" : targetType === "tengesaStore" ? "tengesa" : "fynage", currency: "USD", createdAt: now, updatedAt: now });
    setAmount(""); setInterest(""); setNote(""); await load();
  };
  const selectType = (type: TargetType) => { setTargetType(type); setTargetId(targets.find((target) => target.type === type)?.id ?? ""); };
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><ThemedText type="title">Savings</ThemedText><ThemedText type="tiny" color={muted}>Allocate money you have saved to yourself, a Murimi farm, a project, or a plan.</ThemedText>
    <View style={[styles.total, { backgroundColor: surface, borderColor: accent }]}><ThemedText type="tiny" color={muted}>{platformParam ? `${platformParam[0].toUpperCase()}${platformParam.slice(1)} SAVINGS` : "TOTAL ALLOCATED SAVINGS"}</ThemedText><ThemedText type="title">{money(visibleRows.reduce((sum, row) => sum + row.amountMinor, 0))}</ThemedText></View>
    {!platformParam && <View style={styles.tabs}>{(["personal", "murimiFarm", "tengesaStore", "project", "plan"] as const).map((item) => <Pressable key={item} onPress={() => selectType(item)} style={[styles.tab, { borderColor: targetType === item ? accent : border, backgroundColor: targetType === item ? `${accent}18` : surface }]}><ThemedText color={targetType === item ? accent : text}>{item === "personal" ? "Personal" : item === "murimiFarm" ? "Murimi" : item === "tengesaStore" ? "Tengesa" : item[0].toUpperCase() + item.slice(1)}</ThemedText></Pressable>)}</View>}
    {targetType !== "personal" && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{targetOptions.map((target) => <Pressable key={target.id} onPress={() => setTargetId(target.id)} style={[styles.chip, { borderColor: selectedTarget?.id === target.id ? accent : border, backgroundColor: selectedTarget?.id === target.id ? `${accent}18` : surface }]}><ThemedText color={selectedTarget?.id === target.id ? accent : text}>{targetType === "murimiFarm" ? `Murimi · ${target.name}` : target.name}</ThemedText></Pressable>)}</ScrollView>}
    {!selectedTarget && <ThemedText type="tiny" color={muted}>Create a {targetType === "murimiFarm" ? "farm" : targetType} first, then allocate savings to it.</ThemedText>}
    <View style={[styles.form, { backgroundColor: surface, borderColor }]}><ThemedText type="defaultSemiBold">{selectedTarget ? `Save for ${targetLabel({ targetType, targetName: selectedTarget.name } as SavingsEntry)}` : "Savings allocation"}</ThemedText><TextInput value={amount} onChangeText={setAmount} placeholder="Amount saved" placeholderTextColor={muted} keyboardType="decimal-pad" style={[styles.input, { backgroundColor: input, color: text, borderColor }]} /><TextInput value={interest} onChangeText={setInterest} placeholder="Interest % (optional)" placeholderTextColor={muted} keyboardType="decimal-pad" style={[styles.input, { backgroundColor: input, color: text, borderColor }]} /><TextInput value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={muted} style={[styles.input, { backgroundColor: input, color: text, borderColor }]} /><Pressable disabled={!selectedTarget} onPress={() => void save()} style={[styles.button, { backgroundColor: accent, opacity: selectedTarget ? 1 : 0.5 }]}><ThemedText style={styles.buttonText}>Allocate savings</ThemedText></Pressable></View>
    <ThemedText type="subtitle">Savings by target</ThemedText>{totals.map((item) => <View key={item.label} style={[styles.row, { backgroundColor: surface, borderColor }]}><ThemedText type="defaultSemiBold" style={styles.rowLabel}>{item.label}</ThemedText><ThemedText color={accent}>{money(item.total)}</ThemedText></View>)}
    {visibleRows.slice().reverse().map((row) => <View key={row.id} style={[styles.entry, { backgroundColor: surface, borderColor }]}><View style={styles.flex}><ThemedText type="defaultSemiBold">{money(row.amountMinor, row.currency ?? "USD")}</ThemedText><ThemedText type="tiny" color={muted}>{targetLabel(row)} · {row.note || "Saved money"}</ThemedText></View><ThemedText color={accent}>{row.interestBps / 100}%</ThemedText></View>)}
  </ScrollView></ScreenWrapper>;
}

const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 36, gap: 13 }, total: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 5 }, tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, tab: { flexGrow: 1, minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" }, chips: { gap: 8 }, chip: { minHeight: 40, borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, justifyContent: "center" }, form: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 9 }, input: { minHeight: 45, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11 }, button: { minHeight: 46, borderRadius: 10, alignItems: "center", justifyContent: "center" }, buttonText: { color: "#12315C", fontFamily: "sfbold" }, row: { borderWidth: 1, borderRadius: 13, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, rowLabel: { flex: 1 }, entry: { borderWidth: 1, borderRadius: 13, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }, flex: { flex: 1 } });
