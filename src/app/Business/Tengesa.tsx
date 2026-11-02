import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";
import { listTengesaFinance, setTengesaFinanceConnection, type TengesaStoreSummary } from "@/services/integrations/tengesaFinance";

const money = (amount: number, currency: string) => `${currency} ${(amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TengesaBusiness() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [stores, setStores] = useState<TengesaStoreSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border");
  const reload = useCallback(async () => {
    if (!uid) return;
    setLoading(true); setError("");
    try { setStores(await listTengesaFinance(uid)); }
    catch { setError("Could not load Tengesa stores. Check your connection and try again."); }
    finally { setLoading(false); }
  }, [uid]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const changeConnection = (store: TengesaStoreSummary) => {
    const next = !store.connected;
    Alert.alert(next ? "Connect this store?" : "Disconnect this store?", next
      ? "Fynage will show this store's posted sales and expenses. It will not change Tengesa records."
      : "Fynage will stop loading this store's financial summary. Tengesa records will remain unchanged.", [
      { text: "Cancel", style: "cancel" },
      { text: next ? "Connect" : "Disconnect", style: next ? "default" : "destructive", onPress: () => void (async () => {
        if (!user?.uid) return;
        try { await setTengesaFinanceConnection(user.uid, store.id, next); await reload(); }
        catch { setError("The connection could not be changed. Check your access and try again."); }
      })() },
    ]);
  };

  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={accent} /><ThemedText color={accent}>Business</ThemedText></Pressable>
    <View style={styles.header}><View><ThemedText type="title">Tengesa</ThemedText><ThemedText type="tiny" color={muted}>Owner-authorized store finances</ThemedText></View><Ionicons name="storefront-outline" size={27} color={accent} /></View>
    <ThemedText type="tiny" color={muted}>Fynage reads only posted shared-ledger entries for stores owned by this signed-in account. Personal finances remain separate.</ThemedText>
    {loading ? <ActivityIndicator color={accent} /> : null}
    {error ? <ThemedText color="#a33">{error}</ThemedText> : null}
    {!loading && stores.length === 0 ? <ThemedText type="tiny" color={muted}>No Tengesa stores were found for this account.</ThemedText> : null}
    {stores.map((store) => <View key={store.id} style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.storeHead}><View style={styles.copy}><ThemedText type="defaultSemiBold">{store.name}</ThemedText><ThemedText type="tiny" color={muted}>Store {store.id}</ThemedText></View><Pressable accessibilityRole="button" onPress={() => changeConnection(store)} style={styles.action}><ThemedText type="tiny" color={store.connected ? "#9b5348" : accent}>{store.connected ? "Disconnect" : "Connect"}</ThemedText></Pressable></View>
      {store.connected ? <><View style={styles.metric}><ThemedText type="tiny" color={muted}>Posted sales</ThemedText><ThemedText type="defaultSemiBold">{money(store.incomeMinor, store.currency)}</ThemedText></View><View style={styles.metric}><ThemedText type="tiny" color={muted}>Posted expenses</ThemedText><ThemedText type="defaultSemiBold">{money(store.expenseMinor, store.currency)}</ThemedText></View><ThemedText type="tiny" color={muted}>{store.transactionCount} shared entries · source: Tengesa</ThemedText></> : <ThemedText type="tiny" color={muted}>Not connected. Connect to show this store&apos;s financial totals.</ThemedText>}
    </View>)}
  </ScrollView></ScreenWrapper>;
}

const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 36, gap: 14 }, back: { flexDirection: "row", alignItems: "center", gap: 6 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }, storeHead: { flexDirection: "row", alignItems: "center", gap: 10 }, copy: { flex: 1, gap: 3 }, action: { padding: 8 }, metric: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" } });
