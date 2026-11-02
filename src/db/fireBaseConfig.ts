import { getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// This configuration must match this app's native Firebase registration in
// google-services.json. Keep it scoped to the Armament Firebase project.
export const firebaseConfig = {
  apiKey: "AIzaSyDW6CHv887ClF4nVTzGa28vzI9Jd1hqa0Y",
  authDomain: "armament-f5a0b.firebaseapp.com",
  projectId: "armament-f5a0b",
  storageBucket: "armament-f5a0b.firebasestorage.app",
  messagingSenderId: "853368688021",
  appId: "1:853368688021:android:bebcddbe0b2564bbb53a9c",
};

const app = getApps().find((candidate) => candidate.options.projectId === firebaseConfig.projectId)
  ?? initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
