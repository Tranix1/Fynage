
import { getApps, initializeApp } from "firebase/app";


import { getFirestore, } from 'firebase/firestore'
import { getStorage } from "firebase/storage"

export const firebaseConfig = { 
  apiKey: "AIzaSyDY9dgj43xzhjfOLtW2rqPeUNOvXQTy_dw",
  authDomain: "transix-470b3.firebaseapp.com",
  projectId: "transix-470b3",
  storageBucket: "transix-470b3.firebasestorage.app",
  messagingSenderId: "426143331819",
  appId: "1:426143331819:web:658f6bd5a92a62508e55ae",
  measurementId: "G-95BHLPFXLG"
};


const app = getApps().find((candidate) => candidate.options.projectId === firebaseConfig.projectId)
  ?? initializeApp(firebaseConfig);
export const db = getFirestore(app)
export const storage = getStorage(app)






