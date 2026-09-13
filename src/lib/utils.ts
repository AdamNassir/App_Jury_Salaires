import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { FirestoreErrorInfo } from "../types";
import { auth } from "./firebase";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handleFirestoreError(error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null = null): never {
  const user = auth.currentUser;
  
  const errorInfo: FirestoreErrorInfo = {
    error: error.message || String(error),
    operationType,
    path,
    authInfo: {
      userId: user?.uid || 'anonymous',
      email: user?.email || 'none',
      emailVerified: user?.emailVerified || false,
      isAnonymous: user?.isAnonymous || true,
      providerInfo: user?.providerData.map(p => ({
        providerId: p.providerId,
        displayName: p.displayName || '',
        email: p.email || ''
      })) || []
    }
  };

  throw new Error(JSON.stringify(errorInfo));
}

export function formatCurrency(amount: number) {
  if (amount == null || !Number.isFinite(amount)) return "Non renseigné / non calculable";
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1 }).format(value / 100);
}
