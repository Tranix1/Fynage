import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";
import { listBusinessConnections } from "@/repositories/businessConnections";
import { connectMurimiFinance, disconnectMurimiFinance, listMurimiFarmAccounts, refreshMurimiFinance } from "@/services/integrations/murimiFinance";
import { summarizeMurimi, summarizeMurimiBalanceSheet } from "@/services/integrations/businessSummary";
import type { BusinessConnection } from "@/types/business";
import { doc, getDoc, getFirestore } from "@react-native-firebase/firestore";
import Subscription from "@/app/Subscription";

const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MurimiBusinesses() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<BusinessConnection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [subscriptionAccess, setSubscriptionAccess] = useState<"checking" | "active" | "required">("checking");
  const [subscriptionSkipped, setSubscriptionSkipped] = useState(false);
  const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const accent = useThemeColor("accent"); const muted = useThemeColor("textlight");
  const allFarmBalance = connections.reduce((total, connection) => {
    const sheet = summarizeMurimiBalanceSheet(connection);
    return { moneyIn: total.moneyIn + connection.snapshot.performance.cashInflows, moneyOut: total.moneyOut + connection.snapshot.performance.cashOutflows, workingCapital: total.workingCapital + sheet.workingCapital, currentAssets: total.currentAssets + sheet.currentAssets, nonCurrentAssets: total.nonCurrentAssets + sheet.nonCurrentAssets, totalAssets: total.totalAssets + sheet.totalAssets, liabilities: total.liabilities + sheet.liabilities, netWorth: total.netWorth + sheet.netWorth };
  }, { moneyIn: 0, moneyOut: 0, workingCapital: 0, currentAssets: 0, nonCurrentAssets: 0, totalAssets: 0, liabilities: 0, netWorth: 0 });
  const checkSubscription = useCallback(async () => {
    if (!user?.uid) { setSubscriptionAccess("required"); return; }
    try {
      const snapshot = await getDoc(doc(getFirestore(), "subscriptions", user.uid));
      const data = snapshot.exists() ? snapshot.data() : null;
      const expiry = data?.expiresAt?.toDate?.();
      const active = (data?.sourceApp === "murimi" || data?.platform === "murimi") && data?.status === "active" && expiry instanceof Date && expiry.getTime() > Date.now();
      setSubscriptionAccess(active ? "active" : "required");
    } catch { setSubscriptionAccess("required"); }
  }, [user]);
  useFocusEffect(useCallback(() => { void checkSubscription(); }, [checkSubscription]));
  const reload = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const farms = await listMurimiFarmAccounts(user.uid);
      let nextConnections = await listBusinessConnections(user.uid, "murimi");
      await Promise.all(nextConnections.filter((connection) => connection.status === "connected").map((connection) => refreshMurimiFinance(user.uid, connection).catch(() => connection)));
      nextConnections = await listBusinessConnections(user.uid, "murimi");
      const existing = new Set(nextConnections.map((connection) => connection.sourceBusinessId));
      await Promise.all(farms.filter((farm) => !existing.has(farm.id)).map((farm) => connectMurimiFinance(user.uid, farm.id)));
      nextConnections = await listBusinessConnections(user.uid, "murimi");
      setConnections(nextConnections);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read Murimi farm data."); }
  }, [user]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const refresh = async (connection: BusinessConnection) => {
    if (!user?.uid || busy) return;
    setError(""); setBusy(true);
    try { await refreshMurimiFinance(user.uid, connection); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh this farm."); }
    finally { setBusy(false); }
  };
  const removeSnapshot = async (connection: BusinessConnection) => {
    if (!user?.uid || busy) return;
    setBusy(true);
    try { await disconnectMurimiFinance(user.uid, connection); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove this local snapshot."); }
    finally { setBusy(false); }
  };
  if (subscriptionAccess === "checking") return <ScreenWrapper><View style={styles.loading}><ActivityIndicator color={accent} /><ThemedText color={muted}>Checking Murimi subscription…</ThemedText></View></ScreenWrapper>;
  if (subscriptionAccess !== "active" && !subscriptionSkipped) return <Subscription sourceApp="murimi" returnPath="/Business/Murimi" onSkip={() => setSubscriptionSkipped(true)} />;
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={accent} /><ThemedText color={accent}>Business</ThemedText></Pressable>
    <View style={styles.header}><View><ThemedText type="title">Murimi</ThemedText><ThemedText type="tiny" color={muted}>Direct farm data from the shared Firebase project</ThemedText></View><Ionicons name="leaf-outline" size={27} color={accent} /></View>
    <View style={[styles.notice, { backgroundColor: surface, borderColor: border }]}><Ionicons name="lock-closed-outline" size={19} color={accent} /><ThemedText style={styles.flex} type="tiny" color={muted}>Fynage reads Murimi farm collections directly for this signed-in owner. No linking or shared-ledger membership is required.</ThemedText></View>
    {connections.length > 0 && <View style={[styles.totalCard, { backgroundColor: surface, borderColor: border }]}><View style={styles.totalHeading}><View style={styles.flex}><ThemedText type="tiny" color={muted}>ALL FARMS FINANCIAL POSITION</ThemedText><ThemedText type="title" color={accent}>{money(allFarmBalance.netWorth, connections[0].snapshot.business.currency)}</ThemedText></View><Ionicons name="bar-chart-outline" size={25} color={accent} /></View><View style={styles.totalGrid}><Metric label="Money in" value={money(allFarmBalance.moneyIn, connections[0].snapshot.business.currency)} /><Metric label="Money out" value={money(allFarmBalance.moneyOut, connections[0].snapshot.business.currency)} /><Metric label="Working capital" value={money(allFarmBalance.workingCapital, connections[0].snapshot.business.currency)} /><Metric label="Current assets" value={money(allFarmBalance.currentAssets, connections[0].snapshot.business.currency)} /><Metric label="Non-current assets" value={money(allFarmBalance.nonCurrentAssets, connections[0].snapshot.business.currency)} /><Metric label="Total assets" value={money(allFarmBalance.totalAssets, connections[0].snapshot.business.currency)} /><Metric label="Liabilities" value={money(allFarmBalance.liabilities, connections[0].snapshot.business.currency)} /><Metric label="Farm net worth" value={money(allFarmBalance.netWorth, connections[0].snapshot.business.currency)} /></View><ThemedText type="tiny" color={muted}>Calculation: current assets + non-current assets − liabilities = farm net worth. Working capital includes cash movement + receivables + consumable inventory − payables. Values are summed from {connections.length} connected {connections.length === 1 ? "farm" : "farms"}.</ThemedText></View>}
    {error ? <ThemedText color="#a33">{error}</ThemedText> : null}
    <ThemedText type="subtitle">Farms</ThemedText>
    {!connections.length ? <ThemedText type="tiny" color={muted}>No Murimi farm records were found for this account.</ThemedText> : connections.map((connection) => {
      const summary = summarizeMurimi(connection); const balanceSheet = summarizeMurimiBalanceSheet(connection);
      return <View key={connection.sourceBusinessId} style={[styles.farmCard, { backgroundColor: surface, borderColor: border }]}>
        <Pressable onPress={() => router.push({ pathname: "/Business/MurimiFarm" as never, params: { accountId: connection.sourceBusinessId } } as never)} style={styles.farmTitle}><View style={styles.flex}><ThemedText type="defaultSemiBold">{connection.businessName}</ThemedText><ThemedText type="tiny" color={muted}>Farm ID {connection.sourceBusinessId} · Direct read</ThemedText></View><View style={styles.farmValue}><ThemedText type="tiny" color={muted}>VALUE</ThemedText><ThemedText type="defaultSemiBold" color={accent}>{money(summary.valuedFixedAssets, connection.snapshot.business.currency)}</ThemedText></View><Ionicons name="chevron-forward" size={19} color={muted} /></Pressable>
        <View style={styles.metric}><ThemedText type="tiny" color={muted}>Recorded income</ThemedText><ThemedText type="defaultSemiBold">{money(summary.revenue, connection.snapshot.business.currency)}</ThemedText></View>
        <View style={styles.metric}><ThemedText type="tiny" color={muted}>Recorded expenses</ThemedText><ThemedText type="defaultSemiBold">{money(summary.expenses, connection.snapshot.business.currency)}</ThemedText></View>
        <View style={styles.farmGrid}><Metric label="Money in" value={money(connection.snapshot.performance.cashInflows, connection.snapshot.business.currency)} /><Metric label="Money out" value={money(connection.snapshot.performance.cashOutflows, connection.snapshot.business.currency)} /><Metric label="Operating result" value={money(summary.operatingResult, connection.snapshot.business.currency)} /><Metric label="Current assets" value={money(balanceSheet.currentAssets, connection.snapshot.business.currency)} /><Metric label="Non-current assets" value={money(balanceSheet.nonCurrentAssets, connection.snapshot.business.currency)} /><Metric label="Total assets" value={money(balanceSheet.totalAssets, connection.snapshot.business.currency)} /><Metric label="Liabilities" value={money(balanceSheet.liabilities, connection.snapshot.business.currency)} /><Metric label="Farm net worth" value={money(balanceSheet.netWorth, connection.snapshot.business.currency)} /></View>
        <ThemedText type="tiny" color={muted}>Calculation: {money(balanceSheet.currentAssets, connection.snapshot.business.currency)} current assets + {money(balanceSheet.nonCurrentAssets, connection.snapshot.business.currency)} non-current assets − {money(balanceSheet.liabilities, connection.snapshot.business.currency)} liabilities = {money(balanceSheet.netWorth, connection.snapshot.business.currency)} net worth.</ThemedText>
        <ThemedText type="tiny" color={muted}>Working capital {money(balanceSheet.workingCapital, connection.snapshot.business.currency)} Â· Current assets {money(balanceSheet.currentAssets, connection.snapshot.business.currency)} Â· Liabilities {money(balanceSheet.liabilities, connection.snapshot.business.currency)}</ThemedText><ThemedText type="tiny" color={muted}>Read directly: {new Date(connection.generatedAt).toLocaleString()}</ThemedText>
        <View style={styles.actions}><Pressable disabled={busy} onPress={() => void refresh(connection)} style={styles.action}><Ionicons name="sync-outline" size={17} color={accent} /><ThemedText type="tiny" color={accent}>Refresh</ThemedText></Pressable><Pressable disabled={busy} onPress={() => void removeSnapshot(connection)} style={styles.action}><Ionicons name="trash-outline" size={17} color="#9b5348" /><ThemedText type="tiny" color="#9b5348">Remove local snapshot</ThemedText></Pressable></View>
      </View>;
    })}
  </ScrollView></ScreenWrapper>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><ThemedText type="tiny" color="#d7e8dc">{label}</ThemedText><ThemedText type="defaultSemiBold" color="#fff" numberOfLines={1}>{value}</ThemedText></View>; }

const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 38, gap: 13 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 3 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, notice: { borderWidth: 1, borderRadius: 13, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 }, totalCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }, totalHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, totalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, flex: { flex: 1 }, farmCard: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 9 }, farmTitle: { flexDirection: "row", alignItems: "center", gap: 8 }, farmValue: { alignItems: "flex-end", gap: 1 }, farmGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, metric: { width: "48%", minHeight: 58, borderRadius: 10, backgroundColor: "#214f3a", padding: 9, justifyContent: "space-between" }, actions: { flexDirection: "row", gap: 18, paddingTop: 2 }, action: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 5 } });
