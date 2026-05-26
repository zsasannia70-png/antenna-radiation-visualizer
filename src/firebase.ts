import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBAEZpBqNcqa8LbWZtEgZmNYAy-DVEpL-8",
  authDomain: "ai-antenna-lab-test-2026.firebaseapp.com",
  projectId: "ai-antenna-lab-test-2026",
  storageBucket: "ai-antenna-lab-test-2026.firebasestorage.app",
  messagingSenderId: "766884756151",
  appId: "1:766884756151:web:d54b6a4d06959085d46b32"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);