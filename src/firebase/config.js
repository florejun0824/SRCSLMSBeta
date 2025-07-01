import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAwzXvo1MhL8Uj9UlhhMu4_LPB013SW2ig",
  authDomain: "srcs-log-book.firebaseapp.com",
  projectId: "srcs-log-book",
  storageBucket: "srcs-log-book.firebasestorage.app",
  messagingSenderId: "1016390403599",
  appId: "1:1016390403599:web:303b35a99b0f2260a2057a",
  measurementId: "G-P7ZZ5VVJ88"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);