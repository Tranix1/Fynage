import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { getDatabase } from "@/db/database";
import AppUpdateGate from "@/components/AppUpdateGate";

function AccessGate() {
  const { user, isLoading, subscriptionAccess, subscriptionSkipped } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isSubscriptionScreen = pathname === "/Subscription";

  useEffect(() => {
    if (isLoading || subscriptionAccess === "checking") return;
    if (!user && pathname !== "/") {
      router.replace("/");
    } else if (user && subscriptionAccess !== "active" && !subscriptionSkipped && !isSubscriptionScreen) {
      router.replace("/Subscription");
    }
  }, [isLoading, isSubscriptionScreen, pathname, router, subscriptionAccess, subscriptionSkipped, user]);

  const mustWait = isLoading || (subscriptionAccess === "checking" && !isSubscriptionScreen) ||
    (!user && pathname !== "/") || (user && subscriptionAccess !== "active" && !subscriptionSkipped && !isSubscriptionScreen);
  if (mustWait) return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator /></View>;

  return <AppUpdateGate><Stack screenOptions={{ headerShown: false }} /></AppUpdateGate>;
}

export default function RootLayout() {
  const [databaseState, setDatabaseState] = useState<"loading" | "ready" | "failed">("loading");
  const [databaseError, setDatabaseError] = useState("");
  const initialize = () => {
    setDatabaseState("loading");
    void getDatabase().then(() => setDatabaseState("ready")).catch((error: unknown) => {
      setDatabaseError(error instanceof Error ? error.message : "Could not open the local database.");
      setDatabaseState("failed");
    });
  };
  useEffect(() => {
    let active = true;
    void getDatabase().then(() => {
      if (active) setDatabaseState("ready");
    }).catch((error: unknown) => {
      if (!active) return;
      setDatabaseError(error instanceof Error ? error.message : "Could not open the local database.");
      setDatabaseState("failed");
    });
    return () => { active = false; };
  }, []);

  if (databaseState !== "ready") return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 }}>
    {databaseState === "loading" ? <ActivityIndicator /> : <>
      <Text style={{ textAlign: "center" }}>Fynage could not open its local database. Your records have not been changed.</Text>
      <Text style={{ textAlign: "center", color: "#a33" }}>{databaseError}</Text>
      <Pressable accessibilityRole="button" onPress={initialize} style={{ padding: 14 }}><Text>Try again</Text></Pressable>
    </>}
  </View>;

  return (
    <AuthProvider>
      <AccessGate />
    </AuthProvider>
  );
}
