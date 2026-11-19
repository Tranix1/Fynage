import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { ensureDefaultFinancialAccounts, listFinancialAccounts } from "@/repositories/financialRecords";
import { changeAssetValuation, createAssetRecord, listAssets, replaceAllocation, saveAsset } from "@/services/assets/assetRecords";
import { appendDepreciationThrough, assertAllocationPercent, recordRecovery, recoveryOutstanding } from "@/services/assets/assetCalculations";
import type { AssetAllocation, AssetCategory, AssetPlatform, AssetRecord, DepreciationMethod } from "@/types/assets";
import type { FinancialAccount } from "@/types/finance";
import { listMurimiFarmAccounts } from "@/services/integrations/murimiFinance";
import { listTengesaFinance } from "@/services/integrations/tengesaFinance";

const categories: { id: AssetCategory; name: string }[] = [
  { id: "land", name: "Land" }, { id: "buildings", name: "Buildings" }, { id: "vehicles", name: "Vehicles" },
  { id: "machinery_equipment", name: "Machinery & equipment" }, { id: "solar_electrical", name: "Solar & electrical" },
  { id: "furniture_fittings", name: "Furniture & fittings" }, { id: "agricultural_infrastructure", name: "Agricultural infrastructure" },
  { id: "livestock_infrastructure", name: "Livestock infrastructure" }, { id: "other", name: "Other assets" },
];
const money = (minor: number, currency = "USD") => `${currency} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const assetName = (asset: AssetRecord) => asset.name || "Unnamed asset";

export default function AssetsHome() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const { user, activeAccountId } = useAuth();
  const { save: saveFinancial, refresh: refreshLedger } = useFinancialRecords();
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const input = useThemeColor("input"); const text = useThemeColor("text");
  const borderColor = border;
  const [assets, setAssets] = useState<AssetRecord[]>([]); const [accounts, setAccounts] = useState<FinancialAccount[]>([]); const [loading, setLoading] = useState(true);
  const [farmOptions, setFarmOptions] = useState<{ id: string; name: string }[]>([]); const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [section, setSection] = useState("Register"); const [formOpen, setFormOpen] = useState(false); const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [category, setCategory] = useState<AssetCategory>("other"); const [acquired, setAcquired] = useState(today()); const [cost, setCost] = useState(""); const [valuation, setValuation] = useState(""); const [valuationDate, setValuationDate] = useState(today()); const [legalOwner, setLegalOwner] = useState("Me"); const [location, setLocation] = useState(""); const [usefulLife, setUsefulLife] = useState(""); const [method, setMethod] = useState<DepreciationMethod>("straight_line"); const [residual, setResidual] = useState("0"); const [notes, setNotes] = useState(""); const [accountId, setAccountId] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null); const [action, setAction] = useState<"valuation" | "allocation" | "recovery" | null>(null); const [actionValue, setActionValue] = useState(""); const [actionDate, setActionDate] = useState(today()); const [actionReason, setActionReason] = useState(""); const [allocationPlatform, setAllocationPlatform] = useState<AssetPlatform>("murimi"); const [businessName, setBusinessName] = useState(""); const [businessId, setBusinessId] = useState(""); const [allocationPercent, setAllocationPercent] = useState(""); const [recoveryTarget, setRecoveryTarget] = useState(""); const [recoveryMethod, setRecoveryMethod] = useState<"manual" | "equal_monthly">("manual"); const [allocationId, setAllocationId] = useState("");
  const uid = user?.uid; const scope = activeAccountId ?? "personal";

  const load = useCallback(async () => {
    if (!uid) { setAssets([]); setAccounts([]); setLoading(false); return; }
    setLoading(true);
    try {
      await ensureDefaultFinancialAccounts(uid, scope);
      const [nextAssets, nextAccounts] = await Promise.all([listAssets(uid), listFinancialAccounts(uid, scope)]);
      setAssets(nextAssets.filter((asset) => !asset.deletedAt)); setAccounts(nextAccounts.filter((account) => !account.archived));
      setAccountId((current) => nextAccounts.some((account) => account.id === current && !account.archived) ? current : nextAccounts.find((account) => account.name === "Cash" && !account.archived)?.id ?? nextAccounts.find((account) => !account.archived)?.id ?? "");
    } finally { setLoading(false); }
  }, [uid, scope]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    if (add !== "1") return;
    const openForm = setTimeout(() => { setSection("Register"); setFormOpen(true); router.setParams({ add: undefined }); }, 0);
    return () => clearTimeout(openForm);
  }, [add]);
  useEffect(() => { if (!uid) return; let active = true; void Promise.all([listMurimiFarmAccounts(uid).catch(() => []), listTengesaFinance(uid).catch(() => [])]).then(([farms, stores]) => { if (active) { setFarmOptions(farms); setStoreOptions(stores.filter((store) => store.connected && store.financialAccess).map((store) => ({ id: store.id, name: store.name }))); } }); return () => { active = false; }; }, [uid]);

  const activeAssets = useMemo(() => assets.filter((asset) => asset.status === "active"), [assets]);
  const saveNewAsset = async () => {
    if (!uid) return;
    const costValue = Number(cost.replace(/,/g, ""));
    const valuationValue = valuation.trim() ? Number(valuation.replace(/,/g, "")) : costValue;
    const life = usefulLife.trim() ? Number(usefulLife) : undefined;
    const residualMinor = Math.round((Number(residual.replace(/,/g, "")) || 0) * 100);
    if (!name.trim() || !Number.isFinite(costValue) || costValue <= 0 || !Number.isFinite(valuationValue) || valuationValue < 0 || !accountId) { Alert.alert("Complete asset details", "Enter a name and valid acquisition cost, valuation, and account."); return; }
    if (life !== undefined && (!Number.isFinite(life) || life <= 0)) { Alert.alert("Check useful life", "Useful life must be greater than zero years."); return; }
    if (method !== "none" && life === undefined) { Alert.alert("Add useful life", "Enter useful life or set depreciation to none."); return; }
    if (residualMinor > Math.round(costValue * 100)) { Alert.alert("Check residual value", "Residual value cannot exceed acquisition cost."); return; }
    setSaving(true);
    // eslint-disable-next-line react-hooks/purity
    const id = `asset_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ledgerId = `asset_purchase_${id}`; const costMinor = Math.round(costValue * 100); const valueMinor = Math.round(valuationValue * 100);
    const asset = createAssetRecord({ id, ownerId: uid, accountId: scope, name: name.trim(), description: description.trim() || undefined, category, acquisitionDate: acquired, acquisitionCostMinor: costMinor, currency: "USD", currentValuationMinor: valueMinor, valuationDate, legalOwner: legalOwner.trim() || "Me", location: location.trim() || undefined, usefulLifeYears: life, depreciationMethod: category === "land" && method === "straight_line" ? "none" : method, depreciationStartDate: acquired, residualValueMinor: residualMinor, notes: notes.trim() || undefined, acquisitionRecordId: ledgerId });
    try {
      await saveFinancial({ id: ledgerId, type: "fixed_asset", direction: "out", amountMinor: costMinor, currency: "USD", category: "Asset acquisition", description: `Purchase: ${asset.name}`, occurredAt: `${acquired}T12:00:00.000Z`, accountId, account: accounts.find((account) => account.id === accountId)?.name, assetValueMinor: valueMinor, centralAssetId: id, notes: asset.notes, source: "manual", sourceApp: "fynage", classificationStatus: "reviewed" });
      await saveAsset(asset); await refreshLedger(); await load(); setFormOpen(false); clearForm();
    } catch (error) { Alert.alert("Could not save asset", error instanceof Error ? error.message : "Try again. The purchase remains linked to the financial ledger."); }
    finally { setSaving(false); }
  };

  const clearForm = () => { setName(""); setDescription(""); setCategory("other"); setAcquired(today()); setCost(""); setValuation(""); setValuationDate(today()); setLegalOwner("Me"); setLocation(""); setUsefulLife(""); setMethod("straight_line"); setResidual("0"); setNotes(""); };

  const persistAction = async () => {
    if (!uid || !selectedAsset) return;
    try {
      let updated = selectedAsset;
      if (action === "valuation") updated = changeAssetValuation(selectedAsset, Math.round(Number(actionValue.replace(/,/g, "")) * 100), actionDate, actionReason, uid);
      if (action === "allocation") {
        const percent = Number(allocationPercent.replace(",", ".")); const stableAllocationId = `alloc_${selectedAsset.id}_${allocationPlatform}_${businessId.trim()}`; assertAllocationPercent(selectedAsset.allocations, percent, stableAllocationId);
        if (!businessName.trim() || !businessId.trim()) throw new Error("Enter the business name and ID.");
        const targetMinor = recoveryTarget.trim() ? Math.round(Number(recoveryTarget.replace(/,/g, "")) * 100) : undefined;
        if (targetMinor !== undefined && (!Number.isSafeInteger(targetMinor) || targetMinor < 0 || targetMinor > selectedAsset.currentValuationMinor * percent / 100)) throw new Error("Recovery target cannot exceed this allocation's value.");
        const allocation: AssetAllocation = { id: stableAllocationId, assetId: selectedAsset.id, platform: allocationPlatform, businessId: businessId.trim(), businessName: businessName.trim(), allocationPercent: percent, allocatedValueMinor: Math.round(selectedAsset.currentValuationMinor * percent / 100), allocationDate: actionDate, status: "active", notes: actionReason.trim() || undefined, history: [], recoveryTargetMinor: targetMinor, recoveryStartDate: actionDate, recoveryMethod, recoveryPayments: [] };
        updated = replaceAllocation(selectedAsset, allocation);
      }
      if (action === "recovery") {
        const allocation = selectedAsset.allocations.find((row) => row.id === allocationId && row.status === "active");
        if (!allocation) throw new Error("Select an active business allocation.");
        // eslint-disable-next-line react-hooks/purity
        const recoveryTimestamp = Date.now();
        const updatedAllocation = recordRecovery(allocation, { id: `recovery_${selectedAsset.id}_${allocationId}_${recoveryTimestamp}`, amountMinor: Math.round(Number(actionValue.replace(/,/g, "")) * 100), date: actionDate, note: actionReason.trim() || undefined });
        updated = { ...selectedAsset, allocations: selectedAsset.allocations.map((row) => row.id === allocationId ? updatedAllocation : row), auditHistory: [...selectedAsset.auditHistory, { id: `audit_${recoveryTimestamp}`, date: new Date(recoveryTimestamp).toISOString(), actorId: uid, action: "recovery_recorded", changes: { allocationId, amount: actionValue } }], revision: selectedAsset.revision + 1 };
      }
      await saveAsset(updated); await load(); setSelectedAsset(null); setAction(null); setActionValue(""); setActionReason(""); setRecoveryTarget(""); setBusinessName(""); setBusinessId(""); setAllocationPercent("");
    } catch (error) { Alert.alert("Could not save asset update", error instanceof Error ? error.message : "Check the values and try again."); }
  };

  const recordDepreciation = async (asset: AssetRecord) => {
    if (!uid) return;
    const updated = appendDepreciationThrough(asset, today(), uid);
    if (updated === asset || updated.depreciationHistory.length === asset.depreciationHistory.length) { Alert.alert("Depreciation up to date", "There are no new monthly depreciation entries to record."); return; }
    await saveAsset(updated); await load();
  };

  const button = (label: string, onPress: () => void, filled = false) => <Pressable onPress={onPress} style={[styles.button, { backgroundColor: filled ? accent : surface, borderColor: accent }]}><ThemedText color={filled ? "#12315C" : accent}>{label}</ThemedText></Pressable>;
  const field = (label: string, value: string, change: (value: string) => void, placeholder: string, keyboardType?: "default" | "decimal-pad" | "numeric") => <View style={styles.field}><ThemedText type="tiny" color={muted}>{label}</ThemedText><TextInput value={value} onChangeText={change} placeholder={placeholder} placeholderTextColor={muted} keyboardType={keyboardType} style={[styles.input, { backgroundColor: input, borderColor, color: text }]} /></View>;
  const assetCard = (asset: AssetRecord) => <Pressable key={asset.id} onPress={() => router.push({ pathname: "/Assets/Details" as never, params: { id: asset.id } } as never)} style={[styles.assetCard, { backgroundColor: surface, borderColor }]}><View style={styles.assetHead}><View style={styles.flex}><ThemedText type="defaultSemiBold">{assetName(asset)}</ThemedText><ThemedText type="tiny" color={muted}>{categories.find((row) => row.id === asset.category)?.name ?? "Other assets"} | {asset.status}</ThemedText></View><ThemedText type="defaultSemiBold" color={accent}>{money(asset.netBookValueMinor, asset.currency)}</ThemedText></View><View style={styles.values}><Mini label="Cost" value={money(asset.acquisitionCostMinor, asset.currency)} /><Mini label="Valuation" value={money(asset.currentValuationMinor, asset.currency)} /><Mini label="Depreciation" value={money(asset.accumulatedDepreciationMinor, asset.currency)} /></View><ThemedText type="tiny" color={muted}>{asset.allocations.filter((row) => row.status === "active").length} active business allocation(s) | acquired {asset.acquisitionDate}</ThemedText></Pressable>;

  if (loading) return <ScreenWrapper><ActivityIndicator color={accent} /></ScreenWrapper>;
  const listed = section === "Register" ? assets.filter((asset) => !asset.deletedAt) : section === "Allocations" ? assets.filter((asset) => asset.allocations.some((row) => row.status === "active")) : assets.filter((asset) => asset.status === "active");
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.heading}><View style={styles.flex}><ThemedText type="title">Asset Register</ThemedText><ThemedText type="tiny" color={muted}>{assets.filter((asset) => !asset.deletedAt).length} registered asset{assets.filter((asset) => !asset.deletedAt).length === 1 ? "" : "s"}</ThemedText></View>{button("+ Add asset", () => setFormOpen(true), true)}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{["Register", "Allocations", "Valuations", "Depreciation", "Cost recovery", "History"].map((item) => <Pressable key={item} onPress={() => setSection(item)} style={[styles.tab, { borderColor: section === item ? accent : border, backgroundColor: section === item ? `${accent}18` : surface }]}><ThemedText color={section === item ? accent : text}>{item}</ThemedText></Pressable>)}</ScrollView>
    {section === "Depreciation" && <View style={[styles.panel, { backgroundColor: surface, borderColor }]}><ThemedText type="subtitle">Depreciation</ThemedText><ThemedText type="tiny" color={muted}>Straight-line and declining-balance depreciation are recorded once per asset and month. Land defaults to no depreciation.</ThemedText>{activeAssets.filter((asset) => asset.depreciationMethod !== "none").map((asset) => <View key={asset.id} style={styles.listRow}><View style={styles.flex}><ThemedText type="defaultSemiBold">{asset.name}</ThemedText><ThemedText type="tiny" color={muted}>{asset.depreciationMethod.replace("_", " ")} | life {asset.usefulLifeYears ?? "—"} years | book {money(asset.netBookValueMinor)}</ThemedText></View>{button("Record through this month", () => void recordDepreciation(asset))}</View>)}</View>}
    {section === "Allocations" && <View style={[styles.panel, { backgroundColor: surface, borderColor }]}><ThemedText type="subtitle">Business allocations</ThemedText><ThemedText type="tiny" color={muted}>Allocation changes preserve previous percentages and values.</ThemedText>{assets.flatMap((asset) => asset.allocations.filter((row) => row.status === "active").map((allocation) => <View key={allocation.id} style={styles.listRow}><View style={styles.flex}><ThemedText type="defaultSemiBold">{asset.name} to {allocation.businessName}</ThemedText><ThemedText type="tiny" color={muted}>{allocation.allocationPercent}% | {money(allocation.allocatedValueMinor)} | {allocation.platform}</ThemedText></View></View>))}{activeAssets.map((asset) => <View key={`allocate_${asset.id}`} style={styles.listRow}><View style={styles.flex}><ThemedText type="defaultSemiBold">{asset.name}</ThemedText><ThemedText type="tiny" color={muted}>Unallocated {money(Math.max(0, asset.currentValuationMinor - asset.allocations.filter((row) => row.status === "active").reduce((sum, row) => sum + row.allocatedValueMinor, 0)))}</ThemedText></View>{button("Allocate", () => { setSelectedAsset(asset); setAction("allocation"); setActionDate(today()); }, true)}</View>)}</View>}
    {section === "Valuations" && <View style={[styles.panel, { backgroundColor: surface, borderColor }]}><ThemedText type="subtitle">Valuation history</ThemedText>{assets.flatMap((asset) => asset.valuationHistory.map((row) => <View key={row.id} style={styles.listRow}><View style={styles.flex}><ThemedText type="defaultSemiBold">{asset.name} | {money(row.valueMinor, asset.currency)}</ThemedText><ThemedText type="tiny" color={muted}>{row.date} | {row.reason}</ThemedText></View></View>))}</View>}
    {section === "Cost recovery" && <View style={[styles.panel, { backgroundColor: surface, borderColor }]}><ThemedText type="subtitle">Cost recovery</ThemedText><ThemedText type="tiny" color={muted}>Recoveries are tracked against allocation targets and do not create income or ledger transactions.</ThemedText>{assets.flatMap((asset) => asset.allocations.filter((row) => row.recoveryTargetMinor).map((row) => <View key={row.id} style={styles.listRow}><View style={styles.flex}><ThemedText type="defaultSemiBold">{asset.name} | {row.businessName}</ThemedText><ThemedText type="tiny" color={muted}>Target {money(row.recoveryTargetMinor ?? 0)} | recovered {money((row.recoveryTargetMinor ?? 0) - recoveryOutstanding(row))} | outstanding {money(recoveryOutstanding(row))}</ThemedText></View>{button("Record recovery", () => { setSelectedAsset(asset); setAllocationId(row.id); setAction("recovery"); }, false)}</View>))}{activeAssets.length > 0 && button("Configure allocation recovery", () => { const asset = activeAssets.find((row) => row.allocations.some((allocation) => allocation.status === "active")); if (!asset) { Alert.alert("Allocate an asset first", "Create an active business allocation, then add its recovery target."); return; } setSelectedAsset(asset); setAction("allocation"); }, false)}</View>}
    {section === "History" && <View style={[styles.panel, { backgroundColor: surface, borderColor }]}><ThemedText type="subtitle">Asset history</ThemedText>{assets.flatMap((asset) => asset.auditHistory.slice().reverse().map((row) => <View key={row.id} style={styles.listRow}><View style={styles.flex}><ThemedText type="defaultSemiBold">{asset.name} | {row.action.replace(/_/g, " ")}</ThemedText><ThemedText type="tiny" color={muted}>{row.date}</ThemedText></View></View>))}</View>}
    {section === "Register" && (listed.length ? listed.map(assetCard) : <View style={[styles.empty, { borderColor }]}><ThemedText type="subtitle">No assets yet</ThemedText><ThemedText type="tiny" color={muted}>Add an asset to track its cost, valuation, depreciation, allocations, and recovery.</ThemedText>{button("Add your first asset", () => setFormOpen(true), true)}</View>)}
  </ScrollView>

  <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: surface, borderColor }]}><View style={styles.modalHead}><ThemedText type="subtitle">Register asset</ThemedText><Pressable onPress={() => setFormOpen(false)}><ThemedText color={accent}>Close</ThemedText></Pressable></View><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    {field("ASSET NAME", name, setName, "e.g. Solar pump")}{field("DESCRIPTION", description, setDescription, "Details", "default")}
    <ThemedText type="tiny" color={muted}>CATEGORY</ThemedText><View style={styles.chips}>{categories.map((item) => <Pressable key={item.id} onPress={() => { setCategory(item.id); if (item.id === "land") setMethod("none"); }} style={[styles.tab, { borderColor: category === item.id ? accent : border }]}><ThemedText color={category === item.id ? accent : text}>{item.name}</ThemedText></Pressable>)}</View>
    {field("ACQUISITION DATE (YYYY-MM-DD)", acquired, setAcquired, today())}{field("ACQUISITION COST (USD)", cost, setCost, "0.00", "decimal-pad")}{field("CURRENT VALUATION (USD)", valuation, setValuation, "Defaults to acquisition cost", "decimal-pad")}{field("VALUATION DATE", valuationDate, setValuationDate, today())}
    <ThemedText type="tiny" color={muted}>PAYMENT ACCOUNT</ThemedText><View style={styles.chips}>{accounts.map((account) => <Pressable key={account.id} onPress={() => setAccountId(account.id)} style={[styles.tab, { borderColor: accountId === account.id ? accent : border }]}><ThemedText color={accountId === account.id ? accent : text}>{account.name}</ThemedText></Pressable>)}</View>
    {field("LEGAL OWNER", legalOwner, setLegalOwner, "Me")}{field("LOCATION", location, setLocation, "Where the asset is kept")}{field("USEFUL LIFE (YEARS)", usefulLife, setUsefulLife, "Optional", "decimal-pad")}{field("RESIDUAL VALUE (USD)", residual, setResidual, "0.00", "decimal-pad")}
    <ThemedText type="tiny" color={muted}>DEPRECIATION METHOD</ThemedText><View style={styles.chips}>{(["none", "straight_line", "declining_balance"] as const).map((item) => <Pressable key={item} onPress={() => setMethod(item)} style={[styles.tab, { borderColor: method === item ? accent : border }]}><ThemedText color={method === item ? accent : text}>{item.replace("_", " ")}</ThemedText></Pressable>)}</View>{field("NOTES", notes, setNotes, "Optional")}
    {button(saving ? "Saving..." : "Save asset and purchase", () => void saveNewAsset(), true)}
  </ScrollView></View></View></Modal>

  <Modal visible={action !== null} transparent animationType="fade" onRequestClose={() => { setAction(null); setSelectedAsset(null); }}><View style={styles.modalBackdrop}><View style={[styles.actionModal, { backgroundColor: surface, borderColor }]}><ThemedText type="subtitle">{action === "valuation" ? "Record valuation" : action === "allocation" ? `Allocate ${selectedAsset?.name ?? "asset"}` : "Record recovery payment"}</ThemedText>{selectedAsset && <ThemedText type="tiny" color={muted}>{selectedAsset.name} | current value {money(selectedAsset.currentValuationMinor)}</ThemedText>}
    {action === "valuation" && <>{field("NEW VALUE (USD)", actionValue, setActionValue, "0.00", "decimal-pad")}{field("VALUATION DATE", actionDate, setActionDate, today())}{field("REASON", actionReason, setActionReason, "Valuation reason")}</>}
    {action === "allocation" && <><ThemedText type="tiny" color={muted}>BUSINESS PLATFORM</ThemedText><View style={styles.chips}>{(["fynage", "murimi", "tengesa", "transix", "other"] as const).map((item) => <Pressable key={item} onPress={() => setAllocationPlatform(item)} style={[styles.tab, { borderColor: allocationPlatform === item ? accent : border }]}><ThemedText color={allocationPlatform === item ? accent : text}>{item}</ThemedText></Pressable>)}</View>{field("BUSINESS NAME", businessName, setBusinessName, "Business or farm")}{field("BUSINESS ID", businessId, setBusinessId, "Stable business ID")}<View style={styles.chips}>{(allocationPlatform === "murimi" ? farmOptions : allocationPlatform === "tengesa" ? storeOptions : allocationPlatform === "fynage" ? [{ id: scope, name: "Fynage personal" }] : []).map((business) => <Pressable key={business.id} onPress={() => { setBusinessName(business.name); setBusinessId(business.id); }} style={[styles.tab, { borderColor: businessId === business.id ? accent : border }]}><ThemedText color={businessId === business.id ? accent : text}>{business.name}</ThemedText></Pressable>)}</View>{field("ALLOCATION PERCENT", allocationPercent, setAllocationPercent, "e.g. 60", "decimal-pad")}{field("ALLOCATION DATE", actionDate, setActionDate, today())}{field("RECOVERY TARGET (OPTIONAL USD)", recoveryTarget, setRecoveryTarget, "0.00", "decimal-pad")}<ThemedText type="tiny" color={muted}>RECOVERY METHOD</ThemedText><View style={styles.chips}>{(["manual", "equal_monthly"] as const).map((item) => <Pressable key={item} onPress={() => setRecoveryMethod(item)} style={[styles.tab, { borderColor: recoveryMethod === item ? accent : border }]}><ThemedText color={recoveryMethod === item ? accent : text}>{item === "manual" ? "Manual" : "Equal monthly"}</ThemedText></Pressable>)}</View>{field("NOTES", actionReason, setActionReason, "Optional")}</>}
    {action === "recovery" && <>{field("RECOVERY AMOUNT (USD)", actionValue, setActionValue, "0.00", "decimal-pad")}{field("PAYMENT DATE", actionDate, setActionDate, today())}{field("NOTE", actionReason, setActionReason, "Optional")}</>}
    <View style={styles.actionGrid}>{button("Cancel", () => { setAction(null); setSelectedAsset(null); }, false)}{button("Save", () => void persistAction(), true)}</View>
  </View></View></Modal>
  </ScreenWrapper>;
}

