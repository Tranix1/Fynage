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
import { summarizeMurimi } from "@/services/integrations/businessSummary";
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
  const totals = connections.reduce((sum, connection) => sum + summarizeMurimi(connection).valuedFixedAssets, 0);
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
    {connections.length > 0 && <View style={[styles.totalCard, { backgroundColor: surface, borderColor: border }]}><View style={styles.totalHeading}><View style={styles.flex}><ThemedText type="tiny" color={muted}>TOTAL FARM VALUE</ThemedText><ThemedText type="title">{money(totals, connections[0].snapshot.business.currency)}</ThemedText></View><Ionicons name="bar-chart-outline" size={25} color={accent} /></View><ThemedText type="tiny" color={muted}>Estimated current value of fixed assets across {connections.length} {connections.length === 1 ? "farm" : "farms"}.</ThemedText></View>}
    {error ? <ThemedText color="#a33">{error}</ThemedText> : null}
    <ThemedText type="subtitle">Farms</ThemedText>
    {!connections.length ? <ThemedText type="tiny" color={muted}>No Murimi farm records were found for this account.</ThemedText> : connections.map((connection) => {
      const summary = summarizeMurimi(connection);
      return <View key={connection.sourceBusinessId} style={[styles.farmCard, { backgroundColor: surface, borderColor: border }]}>
        <Pressable onPress={() => router.push({ pathname: "/Business/MurimiFarm" as never, params: { accountId: connection.sourceBusinessId } } as never)} style={styles.farmTitle}><View style={styles.flex}><ThemedText type="defaultSemiBold">{connection.businessName}</ThemedText><ThemedText type="tiny" color={muted}>Farm ID {connection.sourceBusinessId} · Direct read</ThemedText></View><View style={styles.farmValue}><ThemedText type="tiny" color={muted}>VALUE</ThemedText><ThemedText type="defaultSemiBold" color={accent}>{money(summary.valuedFixedAssets, connection.snapshot.business.currency)}</ThemedText></View><Ionicons name="chevron-forward" size={19} color={muted} /></Pressable>
        <View style={styles.metric}><ThemedText type="tiny" color={muted}>Recorded income</ThemedText><ThemedText type="defaultSemiBold">{money(summary.revenue, connection.snapshot.business.currency)}</ThemedText></View>
        <View style={styles.metric}><ThemedText type="tiny" color={muted}>Recorded expenses</ThemedText><ThemedText type="defaultSemiBold">{money(summary.expenses, connection.snapshot.business.currency)}</ThemedText></View>
        <ThemedText type="tiny" color={muted}>Read directly: {new Date(connection.generatedAt).toLocaleString()}</ThemedText>
        <View style={styles.actions}><Pressable disabled={busy} onPress={() => void refresh(connection)} style={styles.action}><Ionicons name="sync-outline" size={17} color={accent} /><ThemedText type="tiny" color={accent}>Refresh</ThemedText></Pressable><Pressable disabled={busy} onPress={() => void removeSnapshot(connection)} style={styles.action}><Ionicons name="trash-outline" size={17} color="#9b5348" /><ThemedText type="tiny" color="#9b5348">Remove local snapshot</ThemedText></Pressable></View>
      </View>;
    })}
  </ScrollView></ScreenWrapper>;
}

const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 38, gap: 13 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 3 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, notice: { borderWidth: 1, borderRadius: 13, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 }, totalCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 5 }, totalHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, flex: { flex: 1 }, farmCard: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 9 }, farmTitle: { flexDirection: "row", alignItems: "center", gap: 8 }, farmValue: { alignItems: "flex-end", gap: 1 }, metric: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, actions: { flexDirection: "row", gap: 18, paddingTop: 2 }, action: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 5 } });
