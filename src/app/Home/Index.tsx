import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { archiveFinancialCategory, listFinancialCategories, mergePotentialDuplicate, saveFinancialCategory } from "@/repositories/financialRecords";
import { explainSmsAccess, importRecentFinancialSms } from "@/services/sms/smsImport";
import { calculateEstimatedNetWorth, calculateMonthlyMovement } from "@/services/finance/calculations";
import { ThemedText } from "@/components/ThemedText";
import ScreenWrapper from "@/components/ScreenWrapper";
import type { FinancialCategoryWithSync, FinancialRecordWithSync, TransactionDirection, TransactionKind } from "@/types/finance";

type ViewMode = "overview" | "history" | "review";
const monthKey = (value: string) => value.slice(0, 7);
const displayMonth = (value: string) => new Date(`${value}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const formatMoney = (minor: number, currency = "USD") => `${currency} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newDate = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const typeLabel: Record<TransactionKind, string> = { expense: "Expense", fixed_asset: "Fixed asset", investment: "Investment", income: "Income", loan_received: "Loan received", loan_repayment: "Loan repayment", transfer: "Transfer", other: "Other" };

export default function Home() {
  const { user, activeAccountName, activeAccountId } = useAuth();
  const { records, save, remove, sync, refresh } = useFinancialRecords();
  const uid = user?.uid; const scope = activeAccountId ?? "personal";
  const [mode, setMode] = useState<ViewMode>("overview");
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date().toISOString()));
  const [expandedMonth, setExpandedMonth] = useState(monthKey(new Date().toISOString()));
  const [direction, setDirection] = useState<TransactionDirection>("out");
  const [cashFlow, setCashFlow] = useState<"in" | "out">("out");
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [amount, setAmount] = useState(""); const [description, setDescription] = useState(""); const [category, setCategory] = useState("");
  const [currency, setCurrency] = useState("USD"); const [summaryCurrency, setSummaryCurrency] = useState("USD");
  const [occurredAt, setOccurredAt] = useState(newDate()); const [account, setAccount] = useState(""); const [counterparty, setCounterparty] = useState(""); const [reference, setReference] = useState(""); const [notes, setNotes] = useState("");
  const [principal, setPrincipal] = useState(""); const [interest, setInterest] = useState(""); const [fees, setFees] = useState(""); const [assetValue, setAssetValue] = useState(""); const [liability, setLiability] = useState("");
  const [editing, setEditing] = useState<FinancialRecordWithSync | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [categoryEditId, setCategoryEditId] = useState<string | undefined>();
  const [categories, setCategories] = useState<FinancialCategoryWithSync[]>([]);
  const [search, setSearch] = useState(""); const [filterDirection, setFilterDirection] = useState<"all" | TransactionDirection>("all");
  const [filterKind, setFilterKind] = useState<"all" | TransactionKind>("all");
  const [filterCategory, setFilterCategory] = useState("all"); const [filterAccount, setFilterAccount] = useState("all"); const [filterSource, setFilterSource] = useState<"all" | "manual" | "sms">("all");
  const [importing, setImporting] = useState(false); const [smsEnabled, setSmsEnabled] = useState(false); const [notice, setNotice] = useState("");
  const [showSmsOffer, setShowSmsOffer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const submitting = useRef(false);

  const refreshCategories = async () => { if (uid) setCategories(await listFinancialCategories(uid, scope)); };
  useEffect(() => {
    if (!uid) return;
    let active = true;
    void listFinancialCategories(uid, scope).then((nextCategories) => { if (active) setCategories(nextCategories); }).catch(() => undefined);
    return () => { active = false; };
  }, [uid, scope]);
  useEffect(() => {
    if (!uid) return;
    void Promise.all([AsyncStorage.getItem(`fynage_sms_enabled_${uid}`), AsyncStorage.getItem(`fynage_sms_offer_dismissed_${uid}`)]).then(([enabledValue, dismissed]) => {
      const enabled = enabledValue === "true" && Platform.OS === "android"; setSmsEnabled(enabled);
      setShowSmsOffer(Platform.OS === "android" && !enabled && dismissed !== "true");
    });
  }, [uid, scope]);

  useEffect(() => {
    if (!uid || !smsEnabled || Platform.OS !== "android") return;
    const poll = async () => {
      if (AppState.currentState !== "active") return;
      try {
        const key = `fynage_sms_cursor_${uid}`;
        const stored = await AsyncStorage.getItem(key);
        const since = stored ? Math.max(Date.now() - 365 * 24 * 60 * 60 * 1000, Number(stored) - 120000) : Date.now() - 7 * 24 * 60 * 60 * 1000;
        const result = await importRecentFinancialSms(uid, scope, false, false, since);
        await AsyncStorage.setItem(key, String(Math.max(since, result.newestDate)));
        if (result.imported) await refresh();
      } catch {
        setNotice("SMS access is unavailable. Re-enable permission in Android settings or continue with manual entry.");
      }
    };
    const timer = setInterval(() => { void poll(); }, 120000);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void poll(); });
    void poll();
    return () => { clearInterval(timer); subscription.remove(); };
  }, [uid, scope, smsEnabled, refresh]);

  const activeRecords = useMemo(() => records.filter((record) => record.classificationStatus !== "dismissed" && record.classificationStatus !== "potential_duplicate" && record.classificationStatus !== "unreviewed"), [records]);
  const currencies = useMemo(() => [...new Set(["USD", ...activeRecords.map((record) => record.currency)])].sort(), [activeRecords]);
  const monthRecords = useMemo(() => activeRecords.filter((record) => monthKey(record.occurredAt) === selectedMonth && record.currency === summaryCurrency), [activeRecords, selectedMonth, summaryCurrency]);
  const monthTotals = useMemo(() => calculateMonthlyMovement(monthRecords, selectedMonth, summaryCurrency), [monthRecords, selectedMonth, summaryCurrency]);
  const groupedMonths = useMemo(() => {
    const groups = new Map<string, FinancialRecordWithSync[]>();
    for (const record of activeRecords) groups.set(monthKey(record.occurredAt), [...(groups.get(monthKey(record.occurredAt)) ?? []), record]);
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [activeRecords]);
  const filteredHistory = useMemo(() => activeRecords.filter((record) => {
    const query = search.trim().toLowerCase();
    const matchesText = !query || [record.description, record.category, record.counterparty, record.reference, record.notes].some((value) => value?.toLowerCase().includes(query));
    return matchesText
      && (filterDirection === "all" || record.direction === filterDirection)
      && (filterKind === "all" || record.type === filterKind)
      && (filterCategory === "all" || record.category === filterCategory)
      && (filterAccount === "all" || record.account === filterAccount)
      && (filterSource === "all" || record.source === filterSource);
  }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [activeRecords, search, filterDirection, filterKind, filterCategory, filterAccount, filterSource]);
  const accountFilters = useMemo(() => ["all", ...new Set(activeRecords.map((item) => item.account).filter((item): item is string => Boolean(item)))], [activeRecords]);
  const reviewRecords = useMemo(() => records.filter((record) => record.classificationStatus === "unreviewed" || record.classificationStatus === "potential_duplicate"), [records]);

  const clearForm = () => { setAmount(""); setDescription(""); setCategory(""); setOccurredAt(newDate()); setAccount(""); setCounterparty(""); setReference(""); setNotes(""); setPrincipal(""); setInterest(""); setFees(""); setAssetValue(""); setLiability(""); setEditing(null); setCategoryEditId(undefined); setShowForm(false); setKind(direction === "in" ? "income" : "expense"); };
  const handleSave = async () => {
    if (submitting.current) return;
    const value = Number(amount.replace(",", ".")); const dateValue = new Date(occurredAt);
    if (!Number.isFinite(value) || value <= 0 || !description.trim() || !Number.isFinite(dateValue.getTime())) { Alert.alert("Check the transaction", "Enter a positive amount, description, and valid date and time."); return; }
    if (!uid) { Alert.alert("Sign in required", "Sign in to save transactions to your private account."); return; }
    submitting.current = true;
    setIsSaving(true);
    try {
      const trimmedCategory = category.trim() || "Uncategorized";
      if (trimmedCategory !== "Uncategorized") { await saveFinancialCategory(uid, scope, trimmedCategory, categoryEditId); await refreshCategories(); }
      const prior = editing;
      await save({
        id: prior?.id ?? `fin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        type: kind, direction: kind === "transfer" ? "transfer" : direction,
        amountMinor: Math.round(value * 100), currency, category: trimmedCategory, description: description.trim(), occurredAt: dateValue.toISOString(),
        account: account.trim() || undefined, counterparty: counterparty.trim() || undefined, reference: reference.trim() || undefined, notes: notes.trim() || undefined,
        source: prior?.source ?? "manual", sourceApp: prior?.sourceApp ?? "fynage", sourceRecordId: prior?.sourceRecordId ?? prior?.id ?? undefined,
        sourceCollection: prior?.sourceCollection, sourceKey: prior?.sourceKey, sourceFingerprint: prior?.sourceFingerprint, sourceDetails: prior?.sourceDetails,
        classificationStatus: "reviewed", userEditedFields: prior?.source === "sms" ? [...new Set([...(prior.userEditedFields ?? []), "type", "direction", "category", "description", "occurredAt", "counterparty", "reference", "notes"])] : prior?.userEditedFields ?? [],
        principalMinor: principal ? Math.round(Number(principal) * 100) : prior?.principalMinor,
        interestMinor: interest ? Math.round(Number(interest) * 100) : prior?.interestMinor,
        feeMinor: fees ? Math.round(Number(fees) * 100) : prior?.feeMinor,
        assetValueMinor: assetValue ? Math.round(Number(assetValue) * 100) : prior?.assetValueMinor,
        liabilityMinor: liability ? Math.round(Number(liability) * 100) : prior?.liabilityMinor,
      });
      setSelectedMonth(monthKey(dateValue.toISOString())); setNotice("Saved on this device. Sync will continue when the network is available."); clearForm(); await refresh(); void sync(); setMode("overview");
    } catch (error) { Alert.alert("Could not save", error instanceof Error ? error.message : "Try again."); }
    finally { submitting.current = false; setIsSaving(false); }
  };

  const beginEdit = (record: FinancialRecordWithSync) => {
    setEditing(record); setCashFlow(record.direction === "in" ? "in" : "out"); setDirection(record.direction); setKind(record.type); setAmount((record.amountMinor / 100).toFixed(2)); setDescription(record.description); setCategory(record.category); setCurrency(record.currency);
    setOccurredAt(new Date(new Date(record.occurredAt).getTime() - new Date(record.occurredAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setAccount(record.account ?? ""); setCounterparty(record.counterparty ?? ""); setReference(record.reference ?? ""); setNotes(record.notes ?? ""); setShowForm(true); setMode(record.classificationStatus === "unreviewed" ? "review" : "overview");
    setPrincipal(record.principalMinor ? (record.principalMinor / 100).toFixed(2) : ""); setInterest(record.interestMinor ? (record.interestMinor / 100).toFixed(2) : ""); setFees(record.feeMinor ? (record.feeMinor / 100).toFixed(2) : ""); setAssetValue(record.assetValueMinor ? (record.assetValueMinor / 100).toFixed(2) : ""); setLiability(record.liabilityMinor ? (record.liabilityMinor / 100).toFixed(2) : "");
  };
  const importSms = async () => {
    if (!uid || Platform.OS !== "android") return;
    const accepted = await explainSmsAccess(); if (!accepted) return;
    setImporting(true); setNotice("Scanning available message history. Unrelated messages are not saved.");
    try {
      const result = await importRecentFinancialSms(uid, scope, true, true, undefined, (scanned, imported) => setNotice(`Scanned ${scanned} messages; ${imported} eligible transactions imported for review.`)); await AsyncStorage.setItem(`fynage_sms_enabled_${uid}`, "true"); setSmsEnabled(true); await refresh();
      await AsyncStorage.setItem(`fynage_sms_cursor_${uid}`, String(result.newestDate));
      setNotice(`${result.imported} imported for review, ${result.duplicates} already present, ${result.ignored} unrelated or unrecognized messages ignored. Available history may be shorter than 12 months.`); setMode("review");
    } catch (error) { setNotice(error instanceof Error ? error.message : "SMS import is unavailable. You can continue with manual entry."); }
    finally { setImporting(false); }
  };
  const changeMonth = (delta: number) => { const date = new Date(`${selectedMonth}-01T12:00:00`); date.setMonth(date.getMonth() + delta); setSelectedMonth(monthKey(date.toISOString())); };
  const saveCategoryEdits = async () => {
    if (!uid || !category.trim()) return;
    try { await saveFinancialCategory(uid, scope, category, categoryEditId); await refreshCategories(); setCategoryEditId(undefined); setNotice("Category saved for future transactions."); }
    catch (error) { Alert.alert("Category not saved", error instanceof Error ? error.message : "Try again."); }
  };

  const renderTransaction = (record: FinancialRecordWithSync) => <View key={record.id} style={styles.transaction}>
    <View style={[styles.directionMark, record.direction === "in" ? styles.inMark : record.direction === "out" ? styles.outMark : styles.transferMark]} />
    <View style={styles.transactionText}><ThemedText type="defaultSemiBold" numberOfLines={1}>{record.description}</ThemedText><ThemedText type="tiny">{new Date(record.occurredAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {record.category || "Uncategorized"}{record.account ? ` · ${record.account}` : ""}</ThemedText><ThemedText type="tiny" color="#66756e">{record.source === "sms" ? "SMS import" : "Manual"} · {record.syncStatus === "synced" ? "Synced" : record.syncStatus === "failed" ? "Sync failed" : "Saved locally"}</ThemedText></View>
    <ThemedText style={record.direction === "in" ? styles.incomeAmount : record.direction === "out" ? styles.expenseAmount : styles.transferAmount} type="defaultSemiBold">{record.direction === "out" ? "−" : record.direction === "in" ? "+" : "↔"}{formatMoney(record.amountMinor, record.currency)}</ThemedText>
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${record.description}`} onPress={() => beginEdit(record)} hitSlop={8}><Ionicons name="create-outline" size={19} color="#58675f" /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${record.description}`} onPress={() => Alert.alert("Delete transaction?", "This removes the record from your financial history.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void remove(record.id); } }])} hitSlop={8}><Ionicons name="trash-outline" size={18} color="#9b5348" /></Pressable>
  </View>;
  const types = cashFlow === "in" ? ["income", "loan_received", "other"] as const : ["expense", "fixed_asset", "investment", "loan_repayment", "transfer", "other"] as const;
  const controls = <View style={styles.segment}>{(["overview", "history", "review"] as const).map((item) => <Pressable key={item} onPress={() => { setEditing(null); setMode(item); }} style={[styles.segmentItem, mode === item && styles.segmentSelected]}><ThemedText style={mode === item ? styles.segmentSelectedText : undefined}>{item === "overview" ? "Overview" : item === "history" ? "History" : `Review${reviewRecords.length ? ` ${reviewRecords.length}` : ""}`}</ThemedText></Pressable>)}</View>;

  return <ScreenWrapper><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><View><ThemedText type="tiny">{activeAccountName ?? "Personal"} · MONEY</ThemedText><ThemedText type="title" style={styles.title}>Fynage</ThemedText></View><Pressable accessibilityRole="button" accessibilityLabel="Synchronize transactions" onPress={() => { void sync(); setNotice("Sync started. Records stay available on this device."); }} style={styles.iconButton}><Ionicons name="sync-outline" size={21} color="#214f3a" /></Pressable></View>
    {controls}{notice ? <Pressable onPress={() => setNotice("")} style={styles.notice}><ThemedText type="tiny">{notice}</ThemedText></Pressable> : null}
    {mode === "overview" && <>
      <View style={styles.netWorth}><View style={styles.summaryHead}><ThemedText type="tiny" color="#d5e7db">ESTIMATED NET WORTH · {summaryCurrency}</ThemedText><ThemedText type="tiny" color="#d5e7db">RECORDED ACTIVITY</ThemedText></View><ThemedText style={styles.netWorthValue}>{formatMoney(calculateEstimatedNetWorth(activeRecords, summaryCurrency), summaryCurrency)}</ThemedText><ThemedText type="tiny" color="#d5e7db">Opening balances are not recorded. Other currencies are shown separately.</ThemedText></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{currencies.map((item) => <Pressable key={item} onPress={() => setSummaryCurrency(item)} style={[styles.chip, summaryCurrency === item && styles.chipSelected]}><ThemedText>{item}</ThemedText></Pressable>)}</ScrollView>
      {showSmsOffer && <View style={styles.smsOffer}><View style={styles.offerText}><ThemedText type="defaultSemiBold">Import mobile money history</ThemedText><ThemedText type="tiny">Fynage looks for EcoCash/Econet money movements in up to 12 months of SMS still available on this phone. Deleted messages cannot be recovered; unknown formats are skipped. Unrelated messages are ignored and manual entry always works.</ThemedText></View><Pressable onPress={() => { void importSms(); }} style={styles.offerButton}><ThemedText style={styles.actionText}>Review import</ThemedText></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Dismiss SMS import offer" onPress={() => { setShowSmsOffer(false); if (uid) void AsyncStorage.setItem(`fynage_sms_offer_dismissed_${uid}`, "true"); }} hitSlop={8}><Ionicons name="close" size={20} color="#58675f" /></Pressable></View>}
      <View style={styles.monthNav}><Pressable onPress={() => changeMonth(-1)} hitSlop={12}><Ionicons name="chevron-back" size={21} color="#29463a" /></Pressable><ThemedText type="subtitle" style={styles.monthTitle}>{displayMonth(selectedMonth)}</ThemedText><Pressable onPress={() => changeMonth(1)} hitSlop={12}><Ionicons name="chevron-forward" size={21} color="#29463a" /></Pressable></View>
      <View style={styles.monthStats}><View style={styles.stat}><ThemedText type="tiny">MONEY IN</ThemedText><ThemedText style={styles.incomeAmount} type="defaultSemiBold">{formatMoney(monthTotals.moneyIn)}</ThemedText></View><View style={styles.stat}><ThemedText type="tiny">MONEY OUT</ThemedText><ThemedText style={styles.expenseAmount} type="defaultSemiBold">{formatMoney(monthTotals.moneyOut)}</ThemedText></View><View style={styles.stat}><ThemedText type="tiny">NET</ThemedText><ThemedText type="defaultSemiBold">{formatMoney(monthTotals.net)}</ThemedText></View><View style={styles.stat}><ThemedText type="tiny">P/L*</ThemedText><ThemedText type="defaultSemiBold">{formatMoney(monthTotals.profitLoss)}</ThemedText></View></View>
      <ThemedText type="tiny">* P/L includes classified income, operating expenses, and known loan interest/fees; it excludes transfers, assets, and investment principal.</ThemedText>
      <View style={styles.actions}><Pressable onPress={() => { clearForm(); setCashFlow("in"); setDirection("in"); setKind("income"); setShowForm(true); }} style={[styles.actionButton, styles.moneyIn]}><Ionicons name="arrow-down-outline" size={18} color="#fff" /><ThemedText style={styles.actionText}>Money in</ThemedText></Pressable><Pressable onPress={() => { clearForm(); setCashFlow("out"); setDirection("out"); setKind("expense"); setShowForm(true); }} style={[styles.actionButton, styles.moneyOut]}><Ionicons name="arrow-up-outline" size={18} color="#fff" /><ThemedText style={styles.actionText}>Money out</ThemedText></Pressable></View>
      {showForm && <View style={styles.form}><View style={styles.formHead}><ThemedText type="subtitle">{categoryEditId ? "Edit category" : editing ? "Edit transaction" : direction === "in" ? "Record money in" : "Record money out"}</ThemedText><Pressable onPress={clearForm}><Ionicons name="close" size={22} color="#53645a" /></Pressable></View>
        <TextInput value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="decimal-pad" style={styles.input} /><TextInput value={occurredAt} onChangeText={setOccurredAt} placeholder="Date and time (YYYY-MM-DDTHH:mm)" style={styles.input} /><TextInput value={description} onChangeText={setDescription} placeholder="Description or purpose" style={styles.input} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{["USD", "ZWG", "ZWL", "ZAR", "EUR"].map((item) => <Pressable key={item} onPress={() => setCurrency(item)} style={[styles.chip, currency === item && styles.chipSelected]}><ThemedText>{item}</ThemedText></Pressable>)}</ScrollView>
        <ThemedText type="tiny">TRANSACTION TYPE</ThemedText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{types.map((item) => <Pressable key={item} onPress={() => { setKind(item); setDirection(item === "transfer" ? "transfer" : cashFlow); }} style={[styles.chip, kind === item && styles.chipSelected]}><ThemedText>{typeLabel[item]}</ThemedText></Pressable>)}</ScrollView>
        <TextInput value={category} onChangeText={setCategory} placeholder="Category (or type a new one)" style={styles.input} />{categories.filter((item) => !item.archived).length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categories.filter((item) => !item.archived).map((item) => <Pressable key={item.id} onPress={() => setCategory(item.name)} style={[styles.chip, category === item.name && styles.chipSelected]}><ThemedText>{item.name}</ThemedText></Pressable>)}</ScrollView>}
        <View style={styles.inlineInputs}><TextInput value={account} onChangeText={setAccount} placeholder="Account / method" style={[styles.input, styles.flexInput]} /><TextInput value={counterparty} onChangeText={setCounterparty} placeholder="Counterparty" style={[styles.input, styles.flexInput]} /></View><TextInput value={reference} onChangeText={setReference} placeholder="Reference (optional)" style={styles.input} /><TextInput value={notes} onChangeText={setNotes} placeholder="Notes (optional)" style={styles.input} />
        {(kind === "loan_repayment" || kind === "loan_received") && <><ThemedText type="tiny">LOAN BREAKDOWN (OPTIONAL)</ThemedText><View style={styles.inlineInputs}><TextInput value={principal} onChangeText={setPrincipal} placeholder="Principal" keyboardType="decimal-pad" style={[styles.input, styles.flexInput]} /><TextInput value={interest} onChangeText={setInterest} placeholder="Interest" keyboardType="decimal-pad" style={[styles.input, styles.flexInput]} /><TextInput value={fees} onChangeText={setFees} placeholder="Fees" keyboardType="decimal-pad" style={[styles.input, styles.flexInput]} /></View>{kind === "loan_received" && <TextInput value={liability} onChangeText={setLiability} placeholder="Outstanding liability (optional)" keyboardType="decimal-pad" style={styles.input} />}</>}
        {(kind === "fixed_asset" || kind === "investment") && <TextInput value={assetValue} onChangeText={setAssetValue} placeholder="Current asset value (optional)" keyboardType="decimal-pad" style={styles.input} />}
        {categoryEditId ? <Pressable onPress={() => void saveCategoryEdits()} style={styles.saveButton}><ThemedText style={styles.actionText}>Save category name</ThemedText></Pressable> : <><Pressable onPress={() => void saveCategoryEdits()} style={styles.textAction}><ThemedText color="#216b4b">Save typed category for later</ThemedText></Pressable><Pressable disabled={isSaving} onPress={() => void handleSave()} style={styles.saveButton}><ThemedText style={styles.actionText}>{editing ? "Save changes" : "Save on this device"}</ThemedText></Pressable></>}
      </View>}
      <View style={styles.sectionHeading}><ThemedText type="subtitle">Monthly history</ThemedText><ThemedText type="tiny">{groupedMonths.length} months</ThemedText></View>
      {!groupedMonths.length ? <ThemedText style={styles.empty}>No transactions yet. Enter history manually or import eligible SMS messages.</ThemedText> : groupedMonths.map(([month, monthItems]) => {
        const totals = monthItems.reduce((sum, item) => { if (item.direction === "in") sum.in += item.amountMinor; if (item.direction === "out") sum.out += item.amountMinor; return sum; }, { in: 0, out: 0 }); const expanded = expandedMonth === month;
        return <View key={month}><Pressable onPress={() => { setExpandedMonth(expanded ? "" : month); setSelectedMonth(month); }} style={styles.monthSectionHead}><View><ThemedText type="defaultSemiBold">{displayMonth(month)}</ThemedText><ThemedText type="tiny">{monthItems.length} transactions</ThemedText></View><View style={styles.monthAmount}><ThemedText type="tiny" color="#216b4b">+{formatMoney(totals.in)}</ThemedText><ThemedText type="tiny" color="#9b5348">−{formatMoney(totals.out)}</ThemedText></View><Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={19} color="#53645a" /></Pressable>{expanded && [...monthItems].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map(renderTransaction)}</View>;
      })}
      {Platform.OS === "android" && <Pressable disabled={importing} onPress={() => void importSms()} style={styles.smsButton}><Ionicons name="chatbubble-ellipses-outline" size={19} color="#214f3a" /><ThemedText>{importing ? "Scanning messages…" : smsEnabled ? "Import recent eligible SMS" : "Import EcoCash / Econet SMS"}</ThemedText></Pressable>}
    </>}
    {mode === "history" && <><ThemedText type="subtitle">All transactions</ThemedText><TextInput value={search} onChangeText={setSearch} placeholder="Search description, category, reference" style={styles.input} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(["all", "in", "out", "transfer"] as const).map((item) => <Pressable key={item} onPress={() => setFilterDirection(item)} style={[styles.chip, filterDirection === item && styles.chipSelected]}><ThemedText>{item === "all" ? "All directions" : item === "in" ? "Money in" : item === "out" ? "Money out" : "Transfers"}</ThemedText></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(["all", "expense", "fixed_asset", "investment", "income", "loan_received", "loan_repayment", "transfer", "other"] as const).map((item) => <Pressable key={item} onPress={() => setFilterKind(item)} style={[styles.chip, filterKind === item && styles.chipSelected]}><ThemedText>{item === "all" ? "All types" : typeLabel[item]}</ThemedText></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{["all", ...categories.filter((item) => !item.archived).map((item) => item.name)].map((item) => <Pressable key={item} onPress={() => setFilterCategory(item)} style={[styles.chip, filterCategory === item && styles.chipSelected]}><ThemedText>{item === "all" ? "All categories" : item}</ThemedText></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{accountFilters.map((item) => <Pressable key={item} onPress={() => setFilterAccount(item)} style={[styles.chip, filterAccount === item && styles.chipSelected]}><ThemedText>{item === "all" ? "All accounts" : item}</ThemedText></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(["all", "manual", "sms"] as const).map((item) => <Pressable key={item} onPress={() => setFilterSource(item)} style={[styles.chip, filterSource === item && styles.chipSelected]}><ThemedText>{item === "all" ? "All sources" : item === "sms" ? "SMS" : "Manual"}</ThemedText></Pressable>)}</ScrollView>{filteredHistory.map(renderTransaction)}{!filteredHistory.length && <ThemedText style={styles.empty}>No transactions match these filters.</ThemedText>}
      {categories.length > 0 && <View style={styles.form}><ThemedText type="subtitle">Categories</ThemedText>{categories.map((item) => <View key={item.id} style={styles.categoryRow}><ThemedText>{item.name}{item.archived ? " · Archived" : ""}</ThemedText>{!item.archived && <View style={styles.categoryActions}><Pressable onPress={() => { setCategoryEditId(item.id); setCategory(item.name); setDirection("out"); setKind("expense"); setShowForm(true); setMode("overview"); }}><ThemedText color="#216b4b">Edit</ThemedText></Pressable><Pressable onPress={() => Alert.alert("Archive category?", "Past transactions keep this category.", [{ text: "Cancel", style: "cancel" }, { text: "Archive", onPress: async () => { if (uid) { await archiveFinancialCategory(uid, scope, item.id); await refreshCategories(); } } }])}><ThemedText color="#9b5348">Archive</ThemedText></Pressable></View>}</View>)}</View>}
    </>}
    {mode === "review" && <><ThemedText type="subtitle">Review imported movements</ThemedText><ThemedText type="tiny">Classify only what you know. Original SMS details stay attached to each imported record.</ThemedText>
      {reviewRecords.map((record) => <View key={record.id} style={styles.reviewItem}>{renderTransaction(record)}<ThemedText type="tiny">{record.sourceDetails?.sender} · {record.reference ? `Ref ${record.reference}` : "No reference detected"}</ThemedText><ThemedText type="tiny">{record.sourceDetails?.messageBody}</ThemedText>{record.classificationStatus === "potential_duplicate" && record.potentialDuplicateOf ? <Pressable onPress={() => Alert.alert("Merge duplicate?", "The matching transaction will remain. This entry’s SMS source details will be attached to it.", [{ text: "Cancel", style: "cancel" }, { text: "Merge", onPress: async () => { if (!uid) return; await mergePotentialDuplicate(uid, scope, record.id); await refresh(); void sync(); } }])} style={styles.reviewButton}><ThemedText style={styles.actionText}>Merge into matching transaction</ThemedText></Pressable> : <Pressable onPress={() => beginEdit(record)} style={styles.reviewButton}><ThemedText style={styles.actionText}>Explain / classify</ThemedText></Pressable>}<Pressable onPress={() => { void save({ ...record, classificationStatus: "dismissed" }); }} style={styles.textAction}><ThemedText color="#9b5348">Dismiss from totals</ThemedText></Pressable></View>)}
      {!reviewRecords.length && <ThemedText style={styles.empty}>Nothing waiting for review. Import SMS from Overview or add historical transactions manually.</ThemedText>}{Platform.OS === "android" && <Pressable disabled={importing} onPress={() => void importSms()} style={styles.smsButton}><Ionicons name="chatbubble-ellipses-outline" size={19} color="#214f3a" /><ThemedText>{importing ? "Scanning messages…" : "Scan available SMS history"}</ThemedText></Pressable>}
      {editing && <View style={styles.form}><ThemedText type="subtitle">Classify transaction</ThemedText><TextInput value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="decimal-pad" style={styles.input} /><TextInput value={description} onChangeText={setDescription} placeholder="Description" style={styles.input} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(editing.direction === "in" ? ["income", "loan_received", "other"] as const : ["expense", "fixed_asset", "investment", "loan_repayment", "transfer", "other"] as const).map((item) => <Pressable key={item} onPress={() => { setKind(item); setDirection(item === "transfer" ? "transfer" : editing.direction); }} style={[styles.chip, kind === item && styles.chipSelected]}><ThemedText>{typeLabel[item]}</ThemedText></Pressable>)}</ScrollView><TextInput value={category} onChangeText={setCategory} placeholder="Category or custom purpose" style={styles.input} /><Pressable onPress={() => void handleSave()} style={styles.saveButton}><ThemedText style={styles.actionText}>Save classification</ThemedText></Pressable></View>}
    </>}
    {!user && <ThemedText>Sign in to synchronize. Local manual records remain on this device.</ThemedText>}
  </ScrollView></ScreenWrapper>;
}

const styles = StyleSheet.create({
  page: { padding: 18, paddingBottom: 40, gap: 16 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }, title: { fontSize: 28, lineHeight: 34 }, iconButton: { width: 42, height: 42, justifyContent: "center", alignItems: "center", borderRadius: 22, backgroundColor: "#e6f0e9" },
  segment: { flexDirection: "row", padding: 4, backgroundColor: "#edf1ee", borderRadius: 12 }, segmentItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9 }, segmentSelected: { backgroundColor: "#214f3a" }, segmentSelectedText: { color: "#fff" }, notice: { padding: 11, backgroundColor: "#fff1d8", borderRadius: 8 }, netWorth: { padding: 18, backgroundColor: "#214f3a", borderRadius: 8, gap: 8 }, summaryHead: { flexDirection: "row", justifyContent: "space-between" }, netWorthValue: { fontFamily: "sfbold", fontSize: 30, color: "#fff" },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, monthTitle: { fontSize: 18 }, monthStats: { flexDirection: "row", gap: 8 }, stat: { flex: 1, padding: 11, borderLeftWidth: 2, borderColor: "#d2ded5", gap: 5 }, incomeAmount: { color: "#19704a" }, expenseAmount: { color: "#a84f43" }, transferAmount: { color: "#5e6570" }, actions: { flexDirection: "row", gap: 10 }, actionButton: { flex: 1, minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }, moneyIn: { backgroundColor: "#21744b" }, moneyOut: { backgroundColor: "#a84f43" }, actionText: { color: "#fff", fontFamily: "sfbold" },
  form: { padding: 14, gap: 10, borderWidth: 1, borderColor: "#d7dfd9", borderRadius: 8, backgroundColor: "#fbfcfb" }, formHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, input: { minHeight: 46, paddingHorizontal: 13, borderWidth: 1, borderColor: "#cbd5ce", borderRadius: 7, color: "#1c2921", backgroundColor: "#fff" }, chips: { gap: 7, paddingVertical: 2 }, chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: "#cbd5ce" }, chipSelected: { backgroundColor: "#e3eee6", borderColor: "#3d7958" }, inlineInputs: { flexDirection: "row", gap: 8 }, flexInput: { flex: 1, minWidth: 0 }, saveButton: { minHeight: 46, borderRadius: 7, backgroundColor: "#214f3a", alignItems: "center", justifyContent: "center" }, textAction: { paddingVertical: 5 }, sectionHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }, empty: { paddingVertical: 14, color: "#69776e" }, monthSectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13 }, monthAmount: { flexDirection: "row", gap: 9 },
  transaction: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#e0e6e1" }, directionMark: { width: 3, height: 31, borderRadius: 2 }, inMark: { backgroundColor: "#21804f" }, outMark: { backgroundColor: "#ae594d" }, transferMark: { backgroundColor: "#7d8791" }, transactionText: { flex: 1, gap: 2, minWidth: 70 }, smsButton: { minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: "#9eb4a3", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 }, smsOffer: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, borderWidth: 1, borderColor: "#c8d8cc", borderRadius: 8, backgroundColor: "#f2f7f3" }, offerText: { flex: 1, gap: 4 }, offerButton: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 7, backgroundColor: "#214f3a" }, categoryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#dce4de" }, categoryActions: { flexDirection: "row", gap: 16 }, reviewItem: { borderBottomWidth: 1, borderColor: "#d3ddd6", paddingBottom: 12 }, reviewButton: { minHeight: 42, borderRadius: 7, backgroundColor: "#214f3a", alignItems: "center", justifyContent: "center", marginTop: 8 },
});