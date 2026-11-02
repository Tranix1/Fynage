import React, { useCallback, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { collection, doc, getDoc, getDocs, getFirestore, query, where } from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { callArmament } from "@/services/integrations/armamentApi";

const paymentEndpoint = "https://us-central1-armament-f5a0b.cloudfunctions.net/createArmamentSubscriptionPayment";

export default function SubscriptionScreen() {
  const uid = getAuth().currentUser?.uid;
  const [subscription, setSubscription] = useState<Record<string, any> | null>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [businessCoverage, setBusinessCoverage] = useState<{ name: string; role: string }[]>([]);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const [referralCode, setReferralCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [credits, setCredits] = useState(0);
  const [creditIds, setCreditIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight");
  const refresh = useCallback(async () => {
    if (!uid) return;
    try {
      const [sub, creditDocs, code, businessList] = await Promise.all([
        getDoc(doc(getFirestore(), "subscriptions", uid)),
        getDocs(query(collection(getFirestore(), "referralCredits"), where("ownerId", "==", uid), where("status", "==", "available"))),
        callArmament<{ code: string }>("assignArmamentReferralCode"),
        callArmament<{ businesses: { id: string; name: string; role: string }[] }>("listArmamentBusinesses"),
      ]);
      const subscriptionData = sub.exists() ? sub.data() : null;
      setSubscription(subscriptionData);
      const expiryDate = subscriptionData?.expiresAt?.toDate?.();
      const ownActive = subscriptionData?.status === "active" && expiryDate instanceof Date && expiryDate.getTime() > Date.now();
      const entitlements = await Promise.all(businessList.businesses.map(async (business) => ({ business, entitlement: await callArmament<{ active: boolean }>("getArmamentEntitlement", { businessId: business.id }) })));
      const activeMemberships = entitlements.filter(({ entitlement }) => entitlement.active).map(({ business }) => ({ name: business.name, role: business.role }));
      setBusinessCoverage(activeMemberships);
      setCanSubscribe(!businessList.businesses.length || businessList.businesses.some((business) => business.role === "owner"));
      setSubscriptionActive(ownActive);
      setCredits(creditDocs.size);
      setCreditIds(creditDocs.docs.map((item) => item.id));
      setReferralCode(code.code);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Subscription information could not be loaded."); }
  }, [uid]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const act = async (run: () => Promise<void>) => { setBusy(true); setError(""); try { await run(); } catch (e) { setError(e instanceof Error ? e.message : "The request failed."); } finally { setBusy(false); } };
  const pay = () => act(async () => {
    const user = getAuth().currentUser; if (!user) throw new Error("Sign in to continue.");
    const response = await fetch(paymentEndpoint, { method: "POST", headers: { Authorization: "Bearer " + await user.getIdToken(), "Content-Type": "application/json" }, body: JSON.stringify({ sourceApp: "fynage", returnUrl: "fynage://subscription" }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Paynow could not start.");
    if (typeof result.redirectUrl !== "string") throw new Error("Paynow did not return a payment page.");
    await Linking.openURL(result.redirectUrl);
  });
  const redeem = () => act(async () => {
    const creditId = creditIds[0];
    if (!creditId) throw new Error("No available referral credit.");
    await callArmament("redeemArmamentReferralCredit", { creditId });
    await refresh();
  });
  const attribute = () => act(async () => {
    if (!codeInput.trim()) throw new Error("Enter a referral code.");
    await callArmament("attributeArmamentReferral", { code: codeInput.trim() });
    setCodeInput("");
    Alert.alert("Referral applied", "This account is now attributed to the referral code.");
  });
  const expiry = subscription?.expiresAt?.toDate?.();
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <ThemedText type="title">Subscription & referrals</ThemedText>
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <ThemedText type="subtitle">Armament account</ThemedText>
      <ThemedText color={muted}>{subscriptionActive ? "Active until " + expiry.toLocaleDateString() : businessCoverage.length ? `Covered through ${businessCoverage.length} authorised business${businessCoverage.length === 1 ? "" : "es"}.` : subscription?.status ? "Status: " + subscription.status : "No active subscription."}</ThemedText>
      <ThemedText type="tiny" color={muted}>The verified account subscription covers authorised business members in Fynage, Murimi and Tengesa. Referral credits add one month.</ThemedText>
      {error ? <ThemedText color="#a33">{error}</ThemedText> : null}
      {canSubscribe ? <Pressable disabled={busy} style={[styles.button, { backgroundColor: accent, opacity: busy ? 0.6 : 1 }]} onPress={() => void pay()}><ThemedText color="#fff">{busy ? "Please wait…" : subscriptionActive ? "Renew for US$1" : "Subscribe for US$1"}</ThemedText></Pressable> : <ThemedText type="tiny" color={muted}>Your business owner manages the subscription for your access.</ThemedText>}
      <ThemedText color={muted}>Available referral credits: {credits}</ThemedText>
      <Pressable disabled={busy || credits < 1} style={[styles.button, { borderColor: accent, borderWidth: 1, opacity: busy || credits < 1 ? 0.5 : 1 }]} onPress={() => void redeem()}><ThemedText color={accent}>Redeem one month credit</ThemedText></Pressable>
    </View>
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <ThemedText type="subtitle">Your referral code</ThemedText>
      <ThemedText selectable type="defaultSemiBold" color={accent}>{referralCode || "Loading…"}</ThemedText>
      <ThemedText type="tiny" color={muted}>A reward is issued once a referred account completes its first verified subscription payment.</ThemedText>
      <TextInput value={codeInput} onChangeText={setCodeInput} autoCapitalize="characters" placeholder="Enter a referral code" style={styles.input} />
      <Pressable disabled={busy} style={[styles.button, { backgroundColor: accent, opacity: busy ? 0.6 : 1 }]} onPress={() => void attribute()}><ThemedText color="#fff">Apply referral code</ThemedText></Pressable>
    </View>
  </ScrollView></ScreenWrapper>;
}

const styles = StyleSheet.create({ page: { padding: 18, gap: 14 }, card: { borderWidth: 1, borderRadius: 14, padding: 15, gap: 11 }, button: { minHeight: 46, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }, input: { minHeight: 46, borderWidth: 1, borderColor: "#cbd5ce", borderRadius: 9, backgroundColor: "#fff", paddingHorizontal: 12, color: "#1c2921" } });
