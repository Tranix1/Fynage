import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import type { FinancialAccount, FinancialRecord } from "@/types/finance";
import type { AssetRecord } from "@/types/assets";
import { buildNetWorthHistory, type HistoryRange, type NetWorthBusinessHistory, type NetWorthSnapshot, type NetWorthSupplementalHistory } from "@/services/finance/netWorthHistory";

type Props = { uid?: string; currency: string; records: FinancialRecord[]; accounts: FinancialAccount[]; assets: AssetRecord[]; businessHistories: NetWorthBusinessHistory[]; supplementalHistory: NetWorthSupplementalHistory[]; currentNetWorthMinor: number };
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const STORAGE_KEY = (uid: string) => `fynage.networth.history.expanded.${uid}`;

export default function NetWorthHistory({ uid, currency, records, accounts, assets, businessHistories, supplementalHistory, currentNetWorthMinor }: Props) {
  const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const accent = useThemeColor("accent"); const text = useThemeColor("text"); const muted = useThemeColor("textlight"); const income = useThemeColor("moneyIn"); const expense = useThemeColor("expense"); const selection = useThemeColor("selection");
  const [expanded, setExpanded] = useState(false); const [range, setRange] = useState<HistoryRange>("monthly"); const [selectedDate, setSelectedDate] = useState(today()); const [calendarMonth, setCalendarMonth] = useState(`${today().slice(0, 7)}-01`); const [dateInput, setDateInput] = useState(today()); const [dateError, setDateError] = useState("");
  useEffect(() => { if (!uid) return; let active = true; void AsyncStorage.getItem(STORAGE_KEY(uid)).then((value) => { if (active && value === "true") setExpanded(true); }).catch(() => undefined); return () => { active = false; }; }, [uid]);
  const historyInput = useMemo(() => ({ uid: uid ?? "", currency, records, accounts, assets, businessHistories, supplementalHistory, currentNetWorthMinor }), [uid, currency, records, accounts, assets, businessHistories, supplementalHistory, currentNetWorthMinor]);
  const points = useMemo(() => expanded && uid ? buildNetWorthHistory({ ...historyInput, range }) : [], [expanded, uid, historyInput, range]);
  const availablePoints = points.filter((point) => point.date <= today());
  const currentPoint = availablePoints.find((point) => point.date === selectedDate) ?? availablePoints.at(-1);
  const previousPoint = currentPoint ? [...availablePoints].reverse().find((point) => point.date < currentPoint.date) : undefined;
  const change = currentPoint && previousPoint ? currentPoint.netWorthMinor - previousPoint.netWorthMinor : undefined;
  const changePercent = change !== undefined && previousPoint?.netWorthMinor ? (change / Math.abs(previousPoint.netWorthMinor)) * 100 : undefined;
  const firstDate = availablePoints[0]?.date;
  const calendarStart = useMemo(() => { const first = new Date(`${calendarMonth}T12:00:00`); first.setDate(1 - first.getDay()); return first; }, [calendarMonth]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => { const date = new Date(calendarStart); date.setDate(calendarStart.getDate() + index); return date; }), [calendarStart]);
  const values = availablePoints.map((point) => point.netWorthMinor); const minimum = Math.min(0, ...values); const maximum = Math.max(0, ...values); const span = Math.max(1, maximum - minimum);
  const toggle = () => { const next = !expanded; setExpanded(next); if (uid) void AsyncStorage.setItem(STORAGE_KEY(uid), String(next)).catch(() => undefined); };
  const selectDay = (inputDay: string) => {
    if (firstDate && inputDay < firstDate) return;
    const day = range === "daily" ? inputDay : range === "yearly" ? `${inputDay.slice(0, 4)}-12-31` : dateKey(new Date(Number(inputDay.slice(0, 4)), Number(inputDay.slice(5, 7)), 0));
    const effectiveDay = day > today() ? today() : day;
    setSelectedDate(effectiveDay); setDateInput(effectiveDay);
  };
  const jump = (amount: number) => {
    const date = new Date(`${selectedDate}T12:00:00`);
    if (range === "monthly" || range === "all-time") date.setMonth(date.getMonth() + amount, 1);
    else if (range === "yearly") date.setFullYear(date.getFullYear() + amount, 0, 1);
    else date.setDate(date.getDate() + amount);
    selectDay(dateKey(date));
  };
  const chooseInputDate = () => {
    const parsedDate = new Date(`${dateInput}T12:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput) || !Number.isFinite(parsedDate.getTime()) || dateKey(parsedDate) !== dateInput) { setDateError("Enter a real date as YYYY-MM-DD."); return; }
    if (firstDate && dateInput < firstDate) { setDateError(`History starts ${firstDate}; earlier positions are not available.`); return; }
    setDateError(""); setCalendarMonth(`${dateInput.slice(0, 7)}-01`); selectDay(dateInput);
  };
  const currentPointDate = currentPoint?.date;
  const selectedPeriod = range === "monthly" || range === "all-time" ? currentPointDate?.slice(0, 7) : range === "yearly" ? currentPointDate?.slice(0, 4) : currentPointDate;
  const periodActivity = currentPoint;
  const assetActivity = currentPoint;
  const calendarTitle = new Date(`${calendarMonth}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const onSelectPoint = (point: NetWorthSnapshot) => { setSelectedDate(point.date); setDateInput(point.date); setCalendarMonth(`${point.date.slice(0, 7)}-01`); };

  return <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={toggle} style={styles.header}>
      <View style={styles.headingCopy}><ThemedText type="defaultSemiBold">Net Worth History</ThemedText><ThemedText type="tiny" color={muted}>View how your money has changed over time</ThemedText></View>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={accent} />
    </Pressable>
    {expanded && <View style={styles.body}>
      <View style={styles.ranges}>{(["daily", "monthly", "yearly", "all-time"] as HistoryRange[]).map((item) => <Pressable key={item} onPress={() => { setRange(item); const date = new Date(`${selectedDate}T12:00:00`); const bucketEnd = item === "daily" ? selectedDate : item === "yearly" ? `${selectedDate.slice(0, 4)}-12-31` : dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)); const target = bucketEnd > today() ? today() : bucketEnd; setSelectedDate(target); setDateInput(target); }} style={[styles.rangeButton, { borderColor: item === range ? accent : border, backgroundColor: item === range ? selection : surface }]}><ThemedText type="tiny" color={item === range ? accent : muted}>{item === "all-time" ? "All time" : item[0].toUpperCase() + item.slice(1)}</ThemedText></Pressable>)}</View>
      {!availablePoints.length ? <View style={styles.empty}><Ionicons name="analytics-outline" size={25} color={muted} /><ThemedText type="defaultSemiBold">No historical balances yet</ThemedText><ThemedText type="tiny" color={muted}>Add an opening balance and dated financial records to build your history. No values are estimated for dates before your records begin.</ThemedText></View> : <>
        <View style={styles.chartHeader}><View><ThemedText type="tiny" color={muted}>CLOSING NET WORTH</ThemedText><ThemedText type="subtitle" style={{ color: text }}>{money(currentPoint?.netWorthMinor ?? 0, currency)}</ThemedText></View><View style={styles.chartNav}><Pressable accessibilityLabel="Previous period" onPress={() => jump(-1)}><Ionicons name="chevron-back" size={21} color={text} /></Pressable><ThemedText type="tiny">{selectedPeriod ?? ""}</ThemedText><Pressable accessibilityLabel="Next period" onPress={() => jump(1)} disabled={selectedDate >= today()}><Ionicons name="chevron-forward" size={21} color={selectedDate >= today() ? muted : text} /></Pressable></View></View>
        {values.length > 1 ? <FlatList horizontal data={availablePoints} keyExtractor={(point) => point.date} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chart} style={styles.chartList} initialNumToRender={20} maxToRenderPerBatch={20} windowSize={5} getItemLayout={(_, index) => ({ length: 31, offset: 31 * index, index })} extraData={currentPoint?.date} renderItem={({ item: point }) => { const height = Math.max(4, Math.abs(point.netWorthMinor) / span * 94); const bottom = point.netWorthMinor >= 0 ? (0 - minimum) / span * 94 : (point.netWorthMinor - minimum) / span * 94; const isSelected = point.date === currentPoint?.date; return <Pressable accessibilityRole="button" accessibilityLabel={`${point.date}: ${money(point.netWorthMinor, currency)}${point.carriedForward ? ", carried forward" : ""}`} onPress={() => onSelectPoint(point)} style={styles.barColumn}><View style={[styles.plot, { height: 104 }]}><View style={[styles.bar, { height, bottom, backgroundColor: isSelected ? accent : point.carriedForward ? border : income }]} /></View><ThemedText type="tiny" color={isSelected ? accent : muted}>{point.date.slice(range === "yearly" ? 0 : 5, range === "daily" ? 10 : 7)}</ThemedText></Pressable>; }} /> : <ThemedText type="tiny" color={muted}>Record balances in more than one period to compare history. This point shows the recorded closing value.</ThemedText>}
        <ThemedText type="tiny" color={muted}>Dated Fynage records and available business snapshots · grey bars carry forward unchanged balances.</ThemedText>
        <View style={[styles.snapshot, { borderColor: border }]}>
          <View style={styles.snapshotHeading}><ThemedText type="defaultSemiBold">{range === "daily" ? "Daily" : range === "yearly" ? "Year-end" : "Month-end"} snapshot · {currentPoint?.date}</ThemedText><Pressable accessibilityRole="button" onPress={() => { setCalendarMonth(`${selectedDate.slice(0, 7)}-01`); setDateError(""); }}><ThemedText type="tiny" color={accent}>Choose date</ThemedText></Pressable></View>
          <Line label="Net worth" value={currentPoint?.netWorthMinor ?? 0} currency={currency} strong />
          {change !== undefined && <Line label="Change vs previous period" value={change} currency={currency} note={changePercent === undefined ? undefined : `${changePercent.toFixed(1)}%`} />}
          <Line label="Cash and bank" value={currentPoint?.cashMinor ?? 0} currency={currency} />
          <Line label="Physical assets" value={currentPoint?.physicalAssetsMinor ?? 0} currency={currency} />
          <Line label="Other financial assets" value={currentPoint?.otherFinancialAssetsMinor ?? 0} currency={currency} />
          <Line label="Outstanding loan liabilities" value={currentPoint?.liabilitiesMinor ?? 0} currency={currency} />
          <Line label="Income this period" value={periodActivity?.incomeMinor ?? currentPoint?.incomeMinor ?? 0} currency={currency} color={income} />
          <Line label="Expenses this period" value={-(periodActivity?.expensesMinor ?? currentPoint?.expensesMinor ?? 0)} currency={currency} color={expense} />
          <Line label="Internal transfers (no net worth change)" value={periodActivity?.transfersMinor ?? currentPoint?.transfersMinor ?? 0} currency={currency} />
          <Line label="Asset purchases" value={periodActivity?.assetPurchasesMinor ?? currentPoint?.assetPurchasesMinor ?? 0} currency={currency} />
          <Line label="Asset disposal proceeds" value={periodActivity?.assetDisposalsMinor ?? currentPoint?.assetDisposalsMinor ?? 0} currency={currency} />
          <Line label="Loan movements" value={periodActivity?.loanMovementsMinor ?? currentPoint?.loanMovementsMinor ?? 0} currency={currency} />
          <Line label="Asset valuation adjustments" value={assetActivity?.assetValuationAdjustmentsMinor ?? currentPoint?.assetValuationAdjustmentsMinor ?? 0} currency={currency} />
          <Line label="Depreciation recorded" value={-(assetActivity?.depreciationMinor ?? currentPoint?.depreciationMinor ?? 0)} currency={currency} />
          {currentPoint?.businessBreakdown.map((business) => <Line key={business.name} label={`${business.name} contribution`} value={business.netWorthMinor} currency={currency} />)}
        </View>
        <View style={[styles.calendar, { borderColor: border }]}>
          <View style={styles.snapshotHeading}><ThemedText type="defaultSemiBold">Select any date</ThemedText><View style={styles.chartNav}><Pressable onPress={() => setCalendarMonth((month) => { const date = new Date(`${month}T12:00:00`); date.setMonth(date.getMonth() - 1); return `${dateKey(date).slice(0, 7)}-01`; })}><Ionicons name="chevron-back" size={19} color={text} /></Pressable><ThemedText type="tiny">{calendarTitle}</ThemedText><Pressable onPress={() => setCalendarMonth((month) => { const date = new Date(`${month}T12:00:00`); date.setMonth(date.getMonth() + 1); return `${dateKey(date).slice(0, 7)}-01`; })}><Ionicons name="chevron-forward" size={19} color={text} /></Pressable></View></View>
          <View style={styles.calendarGrid}>{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <ThemedText key={`${day}${index}`} type="tiny" style={styles.dayCell} color={muted}>{day}</ThemedText>)}{days.map((date) => { const key = dateKey(date); const inMonth = key.slice(0, 7) === calendarMonth.slice(0, 7); const unavailable = Boolean(firstDate && key < firstDate) || key > today(); return <Pressable key={key} disabled={unavailable} onPress={() => selectDay(key)} style={[styles.dayCell, key === selectedDate && { backgroundColor: selection, borderRadius: 16 }]}><ThemedText type="tiny" color={unavailable || !inMonth ? muted : key === selectedDate ? accent : text}>{date.getDate()}</ThemedText></Pressable>; })}</View>
          <View style={styles.dateControls}><TextInput value={dateInput} onChangeText={setDateInput} placeholder="YYYY-MM-DD" accessibilityLabel="Date YYYY-MM-DD" style={[styles.dateInput, { borderColor: border, color: text, backgroundColor: surface }]} /><Pressable onPress={chooseInputDate} style={[styles.smallButton, { backgroundColor: selection }]}><ThemedText type="tiny" color={accent}>Go</ThemedText></Pressable><Pressable onPress={() => { if (firstDate) selectDay(firstDate); }} style={[styles.smallButton, { backgroundColor: selection }]}><ThemedText type="tiny" color={accent}>Earliest</ThemedText></Pressable><Pressable onPress={() => selectDay(today())} style={[styles.smallButton, { backgroundColor: selection }]}><ThemedText type="tiny" color={accent}>Today</ThemedText></Pressable></View>
          {dateError ? <ThemedText type="tiny" color={expense}>{dateError}</ThemedText> : null}
        </View>
        <ThemedText type="tiny" color={muted}>Platform values are shown from their recorded dates. Murimi history starts when its farm snapshot was first recorded in Fynage; older snapshots that were never retained cannot be reconstructed. Tengesa uses dated posted ledger entries. Transix is not connected to this history source yet.</ThemedText>
      </>}
    </View>}
  </View>;
}

