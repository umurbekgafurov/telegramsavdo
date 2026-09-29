import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import configJson from '../../firebase-applet-config.json';

export const firebaseConfig = {
  apiKey: configJson.apiKey,
  authDomain: configJson.authDomain,
  projectId: configJson.projectId,
  storageBucket: configJson.storageBucket,
  messagingSenderId: configJson.messagingSenderId,
  appId: configJson.appId,
};

// Diagnostic logging as requested
console.log('====================================');
console.log('[Firebase Init Diagnostic]');
console.log('Firebase runtime project:', firebaseConfig.projectId);
console.log('Auth Domain:', firebaseConfig.authDomain);
console.log('Firestore Database ID:', configJson.firestoreDatabaseId || '(default)');
console.log('App ID:', firebaseConfig.appId);
console.log('====================================');

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with specific database ID from config
export const db = configJson.firestoreDatabaseId
  ? getFirestore(app, configJson.firestoreDatabaseId)
  : getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

export const currentFirebaseProjectId = configJson.projectId;

export default app;
