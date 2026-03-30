/**
 * Firebase configuration and initialization.
 * All config values are loaded from Vite environment variables.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

/** Required Vite env var names and their corresponding config keys. */
const REQUIRED_ENV_VARS = [
  { env: 'VITE_FIREBASE_API_KEY',            key: 'apiKey' },
  { env: 'VITE_FIREBASE_AUTH_DOMAIN',        key: 'authDomain' },
  { env: 'VITE_FIREBASE_PROJECT_ID',         key: 'projectId' },
  { env: 'VITE_FIREBASE_APP_ID',             key: 'appId' },
];

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate required config fields before calling initializeApp.
// Missing values (undefined/empty) would produce a silent auth/invalid-api-key
// error that is very hard to diagnose at runtime.
const missingVars = REQUIRED_ENV_VARS
  .filter(({ key }) => !firebaseConfig[key] || firebaseConfig[key].trim() === '')
  .map(({ env }) => env);

if (missingVars.length > 0) {
  throw new Error(
    `Firebase initialization failed — missing required environment variable(s): ${missingVars.join(', ')}. ` +
    'Ensure these variables are set in your deployment environment (or in a local .env file — see .env.example).'
  );
}

// In development, log a sanitized config summary so missing values are easy
// to spot without exposing actual secrets.
if (import.meta.env.DEV) {
  const summary = Object.fromEntries(
    Object.entries(firebaseConfig).map(([k, v]) => [k, (v && v.trim() !== '') ? '✓ set' : '✗ missing'])
  );
  console.debug('[Firebase] Config summary:', summary);
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
