export type PlanningItem = {
  id: string;
  category: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  done: boolean;
  /** Whether this item has already been bought/paid for. Legacy records use done. */
  bought?: boolean;
  recordType?: "expense" | "fixed_asset" | "current_asset" | "non_current_asset" | "liability";
};

export type PurchaseSnapshot = {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
  purchasedAt: string;
  currency: string;
};

export type PlanningRecord = {
  id: string;
  ownerId: string;
  businessId: string;
  platform?: "fynage" | "murimi" | "tengesa";
  platformBusinessId?: string;
  platformBusinessName?: string;
  farmId?: string;
  farmName?: string;
  name: string;
  kind: "plan" | "list" | "project";
  currency?: string;
  status?: "active" | "completed";
  completedAt?: string;
  recordedItemIds?: string[];
  purchaseHistory?: PurchaseSnapshot[];
  dueDate?: string;
  items: PlanningItem[];
  createdAt: string;
  updatedAt: string;
  activeSubmissionId?: string;
};
