import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

const links = [
  { title: "Personal accounts", subtitle: "Cash, mobile money and bank balances", icon: "wallet-outline" as const, route: "/Account/Accounts" },
  { title: "Business connections", subtitle: "Connect or review Murimi and other apps", icon: "git-network-outline" as const, route: "/Business/Index" },
  { title: "Team access", subtitle: "Invite or revoke business members", icon: "people-outline" as const, route: "/Business/Members" },
  { title: "Subscription & referrals", subtitle: "Shared access, renewal and credits", icon: "ribbon-outline" as const, route: "/Subscription" },
  { title: "About Fynage", subtitle: "Application information", icon: "information-circle-outline" as const, route: "/About" },
];

export default function MoreIndex() {
  const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border");
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}><View><ThemedText type="title">More</ThemedText><ThemedText type="tiny" color={muted}>Accounts and settings</ThemedText></View><Ionicons name="ellipsis-horizontal-circle-outline" size={25} color={accent} /></View>
    {links.map((item) => <Pressable key={item.title} accessibilityRole="button" onPress={() => router.push(item.route as never)} style={[styles.row, { backgroundColor: surface, borderColor: border }]}><Ionicons name={item.icon} size={22} color={accent} /><View style={styles.copy}><ThemedText type="defaultSemiBold">{item.title}</ThemedText><ThemedText type="tiny" color={muted}>{item.subtitle}</ThemedText></View><Ionicons name="chevron-forward" size={18} color={muted} /></Pressable>)}
  </ScrollView></ScreenWrapper>;
}
const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 36, gap: 13 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }, row: { minHeight: 66, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 }, copy: { flex: 1, gap: 3 } });
