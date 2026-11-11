import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth } from "@/context/AuthContext";

export default function AccountsScreen() {
  const { accounts, currentRole } = useAuth();
  const background = useThemeColor("backgroundLight");

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <ThemedText>Back</ThemedText>
        </Pressable>
        <ThemedText type="title">Personal account</ThemedText>
        <ThemedText>Fynage uses one account per person. Your role is {currentRole.accType}.</ThemedText>
        <View style={[styles.account, { backgroundColor: background }]}>
          <ThemedText type="subtitle">{accounts[0]?.name ?? "Personal account"}</ThemedText>
          <ThemedText>Cash, mobile money, bank balances, and personal history stay together here.</ThemedText>
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 14 },
  back: { alignSelf: "flex-start", paddingVertical: 8 },
  account: { borderRadius: 12, padding: 16, gap: 4 },
});
