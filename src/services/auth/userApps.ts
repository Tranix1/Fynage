import { collection, doc, getDoc, getDocs, getFirestore, setDoc } from "@react-native-firebase/firestore";

export type ArmamentAppId = "fynage" | "murimi" | "tengesa" | "transix";

export const armamentApps: Record<ArmamentAppId, { name: string; packageName?: string }> = {
  fynage: { name: "Fynage", packageName: "com.armament.fynage" },
  murimi: { name: "Murimi", packageName: "com.armament.murimi" },
  tengesa: { name: "Tengesa", packageName: "com.armament.tengesa" },
  transix: { name: "Transix", packageName: "com.yayapana.TransixNewVersion" },
};

/** Builds the user's Armament app list from their profile and connected app records. */
export async function syncUserArmamentApps(uid: string): Promise<ArmamentAppId[]> {
  const firestore = getFirestore();
  const [profileSnapshot, connectionsSnapshot] = await Promise.all([
    getDoc(doc(firestore, "users", uid)),
    getDocs(collection(firestore, "users", uid, "connectedApps")),
  ]);
  const apps = new Set<ArmamentAppId>(["fynage"]);
  const stored = profileSnapshot.data()?.appsUsed;
  if (Array.isArray(stored)) stored.filter((value): value is ArmamentAppId => value in armamentApps).forEach((value) => apps.add(value));
  connectionsSnapshot.docs.forEach((entry) => {
    const data = entry.data();
    if (data.status !== "connected") return;
    const appId = data.appId;
    if (appId in armamentApps) apps.add(appId as ArmamentAppId);
  });
  const appsUsed = [...apps];
  await setDoc(doc(firestore, "users", uid), { appsUsed }, { merge: true });
  return appsUsed;
}
