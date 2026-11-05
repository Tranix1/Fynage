import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const RECONCILIATION_REMINDER_ID = "fynage-weekly-balance-reconciliation";
const ENABLED_KEY = "fynage.notifications.weeklyReconciliation.enabled";
const NOTIFICATION_KIND = "weekly_balance_reconciliation";

export type ReconciliationReminderPreferences = {
  enabled: boolean;
  weekday: 7;
  hour: 9;
  minute: 0;
  timezone?: string;
  updatedAt: string;
};

async function configureNotifications(): Promise<void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("fynage-reconciliation", {
      name: "Balance reconciliation",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

export async function requestLocalNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function cancelExistingReminder(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((item) => item.content.data?.notificationKind === NOTIFICATION_KIND).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

export async function scheduleSaturdayBalanceReminder(): Promise<{ scheduled: boolean; reason?: string }> {
  try {
    const permission = await requestLocalNotificationPermission();
    if (!permission) return { scheduled: false, reason: "Notification permission was not granted." };
    await configureNotifications();
    await cancelExistingReminder();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Balance check reminder",
        body: "It is Saturday. Match your EcoCash, bank, cash, and other balances with Fynage.",
        sound: "default",
        data: { notificationKind: NOTIFICATION_KIND, route: "/Home/Index" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 7, hour: 9, minute: 0, channelId: "fynage-reconciliation" },
    });
    await AsyncStorage.setItem(ENABLED_KEY, "true");
    return { scheduled: true };
  } catch (error) {
    return { scheduled: false, reason: error instanceof Error ? error.message : "Could not schedule the reminder." };
  }
}

export async function cancelSaturdayBalanceReminder(): Promise<void> {
  await cancelExistingReminder();
  await AsyncStorage.setItem(ENABLED_KEY, "false");
}

export async function isSaturdayBalanceReminderScheduled(): Promise<boolean> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((item) => item.content.data?.notificationKind === NOTIFICATION_KIND);
}

export async function getReconciliationReminderPreferences(): Promise<ReconciliationReminderPreferences> {
  const enabled = (await AsyncStorage.getItem(ENABLED_KEY)) === "true";
  return { enabled, weekday: 7, hour: 9, minute: 0, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, updatedAt: new Date().toISOString() };
}
