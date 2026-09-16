import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult,
  signOut 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Cache token in memory and sessionStorage
let inMemoryToken: string | null = null;

export const getGoogleAccessToken = (): string | null => {
  if (inMemoryToken) return inMemoryToken;
  try {
    const stored = sessionStorage.getItem('g_sheets_token');
    if (stored) {
      inMemoryToken = stored;
      return stored;
    }
  } catch (error) {
    console.warn('Google token session cache unavailable:', error);
  }
  return null;
};

export const setGoogleAccessToken = (token: string | null) => {
  inMemoryToken = token;
  try {
    if (token) {
      sessionStorage.setItem('g_sheets_token', token);
    } else {
      sessionStorage.removeItem('g_sheets_token');
    }
  } catch (error) {
    // The optional cache must not turn a successful Google login into a failure.
    console.warn('Google token session cache unavailable; using memory:', error);
  }
};

// Retain redirect failures until the login screen mounts (including StrictMode remounts).
// Resolve with the error rather than leaving an unhandled rejection at module load.
export const googleRedirectError: Promise<unknown | null> = getRedirectResult(auth)
  .then((result) => {
    if (result) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
      }
    }
    return null;
  })
  .catch((err) => {
    console.warn("Redirect auth check:", err);
    return err;
  });

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setGoogleAccessToken(credential.accessToken);
    }
    return result.user;
  } catch (error: any) {
    if (error?.code === 'auth/popup-blocked') {
      console.warn("Popup blocked, attempting redirect...");
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

/**
 * Re-prompts or requests Sheets access if token is absent or expired
 */
export const requestGoogleSheetsAccess = async (): Promise<string | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setGoogleAccessToken(credential.accessToken);
      return credential.accessToken;
    }
    return null;
  } catch (error: any) {
    console.error("Error requesting Google Sheets authorization:", error);
    throw error;
  }
};

export const logout = () => {
  setGoogleAccessToken(null);
  return signOut(auth);
};

