import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function AboutScreen() {
  const accent = useThemeColor("accent");
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <ThemedText type="title">About Fynage</ThemedText>
    <ThemedText>Fynage keeps personal finances distinct from business information shared by authorised Armament applications.</ThemedText>
    <View style={styles.links}>
      <Pressable onPress={() => router.push("/Subscription")}><ThemedText color={accent}>Subscription and referrals</ThemedText></Pressable>
      <Pressable onPress={() => router.push("/Business/Members" as never)}><ThemedText color={accent}>Business team access</ThemedText></Pressable>
    </View>
  </ScrollView></ScreenWrapper>;
}
const styles = StyleSheet.create({ page: { padding: 24, gap: 14 }, links: { gap: 16, paddingTop: 12 } });
