/**
 * Firebase configuration and initialization.
 * All config values are loaded from Vite environment variables.
 */
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
// This explicit local-only mode cannot disable App Check in a production build.
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true' && firebaseConfig.projectId?.startsWith('demo-');

// Enable App Check debug mode for local development or explicit preview/debug builds.
// Register the debug token in Firebase Console -> App Check -> Debug tokens.
if (import.meta.env.DEV || import.meta.env.VITE_APPCHECK_DEBUG === 'true') {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
}
if (!useEmulators) initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(
      import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY
  ),
  isTokenAutoRefreshEnabled: true,
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();
if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings: true});
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
