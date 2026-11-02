import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";
import { listBusinessConnections } from "@/repositories/businessConnections";
import { connectMurimiFinance, disconnectMurimiFinance, refreshMurimiFinance } from "@/services/integrations/murimiFinance";
import { summarizeMurimi } from "@/services/integrations/businessSummary";
import { listMurimiSharedLedgers, type SharedFarmLedger } from "@/services/integrations/murimiSharedLedger";
import type { BusinessConnection } from "@/types/business";

const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MurimiBusinesses() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<BusinessConnection[]>([]);
  const [sharedLedgers, setSharedLedgers] = useState<SharedFarmLedger[]>([]);
  const [pairingCode, setPairingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const accent = useThemeColor("accent"); const muted = useThemeColor("textlight");
  const reload = useCallback(async () => {
    if (!user) return;
    const [connectionResult, ledgerResult] = await Promise.allSettled([
      listBusinessConnections(user.uid, "murimi"),
      listMurimiSharedLedgers(),
    ]);
    setConnections(connectionResult.status === "fulfilled" ? connectionResult.value : []);
    setSharedLedgers(ledgerResult.status === "fulfilled" ? ledgerResult.value : []);
    if (ledgerResult.status === "rejected") setError("Shared farm ledgers are unavailable. Check your connection and retry.");
  }, [user]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const connect = async () => {
    if (!user?.uid || busy) return;
    setError(""); setBusy(true);
    try { await connectMurimiFinance(user.uid, pairingCode); setPairingCode(""); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect to Murimi. Try again."); }
    finally { setBusy(false); }
  };
  const refresh = async (connection: BusinessConnection) => {
    if (!user?.uid || busy) return;
    setError(""); setBusy(true);
    try { await refreshMurimiFinance(user.uid, connection); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh this farm."); await reload(); }
    finally { setBusy(false); }
  };
  const disconnect = (connection: BusinessConnection) => Alert.alert("Remove this farm from Fynage?", "This removes the local snapshot and secure token from this device. The farm owner can revoke the connection from Murimi to block future downloads.", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => void (async () => { if (!user?.uid) return; setBusy(true); try { await disconnectMurimiFinance(user.uid, connection); await reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove this connection."); } finally { setBusy(false); } })() },
  ]);

  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={accent} /><ThemedText color={accent}>Business</ThemedText></Pressable>
    <View style={styles.header}><View><ThemedText type="title">Murimi</ThemedText><ThemedText type="tiny" color={muted}>Farm financial snapshots</ThemedText></View><Ionicons name="leaf-outline" size={27} color={accent} /></View>
    <View style={[styles.notice, { backgroundColor: surface, borderColor: border }]}><Ionicons name="lock-closed-outline" size={19} color={accent} /><ThemedText style={styles.flex} type="tiny" color={muted}>Connect each farm with its owner’s one-time code. Fynage receives read-only financial data. It does not create or edit farm records.</ThemedText></View>
    <ThemedText type="subtitle">Connect a farm</ThemedText>
    <ThemedText type="tiny" color={muted}>In Murimi, open More → Finance app connections, create a code for Fynage, then enter it here. The code can be used once and expires in 10 minutes.</ThemedText>
    <TextInput value={pairingCode} onChangeText={setPairingCode} autoCapitalize="none" autoCorrect={false} placeholder="One-time Murimi code" style={styles.input} accessibilityLabel="Murimi one-time pairing code" />
    <Pressable disabled={busy || pairingCode.trim().length < 30} onPress={() => void connect()} style={[styles.primary, (busy || pairingCode.trim().length < 30) && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <ThemedText color="#fff" type="defaultSemiBold">Connect farm</ThemedText>}</Pressable>
    {error ? <ThemedText color="#a33">{error}</ThemedText> : null}
    <ThemedText type="subtitle">Connected farms</ThemedText>
    {!connections.length ? <ThemedText type="tiny" color={muted}>No farms are connected on this device yet. Your personal finances remain separate.</ThemedText> : connections.map((connection) => {
      const summary = summarizeMurimi(connection);
      return <View key={connection.sourceBusinessId} style={[styles.farmCard, { backgroundColor: surface, borderColor: border }]}>
        <Pressable onPress={() => router.push({ pathname: "/Business/MurimiFarm" as never, params: { accountId: connection.sourceBusinessId } } as never)} style={styles.farmTitle}><View style={styles.flex}><ThemedText type="defaultSemiBold">{connection.businessName}</ThemedText><ThemedText type="tiny" color={muted}>Farm ID {connection.sourceBusinessId} · {connection.status === "connected" ? "Connected" : connection.status === "expired" ? "Reconnect required" : "Sync needs attention"}</ThemedText></View><Ionicons name="chevron-forward" size={19} color={muted} /></Pressable>
        <View style={styles.metric}><ThemedText type="tiny" color={muted}>Recorded income</ThemedText><ThemedText type="defaultSemiBold">{money(summary.revenue, connection.snapshot.business.currency)}</ThemedText></View>
        <View style={styles.metric}><ThemedText type="tiny" color={muted}>Recorded expenses</ThemedText><ThemedText type="defaultSemiBold">{money(summary.expenses, connection.snapshot.business.currency)}</ThemedText></View>
        <ThemedText type="tiny" color={muted}>Source snapshot: {new Date(connection.generatedAt).toLocaleString()} · Fynage last synced {new Date(connection.lastSyncedAt).toLocaleString()}</ThemedText>
        <View style={styles.actions}><Pressable disabled={busy} onPress={() => void refresh(connection)} style={styles.action}><Ionicons name="sync-outline" size={17} color={accent} /><ThemedText type="tiny" color={accent}>Refresh</ThemedText></Pressable><Pressable disabled={busy} onPress={() => disconnect(connection)} style={styles.action}><Ionicons name="unlink-outline" size={17} color="#9b5348" /><ThemedText type="tiny" color="#9b5348">Remove</ThemedText></Pressable></View>
      </View>;
    })}
    <ThemedText type="subtitle">Shared farm ledger</ThemedText>
    <ThemedText type="tiny" color={muted}>Authorized Murimi purchases and sales appear here from the shared ledger. These entries stay separate from personal finances.</ThemedText>
    {!sharedLedgers.length ? <ThemedText type="tiny" color={muted}>No registered Murimi business memberships were found. Open Murimi online to register and sync its farm accounts.</ThemedText> : sharedLedgers.map((farm) => <View key={farm.businessId} style={[styles.farmCard, { backgroundColor: surface, borderColor: border }]}>
      <ThemedText type="defaultSemiBold">{farm.name} · {farm.role}</ThemedText>
      {!farm.entries.length ? <ThemedText type="tiny" color={muted}>No posted financial entries are available for this role or subscription.</ThemedText> : farm.entries.map((entry) => <View key={entry.id} style={styles.metric}>
        <View style={styles.flex}><ThemedText type="tiny">{entry.transactionType} · {entry.category}</ThemedText><ThemedText type="tiny" color={muted}>{new Date(entry.transactionAt).toLocaleDateString()}</ThemedText></View>
        <ThemedText type="defaultSemiBold">{entry.direction === "out" ? "−" : entry.direction === "in" ? "+" : "↔ "}{money(entry.amountMinor / 100, entry.currency)}</ThemedText>
      </View>)}
    </View>)}
  </ScrollView></ScreenWrapper>;
}

const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 38, gap: 13 }, back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 3 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, notice: { borderWidth: 1, borderRadius: 13, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 }, flex: { flex: 1 }, input: { minHeight: 48, borderWidth: 1, borderColor: "#cbd5ce", borderRadius: 9, backgroundColor: "#fff", paddingHorizontal: 13, color: "#1c2921" }, primary: { minHeight: 48, borderRadius: 9, backgroundColor: "#214f3a", alignItems: "center", justifyContent: "center" }, disabled: { opacity: 0.52 }, farmCard: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 9 }, farmTitle: { flexDirection: "row", alignItems: "center", gap: 8 }, metric: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, actions: { flexDirection: "row", gap: 18, paddingTop: 2 }, action: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 5 } });
