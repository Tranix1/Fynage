import { getAuth } from "@react-native-firebase/auth";

const endpoint = "https://us-central1-armament-f5a0b.cloudfunctions.net/";

export async function callArmament<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Sign in to use shared Armament services.");
  const token = await user.getIdToken();
  const response = await fetch(`${endpoint}${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  const responseText = await response.text();
  let body: { result?: T; error?: { message?: string } };
  try {
    body = JSON.parse(responseText) as { result?: T; error?: { message?: string } };
  } catch {
    throw new Error(`Armament service returned an invalid response (HTTP ${response.status}). Check that the subscription functions are deployed.`);
  }
  if (!response.ok || body.error) throw new Error(body.error?.message ?? "Armament service is unavailable.");
  return body.result as T;
}