function Mini({ label, value }: { label: string; value: string }) { return <View style={styles.mini}><ThemedText type="tiny" color="#5D6A78">{label}</ThemedText><ThemedText type="tiny" numberOfLines={1}>{value}</ThemedText></View>; }
const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 44, gap: 12 }, heading: { flexDirection: "row", alignItems: "center", gap: 10 }, flex: { flex: 1 }, hero: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 7 }, total: { fontFamily: "sfbold", fontSize: 30 }, metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 7 }, stat: { width: "48%", minHeight: 54, borderRadius: 9, padding: 9, backgroundColor: "#F1F4F2", gap: 4 }, tabs: { gap: 7, paddingVertical: 2 }, tab: { minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, justifyContent: "center", alignItems: "center" }, panel: { borderWidth: 1, borderRadius: 15, padding: 13, gap: 10 }, actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { minHeight: 40, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, assetCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 9 }, assetHead: { flexDirection: "row", alignItems: "center", gap: 8 }, values: { flexDirection: "row", gap: 7 }, mini: { flex: 1, minWidth: 0, borderRadius: 8, padding: 7, backgroundColor: "#F1F4F2", gap: 3 }, listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#D5DDD8" }, empty: { borderWidth: 1, borderStyle: "dashed", borderRadius: 14, padding: 18, gap: 10, alignItems: "flex-start" }, modalBackdrop: { flex: 1, justifyContent: "center", padding: 14, backgroundColor: "rgba(0,0,0,0.45)" }, modal: { maxHeight: "92%", borderWidth: 1, borderRadius: 16, padding: 13 }, modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 10 }, form: { gap: 10, paddingBottom: 12 }, field: { gap: 4 }, input: { minHeight: 43, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, actionModal: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
});
