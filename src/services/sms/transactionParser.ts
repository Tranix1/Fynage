import type { FinancialRecord, TransactionDirection, TransactionKind } from "@/types/finance";

export type SmsMessage = { id: string; sender: string; body: string; date: number };

const providerSender = (sender: string) => {
  const value = sender.replace(/[\s()-]/g, "");
  return value === "+263143" || value === "+263164" || /ecocash|econet/i.test(sender);
};

const financialWords = /received|credited|sent|transferred|transfer|paid|payment|purchase|withdraw|cash.?out|cash.?in|fee|charged|loan|debit|credit|ecocash|balance/i;
const excludedWords = /data bundle|bundle purchase|airtime|recharge|promotional|promo|bonus|free minutes|megabytes|\bmb\b|\bgb\b/i;

function amountMinor(body: string): number | undefined {
  const match = body.match(/(?:USD|US\$|\$|ZWG|ZWL|RTGS|ZIG)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)
    ?? body.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:USD|ZWG|ZWL|RTGS|ZIG)\b/i)
    ?? body.match(/(?:amount|received|sent|paid|purchase|debited|credited)\s*(?:of|is|:)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined;
}

function classify(body: string): { direction: TransactionDirection; type: TransactionKind } | undefined {
  const text = body.toLowerCase();
  if (/\b(received|credited|cash.?in|deposit|loan received)\b/.test(text)) {
    return { direction: "in", type: /loan/.test(text) ? "loan_received" : "income" };
  }
  if (/\b(transfer(?:red)? between|own account|to your account)\b/.test(text)) return { direction: "transfer", type: "transfer" };
  if (/\b(sent|paid|purchase|withdraw|cash.?out|debited|fee|charged|repayment)\b/.test(text)) {
    return { direction: "out", type: /loan|repayment/.test(text) ? "loan_repayment" : "expense" };
  }
  return undefined;
}

function fingerprint(message: SmsMessage): string {
  const value = `${message.sender.toLowerCase()}|${message.date}|${message.body.toLowerCase().replace(/\s+/g, " ").trim()}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function parseFinancialSms(message: SmsMessage, ownerId: string, businessId: string): FinancialRecord | undefined {
  if (!providerSender(message.sender) || excludedWords.test(message.body) || !financialWords.test(message.body)) return undefined;
  const amount = amountMinor(message.body);
  const parsed = classify(message.body);
  if (!amount || !parsed) return undefined;
  const reference = message.body.match(/(?:ref(?:erence)?|txn|transaction|id)\s*[:#-]?\s*([A-Z0-9-]{5,})/i)?.[1];
  const counterparty = message.body.match(/(?:to|from|by)\s+([A-Za-z][A-Za-z .'-]{1,35})(?=\s+(?:for|ref|txn|on|at|amount|balance)\b|[.,]|$)/i)?.[1]?.trim();
  const providerId = reference ?? String(message.id);
  const date = new Date(message.date).toISOString();
  const senderKey = message.sender.toLowerCase().replace(/[^a-z0-9]/g, "");
  const stableSourceId = reference ? `${senderKey}_ref_${reference.toLowerCase().replace(/[^a-z0-9]/g, "")}` : fingerprint(message);
  const sourceKey = `sms_${stableSourceId}`;
  const bodyDescription = message.body.match(/(?:to|from|by)\s+([A-Za-z][A-Za-z .'-]{1,35})/i)?.[1]?.trim();
  const currencyCode = message.body.match(/\b(USD|ZWG|ZWL|ZAR|EUR)\b/i)?.[1]?.toUpperCase()
    ?? (/\bRTGS\b/i.test(message.body) ? "ZWL" : /\bZIG\b/i.test(message.body) ? "ZWG" : "USD");
  return {
    id: sourceKey, ownerId, businessId, sourceApp: "fynage", sourceRecordId: sourceKey,
    sourceCollection: "android_sms", source: "sms", sourceKey, sourceFingerprint: fingerprint(message),
    sourceDetails: { sender: message.sender, messageDate: date, messageBody: message.body, providerId },
    direction: parsed.direction, type: parsed.type, amountMinor: amount,
    currency: currencyCode,
    category: "Uncategorized", description: bodyDescription ? `${parsed.direction === "in" ? "Received from" : "Sent to"} ${bodyDescription}` : "Mobile money transaction",
    counterparty, reference, occurredAt: date, createdAt: date, updatedAt: date,
    revision: 1, classificationStatus: "unreviewed", userEditedFields: [],
  };
}