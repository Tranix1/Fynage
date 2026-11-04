import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as IntentLauncher from "expo-intent-launcher";
import { useAuth } from "@/context/AuthContext";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { listBusinessConnections } from "@/repositories/businessConnections";
import { listTengesaFinance, type TengesaStoreSummary } from "@/services/integrations/tengesaFinance";
import type { ArmamentAppId, BusinessConnection } from "@/types/business";

type AppDefinition = { id: ArmamentAppId; name: string; description: string; packageName: string; icon: keyof typeof Ionicons.glyphMap; detail: string; available: boolean };
const apps: AppDefinition[] = [
  { id: "murimi", name: "Murimi", description: "Farm management", packageName: "com.armament.murimi", icon: "leaf-outline", detail: "Farm operations stay in Murimi. Farm owners can connect a read-only snapshot, and active Armament business members can view role-authorized shared farm ledger entries. Farm purchases and sales remain recorded in Murimi; their financial entries stay separate from your personal finances in Fynage.", available: true },
  { id: "tengesa", name: "Tengesa", description: "Retail and POS management", packageName: "com.armament.tengesa", icon: "storefront-outline", detail: "Tengesa stores sync sales, expenses and customer references to the shared Armament records. Fynage shows summaries only for businesses where your membership and owner connection are active. Each record retains its business and store attribution.", available: true },
  { id: "transix", name: "Transix", description: "Transport and logistics", packageName: "com.yayapana.TransixNewVersion", icon: "car-outline", detail: "Transix manages transport and logistics. Its integration is deferred. Fynage will not import or combine Transix transactions in this stage.", available: false },
];
type Installation = { installed: boolean | null; iconData?: string };
const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BusinessIndex() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<BusinessConnection[]>([]);
  const [tengesaStores, setTengesaStores] = useState<TengesaStoreSummary[]>([]);
  const [installation, setInstallation] = useState<Record<string, Installation>>({});
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<AppDefinition | null>(null);
  const border = useThemeColor("border"); const surface = useThemeColor("backgroundLight"); const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const text = useThemeColor("text");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [connectionRows, storeRows] = user?.uid
        ? await Promise.all([
            listBusinessConnections(user.uid).catch(() => []),
            listTengesaFinance(user.uid).catch(() => []),
          ])
        : [[], []];
      const detected: Record<string, Installation> = {};
      if (Platform.OS === "android") {
        await Promise.all(apps.map(async (app) => {
          try {
            const iconData = await IntentLauncher.getApplicationIconAsync(app.packageName);
            detected[app.id] = { installed: iconData ? true : null, iconData: iconData || undefined };
          } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
            detected[app.id] = { installed: message.includes("packagenotfound") || message.includes("not found") ? false : null };
          }
        }));
      } else apps.forEach((app) => { detected[app.id] = { installed: null }; });
      if (active) { setConnections(connectionRows); setTengesaStores(storeRows); setInstallation(detected); setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [user?.uid]);

  const totals = useMemo(() => {
    const murimi = connections.filter((connection) => connection.status !== "expired");
    const currencies = [...new Set(murimi.map((item) => item.snapshot.business.currency))];
    if (!murimi.length || currencies.length !== 1) return null;
    return { currency: currencies[0], revenue: murimi.reduce((sum, item) => sum + item.snapshot.performance.revenue, 0), expenses: murimi.reduce((sum, item) => sum + item.snapshot.performance.operatingExpenses, 0), farmCount: murimi.length };
  }, [connections]);
  const storeTotals = useMemo(() => {
    const totalsByCurrency = new Map<string, { sales: number; expenses: number; stores: number }>();
    for (const store of tengesaStores.filter((item) => item.connected)) {
      const current = totalsByCurrency.get(store.currency) ?? { sales: 0, expenses: 0, stores: 0 };
      current.sales += store.incomeMinor;
      current.expenses += store.expenseMinor;
      current.stores += 1;
      totalsByCurrency.set(store.currency, current);
    }
    return [...totalsByCurrency.entries()];
  }, [tengesaStores]);

  const openApp = async (app: AppDefinition) => {
    if (app.id === "murimi") router.push("/Business/Murimi" as never);
    else if (app.id === "tengesa") router.push("/Business/Tengesa" as never);
    else router.push("/Business/Transix" as never);
  };
  const onOpenInstalled = async (app: AppDefinition) => {
    try { await IntentLauncher.openApplication(app.packageName); }
    catch { setInfo({ ...app, detail: `${app.detail}\n\nFynage could not open this package on the device. Check that it is installed and try again.` }); }
  };
  const onFindApp = async (app: AppDefinition) => {
    try { await Linking.openURL(`https://play.google.com/store/apps/details?id=${encodeURIComponent(app.packageName)}`); }
    catch { setInfo({ ...app, detail: `${app.detail}\n\nFynage could not open the Play Store. Search for ${app.name} by Armament Ventures in your app store.` }); }
  };

  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}><View><ThemedText type="title">Business</ThemedText><ThemedText type="tiny" color={muted}>Your connected business finances</ThemedText></View><Ionicons name="briefcase-outline" size={25} color={accent} /></View>
    <View style={[styles.note, { backgroundColor: surface, borderColor: border }]}><Ionicons name="shield-checkmark-outline" size={20} color={accent} /><ThemedText style={styles.noteText} type="tiny" color={muted}>Business records stay with their source app. Fynage shows only information that an owner has securely shared.</ThemedText></View>
    {loading ? <ActivityIndicator color={accent} /> : apps.map((app) => {
      const appConnections = app.id === "murimi" ? connections : [];
      const appStores = app.id === "tengesa" ? tengesaStores : [];
      const connectedStores = appStores.filter((store) => store.connected);
      const install = installation[app.id] ?? { installed: null };
      const status = app.id === "tengesa" && connectedStores.length
        ? `${connectedStores.length} store${connectedStores.length === 1 ? "" : "s"} connected`
        : appConnections.length
        ? appConnections.some((item) => item.status === "sync_failed") ? "Sync needs attention · subscription not verified" : appConnections.some((item) => item.status === "expired") ? "Reconnect required · subscription not verified" : "Connected · subscription not verified"
        : install.installed ? "Installed · not connected" : install.installed === false ? "Not installed · not connected" : "Installation status unavailable";
      return <Pressable accessibilityRole="button" key={app.id} onPress={() => void openApp(app)} style={[styles.appCard, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.appCardTop}>
          <View style={[styles.appIcon, { backgroundColor: "#e5efe8" }]}>{install.iconData ? <Image source={{ uri: install.iconData }} style={styles.actualIcon} /> : <Ionicons name={app.icon} size={23} color={accent} />}</View>
          <View style={styles.appTitle}><ThemedText type="defaultSemiBold" color={text}>{app.name}</ThemedText><ThemedText type="tiny" color={muted}>{app.description}</ThemedText></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`About ${app.name}`} hitSlop={12} onPress={(event) => { event.stopPropagation(); setInfo(app); }} style={styles.infoButton}><Ionicons name="information-circle-outline" size={23} color={accent} /></Pressable>
        </View>
        <View style={styles.statusLine}><View style={[styles.dot, { backgroundColor: appConnections.length ? "#25834e" : install.installed ? "#c28725" : "#89928c" }]} /><ThemedText type="tiny" color={muted}>{status}</ThemedText><ThemedText style={styles.appArrow} color={accent}>View finances ›</ThemedText></View>
        <ThemedText type="tiny" color={muted}>On this device: {install.installed === true ? "Installed" : install.installed === false ? "Not installed" : "Installation status unavailable"}</ThemedText>
        {app.id === "murimi" && appConnections.length > 0 ? <View style={[styles.summary, { borderTopColor: border }]}><ThemedText type="tiny" color={muted}>{appConnections.length} {appConnections.length === 1 ? "farm" : "farms"} · {totals ? `${money(totals.revenue, totals.currency)} recorded income` : "Financial snapshots connected"}</ThemedText>{totals ? <ThemedText type="tiny" color={muted}>{money(totals.expenses, totals.currency)} recorded expenses</ThemedText> : null}</View>
          : app.id === "tengesa" && connectedStores.length > 0 ? <View style={[styles.summary, { borderTopColor: border }]}><ThemedText type="tiny" color={muted}>{connectedStores.length} connected store{connectedStores.length === 1 ? "" : "s"} · subscription access is checked per store</ThemedText>{storeTotals.map(([currency, summary]) => <ThemedText key={currency} type="tiny" color={muted}>{currency}: {money(summary.sales / 100, currency)} posted sales · {money(summary.expenses / 100, currency)} posted expenses ({summary.stores} store{summary.stores === 1 ? "" : "s"})</ThemedText>)}</View>
          : <View style={[styles.summary, { borderTopColor: border }]}><ThemedText type="tiny" color={muted}>{app.id === "tengesa" ? "Connect a store to view its authorized financial summary." : app.available ? "Connect a business to view its financial summary." : "Integration will be added later."}</ThemedText></View>}
        {install.installed && <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); void onOpenInstalled(app); }} style={styles.openApp}><Ionicons name="open-outline" size={15} color={accent} /><ThemedText type="tiny" color={accent}>Open {app.name}</ThemedText></Pressable>}
        {Platform.OS === "android" && install.installed === false && app.available && <Pressable accessibilityRole="button" onPress={(event) => { event.stopPropagation(); void onFindApp(app); }} style={styles.openApp}><Ionicons name="download-outline" size={15} color={accent} /><ThemedText type="tiny" color={accent}>Check Play Store</ThemedText></Pressable>}
      </Pressable>;
    })}
    {totals && <ThemedText type="tiny" color={muted}>Murimi values are source-reported totals. They are not added to your personal net worth until cash ownership and internal transfers can be reconciled.</ThemedText>}
  </ScrollView><Modal visible={!!info} transparent animationType="fade" onRequestClose={() => setInfo(null)}><Pressable style={styles.modalBackdrop} onPress={() => setInfo(null)}><Pressable onPress={(event) => event.stopPropagation()} style={[styles.modalCard, { backgroundColor: surface }]}><View style={styles.modalHead}><ThemedText type="subtitle">{info?.name}</ThemedText><Pressable accessibilityRole="button" accessibilityLabel="Close information" onPress={() => setInfo(null)}><Ionicons name="close" size={22} color={text} /></Pressable></View><ThemedText color={muted}>{info?.detail}</ThemedText><Pressable style={[styles.modalButton, { backgroundColor: accent }]} onPress={() => { const app = info; setInfo(null); if (app) void openApp(app); }}><ThemedText color="#fff" type="defaultSemiBold">View {info?.name}</ThemedText></Pressable></Pressable></Pressable></Modal></ScreenWrapper>;
}

const styles = StyleSheet.create({
  page: { padding: 18, paddingBottom: 36, gap: 14 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }, note: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 }, noteText: { flex: 1 }, appCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 }, appCardTop: { flexDirection: "row", alignItems: "center", gap: 11 }, appIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" }, actualIcon: { width: 29, height: 29, borderRadius: 7 }, appTitle: { flex: 1, gap: 2 }, infoButton: { padding: 3 }, statusLine: { flexDirection: "row", alignItems: "center", gap: 7 }, dot: { width: 8, height: 8, borderRadius: 4 }, appArrow: { marginLeft: "auto" }, summary: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, gap: 3 }, openApp: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" }, modalBackdrop: { flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: 20 }, modalCard: { borderRadius: 18, padding: 18, gap: 15 }, modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalButton: { minHeight: 46, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
