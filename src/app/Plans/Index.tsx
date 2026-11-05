import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { listPlanningRecords } from "@/services/planning/planningRecords";
import type { PlanningRecord } from "@/types/planning";

const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;
export default function PlansIndex() {
  const { user, activeAccountId } = useAuth();
  const [records, setRecords] = useState<PlanningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const text = useThemeColor("text");
  const load = useCallback(async () => { if (!user?.uid) { setRecords([]); setLoading(false); return; } setLoading(true); setError(""); try { setRecords(await listPlanningRecords(user.uid, activeAccountId ?? "personal")); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load plans."); } finally { setLoading(false); } }, [user, activeAccountId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.heading}><View style={styles.flex}><ThemedText type="title" color={text}>Plans & lists</ThemedText><ThemedText type="tiny" color={muted}>Track things to do and reusable shopping lists.</ThemedText></View><Pressable accessibilityRole="button" accessibilityLabel="Create plan or list" onPress={() => router.push("/Plans/Create" as never)} style={[styles.add, { backgroundColor: accent }]}><Ionicons name="add" size={24} color="#fff" /></Pressable></View>
    <View style={styles.actions}><Action title="New plan" caption="Tasks or spending" icon="checkbox-outline" onPress={() => router.push({ pathname: "/Plans/Create" as never, params: { kind: "plan" } })} /><Action title="Shopping list" caption="Reusable collection" icon="cart-outline" onPress={() => router.push({ pathname: "/Plans/Create" as never, params: { kind: "list" } })} /></View>
    {loading ? <ActivityIndicator color={accent} style={{ marginTop: 28 }} /> : error ? <ThemedText color="#B42318">{error}</ThemedText> : records.length ? records.map((record) => { const done = record.items.filter((item) => item.done).length; const total = record.items.length; const totalValue = record.items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0); return <Pressable key={record.id} onPress={() => router.push({ pathname: "/Plans/Details" as never, params: { id: record.id } })} style={[styles.card, { backgroundColor: surface, borderColor: border }]}><View style={[styles.icon, { backgroundColor: `${accent}18` }]}><Ionicons name={record.kind === "list" ? "cart-outline" : "checkbox-outline"} size={21} color={accent} /></View><View style={styles.flex}><ThemedText type="defaultSemiBold" color={text}>{record.name}</ThemedText><ThemedText type="tiny" color={muted}>{record.kind === "list" ? "Reusable shopping list" : record.dueDate ? `Due ${record.dueDate}` : "Plan"} · {record.platform ?? "fynage"} · {done}/{total} checked{record.kind === "list" ? ` · ${money(totalValue)}` : ""}</ThemedText></View><Ionicons name="chevron-forward" size={18} color={muted} /></Pressable>; }) : <View style={[styles.empty, { backgroundColor: surface, borderColor: border }]}><Ionicons name="calendar-outline" size={30} color={accent} /><ThemedText type="defaultSemiBold">No plans or lists yet</ThemedText><ThemedText type="tiny" color={muted}>Create a plan or save a shopping list to reuse later.</ThemedText></View>}
  </ScrollView></ScreenWrapper>;
}
function Action({ title, caption, icon, onPress }: { title: string; caption: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) { const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); return <Pressable onPress={onPress} style={[styles.action, { backgroundColor: surface, borderColor: border }]}><Ionicons name={icon} size={21} color={accent} /><ThemedText type="defaultSemiBold">{title}</ThemedText><ThemedText type="tiny" color={muted}>{caption}</ThemedText></Pressable>; }
const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 38, gap: 12 }, heading: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 }, flex: { flex: 1, gap: 4 }, add: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" }, actions: { flexDirection: "row", gap: 9, marginBottom: 7 }, action: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 13, gap: 5, minHeight: 102 }, card: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }, icon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" }, empty: { marginTop: 12, borderWidth: 1, borderRadius: 16, padding: 24, alignItems: "center", gap: 9 } });
