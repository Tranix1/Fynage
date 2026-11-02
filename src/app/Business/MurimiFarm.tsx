import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";
import { listBusinessConnections } from "@/repositories/businessConnections";
import { refreshMurimiFinance } from "@/services/integrations/murimiFinance";
import { summarizeMurimi } from "@/services/integrations/businessSummary";
import type { BusinessConnection } from "@/types/business";

const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rowLabel = (row: Record<string, unknown>, candidates: string[], fallback: string) => { const found = candidates.find((key) => typeof row[key] === "string" && row[key]); return found ? String(row[found]) : fallback; };

export default function MurimiFarmPage() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const { user } = useAuth();
  const [connection, setConnection] = useState<BusinessConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const accent = useThemeColor("accent"); const muted = useThemeColor("textlight");
  const reload = useCallback(async () => {
    if (!user || !accountId) { setConnection(null); setLoading(false); return; }
    const rows = await listBusinessConnections(user.uid, "murimi");
    setConnection(rows.find((item) => item.sourceBusinessId === accountId) ?? null); setLoading(false);
  }, [user, accountId]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const summary = useMemo(() => connection ? summarizeMurimi(connection) : null, [connection]);

  const refresh = async () => {
    if (!user || !connection || refreshing) return;
    setRefreshing(true); setError("");
    try { await refreshMurimiFinance(user.uid, connection); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh farm data."); await reload(); }
    finally { setRefreshing(false); }
  };

  if (loading) return <ScreenWrapper fh={false}><View style={styles.loading}><ActivityIndicator color={accent} /></View></ScreenWrapper>;
  if (!connection || !summary) return <ScreenWrapper fh={false}><View style={styles.page}><Pressable onPress={() => router.back()}><ThemedText color={accent}>‹ Back to Murimi</ThemedText></Pressable><ThemedText type="subtitle">Farm unavailable</ThemedText><ThemedText type="tiny" color={muted}>This farm is not connected on this device. Its financial records have not been changed.</ThemedText></View></ScreenWrapper>;
  const { snapshot } = connection; const currency = snapshot.business.currency;
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={accent} /><ThemedText color={accent}>Murimi farms</ThemedText></Pressable>
    <View style={styles.header}><View><ThemedText type="title">{connection.businessName}</ThemedText><ThemedText type="tiny" color={muted}>Murimi farm · {snapshot.business.id}</ThemedText></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh farm financials" onPress={() => void refresh()} style={styles.refresh}>{refreshing ? <ActivityIndicator color={accent} /> : <Ionicons name="sync-outline" size={21} color={accent} />}</Pressable></View>
    <View style={[styles.sourceNote, { backgroundColor: surface, borderColor: border }]}><ThemedText type="tiny" color={muted}>Read-only snapshot · source generated {new Date(connection.generatedAt).toLocaleString()} · Fynage synced {new Date(connection.lastSyncedAt).toLocaleString()}</ThemedText></View>
    {error ? <ThemedText color="#a33">{error}</ThemedText> : null}
    <View style={styles.grid}><Metric label="Recorded income" value={money(summary.revenue, currency)} /><Metric label="Recorded expenses" value={money(summary.expenses, currency)} /><Metric label="Operating result*" value={money(summary.operatingResult, currency)} /><Metric label="Customer receivables" value={money(summary.receivables, currency)} /><Metric label="Supplier payables" value={money(summary.payables, currency)} /><Metric label="Estimated fixed assets" value={money(summary.valuedFixedAssets, currency)} /></View>
    <ThemedText type="tiny" color={muted}>*Murimi labels this as profit before inventory and assets; it is a simplified source figure, not audited profit. Current cash balance and inventory valuation are not available in the shared snapshot. {summary.assetsWithoutCurrentValuation ? `${summary.assetsWithoutCurrentValuation} assets have no current value and are excluded.` : ""}</ThemedText>
    <FinancialListSection title="Working capital" rows={[]} empty={`Current cash balance is not supplied. Recorded cash movement: ${money(snapshot.balances.cashNetMovement, currency)} (inflows less outflows over the available record history). This is not a current balance.`} currency={currency} surface={surface} border={border} muted={muted} />
    <FinancialListSection title="Fixed assets" rows={snapshot.assets.map((asset) => ({ ...asset, amount: asset.estimatedValue }))} empty="No fixed assets were shared." currency={currency} surface={surface} border={border} muted={muted} />
    <FinancialListSection title="Income" rows={snapshot.sales} empty="No sales were shared." currency={currency} surface={surface} border={border} muted={muted} />
    <FinancialListSection title="Expenses" rows={snapshot.expenses} empty="No expenses were shared." currency={currency} surface={surface} border={border} muted={muted} />
    <FinancialListSection title="Purchases" rows={snapshot.purchases} empty="No purchases were shared." currency={currency} surface={surface} border={border} muted={muted} />
    <FinancialListSection title="Financial history" rows={snapshot.transactions} empty="No cash transactions were shared." currency={currency} surface={surface} border={border} muted={muted} />
  </ScrollView></ScreenWrapper>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><ThemedText type="tiny" color="#d7e8dc">{label}</ThemedText><ThemedText type="defaultSemiBold" color="#fff" numberOfLines={1}>{value}</ThemedText></View>; }
function FinancialListSection({ title, rows, empty, currency, surface, border, muted }: { title: string; rows: Record<string, unknown>[]; empty: string; currency: string; surface: string; border: string; muted: string }) {
  return <View style={[styles.section, { backgroundColor: surface, borderColor: border }]}><ThemedText type="defaultSemiBold">{title}</ThemedText>{rows.length ? rows.slice(0, 30).map((row, index) => <View key={String(row.id ?? index)} style={[styles.listRow, { borderTopColor: border }]}><View style={styles.flex}><ThemedText type="defaultSemiBold" numberOfLines={1}>{rowLabel(row, ["item", "description", "name", "category"], `${title.slice(0, -1)} ${index + 1}`)}</ThemedText><ThemedText type="tiny" color={muted}>{rowLabel(row, ["date", "purchaseDate"], "Date unavailable")}{row.status ? ` · ${String(row.status)}` : ""}</ThemedText></View><ThemedText type="tiny">{typeof row.amount === "number" ? money(row.amount, currency) : typeof row.totalCost === "number" ? money(row.totalCost, currency) : typeof row.totalValue === "number" ? money(row.totalValue, currency) : ""}</ThemedText></View>) : <ThemedText type="tiny" color={muted}>{empty}</ThemedText>}</View>;
}
const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 40, gap: 13 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" }, back: { flexDirection: "row", alignItems: "center", gap: 6 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, refresh: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#e6f0e9", alignItems: "center", justifyContent: "center" }, sourceNote: { borderWidth: 1, borderRadius: 10, padding: 11 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, metric: { width: "48%", minHeight: 76, borderRadius: 12, backgroundColor: "#214f3a", padding: 11, justifyContent: "space-between" }, section: { borderWidth: 1, borderRadius: 13, padding: 13, gap: 8 }, listRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, flexDirection: "row", alignItems: "center", gap: 10 }, flex: { flex: 1 } });
