import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';
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

// Safe check for LocalStorage availability inside sandboxed preview environments
const checkLocalStorageSupported = (): boolean => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const testKey = '__firestore_storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

const cacheConfig = checkLocalStorageSupported()
  ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  : memoryLocalCache();

console.log('[Firestore Cache Mode]:', checkLocalStorageSupported() ? 'Persistent (IndexedDB)' : 'Memory-Only Fallback');

// Initialize Firestore with specific database ID and robust offline caching policy
export const db = initializeFirestore(app, {
  localCache: cacheConfig,
});

// Initialize Auth
export const auth = getAuth(app);

export const currentFirebaseProjectId = configJson.projectId;

export default app;
