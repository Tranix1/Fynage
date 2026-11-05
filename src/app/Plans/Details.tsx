import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { ensureDefaultFinancialAccounts, listFinancialAccounts } from "@/repositories/financialRecords";
import { useThemeColor } from "@/hooks/useThemeColor";
import { listPlanningRecords, savePlanningRecord } from "@/services/planning/planningRecords";
import type { PlanningItem, PlanningRecord } from "@/types/planning";

const cashId = "account_cash";
const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;
export default function PlanDetails() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { user, activeAccountId } = useAuth(); const scope = activeAccountId ?? "personal"; const { save: saveFinancial } = useFinancialRecords();
  const [record, setRecord] = useState<PlanningRecord | null>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const inputBg = useThemeColor("input"); const text = useThemeColor("text");
  const load = useCallback(async () => { if (!user?.uid || !id) { setLoading(false); return; } setLoading(true); try { const rows = await listPlanningRecords(user.uid, scope); setRecord(rows.find((entry) => entry.id === id) ?? null); } catch (cause) { Alert.alert("Could not load", cause instanceof Error ? cause.message : "Try again."); } finally { setLoading(false); } }, [user?.uid, id, scope]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const update = (itemId: string, patch: Partial<PlanningItem>) => setRecord((current) => current ? { ...current, items: current.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) } : current);
  const persist = async (next: PlanningRecord) => { if (!user?.uid) return; const updated = { ...next, updatedAt: new Date().toISOString() }; await savePlanningRecord(updated); setRecord(updated); };
  const toggle = async (item: PlanningItem) => { if (!record) return; const next = { ...record, items: record.items.map((row) => row.id === item.id ? { ...row, done: !row.done } : row) }; try { await persist(next); } catch (cause) { Alert.alert("Could not update item", cause instanceof Error ? cause.message : "Try again."); } };
  const saveChanges = async () => { if (!record) return; setSaving(true); try { await persist(record); Alert.alert("Saved", "Your list changes have been saved."); } catch (cause) { Alert.alert("Could not save", cause instanceof Error ? cause.message : "Try again."); } finally { setSaving(false); } };
  const submitPurchases = async () => {
    if (!record || !user?.uid) return; const selected = record.items.filter((item) => item.done);
    if (!selected.length) { Alert.alert("Choose items first", "Tick the things you bought, then submit the list."); return; }
    const invalid = selected.find((item) => item.unitPriceMinor <= 0);
    if (invalid) { Alert.alert("Add a price", `Enter a price for ${invalid.name} before submitting.`); return; }
    setSaving(true);
    try {
      await ensureDefaultFinancialAccounts(user.uid, scope);
      const accounts = await listFinancialAccounts(user.uid, scope); const account = accounts.find((entry) => entry.id === cashId && entry.currency === "USD") ?? accounts.find((entry) => entry.currency === "USD" && !entry.archived);
      if (!account) throw new Error("Create a USD account before recording purchases.");
      const submissionId = record.activeSubmissionId ?? `purchase_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (!record.activeSubmissionId) { const pending = { ...record, activeSubmissionId: submissionId }; await savePlanningRecord({ ...pending, updatedAt: new Date().toISOString() }); setRecord(pending); }
      for (const item of selected) {
        const amountMinor = Math.round(item.quantity * item.unitPriceMinor);
        await saveFinancial({ id: `fin_${record.id}_${submissionId}_${item.id}`, type: "expense", direction: "out", amountMinor, currency: account.currency, category: item.category.trim() || "General", description: item.name.trim(), occurredAt: new Date().toISOString(), accountId: account.id, account: account.name, notes: `From reusable list: ${record.name}`, source: "manual", sourceApp: "fynage", classificationStatus: "reviewed" });
      }
      const next = { ...record, activeSubmissionId: undefined, items: record.items.map((item) => ({ ...item, done: false })) }; await persist(next);
      Alert.alert("Purchases recorded", `${selected.length} item${selected.length === 1 ? "" : "s"} saved as expenses. The list is ready to reuse.`);
    } catch (cause) { Alert.alert("Could not submit list", cause instanceof Error ? cause.message : "Try again."); } finally { setSaving(false); }
  };
  if (loading) return <ScreenWrapper><ActivityIndicator color={accent} /></ScreenWrapper>;
  if (!record) return <ScreenWrapper><View style={styles.page}><ThemedText type="title">Plan not found</ThemedText><Pressable onPress={() => router.back()}><ThemedText color={accent}>Go back</ThemedText></Pressable></View></ScreenWrapper>;
  const selectedTotal = record.items.filter((item) => item.done).reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0);
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><View style={styles.heading}><View style={{ flex: 1, gap: 4 }}><ThemedText type="title">{record.name}</ThemedText><ThemedText type="tiny" color={muted}>{record.kind === "list" ? "Reusable shopping list · tick items bought" : record.dueDate ? `Due ${record.dueDate}` : "Plan · tick items as you complete them"} · {record.platform ?? "fynage"}</ThemedText></View><Pressable onPress={() => router.push({ pathname: "/Plans/Create" as never, params: { kind: record.kind } })}><Ionicons name="add-circle-outline" size={28} color={accent} /></Pressable></View>
    {record.items.map((item) => <View key={item.id} style={[styles.item, { backgroundColor: surface, borderColor: border }]}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} onPress={() => void toggle(item)} style={styles.check}><Ionicons name={item.done ? "checkbox" : "square-outline"} size={25} color={item.done ? accent : muted} /></Pressable><View style={{ flex: 1, gap: 7 }}><View style={styles.row}><TextField value={item.category} placeholder="Category" onChangeText={(value) => update(item.id, { category: value })} /><TextField value={item.name} placeholder="Item name" onChangeText={(value) => update(item.id, { name: value })} /></View><View style={styles.row}><TextField value={String(item.quantity)} placeholder="Qty" keyboardType="decimal-pad" onChangeText={(value) => update(item.id, { quantity: Math.max(1, Number(value) || 1) })} /><TextField value={(item.unitPriceMinor / 100).toFixed(2)} placeholder="Price each" keyboardType="decimal-pad" onChangeText={(value) => update(item.id, { unitPriceMinor: Math.max(0, Math.round((Number(value.replace(",", ".")) || 0) * 100)) })} /><ThemedText type="tiny" color={muted}>{money(item.quantity * item.unitPriceMinor)}</ThemedText></View></View></View>)}
    <Pressable disabled={saving} onPress={() => void saveChanges()} style={[styles.secondary, { borderColor: accent }]}><ThemedText color={accent}>{saving ? "Saving…" : "Save list edits"}</ThemedText></Pressable>
    {record.kind === "list" ? <Pressable disabled={saving} onPress={() => void submitPurchases()} style={[styles.submit, { backgroundColor: accent }]}><ThemedText style={{ color: "#fff", fontFamily: "sfbold" }}>Submit bought items · {money(selectedTotal)}</ThemedText></Pressable> : <ThemedText type="tiny" color={muted}>Checked items are saved automatically.</ThemedText>}
  </ScrollView></ScreenWrapper>;
  function TextField({ value, placeholder, onChangeText, keyboardType }: { value: string; placeholder: string; onChangeText: (value: string) => void; keyboardType?: "default" | "decimal-pad" }) { return <TextInput value={value} placeholder={placeholder} onChangeText={onChangeText} keyboardType={keyboardType} placeholderTextColor={muted} style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]} />; }
}
const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 36, gap: 12 }, heading: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 5 }, item: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: "row", alignItems: "center", gap: 9 }, check: { padding: 3 }, row: { flexDirection: "row", alignItems: "center", gap: 7 }, input: { flex: 1, minWidth: 0, minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, fontSize: 14 }, secondary: { minHeight: 46, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" }, submit: { minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" } });
