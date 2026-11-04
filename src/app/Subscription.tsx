import React, { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, getDoc, getFirestore } from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { callArmament } from "@/services/integrations/armamentApi";
import { useAuth } from "@/context/AuthContext";

const paymentEndpoint = "https://us-central1-armament-f5a0b.cloudfunctions.net/createArmamentSubscriptionPayment";
type PaymentMethod = "ecocash" | "card";
type SubscriptionTab = "subscription" | "about";

export default function SubscriptionScreen() {
  const { refreshSubscriptionAccess, skipSubscription } = useAuth();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const uid = getAuth().currentUser?.uid;
  const [subscription, setSubscription] = useState<Record<string, any> | null>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [activeTab, setActiveTab] = useState<SubscriptionTab>("subscription");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("ecocash");
  const [ecocashNumber, setEcocashNumber] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const inputBackground = useThemeColor("input"); const text = useThemeColor("text"); const border = useThemeColor("border"); const muted = useThemeColor("textlight"); const iconColor = useThemeColor("icon"); const background = useThemeColor("background");
  const refresh = useCallback(async () => {
    if (!uid) return;
    try {
      const sub = await getDoc(doc(getFirestore(), "subscriptions", uid));
      const subscriptionData = sub.exists() ? sub.data() : null;
      setSubscription(subscriptionData);
      const expiryDate = subscriptionData?.expiresAt?.toDate?.();
      const belongsToFynage = subscriptionData?.sourceApp === "fynage" || subscriptionData?.platform === "fynage";
      const ownActive = belongsToFynage && subscriptionData?.status === "active" && expiryDate instanceof Date && expiryDate.getTime() > Date.now();
      setSubscriptionActive(ownActive);
      setError("");
      await refreshSubscriptionAccess();

    } catch (e) { setError(e instanceof Error ? e.message : "Subscription information could not be loaded."); }
  }, [refreshSubscriptionAccess, uid]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const act = async (run: () => Promise<void>) => { setBusy(true); setError(""); try { await run(); } catch (e) { setError(e instanceof Error ? e.message : "The request failed."); } finally { setBusy(false); } };
  const pay = () => act(async () => {
    const user = getAuth().currentUser; if (!user) throw new Error("Sign in to continue.");
    let phone: string | undefined;
    if (paymentMethod === "ecocash") {
      const digits = ecocashNumber.trim().replace(/[\s()-]/g, "");
      if (!/^(?:\+263|263|0)?7\d{8}$/.test(digits)) throw new Error("Enter a valid EcoCash number, for example 0771234567.");
      phone = digits.startsWith("+") ? digits.slice(1) : digits.startsWith("0") ? `263${digits.slice(1)}` : digits.startsWith("263") ? digits : `263${digits}`;
    }
    const response = await fetch(paymentEndpoint, { method: "POST", headers: { Authorization: "Bearer " + await user.getIdToken(), "Content-Type": "application/json" }, body: JSON.stringify({ sourceApp: "fynage", returnUrl: "fynage://subscription", paymentMethod, ...(phone ? { phone } : {}) }) });
    const responseText = await response.text();
    let result: { error?: string; redirectUrl?: string; paymentId?: string };
    try { result = JSON.parse(responseText) as typeof result; }
    catch { throw new Error(`Paynow returned an invalid response (HTTP ${response.status}). Check that the payment function is deployed.`); }
    if (!response.ok) throw new Error(result.error ?? "Paynow could not start.");
    if (typeof result.redirectUrl !== "string") throw new Error("Paynow did not return a payment page.");
    setPaymentId(String(result.paymentId)); setPaymentStatus("pending");
    await Linking.openURL(result.redirectUrl);
  });
  const checkPayment = () => act(async () => {
    if (!paymentId) return;
    const result = await callArmament<{ status: string }>("checkArmamentSubscriptionPayment", { paymentId, sourceApp: "fynage" });
    setPaymentStatus(result.status);
    if (result.status === "paid") await refresh();
  });
  const expiry = subscription?.expiresAt?.toDate?.();
  return <ScreenWrapper fh={false}><View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.content}>
    {activeTab === "about" ? <View style={[styles.card, styles.aboutCard, { backgroundColor: surface, borderColor: border }]}>
      <ThemedText type="title" style={styles.aboutTitle}>About Fynage</ThemedText>
      <ThemedText color={muted} style={styles.aboutText}>Fynage helps you keep track of your money. Record income and expenses, organize transactions, and review your monthly history and summaries. You can also choose to link SMS messages to transactions while recording them.</ThemedText>
    </View> : <>
    <View style={styles.heading}>
      <ThemedText type="title" style={styles.title}>Subscription</ThemedText>
      <ThemedText color={muted}>Simple monthly access</ThemedText>
    </View>
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.priceBlock}>
        <ThemedText type="title" style={styles.price}>$1</ThemedText>
        <ThemedText color={muted}>per month</ThemedText>
      </View>
      {subscriptionActive ? <ThemedText color={muted} style={styles.centerText}>Your subscription is active until {expiry.toLocaleDateString()}.</ThemedText> : <ThemedText color={muted} style={styles.centerText}>{subscription?.status ? "Your subscription is not currently active." : "Choose a payment method to get started."}</ThemedText>}
      <View style={styles.methodsBlock}>
        <ThemedText type="defaultSemiBold">Payment method</ThemedText>
        <View style={styles.paymentMethods}>
          {(["ecocash", "card"] as const).map((method) => {
            const selected = paymentMethod === method;
            return <Pressable key={method} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setPaymentMethod(method); setError(""); }} style={[styles.methodTab, { borderColor: selected ? accent : border, backgroundColor: selected ? `${accent}20` : surface }]}>
              <ThemedText numberOfLines={1} adjustsFontSizeToFit color={selected ? accent : text} type={selected ? "defaultSemiBold" : "default"}>
                {method === "ecocash" ? "EcoCash" : "Visa / Mastercard"}
              </ThemedText>
            </Pressable>;
          })}
        </View>
        {paymentMethod === "ecocash" ? <>
          <ThemedText type="tiny" color={muted}>EcoCash mobile number</ThemedText>
          <TextInput value={ecocashNumber} onChangeText={setEcocashNumber} keyboardType="phone-pad" autoComplete="tel" maxLength={18} placeholder="077 123 4567" placeholderTextColor={muted} style={[styles.input, { backgroundColor: inputBackground, color: text, borderColor: border }]} />
        </> : <ThemedText type="tiny" color={muted}>You’ll enter your card details securely on Paynow.</ThemedText>}
      </View>
      {subscriptionActive ? <Pressable style={[styles.button, { borderColor: accent, borderWidth: 1 }]} onPress={() => router.replace("/")}><ThemedText color={accent}>Continue to Fynage</ThemedText></Pressable> : null}
      {paymentStatus ? <ThemedText type="tiny" color={muted}>Latest payment: {paymentStatus}</ThemedText> : null}
      {paymentId && paymentStatus !== "paid" ? <Pressable disabled={busy} style={[styles.button, { borderColor: accent, borderWidth: 1, opacity: busy ? 0.6 : 1 }]} onPress={() => void checkPayment()}><ThemedText color={accent}>{busy ? "Checking payment…" : "Check Paynow payment status"}</ThemedText></Pressable> : null}
      {error ? <ThemedText color="#a33">{error}</ThemedText> : null}
      <Pressable disabled={busy || paymentStatus === "pending"} style={[styles.button, { backgroundColor: "#12315C", opacity: busy || paymentStatus === "pending" ? 0.6 : 1 }]} onPress={() => void pay()}><ThemedText color="#fff" type="defaultSemiBold">{busy ? "Please wait…" : paymentStatus === "pending" ? "Payment pending" : ["failed", "cancelled", "error", "rejected", "expired"].includes(paymentStatus) ? "Try again" : subscriptionActive ? "Renew for $1" : "Subscribe for $1"}</ThemedText></Pressable>
      {!subscriptionActive ? <Pressable style={[styles.skipButton, { borderColor: border }]} onPress={() => { skipSubscription(); router.replace("/"); }}><ThemedText color={muted}>Skip for now</ThemedText></Pressable> : null}
    </View>
    </>}
    </View>
    </ScrollView>
    <View style={[styles.bottomTabs, { backgroundColor: background, borderTopColor: border, paddingBottom: Math.max(bottom, 10) }]}>
      {(["subscription", "about"] as const).map((tab) => {
        const selected = activeTab === tab;
        return <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setActiveTab(tab)} style={styles.bottomTab}>
          <Ionicons name={tab === "subscription" ? "card-outline" : "information-circle-outline"} size={22} color={selected ? accent : iconColor} />
          <ThemedText color={selected ? accent : iconColor} type={selected ? "defaultSemiBold" : "tiny"}>{tab === "subscription" ? "Subscription" : "About"}</ThemedText>
        </Pressable>;
      })}
    </View>
  </View></ScreenWrapper>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flexGrow: 1, justifyContent: "center", padding: 20 },
  content: { width: "100%", maxWidth: 440, alignSelf: "center", gap: 20 },
  bottomTabs: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  bottomTab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 2 },
  heading: { alignItems: "center", gap: 5 },
  title: { fontSize: 28, textAlign: "center" },
  card: { width: "100%", borderWidth: 1, borderRadius: 20, padding: 22, gap: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 3 },
  aboutCard: { minHeight: 220, justifyContent: "center" },
  aboutTitle: { fontSize: 25, textAlign: "center" },
  aboutText: { fontSize: 16, lineHeight: 25, textAlign: "center" },
  priceBlock: { alignItems: "center", paddingVertical: 4, gap: 1 },
  price: { fontSize: 46, lineHeight: 54, textAlign: "center" },
  centerText: { textAlign: "center" },
  methodsBlock: { gap: 10 },
  paymentMethods: { flexDirection: "row", gap: 10 },
  methodTab: { flex: 1, minHeight: 60, borderWidth: 1.5, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  button: { minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, shadowColor: "#12315C", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 2 },
  skipButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, fontSize: 16 },
});
