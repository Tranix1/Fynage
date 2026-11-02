export type ArmamentAppId = "murimi" | "tengesa" | "transix";

export type MurimiFinanceSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  business: { id: string; name: string; currency: string };
  balances: { cashNetMovement: number; customerReceivables: number; supplierPayables: number };
  performance: { revenue: number; operatingExpenses: number; profitBeforeInventoryAndAssets: number; cashInflows: number; cashOutflows: number };
  sales: Record<string, unknown>[];
  purchases: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  assets: { id: string; name?: string; category?: string; estimatedValue?: number; originalCost?: number; status?: string }[];
  batches: Record<string, unknown>[];
  inventory: Record<string, unknown>[];
  stockMovements: Record<string, unknown>[];
  customerPayments: Record<string, unknown>[];
};

export type BusinessConnectionStatus = "connected" | "expired" | "sync_failed";

export type BusinessConnection = {
  id: string;
  ownerId: string;
  appId: "murimi";
  sourceBusinessId: string;
  businessName: string;
  status: BusinessConnectionStatus;
  generatedAt: string;
  lastSyncedAt: string;
  snapshot: MurimiFinanceSnapshot;
};
