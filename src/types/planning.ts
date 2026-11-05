export type PlanningItem = {
  id: string;
  category: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  done: boolean;
  /** Whether this item has already been bought/paid for. Legacy records use done. */
  bought?: boolean;
  recordType?: "expense" | "fixed_asset";
};

export type PlanningRecord = {
  id: string;
  ownerId: string;
  businessId: string;
  platform?: "fynage" | "murimi" | "tengesa";
  name: string;
  kind: "plan" | "list" | "project";
  currency?: string;
  status?: "active" | "completed";
  completedAt?: string;
  recordedItemIds?: string[];
  dueDate?: string;
  items: PlanningItem[];
  createdAt: string;
  updatedAt: string;
  activeSubmissionId?: string;
};
