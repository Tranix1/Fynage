export type TransactionDirection = "in" | "out" | "transfer";
export type TransactionKind = "expense" | "fixed_asset" | "investment" | "income" | "loan_received" | "loan_repayment" | "transfer" | "other";
export type TransactionSource = "manual" | "sms" | "murimi" | "fynage" | "armament";

export type FinancialRecord = {
  id: string; ownerId: string; businessId: string;
  sourceApp?: "fynage" | "murimi" | "armament";
  sourceRecordId?: string | null;
  sourceCollection?: string | null;
  type: TransactionKind;
  direction: TransactionDirection;
  amountMinor: number; currency: string;
  category: string; description: string; occurredAt: string;
  account?: string; counterparty?: string; reference?: string; notes?: string;
  principalMinor?: number; interestMinor?: number; feeMinor?: number;
  assetValueMinor?: number; liabilityMinor?: number;
  source?: TransactionSource; sourceKey?: string; sourceFingerprint?: string;
  sourceDetails?: { sender: string; messageDate: string; messageBody: string; providerId?: string };
  potentialDuplicateOf?: string;
  mergedSources?: Array<{ source: TransactionSource; sourceKey?: string; sourceDetails?: FinancialRecord["sourceDetails"] }>;
  classificationStatus?: "unreviewed" | "reviewed" | "dismissed" | "potential_duplicate";
  userEditedFields?: string[];
  createdAt: string; updatedAt: string; deletedAt?: string | null; revision: number;
};
export type FinancialSyncStatus = "synced" | "pending" | "failed";
export type FinancialRecordWithSync = FinancialRecord & { syncStatus: FinancialSyncStatus };

export type FinancialCategory = {
  id: string; ownerId: string; businessId: string; name: string;
  archived: boolean; updatedAt: string; revision: number;
};

export type FinancialCategoryWithSync = FinancialCategory & { syncStatus: FinancialSyncStatus };
