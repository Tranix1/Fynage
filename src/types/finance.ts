export type TransactionDirection = "in" | "out" | "transfer";
export type TransactionKind = "expense" | "fixed_asset" | "investment" | "income" | "loan_received" | "loan_repayment" | "transfer" | "opening_balance" | "adjustment" | "other";
export type TransactionSource = "manual" | "sms" | "murimi" | "fynage" | "armament";
export type FinancialSourceModule = "farm" | "store" | "personal";
export type FinancialAuditEntry = {
  id: string;
  action: "created" | "edited" | "deleted" | "matched" | "dismissed";
  changedAt: string;
  actorId: string;
  reason?: string;
  changes?: { field: string; from?: unknown; to?: unknown }[];
};

export type FinancialRecord = {
  id: string; ownerId: string; businessId: string;
  sourceApp?: "fynage" | "murimi" | "tengesa";
  sourceModule?: FinancialSourceModule;
  sourceBusinessId?: string | null;
  sourceAccountId?: string | null;
  /** Stable document ID in the originating app's source collection. */
  sourceDocumentId?: string | null;
  /** Legacy alias retained for existing local and cloud records. */
  sourceRecordId?: string | null;
  sourceCollection?: string | null;
  type: TransactionKind;
  direction: TransactionDirection;
  amountMinor: number; currency: string;
  category: string; description: string; occurredAt: string;
  /** Stable ID of the account receiving/losing money. `account` remains the display snapshot for old records. */
  accountId?: string;
  /** Destination account ID for transfers; `accountId` is the source. */
  toAccountId?: string;
  account?: string; toAccount?: string; provider?: string; availableBalanceMinor?: number; counterparty?: string; reference?: string; notes?: string;
  principalMinor?: number; interestMinor?: number; feeMinor?: number;
  assetValueMinor?: number; liabilityMinor?: number;
  source?: TransactionSource; sourceKey?: string; sourceFingerprint?: string;
  sourceDetails?: { sender: string; messageDate: string; messageBody: string; providerId?: string };
  auditTrail?: FinancialAuditEntry[];
  potentialDuplicateOf?: string;
  mergedSources?: Array<{ source: TransactionSource; sourceKey?: string; sourceDetails?: FinancialRecord["sourceDetails"] }>;
  classificationStatus?: "unreviewed" | "reviewed" | "dismissed" | "potential_duplicate";
  /** Optional local transport state; it is not the financial lifecycle status. */
  syncStatus?: FinancialSyncStatus;
  userEditedFields?: string[];
  createdAt: string; updatedAt: string; deletedAt?: string | null; revision: number;
};

export type FinancialAccount = {
  id: string;
  ownerId: string;
  businessId: string;
  name: string;
  type: "cash" | "mobile_money" | "bank" | "other";
  currency: string;
  openingBalanceMinor: number;
  openingBalanceDate: string;
  openingBalanceAudit?: { id: string; changedAt: string; actorId: string; fromMinor: number; fromDate: string; toMinor: number; toDate: string; reason: string }[];
  archived: boolean;
  updatedAt: string;
  revision: number;
};
export type FinancialSyncStatus = "synced" | "pending" | "failed";
export type FinancialRecordWithSync = FinancialRecord & { syncStatus: FinancialSyncStatus };

export type FinancialCategory = {
  id: string; ownerId: string; businessId: string; name: string;
  archived: boolean; updatedAt: string; revision: number;
};

export type FinancialCategoryWithSync = FinancialCategory & { syncStatus: FinancialSyncStatus };
