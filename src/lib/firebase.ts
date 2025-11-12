import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyA5tLLFXnOv-u0tepEtQdug6SnQ1S1z3J4",
  authDomain: "milliongamer-14f35.firebaseapp.com",
  projectId: "milliongamer-14f35",
  storageBucket: "milliongamer-14f35.firebasestorage.app",
  messagingSenderId: "632256457847",
  appId: "1:632256457847:web:18256641945aa8a30aea72",
  measurementId: "G-MX24XHEF76"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
