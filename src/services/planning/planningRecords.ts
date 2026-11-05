import { collection, doc, getDocs, getFirestore, query, setDoc, where } from "@react-native-firebase/firestore";
import type { PlanningRecord } from "@/types/planning";

// Shared root collection: Fynage, Murimi, and Tengesa can read the same owner plans.
const planningCollection = () => collection(getFirestore(), "plans");

export async function listPlanningRecords(uid: string, businessId: string): Promise<PlanningRecord[]> {
  void businessId;
  const snapshot = await getDocs(query(planningCollection(), where("ownerId", "==", uid)));
  return snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }) as PlanningRecord).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

export async function savePlanningRecord(record: PlanningRecord): Promise<void> {
  await setDoc(doc(planningCollection(), record.id), record, { merge: true });
}
