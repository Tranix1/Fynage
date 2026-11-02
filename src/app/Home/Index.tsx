import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { archiveFinancialCategory, ensureDefaultFinancialAccounts, listFinancialAccounts, listFinancialCategories, mergePotentialDuplicate, saveFinancialAccount, saveFinancialCategory, setFinancialAccountOpeningBalance } from "@/repositories/financialRecords";
import { explainSmsAccess, importRecentFinancialSms } from "@/services/sms/smsImport";
import { listSmsReviewCandidates, resolveSmsReviewCandidate, type SmsReviewCandidate } from "@/services/sms/smsReviewQueue";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { buildFinancialCsv } from "@/services/export/csvExport";
import { calculateAccountBalances, calculateAccountNetWorth, calculateMonthlyMovement } from "@/services/finance/calculations";
import { createBalanceAdjustment } from "@/services/finance/reconciliation";
import { ThemedText } from "@/components/ThemedText";
import ScreenWrapper from "@/components/ScreenWrapper";
import type { FinancialAccount, FinancialCategoryWithSync, FinancialRecordWithSync, TransactionDirection, TransactionKind } from "@/types/finance";

type ViewMode = "overview" | "history" | "review";
const monthKey = (value: string) => value.slice(0, 7);
const displayMonth = (value: string) => new Date(`${value}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const formatMoney = (minor: number, currency = "USD") => `${currency} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newDate = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const typeLabel: Record<TransactionKind, string> = { expense: "Expense", fixed_asset: "Fixed asset", investment: "Investment", income: "Income", loan_received: "Loan received", loan_repayment: "Loan repayment", transfer: "Transfer", opening_balance: "Opening balance", adjustment: "Adjustment", other: "Other" };

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
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]); const [accountId, setAccountId] = useState(""); const [toAccountId, setToAccountId] = useState("");
  const [newAccountName, setNewAccountName] = useState(""); const [newAccountBalance, setNewAccountBalance] = useState(""); const [newAccountType, setNewAccountType] = useState<FinancialAccount["type"]>("other");
  const [openingBalances, setOpeningBalances] = useState<Record<string, string>>({});
  const [openingDates, setOpeningDates] = useState<Record<string, string>>({});
  const [openingReasons, setOpeningReasons] = useState<Record<string, string>>({});
  const [actualBalances, setActualBalances] = useState<Record<string, string>>({});
  const [reconciliationReasons, setReconciliationReasons] = useState<Record<string, string>>({});
  const [newAccountOpeningDate, setNewAccountOpeningDate] = useState(newDate().slice(0, 10));
  const [principal, setPrincipal] = useState(""); const [interest, setInterest] = useState(""); const [fees, setFees] = useState(""); const [assetValue, setAssetValue] = useState(""); const [liability, setLiability] = useState("");
  const [editing, setEditing] = useState<FinancialRecordWithSync | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [categoryEditId, setCategoryEditId] = useState<string | undefined>();
  const [categories, setCategories] = useState<FinancialCategoryWithSync[]>([]);
  const [search, setSearch] = useState(""); const [filterDirection, setFilterDirection] = useState<"all" | TransactionDirection>("all");
  const [filterKind, setFilterKind] = useState<"all" | TransactionKind>("all");
  const [filterCategory, setFilterCategory] = useState("all"); const [filterAccount, setFilterAccount] = useState("all"); const [filterSource, setFilterSource] = useState<"all" | "manual" | "sms">("all");
  const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");
  const [importing, setImporting] = useState(false); const [smsEnabled, setSmsEnabled] = useState(false); const [notice, setNotice] = useState("");
  const [showSmsOffer, setShowSmsOffer] = useState(false);
  const [smsReviewCandidates, setSmsReviewCandidates] = useState<SmsReviewCandidate[]>([]);
  const [pendingSmsCandidate, setPendingSmsCandidate] = useState<SmsReviewCandidate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const submitting = useRef(false);

  const refreshCategories = async () => { if (uid) setCategories(await listFinancialCategories(uid, scope)); };
  const refreshAccounts = async () => { if (uid) setAccounts(await listFinancialAccounts(uid, scope)); };
  const refreshSmsQueue = useCallback(async () => { if (uid) setSmsReviewCandidates(await listSmsReviewCandidates(uid, scope)); }, [uid, scope]);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    void listSmsReviewCandidates(uid, scope).then((items) => { if (active) setSmsReviewCandidates(items); }).catch(() => undefined);
    return () => { active = false; };
  }, [uid, scope]);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    void ensureDefaultFinancialAccounts(uid, scope).then(() => listFinancialAccounts(uid, scope)).then((next) => { if (active) { setAccounts(next); setAccountId((current) => next.some((entry) => entry.id === current) ? current : next.find((entry) => entry.name === "Cash")?.id ?? next[0]?.id ?? ""); } }).catch((error) => setNotice(error instanceof Error ? error.message : "Could not load accounts."));
    return () => { active = false; };
  }, [uid, scope]);
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
        const key = `fynage_sms_cursor_${uid}_${scope}`;
        const stored = await AsyncStorage.getItem(key);
        const since = stored ? Math.max(Date.now() - 365 * 24 * 60 * 60 * 1000, Number(stored) - 120000) : Date.now() - 7 * 24 * 60 * 60 * 1000;
        const result = await importRecentFinancialSms(uid, scope, false, false, since);
        await AsyncStorage.setItem(key, String(Math.max(since, result.newestDate)));
        if (result.imported) await refresh();
        if (result.queuedForReview) await refreshSmsQueue();
      } catch {
        setNotice("SMS access is unavailable. Re-enable permission in Android settings or continue with manual entry.");
      }
    };
    const timer = setInterval(() => { void poll(); }, 120000);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void poll(); });
    void poll();
    return () => { clearInterval(timer); subscription.remove(); };
  }, [uid, scope, smsEnabled, refresh, refreshSmsQueue]);

  const activeRecords = useMemo(() => records.filter((record) => record.classificationStatus !== "dismissed" && record.classificationStatus !== "potential_duplicate" && record.classificationStatus !== "unreviewed"), [records]);
  const currencies = useMemo(() => [...new Set(["USD", ...activeRecords.map((record) => record.currency)])].sort(), [activeRecords]);
  const monthRecords = useMemo(() => activeRecords.filter((record) => monthKey(record.occurredAt) === selectedMonth && record.currency === summaryCurrency), [activeRecords, selectedMonth, summaryCurrency]);
  const monthTotals = useMemo(() => calculateMonthlyMovement(monthRecords, selectedMonth, summaryCurrency), [monthRecords, selectedMonth, summaryCurrency]);
  const selectedMonthStart = new Date(`${selectedMonth}-01T00:00:00.000Z`);
  const monthOpeningAsOf = new Date(selectedMonthStart.getTime() - 1).toISOString();
  const selectedMonthEnd = new Date(Date.UTC(selectedMonthStart.getUTCFullYear(), selectedMonthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999)).toISOString();
  const selectedCurrencyAccounts = accounts.filter((entry) => entry.currency === summaryCurrency && !entry.archived);
  const openingBalanceTotal = calculateAccountBalances(selectedCurrencyAccounts, activeRecords, monthOpeningAsOf).reduce((sum, entry) => sum + entry.balanceMinor, 0);
  const closingBalanceTotal = calculateAccountBalances(selectedCurrencyAccounts, activeRecords, selectedMonthEnd).reduce((sum, entry) => sum + entry.balanceMinor, 0);
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
      && (filterSource === "all" || record.source === filterSource)
      && (!dateFrom || record.occurredAt.slice(0, 10) >= dateFrom)
      && (!dateTo || record.occurredAt.slice(0, 10) <= dateTo);
  }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [activeRecords, search, filterDirection, filterKind, filterCategory, filterAccount, filterSource, dateFrom, dateTo]);
  const accountFilters = useMemo(() => ["all", ...new Set(activeRecords.map((item) => item.account).filter((item): item is string => Boolean(item)))], [activeRecords]);
  const reviewRecords = useMemo(() => records.filter((record) => record.classificationStatus === "unreviewed" || record.classificationStatus === "potential_duplicate"), [records]);

  const clearForm = () => { setAmount(""); setDescription(""); setCategory(""); setOccurredAt(newDate()); setAccount(""); setToAccountId(""); setCounterparty(""); setReference(""); setNotes(""); setPrincipal(""); setInterest(""); setFees(""); setAssetValue(""); setLiability(""); setEditing(null); setPendingSmsCandidate(null); setCategoryEditId(undefined); setShowForm(false); setKind(direction === "in" ? "income" : "expense"); };
  const handleSave = async () => {
    if (submitting.current) return;
    const value = Number(amount.replace(",", ".")); const dateValue = new Date(occurredAt);
    if (!Number.isFinite(value) || value <= 0 || !description.trim() || !Number.isFinite(dateValue.getTime())) { Alert.alert("Check the transaction", "Enter a positive amount, description, and valid date and time."); return; }
    if (!uid) { Alert.alert("Sign in required", "Sign in to save transactions to your private account."); return; }
    submitting.current = true;
    setIsSaving(true);
    try {
      const trimmedCategory = category.trim() || "Uncategorized";
      if (!accountId || !accounts.some((entry) => entry.id === accountId && entry.currency === currency)) throw new Error("Choose an account that uses the transaction currency.");
      if (kind === "transfer" && (!toAccountId || toAccountId === accountId || !accounts.some((entry) => entry.id === toAccountId && entry.currency === currency))) throw new Error("Choose a different destination account that uses the transaction currency.");
      if (trimmedCategory !== "Uncategorized") { await saveFinancialCategory(uid, scope, trimmedCategory, categoryEditId); await refreshCategories(); }
      const prior = editing;
      const reviewCandidate = pendingSmsCandidate;
      await save({
        id: prior?.id ?? (reviewCandidate ? `sms_review_${reviewCandidate.messageKey}` : `fin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`),
        type: kind, direction: kind === "transfer" ? "transfer" : direction,
        amountMinor: Math.round(value * 100), currency, category: trimmedCategory, description: description.trim(), occurredAt: dateValue.toISOString(),
        accountId, toAccountId: kind === "transfer" ? toAccountId : undefined,
        account: accounts.find((entry) => entry.id === accountId)?.name ?? (account.trim() || undefined),
        toAccount: kind === "transfer" ? accounts.find((entry) => entry.id === toAccountId)?.name : undefined,
        counterparty: counterparty.trim() || undefined, reference: reference.trim() || undefined, notes: notes.trim() || undefined,
        source: prior?.source ?? (reviewCandidate ? "sms" : "manual"), sourceApp: prior?.sourceApp ?? "fynage", sourceRecordId: prior?.sourceRecordId ?? prior?.id ?? (reviewCandidate ? `sms_review_${reviewCandidate.messageKey}` : undefined),
        sourceCollection: prior?.sourceCollection ?? (reviewCandidate ? "android_sms" : undefined), sourceKey: prior?.sourceKey ?? (reviewCandidate ? `sms_review_${reviewCandidate.messageKey}` : undefined), sourceFingerprint: prior?.sourceFingerprint ?? reviewCandidate?.messageKey, sourceDetails: prior?.sourceDetails ?? (reviewCandidate ? { sender: reviewCandidate.sender, messageDate: new Date(reviewCandidate.date).toISOString(), messageBody: reviewCandidate.body, providerId: reviewCandidate.id } : undefined),
        classificationStatus: "reviewed", userEditedFields: prior?.source === "sms" ? [...new Set([...(prior.userEditedFields ?? []), "type", "direction", "category", "description", "occurredAt", "counterparty", "reference", "notes"])] : prior?.userEditedFields ?? [],
        principalMinor: principal ? Math.round(Number(principal) * 100) : prior?.principalMinor,
        interestMinor: interest ? Math.round(Number(interest) * 100) : prior?.interestMinor,
        feeMinor: fees ? Math.round(Number(fees) * 100) : prior?.feeMinor,
        assetValueMinor: assetValue ? Math.round(Number(assetValue) * 100) : prior?.assetValueMinor,
        liabilityMinor: liability ? Math.round(Number(liability) * 100) : prior?.liabilityMinor,
      });
      if (reviewCandidate) { await resolveSmsReviewCandidate(uid, scope, reviewCandidate.messageKey, "recorded"); setPendingSmsCandidate(null); await refreshSmsQueue(); }
      setSelectedMonth(monthKey(dateValue.toISOString())); setNotice("Saved on this device. Sync will continue when the network is available."); clearForm(); await refresh(); void sync(); setMode("overview");
    } catch (error) { Alert.alert("Could not save", error instanceof Error ? error.message : "Try again."); }
    finally { submitting.current = false; setIsSaving(false); }
  };

  const beginEdit = (record: FinancialRecordWithSync) => {
    setEditing(record); setCashFlow(record.direction === "in" ? "in" : "out"); setDirection(record.direction); setKind(record.type); setAmount((record.amountMinor / 100).toFixed(2)); setDescription(record.description); setCategory(record.category); setCurrency(record.currency);
    setOccurredAt(new Date(new Date(record.occurredAt).getTime() - new Date(record.occurredAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setAccount(record.account ?? ""); setAccountId(record.accountId ?? ""); setToAccountId(record.toAccountId ?? ""); setCounterparty(record.counterparty ?? ""); setReference(record.reference ?? ""); setNotes(record.notes ?? ""); setShowForm(true); setMode(record.classificationStatus === "unreviewed" ? "review" : "overview");
    setPrincipal(record.principalMinor ? (record.principalMinor / 100).toFixed(2) : ""); setInterest(record.interestMinor ? (record.interestMinor / 100).toFixed(2) : ""); setFees(record.feeMinor ? (record.feeMinor / 100).toFixed(2) : ""); setAssetValue(record.assetValueMinor ? (record.assetValueMinor / 100).toFixed(2) : ""); setLiability(record.liabilityMinor ? (record.liabilityMinor / 100).toFixed(2) : "");
  };
  const beginSmsReview = (candidate: SmsReviewCandidate) => {
    setPendingSmsCandidate(candidate); setEditing(null); setAmount(""); setDescription(`${candidate.provider} transaction`); setCategory("Uncategorized");
    setOccurredAt(new Date(new Date(candidate.date).getTime() - new Date(candidate.date).getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setAccountId(candidate.provider === "InnBucks" ? "account_innbucks" : candidate.provider === "EcoCash" ? "account_ecocash" : "account_bank");
    setCurrency("USD"); setDirection("out"); setCashFlow("out"); setKind("expense"); setShowForm(true); setMode("overview");
  };
  const importSms = async () => {
    if (!uid || Platform.OS !== "android") return;
    const accepted = await explainSmsAccess(); if (!accepted) return;
    setImporting(true); setNotice("Scanning available message history. Unrelated messages are not saved.");
    try {
      const result = await importRecentFinancialSms(uid, scope, true, true, undefined, (scanned, imported) => setNotice(`Scanned ${scanned} messages; ${imported} eligible transactions imported for review.`)); await AsyncStorage.setItem(`fynage_sms_enabled_${uid}`, "true"); setSmsEnabled(true); await refresh(); await refreshSmsQueue();
      await AsyncStorage.setItem(`fynage_sms_cursor_${uid}_${scope}`, String(result.newestDate));
      const period = new Date(result.since).toLocaleDateString(); const periodEnd = new Date(result.newestDate).toLocaleDateString();
      setNotice(`${result.scanned} scanned (${period} to ${periodEnd}); ${result.imported} imported, ${result.duplicates} duplicates, ${result.queuedForReview} need review, ${result.ignored} unrelated or unsupported. ${result.reachedLimit ? "Scan reached the 10,000-message limit; run again to continue." : ""}`); setMode("review");
    } catch (error) { setNotice(error instanceof Error ? error.message : "SMS import is unavailable. You can continue with manual entry."); }
    finally { setImporting(false); }
  };
  const exportFinancialCsv = async () => {
    try {
      const summaryKeys = [...new Set(filteredHistory.map((record) => `${monthKey(record.occurredAt)}|${record.currency}`))].sort();
      const summaries = summaryKeys.map((key) => { const [month, itemCurrency] = key.split("|"); return { month, currency: itemCurrency, totals: calculateMonthlyMovement(filteredHistory, month, itemCurrency) }; });
      const csv = buildFinancialCsv(filteredHistory, calculateAccountBalances(accounts, activeRecords), summaries);
      const file = new File(Paths.cache, `fynage_finances_${new Date().toISOString().slice(0, 10)}.csv`);
      file.create({ overwrite: true });
      file.write(csv);
      if (!(await Sharing.isAvailableAsync())) throw new Error("File sharing is unavailable on this device.");
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "Export Fynage financial records" });
    } catch (error) { Alert.alert("Export unavailable", error instanceof Error ? error.message : "Could not create your financial export."); }
  };
  const changeMonth = (delta: number) => { const date = new Date(`${selectedMonth}-01T12:00:00`); date.setMonth(date.getMonth() + delta); setSelectedMonth(monthKey(date.toISOString())); };
  const saveCategoryEdits = async () => {
    if (!uid || !category.trim()) return;
    try { await saveFinancialCategory(uid, scope, category, categoryEditId); await refreshCategories(); setCategoryEditId(undefined); setNotice("Category saved for future transactions."); }
    catch (error) { Alert.alert("Category not saved", error instanceof Error ? error.message : "Try again."); }
  };
  const addAccount = async () => {
    if (!uid) return;
    const initial = newAccountBalance.trim() ? Number(newAccountBalance.replace(",", ".")) : 0;
    if (!Number.isFinite(initial)) { Alert.alert("Check the opening balance", "Enter a valid amount or leave it blank for zero."); return; }
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newAccountOpeningDate)) throw new Error("Enter the opening date as YYYY-MM-DD.");
      const created = await saveFinancialAccount(uid, scope, { name: newAccountName, type: newAccountType, currency, openingBalanceMinor: Math.round(initial * 100), openingBalanceDate: `${newAccountOpeningDate}T00:00:00.000Z` });
      setNewAccountName(""); setNewAccountBalance(""); setNewAccountOpeningDate(newDate().slice(0, 10)); setAccountId(created.id); await refreshAccounts(); void sync();
    } catch (error) { Alert.alert("Account not saved", error instanceof Error ? error.message : "Try again."); }
  };
  const updateOpeningBalance = async (target: FinancialAccount) => {
    if (!uid) return;
    const value = Number((openingBalances[target.id] ?? (target.openingBalanceMinor / 100).toFixed(2)).replace(",", "."));
    const date = openingDates[target.id] ?? target.openingBalanceDate.slice(0, 10);
    if (!Number.isFinite(value)) { Alert.alert("Check the balance", "Enter a valid opening balance."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert("Check the date", "Enter the opening date as YYYY-MM-DD."); return; }
    const reason = (openingReasons[target.id] ?? "").trim();
    if (!reason) { Alert.alert("Add a reason", "Explain why this opening balance or its date is changing."); return; }
    try { await setFinancialAccountOpeningBalance(uid, scope, target.id, Math.round(value * 100), `${date}T00:00:00.000Z`, reason); setOpeningReasons((previous) => ({ ...previous, [target.id]: "" })); await refreshAccounts(); void sync(); }
    catch (error) { Alert.alert("Balance not saved", error instanceof Error ? error.message : "Try again."); }
  };

  const reconcileAccount = async (target: FinancialAccount) => {
    if (!uid) return;
    const value = Number((actualBalances[target.id] ?? "").replace(",", "."));
    const reason = (reconciliationReasons[target.id] ?? "").trim();
    if (!Number.isFinite(value)) { Alert.alert("Check the actual balance", "Enter the balance shown by your cash count or account statement."); return; }
    if (!reason) { Alert.alert("Add a reason", "Briefly explain this balance correction."); return; }
    const current = calculateAccountBalances(accounts, activeRecords).find((entry) => entry.id === target.id)?.balanceMinor ?? 0;
    const actual = Math.round(value * 100); const difference = actual - current;
    if (!difference) { setNotice(`${target.name} is reconciled. No adjustment was needed.`); return; }
    Alert.alert("Confirm balance adjustment", `Recorded: ${formatMoney(current, target.currency)}\nActual: ${formatMoney(actual, target.currency)}\nAdjustment: ${difference > 0 ? "+" : "−"}${formatMoney(Math.abs(difference), target.currency)}\n\nThis changes the account balance without counting as income or spending.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Adjust balance", onPress: async () => {
        try {
          const adjustment = createBalanceAdjustment({ id: `fin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, ownerId: uid, businessId: scope, accountId: target.id, account: target.name, currency: target.currency, recordedMinor: current, actualMinor: actual, reason });
          if (adjustment) await save(adjustment);
          setActualBalances((previous) => ({ ...previous, [target.id]: "" })); setReconciliationReasons((previous) => ({ ...previous, [target.id]: "" })); await refresh(); await refreshAccounts(); void sync(); setNotice(`${target.name} reconciled. The adjustment is excluded from income and expenses.`);
        } catch (error) { Alert.alert("Could not reconcile", error instanceof Error ? error.message : "Try again."); }
      } },
    ]);
  };

  const renderTransaction = (record: FinancialRecordWithSync) => <View key={record.id} style={styles.transaction}>
    <View style={[styles.directionMark, record.direction === "in" ? styles.inMark : record.direction === "out" ? styles.outMark : styles.transferMark]} />
    <View style={styles.transactionText}><ThemedText type="defaultSemiBold" numberOfLines={1}>{record.description}</ThemedText><ThemedText type="tiny">{new Date(record.occurredAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {record.category || "Uncategorized"}{record.account ? ` · ${record.account}` : ""}</ThemedText><ThemedText type="tiny" color="#66756e">{record.source === "sms" ? "SMS import" : "Manual"} · {record.syncStatus === "synced" ? "Synced" : record.syncStatus === "failed" ? "Sync failed" : "Saved locally"}</ThemedText></View>
    <ThemedText style={record.direction === "in" ? styles.incomeAmount : record.direction === "out" ? styles.expenseAmount : styles.transferAmount} type="defaultSemiBold">{record.direction === "out" ? "−" : record.direction === "in" ? "+" : "↔"}{formatMoney(record.amountMinor, record.currency)}</ThemedText>
    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${record.description}`} onPress={() => beginEdit(record)} hitSlop={8}><Ionicons name="create-outline" size={19} color="#58675f" /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${record.description}`} onPress={() => Alert.alert("Delete transaction?", "This removes the record from your financial history.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void remove(record.id); } }])} hitSlop={8}><Ionicons name="trash-outline" size={18} color="#9b5348" /></Pressable>
  </View>;
  const types = cashFlow === "in" ? ["income", "loan_received", "adjustment", "other"] as const : ["expense", "fixed_asset", "investment", "loan_repayment", "transfer", "adjustment", "other"] as const;
  const controls = <View style={styles.segment}>{(["overview", "history", "review"] as const).map((item) => <Pressable key={item} onPress={() => { setEditing(null); setMode(item); }} style={[styles.segmentItem, mode === item && styles.segmentSelected]}><ThemedText style={mode === item ? styles.segmentSelectedText : undefined}>{item === "overview" ? "Overview" : item === "history" ? "History" : `Review${reviewRecords.length ? ` ${reviewRecords.length}` : ""}`}</ThemedText></Pressable>)}</View>;

  return <ScreenWrapper><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><View><ThemedText type="tiny">{activeAccountName ?? "Personal"} · MONEY</ThemedText><ThemedText type="title" style={styles.title}>Fynage</ThemedText></View><Pressable accessibilityRole="button" accessibilityLabel="Synchronize transactions" onPress={() => { void sync(); setNotice("Sync started. Records stay available on this device."); }} style={styles.iconButton}><Ionicons name="sync-outline" size={21} color="#214f3a" /></Pressable></View>
    {notice ? <Pressable onPress={() => setNotice("")} style={styles.notice}><ThemedText type="tiny">{notice}</ThemedText></Pressable> : null}
    {mode === "overview" && <View style={styles.netWorth}><View style={styles.summaryHead}><ThemedText type="tiny" color="#d5e7db">NET WORTH · PERSONAL · {summaryCurrency}</ThemedText><ThemedText type="tiny" color="#d5e7db">RECORDED ACTIVITY</ThemedText></View><ThemedText style={styles.netWorthValue}>{formatMoney(calculateAccountNetWorth(accounts, activeRecords, summaryCurrency), summaryCurrency)}</ThemedText><ThemedText type="tiny" color="#d5e7db">This is your personal position. Business figures stay separate until the shared ledger can reconcile business ownership and internal transfers.</ThemedText></View>}
    {controls}
    {mode === "overview" && <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{currencies.map((item) => <Pressable key={item} onPress={() => setSummaryCurrency(item)} style={[styles.chip, summaryCurrency === item && styles.chipSelected]}><ThemedText>{item}</ThemedText></Pressable>)}</ScrollView>
      {showSmsOffer && <View style={styles.smsOffer}><View style={styles.offerText}><ThemedText type="defaultSemiBold">Import mobile money history</ThemedText><ThemedText type="tiny">Fynage looks for EcoCash/Econet money movements in up to 12 months of SMS still available on this phone. Deleted messages cannot be recovered; unknown formats are skipped. Unrelated messages are ignored and manual entry always works.</ThemedText></View><Pressable onPress={() => { void importSms(); }} style={styles.offerButton}><ThemedText style={styles.actionText}>Review import</ThemedText></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Dismiss SMS import offer" onPress={() => { setShowSmsOffer(false); if (uid) void AsyncStorage.setItem(`fynage_sms_offer_dismissed_${uid}`, "true"); }} hitSlop={8}><Ionicons name="close" size={20} color="#58675f" /></Pressable></View>}
      <View style={styles.monthNav}><Pressable onPress={() => changeMonth(-1)} hitSlop={12}><Ionicons name="chevron-back" size={21} color="#29463a" /></Pressable><ThemedText type="subtitle" style={styles.monthTitle}>{displayMonth(selectedMonth)}</ThemedText><Pressable onPress={() => changeMonth(1)} hitSlop={12}><Ionicons name="chevron-forward" size={21} color="#29463a" /></Pressable></View>
      <View style={styles.monthBalanceLine}><ThemedText type="tiny">OPENING BALANCE · {formatMoney(openingBalanceTotal, summaryCurrency)}</ThemedText><ThemedText type="tiny">CLOSING BALANCE · {formatMoney(closingBalanceTotal, summaryCurrency)}</ThemedText></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthStats}><View style={styles.stat}><ThemedText type="tiny">INCOME</ThemedText><ThemedText style={styles.incomeAmount} type="defaultSemiBold">{formatMoney(monthTotals.income, summaryCurrency)}</ThemedText></View><View style={styles.stat}><ThemedText type="tiny">EXPENSES</ThemedText><ThemedText style={styles.expenseAmount} type="defaultSemiBold">{formatMoney(monthTotals.expenses, summaryCurrency)}</ThemedText></View><View style={styles.stat}><ThemedText type="tiny">TRANSFERS IN</ThemedText><ThemedText style={styles.transferAmount} type="defaultSemiBold">{formatMoney(monthTotals.transfersIn, summaryCurrency)}</ThemedText></View><View style={styles.stat}><ThemedText type="tiny">TRANSFERS OUT</ThemedText><ThemedText style={styles.transferAmount} type="defaultSemiBold">{formatMoney(monthTotals.transfersOut, summaryCurrency)}</ThemedText></View><View style={styles.stat}><ThemedText type="tiny">CHARGES</ThemedText><ThemedText style={styles.expenseAmount} type="defaultSemiBold">{formatMoney(monthTotals.charges, summaryCurrency)}</ThemedText></View><View style={styles.stat}><ThemedText type="tiny">NET CHANGE</ThemedText><ThemedText type="defaultSemiBold">{formatMoney(monthTotals.net, summaryCurrency)}</ThemedText></View><View style={styles.stat}><ThemedText type="tiny">P/L*</ThemedText><ThemedText type="defaultSemiBold">{formatMoney(monthTotals.profitLoss, summaryCurrency)}</ThemedText></View></ScrollView>
      <ThemedText type="tiny">* P/L includes classified income, operating expenses, and known loan interest/fees; it excludes transfers, assets, and investment principal.</ThemedText>
      <View style={styles.accountCard}><ThemedText type="subtitle">Accounts</ThemedText><ThemedText type="tiny">Balances use the opening amount plus recorded movements dated on or after the opening date.</ThemedText>{calculateAccountBalances(accounts, activeRecords).filter((entry) => !entry.archived).map((entry) => <View key={entry.id} style={styles.accountRow}><View style={styles.accountBalanceRow}><ThemedText>{entry.name}</ThemedText><ThemedText type="defaultSemiBold">{formatMoney(entry.balanceMinor, entry.currency)}</ThemedText></View><View style={styles.inlineInputs}><TextInput value={openingBalances[entry.id] ?? (entry.openingBalanceMinor / 100).toFixed(2)} onChangeText={(value) => setOpeningBalances((previous) => ({ ...previous, [entry.id]: value }))} placeholder="Opening balance" keyboardType="decimal-pad" style={[styles.input, styles.flexInput]} /><TextInput value={openingDates[entry.id] ?? entry.openingBalanceDate.slice(0, 10)} onChangeText={(value) => setOpeningDates((previous) => ({ ...previous, [entry.id]: value }))} placeholder="YYYY-MM-DD" style={[styles.input, styles.flexInput]} /><Pressable onPress={() => void updateOpeningBalance(entry)} style={styles.openingSave}><ThemedText style={styles.actionText}>Set</ThemedText></Pressable></View><TextInput value={openingReasons[entry.id] ?? ""} onChangeText={(value) => setOpeningReasons((previous) => ({ ...previous, [entry.id]: value }))} placeholder="Reason for changing opening balance" style={styles.input} /><View style={styles.inlineInputs}><TextInput value={actualBalances[entry.id] ?? ""} onChangeText={(value) => setActualBalances((previous) => ({ ...previous, [entry.id]: value }))} placeholder="Actual balance" keyboardType="decimal-pad" style={[styles.input, styles.flexInput]} /><TextInput value={reconciliationReasons[entry.id] ?? ""} onChangeText={(value) => setReconciliationReasons((previous) => ({ ...previous, [entry.id]: value }))} placeholder="Reason for adjustment" style={[styles.input, styles.flexInput]} /><Pressable onPress={() => void reconcileAccount(entry)} style={styles.openingSave}><ThemedText style={styles.actionText}>Reconcile</ThemedText></Pressable></View></View>)}<View style={styles.inlineInputs}><TextInput value={newAccountName} onChangeText={setNewAccountName} placeholder="Add account (e.g. Stanbic)" style={[styles.input, styles.flexInput]} /><TextInput value={newAccountBalance} onChangeText={setNewAccountBalance} placeholder="Opening balance" keyboardType="decimal-pad" style={[styles.input, styles.flexInput]} /></View><TextInput value={newAccountOpeningDate} onChangeText={setNewAccountOpeningDate} placeholder="Opening date YYYY-MM-DD" style={styles.input} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{([{ value: "cash", label: "Cash" }, { value: "mobile_money", label: "Mobile money" }, { value: "bank", label: "Bank" }, { value: "other", label: "Other" }] as const).map((item) => <Pressable key={item.value} onPress={() => setNewAccountType(item.value)} style={[styles.chip, newAccountType === item.value && styles.chipSelected]}><ThemedText>{item.label}</ThemedText></Pressable>)}</ScrollView><Pressable onPress={() => void addAccount()} style={styles.accountAdd}><ThemedText style={styles.actionText}>Add account</ThemedText></Pressable></View>
      <View style={styles.actions}><Pressable onPress={() => { clearForm(); setCashFlow("in"); setDirection("in"); setKind("income"); setShowForm(true); }} style={[styles.actionButton, styles.moneyIn]}><Ionicons name="arrow-down-outline" size={18} color="#fff" /><ThemedText style={styles.actionText}>Money in</ThemedText></Pressable><Pressable onPress={() => { clearForm(); setCashFlow("out"); setDirection("out"); setKind("expense"); setShowForm(true); }} style={[styles.actionButton, styles.moneyOut]}><Ionicons name="arrow-up-outline" size={18} color="#fff" /><ThemedText style={styles.actionText}>Money out</ThemedText></Pressable><Pressable onPress={() => { clearForm(); setCashFlow("out"); setDirection("transfer"); setKind("transfer"); setShowForm(true); }} style={[styles.actionButton, styles.transferAction]}><Ionicons name="swap-horizontal-outline" size={18} color="#214f3a" /><ThemedText>Transfer</ThemedText></Pressable></View><View style={styles.actions}><Pressable onPress={() => { clearForm(); setCashFlow("in"); setDirection("in"); setKind("adjustment"); setShowForm(true); }} style={[styles.actionButton, styles.transferAction]}><Ionicons name="add-circle-outline" size={18} color="#214f3a" /><ThemedText>Adjust up</ThemedText></Pressable><Pressable onPress={() => { clearForm(); setCashFlow("out"); setDirection("out"); setKind("adjustment"); setShowForm(true); }} style={[styles.actionButton, styles.transferAction]}><Ionicons name="remove-circle-outline" size={18} color="#214f3a" /><ThemedText>Adjust down</ThemedText></Pressable></View>
      {showForm && <View style={styles.form}>{pendingSmsCandidate && <View style={styles.notice}><ThemedText type="tiny">Reviewing {pendingSmsCandidate.provider} message from {new Date(pendingSmsCandidate.date).toLocaleString()}. Choose the correct amount, direction, type and account before saving.</ThemedText><ThemedText type="tiny">{pendingSmsCandidate.body}</ThemedText></View>}<View style={styles.formHead}><ThemedText type="subtitle">{categoryEditId ? "Edit category" : editing ? "Edit transaction" : direction === "in" ? "Record money in" : "Record money out"}</ThemedText><Pressable onPress={clearForm}><Ionicons name="close" size={22} color="#53645a" /></Pressable></View>
        <TextInput value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="decimal-pad" style={styles.input} /><TextInput value={occurredAt} onChangeText={setOccurredAt} placeholder="Date and time (YYYY-MM-DDTHH:mm)" style={styles.input} /><TextInput value={description} onChangeText={setDescription} placeholder="Description or purpose" style={styles.input} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{["USD", "ZWG", "ZWL", "ZAR", "EUR"].map((item) => <Pressable key={item} onPress={() => setCurrency(item)} style={[styles.chip, currency === item && styles.chipSelected]}><ThemedText>{item}</ThemedText></Pressable>)}</ScrollView>
        <ThemedText type="tiny">TRANSACTION TYPE</ThemedText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{types.map((item) => <Pressable key={item} onPress={() => { setKind(item); setDirection(item === "transfer" ? "transfer" : cashFlow); }} style={[styles.chip, kind === item && styles.chipSelected]}><ThemedText>{typeLabel[item]}</ThemedText></Pressable>)}</ScrollView>
        {kind === "adjustment" && <ThemedText type="tiny">Explain why this account balance is changing. Adjustments do not count as income or spending.</ThemedText>}
        <TextInput value={category} onChangeText={setCategory} placeholder="Category (or type a new one)" style={styles.input} />{categories.filter((item) => !item.archived).length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categories.filter((item) => !item.archived).map((item) => <Pressable key={item.id} onPress={() => setCategory(item.name)} style={[styles.chip, category === item.name && styles.chipSelected]}><ThemedText>{item.name}</ThemedText></Pressable>)}</ScrollView>}
        <View style={styles.inlineInputs}><TextInput value={account} onChangeText={setAccount} placeholder="Account / method" style={[styles.input, styles.flexInput]} /><TextInput value={counterparty} onChangeText={setCounterparty} placeholder="Counterparty" style={[styles.input, styles.flexInput]} /></View><TextInput value={reference} onChangeText={setReference} placeholder="Reference (optional)" style={styles.input} /><TextInput value={notes} onChangeText={setNotes} placeholder="Notes (optional)" style={styles.input} />
        <ThemedText type="tiny">{kind === "transfer" ? "FROM ACCOUNT" : "ACCOUNT"}</ThemedText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{accounts.filter((item) => !item.archived && item.currency === currency).map((item) => <Pressable key={item.id} onPress={() => setAccountId(item.id)} style={[styles.chip, accountId === item.id && styles.chipSelected]}><ThemedText>{item.name}</ThemedText></Pressable>)}</ScrollView>
        {kind === "transfer" && <><ThemedText type="tiny">TO ACCOUNT</ThemedText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{accounts.filter((item) => !item.archived && item.currency === currency && item.id !== accountId).map((item) => <Pressable key={item.id} onPress={() => setToAccountId(item.id)} style={[styles.chip, toAccountId === item.id && styles.chipSelected]}><ThemedText>{item.name}</ThemedText></Pressable>)}</ScrollView><ThemedText type="tiny">Transfers move money between your accounts and are not income or expenses.</ThemedText></>}
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
    {mode === "history" && <><ThemedText type="subtitle">All transactions</ThemedText><Pressable onPress={() => void exportFinancialCsv()} style={styles.smsButton}><ThemedText>Export filtered history and account balances (CSV)</ThemedText></Pressable><View style={styles.inlineInputs}><TextInput value={dateFrom} onChangeText={setDateFrom} placeholder="From date (YYYY-MM-DD)" style={[styles.input, styles.flexInput]} /><TextInput value={dateTo} onChangeText={setDateTo} placeholder="To date (YYYY-MM-DD)" style={[styles.input, styles.flexInput]} /></View><TextInput value={search} onChangeText={setSearch} placeholder="Search description, category, reference" style={styles.input} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(["all", "in", "out", "transfer"] as const).map((item) => <Pressable key={item} onPress={() => setFilterDirection(item)} style={[styles.chip, filterDirection === item && styles.chipSelected]}><ThemedText>{item === "all" ? "All directions" : item === "in" ? "Money in" : item === "out" ? "Money out" : "Transfers"}</ThemedText></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(["all", "expense", "fixed_asset", "investment", "income", "loan_received", "loan_repayment", "transfer", "other"] as const).map((item) => <Pressable key={item} onPress={() => setFilterKind(item)} style={[styles.chip, filterKind === item && styles.chipSelected]}><ThemedText>{item === "all" ? "All types" : typeLabel[item]}</ThemedText></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{["all", ...categories.filter((item) => !item.archived).map((item) => item.name)].map((item) => <Pressable key={item} onPress={() => setFilterCategory(item)} style={[styles.chip, filterCategory === item && styles.chipSelected]}><ThemedText>{item === "all" ? "All categories" : item}</ThemedText></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{accountFilters.map((item) => <Pressable key={item} onPress={() => setFilterAccount(item)} style={[styles.chip, filterAccount === item && styles.chipSelected]}><ThemedText>{item === "all" ? "All accounts" : item}</ThemedText></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(["all", "manual", "sms"] as const).map((item) => <Pressable key={item} onPress={() => setFilterSource(item)} style={[styles.chip, filterSource === item && styles.chipSelected]}><ThemedText>{item === "all" ? "All sources" : item === "sms" ? "SMS" : "Manual"}</ThemedText></Pressable>)}</ScrollView>{filteredHistory.map(renderTransaction)}{!filteredHistory.length && <ThemedText style={styles.empty}>No transactions match these filters.</ThemedText>}
      {categories.length > 0 && <View style={styles.form}><ThemedText type="subtitle">Categories</ThemedText>{categories.map((item) => <View key={item.id} style={styles.categoryRow}><ThemedText>{item.name}{item.archived ? " · Archived" : ""}</ThemedText>{!item.archived && <View style={styles.categoryActions}><Pressable onPress={() => { setCategoryEditId(item.id); setCategory(item.name); setDirection("out"); setKind("expense"); setShowForm(true); setMode("overview"); }}><ThemedText color="#216b4b">Edit</ThemedText></Pressable><Pressable onPress={() => Alert.alert("Archive category?", "Past transactions keep this category.", [{ text: "Cancel", style: "cancel" }, { text: "Archive", onPress: async () => { if (uid) { await archiveFinancialCategory(uid, scope, item.id); await refreshCategories(); } } }])}><ThemedText color="#9b5348">Archive</ThemedText></Pressable></View>}</View>)}</View>}
    </>}
    {mode === "review" && <><ThemedText type="subtitle">Review imported movements</ThemedText><ThemedText type="tiny">Classify only what you know. Original SMS details stay attached to each imported record. Unparsed provider messages are stored on this device for manual review.</ThemedText>
      {reviewRecords.map((record) => <View key={record.id} style={styles.reviewItem}>{renderTransaction(record)}<ThemedText type="tiny">{record.sourceDetails?.sender} · {record.reference ? `Ref ${record.reference}` : "No reference detected"}</ThemedText><ThemedText type="tiny">{record.sourceDetails?.messageBody}</ThemedText>{record.classificationStatus === "potential_duplicate" && record.potentialDuplicateOf ? <Pressable onPress={() => Alert.alert("Merge duplicate?", "The matching transaction will remain. This entry’s SMS source details will be attached to it.", [{ text: "Cancel", style: "cancel" }, { text: "Merge", onPress: async () => { if (!uid) return; await mergePotentialDuplicate(uid, scope, record.id); await refresh(); void sync(); } }])} style={styles.reviewButton}><ThemedText style={styles.actionText}>Merge into matching transaction</ThemedText></Pressable> : <Pressable onPress={() => beginEdit(record)} style={styles.reviewButton}><ThemedText style={styles.actionText}>Explain / classify</ThemedText></Pressable>}<Pressable onPress={() => { void save({ ...record, classificationStatus: "dismissed" }); }} style={styles.textAction}><ThemedText color="#9b5348">Dismiss from totals</ThemedText></Pressable></View>)}
      {smsReviewCandidates.map((candidate) => <View key={candidate.messageKey} style={styles.reviewItem}><ThemedText type="defaultSemiBold">{candidate.provider} · Needs manual review</ThemedText><ThemedText type="tiny">{new Date(candidate.date).toLocaleString()} · {candidate.reason}</ThemedText><ThemedText type="tiny">{candidate.body}</ThemedText><Pressable onPress={() => beginSmsReview(candidate)} style={styles.reviewButton}><ThemedText style={styles.actionText}>Record this transaction</ThemedText></Pressable><Pressable onPress={() => Alert.alert("Dismiss message?", "This keeps it out of your financial totals. You can scan again later, but this exact message will remain dismissed on this device.", [{ text: "Cancel", style: "cancel" }, { text: "Dismiss", style: "destructive", onPress: async () => { if (!uid) return; await resolveSmsReviewCandidate(uid, scope, candidate.messageKey, "dismissed"); await refreshSmsQueue(); } }])} style={styles.textAction}><ThemedText color="#9b5348">Dismiss message</ThemedText></Pressable></View>)}
      {!reviewRecords.length && <ThemedText style={styles.empty}>Nothing waiting for review. Import SMS from Overview or add historical transactions manually.</ThemedText>}{Platform.OS === "android" && <Pressable disabled={importing} onPress={() => void importSms()} style={styles.smsButton}><Ionicons name="chatbubble-ellipses-outline" size={19} color="#214f3a" /><ThemedText>{importing ? "Scanning messages…" : "Scan available SMS history"}</ThemedText></Pressable>}
      {editing && <View style={styles.form}><ThemedText type="subtitle">Classify transaction</ThemedText><TextInput value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="decimal-pad" style={styles.input} /><TextInput value={description} onChangeText={setDescription} placeholder="Description" style={styles.input} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(editing.direction === "in" ? ["income", "loan_received", "adjustment", "other"] as const : ["expense", "fixed_asset", "investment", "loan_repayment", "transfer", "adjustment", "other"] as const).map((item) => <Pressable key={item} onPress={() => { setKind(item); setDirection(item === "transfer" ? "transfer" : editing.direction); }} style={[styles.chip, kind === item && styles.chipSelected]}><ThemedText>{typeLabel[item]}</ThemedText></Pressable>)}</ScrollView>{kind === "adjustment" && <ThemedText type="tiny">Explain why this account balance is changing. Adjustments do not count as income or spending.</ThemedText>}<ThemedText type="tiny">{kind === "transfer" ? "FROM ACCOUNT" : "ACCOUNT"}</ThemedText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{accounts.filter((item) => !item.archived && item.currency === currency).map((item) => <Pressable key={item.id} onPress={() => setAccountId(item.id)} style={[styles.chip, accountId === item.id && styles.chipSelected]}><ThemedText>{item.name}</ThemedText></Pressable>)}</ScrollView>{kind === "transfer" && <><ThemedText type="tiny">TO ACCOUNT</ThemedText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{accounts.filter((item) => !item.archived && item.currency === currency && item.id !== accountId).map((item) => <Pressable key={item.id} onPress={() => setToAccountId(item.id)} style={[styles.chip, toAccountId === item.id && styles.chipSelected]}><ThemedText>{item.name}</ThemedText></Pressable>)}</ScrollView></>}<TextInput value={category} onChangeText={setCategory} placeholder="Category or custom purpose" style={styles.input} /><Pressable onPress={() => void handleSave()} style={styles.saveButton}><ThemedText style={styles.actionText}>Save classification</ThemedText></Pressable></View>}
    </>}
    {!user && <ThemedText>Sign in to synchronize. Local manual records remain on this device.</ThemedText>}
  </ScrollView></ScreenWrapper>;
}

const styles = StyleSheet.create({
  page: { padding: 18, paddingBottom: 40, gap: 16 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }, title: { fontSize: 28, lineHeight: 34 }, iconButton: { width: 42, height: 42, justifyContent: "center", alignItems: "center", borderRadius: 22, backgroundColor: "#e6f0e9" },
  segment: { flexDirection: "row", padding: 4, backgroundColor: "#edf1ee", borderRadius: 12 }, segmentItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9 }, segmentSelected: { backgroundColor: "#214f3a" }, segmentSelectedText: { color: "#fff" }, notice: { padding: 11, backgroundColor: "#fff1d8", borderRadius: 8 }, netWorth: { padding: 18, backgroundColor: "#214f3a", borderRadius: 8, gap: 8 }, summaryHead: { flexDirection: "row", justifyContent: "space-between" }, netWorthValue: { fontFamily: "sfbold", fontSize: 30, color: "#fff" },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, monthTitle: { fontSize: 18 }, monthBalanceLine: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }, monthStats: { flexDirection: "row", gap: 8 }, stat: { width: 112, padding: 11, borderLeftWidth: 2, borderColor: "#d2ded5", gap: 5 }, incomeAmount: { color: "#19704a" }, expenseAmount: { color: "#a84f43" }, transferAmount: { color: "#5e6570" }, actions: { flexDirection: "row", gap: 10 }, actionButton: { flex: 1, minHeight: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }, moneyIn: { backgroundColor: "#21744b" }, moneyOut: { backgroundColor: "#a84f43" }, transferAction: { backgroundColor: "#e6f0e9" }, actionText: { color: "#fff", fontFamily: "sfbold" },
  accountCard: { padding: 14, gap: 8, borderWidth: 1, borderColor: "#d7dfd9", borderRadius: 8, backgroundColor: "#fbfcfb" }, accountRow: { gap: 6, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#dce4de" }, accountBalanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, accountAdd: { minHeight: 42, borderRadius: 7, backgroundColor: "#214f3a", alignItems: "center", justifyContent: "center" }, openingSave: { minHeight: 46, paddingHorizontal: 10, borderRadius: 7, backgroundColor: "#214f3a", alignItems: "center", justifyContent: "center" },
  form: { padding: 14, gap: 10, borderWidth: 1, borderColor: "#d7dfd9", borderRadius: 8, backgroundColor: "#fbfcfb" }, formHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, input: { minHeight: 46, paddingHorizontal: 13, borderWidth: 1, borderColor: "#cbd5ce", borderRadius: 7, color: "#1c2921", backgroundColor: "#fff" }, chips: { gap: 7, paddingVertical: 2 }, chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: "#cbd5ce" }, chipSelected: { backgroundColor: "#e3eee6", borderColor: "#3d7958" }, inlineInputs: { flexDirection: "row", gap: 8 }, flexInput: { flex: 1, minWidth: 0 }, saveButton: { minHeight: 46, borderRadius: 7, backgroundColor: "#214f3a", alignItems: "center", justifyContent: "center" }, textAction: { paddingVertical: 5 }, sectionHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }, empty: { paddingVertical: 14, color: "#69776e" }, monthSectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13 }, monthAmount: { flexDirection: "row", gap: 9 },
  transaction: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#e0e6e1" }, directionMark: { width: 3, height: 31, borderRadius: 2 }, inMark: { backgroundColor: "#21804f" }, outMark: { backgroundColor: "#ae594d" }, transferMark: { backgroundColor: "#7d8791" }, transactionText: { flex: 1, gap: 2, minWidth: 70 }, smsButton: { minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: "#9eb4a3", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 }, smsOffer: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, borderWidth: 1, borderColor: "#c8d8cc", borderRadius: 8, backgroundColor: "#f2f7f3" }, offerText: { flex: 1, gap: 4 }, offerButton: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 7, backgroundColor: "#214f3a" }, categoryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#dce4de" }, categoryActions: { flexDirection: "row", gap: 16 }, reviewItem: { borderBottomWidth: 1, borderColor: "#d3ddd6", paddingBottom: 12 }, reviewButton: { minHeight: 42, borderRadius: 7, backgroundColor: "#214f3a", alignItems: "center", justifyContent: "center", marginTop: 8 },
});
