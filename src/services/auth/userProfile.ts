import { doc, getFirestore, serverTimestamp, setDoc } from "@react-native-firebase/firestore";
import type { AuthUser } from "@/context/AuthContext";

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
}
