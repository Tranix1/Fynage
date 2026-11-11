import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDocs, getFirestore, query, setDoc, where } from "@react-native-firebase/firestore";
import type { FinancialRecord } from "@/types/finance";
import type { LoanEntry, SavingsEntry } from "@/types/moneyGoals";

const db = () => getFirestore();
const savingsKey = (uid: string) => `fynage.savings.${uid}`;
const loansKey = (uid: string) => `fynage.loans.${uid}`;
const phoneKey = (phone: string) => `phone_${phone.replace(/\D/g, "")}`;

async function localList<T>(key: string): Promise<T[]> { try { return JSON.parse(await AsyncStorage.getItem(key) ?? "[]") as T[]; } catch { return []; } }
async function localUpsert<T extends { id: string }>(key: string, row: T): Promise<void> { const rows = await localList<T>(key); await AsyncStorage.setItem(key, JSON.stringify([row, ...rows.filter((item) => item.id !== row.id)])); }

export async function listSavings(uid: string): Promise<SavingsEntry[]> {
  const local = await localList<SavingsEntry>(savingsKey(uid));
  try { const remote = await getDocs(query(collection(db(), "savings"), where("ownerId", "==", uid))); const rows = remote.docs.map((item) => ({ ...item.data(), id: item.id }) as SavingsEntry); return [...new Map([...local, ...rows].map((item) => [item.id, item])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); } catch { return local; }
}
export async function saveSavings(entry: SavingsEntry): Promise<void> {
  await localUpsert(savingsKey(entry.ownerId), entry);
  try { await setDoc(doc(collection(db(), "savings"), entry.id), entry, { merge: true }); } catch { /* local-first fallback */ }
}

export async function findUserByPhone(phone: string): Promise<{ uid: string; phoneNumber: string; displayName?: string } | null> {
  try { const { getDoc } = await import("@react-native-firebase/firestore"); const snapshot = await getDoc(doc(db(), "userDirectory", phoneKey(phone))); return snapshot.exists() ? snapshot.data() as { uid: string; phoneNumber: string; displayName?: string } : null; } catch { return null; }
}
export async function listLoans(uid: string): Promise<LoanEntry[]> {
  const local = await localList<LoanEntry>(loansKey(uid));
  try {
    const [lent, borrowed] = await Promise.all([getDocs(query(collection(db(), "loans"), where("lenderUid", "==", uid))), getDocs(query(collection(db(), "loans"), where("borrowerUid", "==", uid)))]);
    const remote = [...lent.docs, ...borrowed.docs].map((item) => ({ ...item.data(), id: item.id }) as LoanEntry);
    return [...new Map([...local, ...remote].map((item) => [item.id, item])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return local; }
}
export async function saveLoan(entry: LoanEntry, ownerUid: string): Promise<void> {
  await localUpsert(loansKey(ownerUid), entry);
  try { await setDoc(doc(collection(db(), "loans"), entry.id), entry, { merge: true }); } catch { /* local-first fallback */ }
}

/** Projects an assigned Fynage entry into the selected app's canonical ledger.
 * Fynage never downloads these rows into its personal daily history because
 * its local ledger is filtered to sourceApp=fynage.
 */
export async function createPlatformLedgerEntry(record: FinancialRecord, platform: "murimi" | "tengesa", platformId: string): Promise<void> {
  const now = new Date().toISOString();
  const id = `fynage_${record.id}_${platform}`;
  await setDoc(doc(db(), "moneyLedger", id), {
    id, ownerId: record.ownerId, businessId: platformId, accountId: platformId, sourceApp: platform,
    sourceCollection: "transactions", sourceDocumentId: record.id, amountMinor: record.amountMinor,
    currency: record.currency, direction: record.direction, transactionAt: record.occurredAt,
    category: record.category, description: record.description, status: "posted", createdAt: now, updatedAt: now,
  }, { merge: true });
}