function Line({ label, value, currency, strong, color, note }: { label: string; value: number; currency: string; strong?: boolean; color?: string; note?: string }) {
  return <View style={styles.line}><ThemedText type={strong ? "defaultSemiBold" : "tiny"}>{label}</ThemedText><View style={styles.lineValue}><ThemedText type={strong ? "defaultSemiBold" : "tiny"} style={color ? { color } : undefined}>{money(value, currency)}</ThemedText>{note ? <ThemedText type="tiny" color="#657184">{note}</ThemedText> : null}</View></View>;
}
const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 14, overflow: "hidden" }, header: { minHeight: 66, paddingHorizontal: 15, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, headingCopy: { flex: 1, gap: 4 }, body: { paddingHorizontal: 13, paddingBottom: 14, gap: 13 }, ranges: { flexDirection: "row", gap: 6 }, rangeButton: { flex: 1, minHeight: 34, paddingHorizontal: 4, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" }, empty: { paddingVertical: 20, alignItems: "center", gap: 8 }, chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, chartNav: { flexDirection: "row", alignItems: "center", gap: 8 }, chart: { alignItems: "flex-end", gap: 4, paddingVertical: 4, minHeight: 137 }, chartList: { minHeight: 137 }, barColumn: { width: 27, marginRight: 4, alignItems: "center", gap: 4 }, plot: { width: 21, justifyContent: "flex-end", alignItems: "center" }, bar: { position: "absolute", width: 13, borderRadius: 6 }, snapshot: { borderTopWidth: 1, paddingTop: 11, gap: 8 }, snapshotHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, line: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 4 }, lineValue: { alignItems: "flex-end", gap: 2 }, calendar: { borderTopWidth: 1, paddingTop: 11, gap: 10 }, calendarGrid: { flexDirection: "row", flexWrap: "wrap" }, dayCell: { width: `${100 / 7}%`, height: 32, textAlign: "center", textAlignVertical: "center", alignItems: "center", justifyContent: "center", paddingTop: 8 }, dateControls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }, dateInput: { flexGrow: 1, minWidth: 115, minHeight: 36, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8 }, smallButton: { minHeight: 36, paddingHorizontal: 9, borderRadius: 8, alignItems: "center", justifyContent: "center" } });
