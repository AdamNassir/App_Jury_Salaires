import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from 'firebase/auth';

import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const loginProvider = new GoogleAuthProvider();

loginProvider.setCustomParameters({
  prompt: 'select_account',
});

const sheetsProvider = new GoogleAuthProvider();

sheetsProvider.addScope(
  'https://www.googleapis.com/auth/spreadsheets'
);

sheetsProvider.setCustomParameters({
  prompt: 'select_account',
});

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
    console.warn(
      'Google token session cache unavailable; using memory:',
      error
    );
  }
};

export const googleRedirectError: Promise<unknown | null> =
  getRedirectResult(auth)
    .then(() => null)
    .catch((err) => {
      console.warn('Redirect auth check:', err);
      return err;
    });

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, loginProvider);
    return result.user;
  } catch (error: any) {
    if (error?.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, loginProvider);
      return null;
    }

    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const requestGoogleSheetsAccess =
  async (): Promise<string | null> => {
    try {
      const result = await signInWithPopup(auth, sheetsProvider);

      const credential =
        GoogleAuthProvider.credentialFromResult(result);

      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        return credential.accessToken;
      }

      return null;
    } catch (error: any) {
      console.error(
        'Error requesting Google Sheets authorization:',
        error
      );

      throw error;
    }
  };

export const logout = () => {
  setGoogleAccessToken(null);
  return signOut(auth);
};