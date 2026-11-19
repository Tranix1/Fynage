import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import About from "./About";
import Home from "./Home/Index";
import AssetsHome from "./Assets/Index";
import BusinessHome from "./Business/Index";
import InsightsHome from "./Insights/Index";
import MoreHome from "./More/Index";
import Login from "./Account/Login";
import SignUp from "./Account/SignUp";
import Subscription from "./Subscription";
import { useAuth } from "@/context/AuthContext";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

type MainTab = "Home" | "Assets" | "Business" | "Insights" | "More" | "About";

export default function Index() {
  const { user, isSignedIn, isLoading, subscriptionAccess, subscriptionSkipped } = useAuth();
  const [selectedTab, setSelectedTab] = useState<MainTab>("Home");
  const [showSignUp, setShowSignUp] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const accent = useThemeColor("accent");
  const background = useThemeColor("background");
  const iconColor = useThemeColor("icon");
  const { bottom } = useSafeAreaInsets();

  // Account storage is supplemental app state, not authentication state. A
  // newly verified user must be allowed into the app even while the local
  // account record is being restored or if that write is temporarily offline.
  const needsAccountEntry = !isSignedIn || !user;
  const needsSubscription = Boolean(user && subscriptionAccess !== "active" && !subscriptionSkipped);

  let content: React.ReactNode;
  if (isLoading || isSigningUp) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={accent} />
        <ThemedText>{isSigningUp ? "Creating your account…" : "Loading your account…"}</ThemedText>
      </View>
    );
  } else if (needsSubscription) {
    content = <Subscription />;
  } else if (selectedTab === "About") {
    content = <About />;
  } else if (needsAccountEntry) {
    content = showSignUp ? (
      <SignUp
        setDspLoginOrSignup={() => setShowSignUp(false)}
        setIsSigningUp={setIsSigningUp}
      />
    ) : (
      <Login setDspLoginOrSignup={() => setShowSignUp(true)} />
    );
  } else {
    content = selectedTab === "Business" ? <BusinessHome />
      : selectedTab === "Assets" ? <AssetsHome />
      : selectedTab === "Insights" ? <InsightsHome />
      : selectedTab === "More" ? <MoreHome />
      : <Home />;
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <View style={styles.content}>{content}</View>
      {!needsSubscription && <View style={[styles.tabBar, { backgroundColor: background, paddingBottom: Math.max(bottom, 10) }]}>
        {(isSignedIn && !needsAccountEntry ? ["Home", "Assets", "Business", "Insights", "More"] as const : ["Home", "About"] as const).map((tab) => {
          const selected = selectedTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSelectedTab(tab)}
              style={styles.tab}
            >
              <Ionicons
                name={tab === "Home" ? "home-outline" : tab === "Assets" ? "cube-outline" : tab === "Business" ? "briefcase-outline" : tab === "Insights" ? "analytics-outline" : tab === "More" ? "ellipsis-horizontal-circle-outline" : "information-circle-outline"}
                size={22}
                color={selected ? accent : iconColor}
              />
              <ThemedText color={selected ? accent : iconColor} type={selected ? "defaultSemiBold" : "tiny"}>
                {tab}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  tabBar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#8885", paddingTop: 8 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 48 },
});
