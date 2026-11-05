import { collection, doc, getDocs, getFirestore, query, setDoc, where } from "@react-native-firebase/firestore";
import type { PlanningRecord } from "@/types/planning";

// Shared root collection: Fynage, Murimi, and Tengesa can read the same owner plans.
const planningCollection = () => collection(getFirestore(), "plans");
const legacyPlanningCollection = (uid: string) => collection(getFirestore(), "users", uid, "financial_plans");

export async function listPlanningRecords(uid: string, businessId: string): Promise<PlanningRecord[]> {
  void businessId;
  const [sharedSnapshot, legacySnapshot] = await Promise.all([
    getDocs(query(planningCollection(), where("ownerId", "==", uid))),
    getDocs(query(legacyPlanningCollection(uid), where("businessId", "==", businessId))),
  ]);
  const merged = new Map<string, PlanningRecord>();
  for (const entry of legacySnapshot.docs) merged.set(entry.id, { ...entry.data(), id: entry.id } as PlanningRecord);
  for (const entry of sharedSnapshot.docs) merged.set(entry.id, { ...entry.data(), id: entry.id } as PlanningRecord);
  return [...merged.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

export async function savePlanningRecord(record: PlanningRecord): Promise<void> {
  await setDoc(doc(planningCollection(), record.id), record, { merge: true });
}
