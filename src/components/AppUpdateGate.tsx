import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { getSafeAppVersion, getUpdateType, type AppVersionConfig, type UpdateType } from "@/Utilities/versionUtils";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

const SKIPPED_VERSION_KEY = "fynage.skippedUpdateVersion";
const currentVersion = Constants.expoConfig?.version ?? "1.0.0";

function storeUrl(config: AppVersionConfig) {
  if (Platform.OS === "ios" && config.iosUrl) return config.iosUrl;
  if (Platform.OS === "android" && config.androidUrl) return config.androidUrl;
  return config.updateUrl || "https://play.google.com/store/apps/details?id=com.armament.fynage";
}

export default function AppUpdateGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const accent = useThemeColor("accent");
  const text = useThemeColor("text");
  const muted = useThemeColor("textlight");
  const surface = useThemeColor("backgroundLight");
  const border = useThemeColor("border");
  const [config, setConfig] = useState<AppVersionConfig | null>(null);
  const [updateType, setUpdateType] = useState<UpdateType>("none");
  const [checking, setChecking] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const check = useCallback(async () => {
    if (!user) { setConfig(null); setUpdateType("none"); return; }
    setChecking(true);
    try {
      const next = await getSafeAppVersion("fynage");
      const type = next.enabled === false ? "none" : getUpdateType({ currentVersion, minVersion: next.minVersion, latestVersion: next.version });
      const skippedVersion = await AsyncStorage.getItem(SKIPPED_VERSION_KEY);
      setConfig(next);
      setUpdateType(type);
      setSkipped(type === "optional" && skippedVersion === next.version);
    } finally { setChecking(false); }
  }, [user]);

  // This effect synchronizes remote Firebase configuration into the update gate.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!isLoading) void check(); }, [check, isLoading]);

  const visible = Boolean(user && config && updateType !== "none" && !(updateType === "optional" && skipped));
  const isForce = updateType === "force";
  const title = isForce ? "Update required" : "Update available";
  const button = async () => { await Linking.openURL(storeUrl(config!)); };
  const skip = async () => { if (!config) return; await AsyncStorage.setItem(SKIPPED_VERSION_KEY, config.version); setSkipped(true); };

  return <>
    {children}
    <Modal visible={visible} transparent animationType="fade" onRequestClose={isForce ? undefined : skip}>
      <View style={styles.backdrop}><View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
        <View style={[styles.icon, { backgroundColor: `${accent}18` }]}><Ionicons name="cloud-download-outline" size={30} color={accent} /></View>
        <ThemedText type="title" style={styles.title}>{title}</ThemedText>
        <ThemedText color={muted} style={styles.message}>{config?.updateMessage}</ThemedText>
        <ThemedText type="tiny" color={muted} style={styles.version}>Installed {currentVersion}  •  Latest {config?.version}</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => void button()} style={[styles.updateButton, { backgroundColor: accent }]}>
          {checking ? <ActivityIndicator color="#12315C" /> : <><Ionicons name="arrow-up-circle-outline" size={19} color="#12315C" /><ThemedText style={styles.updateText}>Update Fynage</ThemedText></>}
        </Pressable>
        {!isForce && <Pressable accessibilityRole="button" onPress={() => void skip()} style={styles.skipButton}><ThemedText color={text}>Skip for now</ThemedText></Pressable>}
      </View></View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(8, 18, 35, 0.62)", justifyContent: "center", padding: 22 },
  card: { borderWidth: 1, borderRadius: 22, padding: 22, alignItems: "center", gap: 12 },
  icon: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center" },
  title: { textAlign: "center", fontSize: 22 }, message: { textAlign: "center", lineHeight: 21 },
  version: { textAlign: "center", marginTop: 2 },
  updateButton: { width: "100%", minHeight: 48, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 5 },
  updateText: { color: "#12315C", fontFamily: "sfbold" }, skipButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 12 },
});
