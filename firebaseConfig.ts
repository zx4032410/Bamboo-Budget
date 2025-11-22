import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCH0XHc7Wiq87ifX_jtoXD_0xpeP0Tg9E8",
  authDomain: "bamboo-budget.firebaseapp.com",
  projectId: "bamboo-budget",
  storageBucket: "bamboo-budget.firebasestorage.app",
  messagingSenderId: "199110048952",
  appId: "1:199110048952:web:8d946f8b3f78840abbc84d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Enable Offline Persistence
// This allows the app to work offline and store data in the local browser (IndexedDB)
// satisfying the requirement for "local storage" feeling while still using Firestore.
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a time.
        console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        // The current browser does not support all of the features required to enable persistence
        console.warn('Firestore persistence not supported by browser');
    }
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();