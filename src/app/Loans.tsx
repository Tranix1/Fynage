import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { router, useFocusEffect } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { ensureDefaultFinancialAccounts, listFinancialAccounts } from "@/repositories/financialRecords";
import { createPlatformLedgerEntry, findUserByPhone, listLoanSourceCategories, listLoans, saveLoan, saveLoanSourceCategory } from "@/services/finance/moneyGoals";
import { listMurimiFarmAccounts, saveMurimiLoanMovement } from "@/services/integrations/murimiFinance";
import { listTengesaFinance } from "@/services/integrations/tengesaFinance";
import type { LoanEntry, LoanSourceCategory } from "@/types/moneyGoals";

const money = (minor: number) => `USD ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const borderColor = "#CBD5CE";
const dateToday = () => new Date().toISOString().slice(0, 10);
const parseDate = (value: string) => new Date(`${value}T12:00:00`);
const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const oneMonthLater = (value: string) => { const date = parseDate(value); const day = date.getDate(); date.setMonth(date.getMonth() + 1); if (date.getDate() < day) date.setDate(0); return formatDate(date); };
const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
type RegisteredUser = { uid: string; phoneNumber: string; displayName?: string | null };

export default function Loans() {
  const { user, activeAccountId } = useAuth(); const { save: saveFinancial } = useFinancialRecords(); const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const input = useThemeColor("input"); const text = useThemeColor("text");
  const [rows, setRows] = useState<LoanEntry[]>([]); const [tab, setTab] = useState<"summary" | "offer" | "all">("summary"); const [mode, setMode] = useState<"lend" | "borrow">("lend"); const [phone, setPhone] = useState(""); const [amount, setAmount] = useState(""); const [interest, setInterest] = useState(""); const [issueDate, setIssueDate] = useState(dateToday()); const [dueDate, setDueDate] = useState(oneMonthLater(dateToday())); const [dueDateEdited, setDueDateEdited] = useState(false); const [datePickerTarget, setDatePickerTarget] = useState<"issue" | "due" | null>(null); const [note, setNote] = useState(""); const [repaymentId, setRepaymentId] = useState<string | null>(null); const [repaymentAmount, setRepaymentAmount] = useState(""); const [repaymentDate, setRepaymentDate] = useState(dateToday()); const [loading, setLoading] = useState(true); const hasLoaded = useRef(false);
  const [categories, setCategories] = useState<LoanSourceCategory[]>([]); const [sourceCategoryId, setSourceCategoryId] = useState(""); const [newCategoryName, setNewCategoryName] = useState(""); const [savingCategory, setSavingCategory] = useState(false);
  const [foundUser, setFoundUser] = useState<RegisteredUser | null>(null); const [selectedUser, setSelectedUser] = useState<RegisteredUser | null>(null); const [searchingUser, setSearchingUser] = useState(false); const [userSearchMessage, setUserSearchMessage] = useState("");
  const [platform, setPlatform] = useState<"fynage" | "murimi" | "tengesa">("fynage"); const [farms, setFarms] = useState<{ id: string; name: string }[]>([]); const [farmId, setFarmId] = useState(""); const [stores, setStores] = useState<{ id: string; name: string; connected: boolean; financialAccess: boolean }[]>([]); const [storeId, setStoreId] = useState("");
  const load = useCallback(async () => { if (!user?.uid) { setRows([]); setCategories([]); setLoading(false); return; } if (!hasLoaded.current) setLoading(true); try { const [loans, sourceCategories] = await Promise.all([listLoans(user.uid), listLoanSourceCategories(user.uid)]); setRows(loans); setCategories(sourceCategories); } finally { hasLoaded.current = true; setLoading(false); } }, [user]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (!user?.uid) return; let active = true; void Promise.all([listMurimiFarmAccounts(user.uid).catch(() => []), listTengesaFinance(user.uid).catch(() => [])]).then(([farmRows, storeRows]) => { if (active) { setFarms(farmRows); setFarmId((current) => farmRows.some((row) => row.id === current) ? current : ""); setStores(storeRows); setStoreId((current) => storeRows.some((row) => row.id === current) ? current : ""); } }); return () => { active = false; }; }, [user?.uid]);
  const issued = useMemo(() => rows.filter((row) => row.lenderUid === user?.uid), [rows, user]); const received = useMemo(() => rows.filter((row) => row.borrowerUid === user?.uid), [rows, user]);
  const receivedBySource = useMemo(() => {
    const grouped = new Map<string, { name: string; total: number; latestDate: string; count: number }>();
    for (const row of received) {
      const name = row.lenderName || row.lenderPhone || row.sourceCategoryName || "Unlisted source";
      const loanDate = row.issueDate ?? row.createdAt.slice(0, 10); const current = grouped.get(name) ?? { name, total: 0, latestDate: loanDate, count: 0 };
      current.total += row.amountMinor;
      current.count += 1;
      if (loanDate > current.latestDate) current.latestDate = loanDate;
      grouped.set(name, current);
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [received]);
  const issuedTotal = issued.reduce((sum, row) => sum + row.amountMinor, 0); const receivedTotal = received.reduce((sum, row) => sum + row.amountMinor, 0); const interestIssued = issued.reduce((sum, row) => sum + Math.round(row.amountMinor * row.interestBps / 10000), 0); const interestReceived = received.reduce((sum, row) => sum + Math.round(row.amountMinor * row.interestBps / 10000), 0);
  const outstanding = (row: LoanEntry) => Math.max(0, row.amountMinor + Math.round(row.amountMinor * row.interestBps / 10000) - (row.paidMinor ?? 0));
  const searchUser = async () => {
    const query = phone.trim();
    setFoundUser(null);
    setUserSearchMessage("");
    if (!query) {
      setUserSearchMessage("Enter a phone number to search registered users. This is optional.");
      return;
    }
    setSearchingUser(true);
    try {
      const match = await findUserByPhone(query);
      if (!match) setUserSearchMessage("No registered user found for that phone number. You can still save this loan without selecting a user.");
      else if (match.uid === user?.uid) setUserSearchMessage("Choose another user.");
      else setFoundUser(match);
    } finally {
      setSearchingUser(false);
    }
  };

  const addSourceCategory = async () => {
    if (!user?.uid) return;
    const categoryName = newCategoryName.trim().replace(/\s+/g, " ");
    if (!categoryName) { Alert.alert("Name the category", "Enter a source such as a bank, friend, or lender."); return; }
    const existing = categories.find((item) => item.name.toLowerCase() === categoryName.toLowerCase());
    if (existing) {
      setSourceCategoryId(existing.id);
      setNewCategoryName("");
      return;
    }
    setSavingCategory(true);
    const now = new Date().toISOString();
    const category: LoanSourceCategory = { id: "loan_source_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8), ownerId: user.uid, name: categoryName, createdAt: now, updatedAt: now };
    try {
      await saveLoanSourceCategory(category);
      setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
      setSourceCategoryId(category.id);
      setNewCategoryName("");
    } catch (error) {
      Alert.alert("Could not save category", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSavingCategory(false);
    }
  };

  const save = async () => {
    if (!user?.uid) return;
    const value = Number(amount.trim().replace(/,/g, ""));
    const rate = Number(interest.trim().replace(",", ".") || 0);
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) { Alert.alert("Enter a valid amount", "Loan amount must be greater than zero."); return; }
    if (!Number.isFinite(rate) || rate < 0) { Alert.alert("Check interest", "Interest must be zero or more."); return; }
    if (!isValidDate(issueDate)) { Alert.alert("Enter the issue date", "Use YYYY-MM-DD for the date the loan was issued or received."); return; }
    if (!isValidDate(dueDate)) { Alert.alert("Enter the due date", "Use YYYY-MM-DD for the repayment due date."); return; }
    if (dueDate < issueDate) { Alert.alert("Check dates", "Due date must be on or after the issue date."); return; }
    if (selectedUser?.uid === user.uid) { Alert.alert("Choose another user", "You cannot create a loan with yourself."); return; }
    const selectedFarm = farms.find((farm) => farm.id === farmId);
    const selectedStore = stores.find((store) => store.id === storeId && store.connected && store.financialAccess);
    if (platform === "murimi" && !selectedFarm) { Alert.alert("Select a farm", "Choose the Murimi farm that this loan belongs to."); return; }
    if (platform === "tengesa" && !selectedStore) { Alert.alert("Select a connected store", "Connect a Tengesa store with financial access first."); return; }

    const now = new Date().toISOString();
    const id = "loan_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const otherUid = selectedUser?.uid ?? "unlinked_" + id;
    const otherPhone = selectedUser?.phoneNumber ?? phone.trim();
    const otherName = selectedUser?.displayName ?? undefined;
    const sourceCategory = categories.find((item) => item.id === sourceCategoryId);
    const entry: LoanEntry = {
      id,
      lenderUid: mode === "lend" ? user.uid : otherUid,
      borrowerUid: mode === "borrow" ? user.uid : otherUid,
      lenderPhone: mode === "lend" ? user.phoneNumber ?? "" : otherPhone,
      borrowerPhone: mode === "borrow" ? user.phoneNumber ?? "" : otherPhone,
      lenderName: mode === "lend" ? user.displayName ?? undefined : otherName,
      borrowerName: mode === "borrow" ? user.displayName ?? undefined : otherName,
      sourceCategoryId: sourceCategory?.id,
      sourceCategoryName: sourceCategory?.name,
      platform,
      platformBusinessId: platform === "murimi" ? selectedFarm?.id : platform === "tengesa" ? selectedStore?.id : undefined,
      farmId: platform === "murimi" ? selectedFarm?.id : undefined,
      farmName: platform === "murimi" ? selectedFarm?.name : platform === "tengesa" ? selectedStore?.name : undefined,
      amountMinor: Math.round(value * 100),
      currency: "USD",
      interestBps: Math.round(rate * 100),
      status: "open",
      issueDate,
      dueDate,
      note: note.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      paidMinor: 0,
      interestPaidMinor: 0,
      repayments: [],
    };
    const linkedRegisteredUser = Boolean(selectedUser);
    await saveLoan(entry, user.uid);
    if (platform === "fynage") try {
      const scope = activeAccountId ?? "personal";
      await ensureDefaultFinancialAccounts(user.uid, scope);
      const accounts = await listFinancialAccounts(user.uid, scope);
      const account = accounts.find((item) => !item.archived && item.currency === entry.currency);
      if (!account) throw new Error("Create a " + entry.currency + " account first.");
      const counterparty = otherName || otherPhone || sourceCategory?.name || "Unlisted source";
      await saveFinancial({
        id: "loan_issue_" + entry.id,
        type: mode === "lend" ? "investment" : "loan_received",
        direction: mode === "lend" ? "out" : "in",
        amountMinor: entry.amountMinor,
        currency: entry.currency,
        category: "Loans",
        description: mode === "lend" ? "Loan issued to " + counterparty : "Loan received from " + counterparty,
        occurredAt: entry.issueDate + "T12:00:00.000Z",
        accountId: account.id,
        account: account.name,
        assetValueMinor: mode === "lend" ? entry.amountMinor : undefined,
        liabilityMinor: mode === "borrow" ? entry.amountMinor : undefined,
        counterparty,
        notes: entry.note,
        source: "manual",
        sourceApp: "fynage",
        classificationStatus: "reviewed",
      });
    } catch (error) {
      Alert.alert("Loan saved, ledger not updated", error instanceof Error ? error.message : "Could not record the loan in the financial ledger.");
    }
    if (platform === "murimi" && selectedFarm) {
      try { await saveMurimiLoanMovement({ ownerId: user.uid, farmId: selectedFarm.id, loanId: entry.id, eventId: "issued", amountMinor: entry.amountMinor, direction: mode === "borrow" ? "inflow" : "outflow", receivableChangeMinor: mode === "lend" ? entry.amountMinor : 0, payableChangeMinor: mode === "borrow" ? entry.amountMinor : 0, date: entry.issueDate!, description: mode === "lend" ? `Loan issued to ${otherName || otherPhone || "unlisted person"}` : `Loan received from ${otherName || otherPhone || "unlisted lender"}` }); }
      catch (error) { Alert.alert("Loan saved, farm net worth not updated", error instanceof Error ? error.message : "Could not save the loan to the selected farm."); }
    }
    if (platform === "tengesa" && selectedStore) {
      try { await createPlatformLedgerEntry({ id: `loan_issue_${entry.id}`, ownerId: user.uid, businessId: selectedStore.id, sourceApp: "tengesa", sourceModule: "store", sourceBusinessId: selectedStore.id, sourceAccountId: selectedStore.id, type: mode === "lend" ? "investment" : "loan_received", direction: mode === "lend" ? "out" : "in", amountMinor: entry.amountMinor, currency: entry.currency, category: "Loans", description: mode === "lend" ? `Loan issued to ${otherName || otherPhone || "unlisted person"}` : `Loan received from ${otherName || otherPhone || "unlisted lender"}`, occurredAt: `${entry.issueDate}T12:00:00.000Z`, accountId: selectedStore.id, source: "fynage", classificationStatus: "reviewed", createdAt: now, updatedAt: now, revision: 1 }, "tengesa", selectedStore.id); }
      catch (error) { Alert.alert("Loan saved, Tengesa ledger not updated", error instanceof Error ? error.message : "Could not record this loan in the selected store."); }
    }
    setPhone("");
    setFoundUser(null);
    setSelectedUser(null);
    setUserSearchMessage("");
    setAmount("");
    setInterest("");
    setIssueDate(dateToday());
    setDueDate(oneMonthLater(dateToday()));
    setDueDateEdited(false);
    setNote("");
    await load();
    Alert.alert("Loan saved", linkedRegisteredUser ? "Loan recorded for the selected user." : "Loan saved without a registered user. You can link a person later.");
  };
  // eslint-disable-next-line react-hooks/purity
  const recordPayment = async (row: LoanEntry) => {
    if (!user?.uid) return;
    const value = Number(repaymentAmount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0 || !isValidDate(repaymentDate)) { Alert.alert("Complete payment", "Enter a valid payment amount and date."); return; }
    const payment = Math.round(value * 100);
    const totalInterest = Math.round(row.amountMinor * row.interestBps / 10000);
    const previousPrincipal = (row.repayments ?? []).reduce((sum, item) => sum + (item.principalMinor ?? Math.max(0, item.amountMinor - item.interestMinor)), 0);
    const previousInterest = (row.repayments ?? []).reduce((sum, item) => sum + item.interestMinor, 0);
    const principalPart = Math.min(Math.max(0, row.amountMinor - previousPrincipal), payment);
    const interestPart = Math.min(Math.max(0, totalInterest - previousInterest), payment - principalPart);
    const recorded = principalPart + interestPart;
    if (recorded <= 0) { Alert.alert("Loan is already paid", "There is no remaining principal or interest to record."); return; }
    // eslint-disable-next-line react-hooks/purity
    const repaymentIdValue = `repay_${Date.now()}`;
    const nextPaid = Math.min(row.amountMinor + totalInterest, (row.paidMinor ?? 0) + recorded);
    const updated: LoanEntry = { ...row, paidMinor: nextPaid, interestPaidMinor: previousInterest + interestPart, status: nextPaid >= row.amountMinor + totalInterest ? "repaid" : "open", repayments: [...(row.repayments ?? []), { id: repaymentIdValue, amountMinor: recorded, principalMinor: principalPart, interestMinor: interestPart, paidAt: repaymentDate, byUid: user.uid }], updatedAt: new Date().toISOString() };
    try {
      await saveLoan(updated, user.uid);
      const lender = row.lenderUid === user.uid;
      if (row.platform === "murimi" && row.farmId && principalPart > 0) {
        await saveMurimiLoanMovement({ ownerId: user.uid, farmId: row.farmId, loanId: row.id, eventId: repaymentIdValue, amountMinor: recorded, direction: lender ? "inflow" : "outflow", receivableChangeMinor: lender ? -principalPart : 0, payableChangeMinor: lender ? 0 : -principalPart, date: repaymentDate, description: `Loan repayment ${lender ? "received" : "paid"}` });
      } else if (row.platform === "tengesa") {
        const store = stores.find((item) => item.connected && item.financialAccess && item.id === row.platformBusinessId);
        if (!store) throw new Error("The linked Tengesa store is no longer available.");
        await createPlatformLedgerEntry({ id: `loan_repayment_${row.id}_${repaymentIdValue}`, ownerId: user.uid, businessId: store.id, sourceApp: "tengesa", sourceModule: "store", sourceBusinessId: store.id, sourceAccountId: store.id, type: "loan_repayment", direction: lender ? "in" : "out", amountMinor: recorded, currency: row.currency, category: "Loan repayment", description: "Loan repayment", occurredAt: `${repaymentDate}T12:00:00.000Z`, accountId: store.id, source: "fynage", classificationStatus: "reviewed", createdAt: updated.updatedAt, updatedAt: updated.updatedAt, revision: 1 }, "tengesa", store.id);
      } else if (row.platform !== "murimi") {
        const scope = activeAccountId ?? "personal";
        await ensureDefaultFinancialAccounts(user.uid, scope);
        const accounts = await listFinancialAccounts(user.uid, scope);
        const account = accounts.find((item) => !item.archived && item.currency === row.currency);
        if (!account) throw new Error(`Create a ${row.currency} account first.`);
        if (lender && principalPart > 0) await saveFinancial({ id: `loan_repayment_${row.id}_${repaymentIdValue}_principal`, type: "investment", direction: "in", amountMinor: principalPart, currency: row.currency, category: "Loan repayment", description: `Principal received from ${row.borrowerName || row.borrowerPhone}`, occurredAt: `${repaymentDate}T12:00:00.000Z`, accountId: account.id, account: account.name, principalMinor: principalPart, assetValueMinor: -principalPart, counterparty: row.borrowerPhone, notes: "Loan principal repayment", source: "manual", sourceApp: "fynage", classificationStatus: "reviewed" });
        if (lender && interestPart > 0) await saveFinancial({ id: `loan_repayment_${row.id}_${repaymentIdValue}_interest`, type: "income", direction: "in", amountMinor: interestPart, currency: row.currency, category: "Loan interest", description: `Interest received from ${row.borrowerName || row.borrowerPhone}`, occurredAt: `${repaymentDate}T12:00:00.000Z`, accountId: account.id, account: account.name, interestMinor: interestPart, counterparty: row.borrowerPhone, notes: "Interest income from loan repayment", source: "manual", sourceApp: "fynage", classificationStatus: "reviewed" });
        if (!lender && principalPart > 0) await saveFinancial({ id: `loan_repayment_${row.id}_${repaymentIdValue}_principal`, type: "loan_repayment", direction: "out", amountMinor: principalPart, currency: row.currency, category: "Loan repayment", description: `Principal paid to ${row.lenderName || row.lenderPhone}`, occurredAt: `${repaymentDate}T12:00:00.000Z`, accountId: account.id, account: account.name, principalMinor: principalPart, interestMinor: 0, counterparty: row.lenderPhone, notes: "Loan principal repayment", source: "manual", sourceApp: "fynage", classificationStatus: "reviewed" });
        if (!lender && interestPart > 0) await saveFinancial({ id: `loan_repayment_${row.id}_${repaymentIdValue}_interest`, type: "expense", direction: "out", amountMinor: interestPart, currency: row.currency, category: "Loan interest", description: `Interest paid to ${row.lenderName || row.lenderPhone}`, occurredAt: `${repaymentDate}T12:00:00.000Z`, accountId: account.id, account: account.name, interestMinor: interestPart, counterparty: row.lenderPhone, notes: "Interest expense from loan repayment", source: "manual", sourceApp: "fynage", classificationStatus: "reviewed" });
      }
    } catch (error) { Alert.alert("Could not record payment", error instanceof Error ? error.message : "The payment could not be saved."); return; }
    setRepaymentId(null); setRepaymentAmount(""); await load();
  };  if (loading) return <ScreenWrapper><ActivityIndicator color={accent} /></ScreenWrapper>;
  const visible = tab === "all" ? rows : tab === "offer" ? issued : rows;
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><Pressable onPress={() => router.back()} style={styles.back}><ThemedText color={accent}>Back</ThemedText></Pressable><View style={styles.heading}><View style={styles.flex}><ThemedText type="title">Loans</ThemedText><ThemedText type="tiny" color={muted}>Offer, receive, and track repayment dates.</ThemedText></View><ThemedText type="title" color={accent}>$</ThemedText></View><View style={[styles.summary, { backgroundColor: surface, borderColor: accent }]}><ThemedText type="subtitle">Loan summary</ThemedText><View style={styles.metrics}><Metric label="Money issued" value={money(issuedTotal)} /><Metric label="Money received" value={money(receivedTotal)} /><Metric label="Interest on issued" value={money(interestIssued)} /><Metric label="Interest on received" value={money(interestReceived)} /></View><ThemedText type="tiny" color={muted}>Open issued balance {money(issued.filter((row) => row.status === "open").reduce((sum, row) => sum + outstanding(row), 0))}</ThemedText></View><View style={styles.tabs}>{(["summary", "offer", "all"] as const).map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, { borderColor: tab === item ? accent : border, backgroundColor: tab === item ? `${accent}18` : surface }]}><ThemedText color={tab === item ? accent : text}>{item === "summary" ? "Overview" : item === "offer" ? "Issued" : "All loans"}</ThemedText></Pressable>)}</View>{tab === "summary" && <View style={[styles.actionCard, { backgroundColor: surface, borderColor: border }]}><ThemedText type="subtitle">What do you want to do?</ThemedText><View style={styles.actionRow}><Pressable onPress={() => setTab("offer")} style={[styles.actionButton, { backgroundColor: accent }]}><ThemedText style={styles.darkText}>View issued</ThemedText></Pressable><Pressable onPress={() => { setMode("lend"); setTab("offer"); }} style={[styles.actionButton, { borderColor: accent }]}><ThemedText color={accent}>Offer loan</ThemedText></Pressable><Pressable onPress={() => { setMode("borrow"); setTab("offer"); }} style={[styles.actionButton, { borderColor: accent }]}><ThemedText color={accent}>Record received</ThemedText></Pressable></View></View>}{receivedBySource.length > 0 && tab === "summary" && <View style={[styles.actionCard, { backgroundColor: surface, borderColor: border }]}><ThemedText type="subtitle">Received by lender</ThemedText>{receivedBySource.map((item) => <View key={item.name} style={styles.sourceRow}><ThemedText type="defaultSemiBold">{item.name}</ThemedText><ThemedText type="tiny" color={muted}>{money(item.total)} · {item.count} loan{item.count === 1 ? "" : "s"} · latest {item.latestDate}</ThemedText></View>)}</View>}{tab === "offer" && <View style={[styles.form, { backgroundColor: surface, borderColor: border }]}><View style={styles.tabs}>{(["lend", "borrow"] as const).map((item) => <Pressable key={item} onPress={() => setMode(item)} style={[styles.tab, { borderColor: mode === item ? accent : border }]}><ThemedText color={mode === item ? accent : text}>{item === "lend" ? "I offer" : "I receive"}</ThemedText></Pressable>)}</View><ThemedText type="tiny" color={muted}>PLATFORM</ThemedText><View style={styles.tabs}>{(["fynage", "murimi", "tengesa"] as const).map((item) => <Pressable key={item} onPress={() => setPlatform(item)} style={[styles.tab, { borderColor: platform === item ? accent : border, backgroundColor: platform === item ? `${accent}18` : surface }]}><ThemedText color={platform === item ? accent : text}>{item === "fynage" ? "Fynage personal" : item === "murimi" ? "Murimi farm" : "Tengesa store"}</ThemedText></Pressable>)}</View>{platform === "murimi" && <><ThemedText type="tiny" color={muted}>SELECT FARM</ThemedText><View style={styles.tabs}>{farms.map((farm) => <Pressable key={farm.id} onPress={() => setFarmId(farm.id)} style={[styles.tab, { borderColor: farmId === farm.id ? accent : border }]}><ThemedText color={farmId === farm.id ? accent : text}>{farm.name}</ThemedText></Pressable>)}</View>{farms.length === 0 && <ThemedText type="tiny" color={muted}>No Murimi farms are available for this account.</ThemedText>}</>}{platform === "tengesa" && <><ThemedText type="tiny" color={muted}>SELECT STORE</ThemedText><View style={styles.tabs}>{stores.filter((store) => store.connected && store.financialAccess).map((store) => <Pressable key={store.id} onPress={() => setStoreId(store.id)} style={[styles.tab, { borderColor: storeId === store.id ? accent : border }]}><ThemedText color={storeId === store.id ? accent : text}>{store.name}</ThemedText></Pressable>)}</View></> }<ThemedText type="tiny" color={muted}>OTHER PERSON (OPTIONAL)</ThemedText><TextInput value={phone} onChangeText={(value) => { setPhone(value); setFoundUser(null); setSelectedUser(null); setUserSearchMessage(""); }} placeholder="Phone number (optional)" placeholderTextColor={muted} keyboardType="phone-pad" style={[styles.input, { backgroundColor: input, color: text, borderColor }]} /><Pressable disabled={searchingUser} onPress={() => void searchUser()} style={styles.inlineButton}><ThemedText color={accent}>{searchingUser ? "Searching…" : "Search registered users"}</ThemedText></Pressable>{foundUser && <Pressable onPress={() => { setSelectedUser(foundUser); setPhone(foundUser.phoneNumber); setFoundUser(null); setUserSearchMessage(""); }} style={[styles.userResult, { borderColor: accent }]}><ThemedText type="defaultSemiBold">{foundUser.displayName || "Registered user"}</ThemedText><ThemedText type="tiny" color={muted}>{foundUser.phoneNumber} · Tap to select</ThemedText></Pressable>}{selectedUser && <View style={[styles.userResult, { borderColor: accent }]}><ThemedText type="defaultSemiBold">Selected: {selectedUser.displayName || selectedUser.phoneNumber}</ThemedText><Pressable onPress={() => setSelectedUser(null)}><ThemedText color={accent}>Remove</ThemedText></Pressable></View>}{!!userSearchMessage && <ThemedText type="tiny" color={muted}>{userSearchMessage}</ThemedText>}<TextInput value={amount} onChangeText={setAmount} placeholder="Loan amount" placeholderTextColor={muted} keyboardType="decimal-pad" style={[styles.input, { backgroundColor: input, color: text, borderColor }]} /><TextInput value={interest} onChangeText={setInterest} placeholder="Interest %" placeholderTextColor={muted} keyboardType="decimal-pad" style={[styles.input, { backgroundColor: input, color: text, borderColor }]} /><View style={styles.dateRow}><TextInput value={issueDate} onChangeText={(value) => { setIssueDate(value); if (!dueDateEdited && isValidDate(value)) setDueDate(oneMonthLater(value)); }} placeholder="Issue date YYYY-MM-DD" placeholderTextColor={muted} style={[styles.input, styles.dateInput, { backgroundColor: input, color: text, borderColor }]} /><Pressable onPress={() => setDatePickerTarget("issue")} style={[styles.dateButton, { borderColor }]}><ThemedText color={accent}>Calendar</ThemedText></Pressable></View><View style={styles.dateRow}><TextInput value={dueDate} onChangeText={(value) => { setDueDate(value); setDueDateEdited(true); }} placeholder="Due date YYYY-MM-DD" placeholderTextColor={muted} style={[styles.input, styles.dateInput, { backgroundColor: input, color: text, borderColor }]} /><Pressable onPress={() => setDatePickerTarget("due")} style={[styles.dateButton, { borderColor }]}><ThemedText color={accent}>Calendar</ThemedText></Pressable></View><ThemedText type="tiny" color={muted}>SOURCE CATEGORY (OPTIONAL)</ThemedText><View style={styles.tabs}>{categories.map((category) => <Pressable key={category.id} onPress={() => setSourceCategoryId(sourceCategoryId === category.id ? "" : category.id)} style={[styles.tab, { borderColor: sourceCategoryId === category.id ? accent : border }]}><ThemedText color={sourceCategoryId === category.id ? accent : text}>{category.name}</ThemedText></Pressable>)}</View><View style={styles.categoryRow}><TextInput value={newCategoryName} onChangeText={setNewCategoryName} placeholder="Add loan source category" placeholderTextColor={muted} style={[styles.input, styles.categoryInput, { backgroundColor: input, color: text, borderColor }]} /><Pressable disabled={savingCategory} onPress={() => void addSourceCategory()}><ThemedText color={accent}>{savingCategory ? "Saving…" : "Add"}</ThemedText></Pressable></View><TextInput value={note} onChangeText={setNote} placeholder="Reason or note" placeholderTextColor={muted} style={[styles.input, { backgroundColor: input, color: text, borderColor }]} /><Pressable onPress={() => void save()} style={[styles.button, { backgroundColor: accent }]}><ThemedText style={styles.darkText}>{mode === "lend" ? "Offer loan" : "Save received loan"}</ThemedText></Pressable></View>}{visible.length ? visible.map((row) => { const due = row.amountMinor + Math.round(row.amountMinor * row.interestBps / 10000); const paid = row.paidMinor ?? 0; const progress = Math.min(100, Math.round((paid / Math.max(1, due)) * 100)); return <View key={row.id} style={[styles.loanCard, { backgroundColor: surface, borderColor }]}><View style={styles.loanHeader}><View style={styles.flex}><ThemedText type="defaultSemiBold">{row.lenderUid === user?.uid ? `To ${row.borrowerName || row.borrowerPhone || "Unlisted person"}` : `From ${row.lenderName || row.lenderPhone || "Unlisted lender"}`}</ThemedText><ThemedText type="tiny" color={muted}>{row.issueDate ?? row.createdAt.slice(0, 10)} Due {row.dueDate ?? "not set"} | {row.status}</ThemedText></View><ThemedText type="defaultSemiBold" color={accent}>{money(outstanding(row))}</ThemedText></View>{row.sourceCategoryName && <ThemedText type="tiny" color={muted}>Source: {row.sourceCategoryName}</ThemedText>}<ThemedText type="tiny" color={muted}>{row.platform === "murimi" ? `Murimi · ${row.farmName || "Farm"}` : row.platform === "tengesa" ? `Tengesa · ${row.farmName || "Store"}` : "Fynage personal"}</ThemedText><View style={styles.loanAmounts}><LoanValue label="Principal" value={money(row.amountMinor)} /><LoanValue label="Interest" value={money(due - row.amountMinor)} /><LoanValue label="Total due" value={money(due)} /></View><ThemedText type="tiny" color={muted}>Rate {row.interestBps / 100}% | Paid {money(paid)} | {progress}% repaid</ThemedText><View style={[styles.track, { backgroundColor: border }]}><View style={[styles.fill, { backgroundColor: accent, width: `${progress}%` }]} /></View>{row.status === "open" && <>{repaymentId === row.id ? <View style={styles.paymentRow}><TextInput value={repaymentAmount} onChangeText={setRepaymentAmount} placeholder="Payment amount" placeholderTextColor={muted} keyboardType="decimal-pad" style={[styles.input, styles.paymentInput, { backgroundColor: input, color: text, borderColor }]} /><TextInput value={repaymentDate} onChangeText={setRepaymentDate} placeholder="YYYY-MM-DD" placeholderTextColor={muted} style={[styles.input, styles.paymentInput, { backgroundColor: input, color: text, borderColor }]} /><Pressable onPress={() => void recordPayment(row)}><ThemedText color={accent}>Save</ThemedText></Pressable></View> : <Pressable onPress={() => setRepaymentId(row.id)}><ThemedText color={accent}>Record payment</ThemedText></Pressable>}</>}</View>; }) : <ThemedText type="tiny" color={muted}>No loans recorded yet.</ThemedText>}</ScrollView><Modal visible={datePickerTarget !== null} transparent animationType="fade" onRequestClose={() => setDatePickerTarget(null)}><View style={styles.modalBackdrop}><View style={[styles.dateModal, { backgroundColor: surface, borderColor }]}><ThemedText type="subtitle">{datePickerTarget === "due" ? "Choose due date" : "Choose issue date"}</ThemedText><DateTimePicker value={parseDate(datePickerTarget === "due" ? dueDate : issueDate)} mode="date" display="inline" accentColor={accent} onValueChange={(_, date) => { const selectedDate = formatDate(date); if (datePickerTarget === "issue") { setIssueDate(selectedDate); if (!dueDateEdited) setDueDate(oneMonthLater(selectedDate)); } else { setDueDate(selectedDate); setDueDateEdited(true); } setDatePickerTarget(null); }} /><Pressable onPress={() => setDatePickerTarget(null)} style={[styles.dateCancel, { borderColor: accent }]}><ThemedText color={accent}>Cancel</ThemedText></Pressable></View></View></Modal></ScreenWrapper>;
}
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><ThemedText type="tiny">{label}</ThemedText><ThemedText type="defaultSemiBold">{value}</ThemedText></View>; }
function LoanValue({ label, value }: { label: string; value: string }) { return <View style={styles.loanValue}><ThemedText type="tiny" color="#687385">{label}</ThemedText><ThemedText type="defaultSemiBold" numberOfLines={1} adjustsFontSizeToFit>{value}</ThemedText></View>; }
const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 42, gap: 13 }, back: { paddingVertical: 3 }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, flex: { flex: 1 }, summary: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, metric: { width: "46%", gap: 3 }, tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, tab: { minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, actionCard: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 11 }, actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, actionButton: { minHeight: 43, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, form: { borderWidth: 1, borderRadius: 15, padding: 13, gap: 9 }, input: { minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11 }, button: { minHeight: 46, borderRadius: 10, alignItems: "center", justifyContent: "center" }, darkText: { color: "#12315C", fontFamily: "sfbold" }, loanCard: { borderWidth: 1, borderRadius: 15, padding: 13, gap: 8 }, loanHeader: { flexDirection: "row", alignItems: "center", gap: 9 }, track: { height: 7, borderRadius: 7, overflow: "hidden" }, fill: { height: "100%", borderRadius: 7 }, paymentRow: { flexDirection: "row", alignItems: "center", gap: 6 }, paymentInput: { flex: 1, minWidth: 0 }, sourceRow: { gap: 3 }, inlineButton: { alignSelf: "flex-start", paddingVertical: 3 }, userResult: { borderWidth: 1, borderRadius: 9, padding: 10, gap: 3 }, categoryRow: { flexDirection: "row", alignItems: "center", gap: 8 }, categoryInput: { flex: 1 }, dateRow: { flexDirection: "row", alignItems: "center", gap: 8 }, dateInput: { flex: 1 }, dateButton: { minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, loanAmounts: { flexDirection: "row", gap: 8, marginTop: 3 }, loanValue: { flex: 1, minWidth: 0, borderRadius: 9, backgroundColor: "#F1F4F2", padding: 9, gap: 3 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 18 }, dateModal: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 }, dateCancel: { minHeight: 42, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" } });
