import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Stack } from "expo-router";
import { AuthProvider } from "@/context/AuthContext";
import { getDatabase } from "@/db/database";

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
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </AuthProvider>
  );
}
