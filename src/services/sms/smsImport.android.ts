import { Alert, PermissionsAndroid, Platform } from "react-native";
import { readInboxPage, type FynageSmsMessage } from "@armament/fynage-sms";
import { importFinancialRecords } from "@/repositories/financialRecords";
import { financialSmsProvider, isReviewableFinancialSms, parseFinancialSms, type SmsMessage } from "@/services/sms/transactionParser";
import { makeSmsReviewCandidate, saveSmsReviewCandidates } from "@/services/sms/smsReviewQueue";

export function explainSmsAccess(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Import mobile money messages?",
      "Fynage scans supported mobile money and bank senders for financial messages. Recognized transactions and messages needing your review are kept on this device; unrelated messages are ignored. You can continue without SMS and enter records manually.",
      [{ text: "Not now", style: "cancel", onPress: () => resolve(false) }, { text: "Continue", onPress: () => resolve(true) }],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function importRecentFinancialSms(ownerId: string, businessId: string, initial = false, requestIfMissing = true, minDate?: number, onProgress?: (scanned: number, imported: number) => void): Promise<{ imported: number; duplicates: number; ignored: number; queuedForReview: number; scanned: number; since: number; newestDate: number; reachedLimit: boolean }> {
  if (Platform.OS !== "android") throw new Error("SMS import is available on Android only.");
  let granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  if (!granted && requestIfMissing) granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: "Allow SMS history access",
    message: "Fynage scans EcoCash and Econet messages for financial movements only.",
    buttonPositive: "Allow",
    buttonNegative: "Cancel",
  }) === PermissionsAndroid.RESULTS.GRANTED;
  if (!granted) throw new Error("SMS permission is unavailable or was revoked. Manual entry remains available.");
  const since = minDate ?? (initial ? Date.now() - 365 * 24 * 60 * 60 * 1000 : Date.now() - 7 * 24 * 60 * 60 * 1000);
  let scanned = 0;
  let imported = 0;
  let duplicates = 0;
  let ignored = 0;
  let queuedForReview = 0;
  let newestDate = since;
  let reachedEnd = false;
  let reachedLimit = false;
  for (let indexFrom = 0; indexFrom < 10000; indexFrom += 250) {
    const page = await readInboxPage(since, indexFrom, 250);
    scanned += page.length;
    newestDate = Math.max(newestDate, ...page.map((message) => message.date));
    const messages: SmsMessage[] = page.filter((row) => row.sender && row.body && row.date).map((row) => ({ id: row.id, sender: row.sender, body: row.body, date: row.date }));
    const parsed = messages.map((message) => parseFinancialSms(message, ownerId, businessId)).filter((record) => record !== undefined);
    const parsedKeys = new Set(parsed.map((record) => record.sourceFingerprint));
    const reviewCandidates = messages.filter((message) => isReviewableFinancialSms(message) && !parsedKeys.has(fingerprintSms(message))).map((message) => makeSmsReviewCandidate(message, financialSmsProvider(message) ?? "Financial provider", "The message looks financial, but Fynage could not reliably determine its amount or transaction type."));
    await saveSmsReviewCandidates(ownerId, businessId, reviewCandidates);
    queuedForReview += reviewCandidates.length;
    const result = await importFinancialRecords(parsed);
    imported += result.inserted;
    duplicates += result.duplicates;
    ignored += messages.length - parsed.length - reviewCandidates.length;
    onProgress?.(scanned, imported);
    if (page.length < 250) { reachedEnd = true; break; }
  }
  if (!reachedEnd) reachedLimit = true;
  if (reachedEnd) newestDate = Math.max(newestDate, Date.now());
  return { imported, duplicates, ignored, queuedForReview, scanned, since, newestDate, reachedLimit };
}

function fingerprintSms(message: SmsMessage): string {
  const value = `${message.sender.toLowerCase()}|${message.date}|${message.body.toLowerCase().replace(/\s+/g, " ").trim()}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
