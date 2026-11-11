export type SavingsEntry = {
  id: string;
  ownerId: string;
  businessId: string;
  kind: "personal" | "business";
  amountMinor: number;
  interestBps: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
  targetType?: "personal" | "murimiFarm" | "tengesaStore" | "project" | "plan";
  targetId?: string;
  targetName?: string;
  platform?: "fynage" | "murimi" | "tengesa";
  currency?: string;
};

export type LoanEntry = {
  id: string;
  lenderUid: string;
  borrowerUid: string;
  lenderPhone: string;
  borrowerPhone: string;
  amountMinor: number;
  currency: string;
  interestBps: number;
  status: "open" | "repaid";
  dueDate?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};
