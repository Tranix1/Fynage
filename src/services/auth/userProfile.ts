import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "@react-native-firebase/firestore";
import type { AuthUser } from "@/context/AuthContext";
import type { CurrentRole } from "@/types/types";

export type CloudAppAccount = { id: string; name: "acc 1" | "acc 2"; currentRole: CurrentRole };

/** Creates/refreshes the authenticated user's Fynage profile in the configured Firebase project. */
export async function saveAuthenticatedUserProfile(user: AuthUser): Promise<void> {
  await setDoc(doc(getFirestore(), "users", user.uid), {
    uid: user.uid,
    phoneNumber: user.phoneNumber ?? null,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  if (user.phoneNumber) await setDoc(doc(getFirestore(), "userDirectory", `phone_${user.phoneNumber.replace(/\D/g, "")}`), { uid: user.uid, phoneNumber: user.phoneNumber, displayName: user.displayName ?? null, updatedAt: serverTimestamp() }, { merge: true });
}

export async function loadUserAppState(uid: string): Promise<{ accounts?: CloudAppAccount[]; activeAccountId?: string } | null> {
  const snapshot = await getDoc(doc(getFirestore(), "users", uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    accounts: Array.isArray(data?.accounts) ? data.accounts as CloudAppAccount[] : undefined,
    activeAccountId: typeof data?.activeAccountId === "string" ? data.activeAccountId : undefined,
  };
}

export async function saveUserAppState(uid: string, accounts: CloudAppAccount[], activeAccountId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", uid), { accounts, activeAccountId, appStateUpdatedAt: serverTimestamp() }, { merge: true });
}
