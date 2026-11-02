import { getDatabase, withDatabaseTransaction } from "@/db/database";
import type { SmsMessage } from "@/services/sms/transactionParser";

export type SmsReviewCandidate = SmsMessage & { provider: string; messageKey: string; reason: string };

function messageKey(message: SmsMessage): string {
  const value = `${message.sender.toLowerCase()}|${message.date}|${message.body.toLowerCase().replace(/\s+/g, " ").trim()}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function saveSmsReviewCandidates(ownerId: string, businessId: string, candidates: SmsReviewCandidate[]): Promise<void> {
  if (!candidates.length) return;
  await withDatabaseTransaction(async (db) => {
    for (const candidate of candidates) {
      await db.runAsync(
        "INSERT OR IGNORE INTO sms_review_queue(owner_id,business_id,message_key,payload,status,created_at) VALUES(?,?,?,?,'pending',?)",
        ownerId, businessId, candidate.messageKey, JSON.stringify(candidate), new Date().toISOString(),
      );
    }
  });
}

export async function listSmsReviewCandidates(ownerId: string, businessId: string): Promise<SmsReviewCandidate[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>("SELECT payload FROM sms_review_queue WHERE owner_id=? AND business_id=? AND status='pending' ORDER BY created_at DESC", ownerId, businessId);
  return rows.map((row) => JSON.parse(row.payload) as SmsReviewCandidate);
}

export async function resolveSmsReviewCandidate(ownerId: string, businessId: string, key: string, decision: "recorded" | "dismissed"): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE sms_review_queue SET status=? WHERE owner_id=? AND business_id=? AND message_key=?", decision, ownerId, businessId, key);
}

export function makeSmsReviewCandidate(message: SmsMessage, provider: string, reason: string): SmsReviewCandidate {
  const key = messageKey(message);
  return { ...message, provider, reason, messageKey: key };
}
