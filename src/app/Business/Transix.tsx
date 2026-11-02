import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function TransixBusiness() {
  const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border");
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={accent} /><ThemedText color={accent}>Business</ThemedText></Pressable>
    <View style={styles.header}><View><ThemedText type="title">Transix</ThemedText><ThemedText type="tiny" color={muted}>Transport and logistics</ThemedText></View><Ionicons name="car-outline" size={27} color={accent} /></View>
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}><Ionicons name="time-outline" size={22} color={accent} /><View style={styles.copy}><ThemedText type="defaultSemiBold">Integration is planned for later</ThemedText><ThemedText type="tiny" color={muted}>Transix remains a separate logistics application. Its financial data is not connected to Fynage in this stage.</ThemedText></View></View>
  </ScrollView></ScreenWrapper>;
}
const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 36, gap: 14 }, back: { flexDirection: "row", alignItems: "center", gap: 6 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, card: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }, copy: { flex: 1, gap: 7 } });
