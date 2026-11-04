import { Alert, PermissionsAndroid, Platform } from "react-native";
import { readInboxPage } from "@armament/fynage-sms";
import { financialSmsProvider, isReviewableFinancialSms, type SmsMessage } from "@/services/sms/transactionParser";
import { makeSmsReviewCandidate, saveSmsReviewCandidates } from "@/services/sms/smsReviewQueue";

export function explainSmsAccess(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Find a message to link?",
      "Fynage searches supported financial messages so you can attach one to a transaction you record. It does not create transactions from SMS. Unrelated messages are ignored.",
      [{ text: "Not now", style: "cancel", onPress: () => resolve(false) }, { text: "Continue", onPress: () => resolve(true) }],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function searchRecentFinancialSms(ownerId: string, businessId: string, requestIfMissing = true, onProgress?: (scanned: number) => void): Promise<{ ignored: number; queuedForLink: number; scanned: number; since: number; newestDate: number; reachedLimit: boolean }> {
  if (Platform.OS !== "android") throw new Error("SMS import is available on Android only.");
  let granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  if (!granted && requestIfMissing) granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: "Allow SMS history access",
    message: "Fynage scans EcoCash and Econet messages for financial movements only.",
    buttonPositive: "Allow",
    buttonNegative: "Cancel",
  }) === PermissionsAndroid.RESULTS.GRANTED;
  if (!granted) throw new Error("SMS permission is unavailable or was revoked. Manual entry remains available.");
  const since = Date.now() - 365 * 24 * 60 * 60 * 1000;
  let scanned = 0;
  let ignored = 0;
  let queuedForLink = 0;
  let newestDate = since;
  let reachedEnd = false;
  let reachedLimit = false;
  for (let indexFrom = 0; indexFrom < 10000; indexFrom += 250) {
    onProgress?.(scanned);
    const page = await readInboxPage(since, indexFrom, 250);
    scanned += page.length;
    for (const message of page) if (message.date > newestDate) newestDate = message.date;
    const messages: SmsMessage[] = page.filter((row) => row.sender && row.body && row.date).map((row) => ({ id: row.id, sender: row.sender, body: row.body, date: row.date }));
    const reviewCandidates = messages.filter(isReviewableFinancialSms).map((message) => makeSmsReviewCandidate(message, financialSmsProvider(message) ?? "Financial provider", "Available to link to a transaction you record."));
    await saveSmsReviewCandidates(ownerId, businessId, reviewCandidates);
    queuedForLink += reviewCandidates.length;
    ignored += messages.length - reviewCandidates.length;
    onProgress?.(scanned);
    if (page.length < 250) { reachedEnd = true; break; }
  }
  if (!reachedEnd) reachedLimit = true;
  if (reachedEnd) newestDate = Math.max(newestDate, Date.now());
  return { ignored, queuedForLink, scanned, since, newestDate, reachedLimit };
}
