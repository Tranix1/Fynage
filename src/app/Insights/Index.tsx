import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { calculateMonthlyMovement } from "@/services/finance/calculations";
import { useThemeColor } from "@/hooks/useThemeColor";

const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const month = new Date().toISOString().slice(0, 7);

export default function InsightsIndex() {
  const { activeAccountId } = useAuth(); const { records } = useFinancialRecords();
  const accent = useThemeColor("accent"); const muted = useThemeColor("textlight"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border");
  const visible = records.filter((record) => !record.deletedAt && record.classificationStatus !== "dismissed" && record.classificationStatus !== "potential_duplicate" && record.classificationStatus !== "unreviewed");
  const currencies = useMemo(() => [...new Set(["USD", ...visible.map((record) => record.currency)])], [visible]);
  const summaries = useMemo(() => currencies.map((currency) => {
    const summary = calculateMonthlyMovement(visible, month, currency);
    const categories = new Map<string, number>();
    visible.filter((record) => record.currency === currency && record.occurredAt.slice(0, 7) === month && record.direction === "out" && record.type === "expense").forEach((record) => categories.set(record.category || "Uncategorized", (categories.get(record.category || "Uncategorized") ?? 0) + record.amountMinor));
    return { currency, summary, categories: [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5) };
  }), [visible, currencies]);
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}><View><ThemedText type="title">Insights</ThemedText><ThemedText type="tiny" color={muted}>Personal finances · {new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</ThemedText></View><Ionicons name="analytics-outline" size={25} color={accent} /></View>
    {summaries.map(({ currency, summary, categories }) => <View key={currency} style={[styles.card, { backgroundColor: surface, borderColor: border }]}><ThemedText type="subtitle">{currency}</ThemedText><Metric label="Income" value={money(summary.income, currency)} /><Metric label="Expenses" value={money(summary.expenses, currency)} /><Metric label="Net cash movement" value={money(summary.net, currency)} /><ThemedText type="defaultSemiBold">Top spending categories</ThemedText>{categories.length ? categories.map(([name, value]) => <Metric key={name} label={name} value={money(value, currency)} />) : <ThemedText type="tiny" color={muted}>No categorized expense transactions this month.</ThemedText>}</View>)}
    <ThemedText type="tiny" color={muted}>These figures use saved personal Fynage records for {activeAccountId ? "the selected personal account" : "your personal account"}. Connected businesses remain separate until their records and transfers can be consolidated reliably.</ThemedText>
  </ScrollView></ScreenWrapper>;
}
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><ThemedText type="tiny">{label}</ThemedText><ThemedText type="defaultSemiBold">{value}</ThemedText></View>; }
const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 36, gap: 14 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 9 }, metric: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 4 } });
