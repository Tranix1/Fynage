export type PlanningItem = {
  id: string;
  category: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  done: boolean;
};

export type PlanningRecord = {
  id: string;
  ownerId: string;
  businessId: string;
  platform?: "fynage" | "murimi" | "tengesa";
  name: string;
  kind: "plan" | "list";
  dueDate?: string;
  items: PlanningItem[];
  createdAt: string;
  updatedAt: string;
  activeSubmissionId?: string;
};
