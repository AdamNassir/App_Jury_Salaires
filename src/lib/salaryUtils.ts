import { Grade } from '../types';

export const calculateYears = (
  fromDate: string | null | undefined,
  referenceDate?: string | Date | null
): number | null => {
  if (!fromDate || !referenceDate) return null;
  const start = new Date(fromDate);
  const ref = new Date(referenceDate);
  if (isNaN(start.getTime()) || isNaN(ref.getTime())) return null;
  const diff = ref.getTime() - start.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
};

export const calculateTotalExperience = (
  experienceAtHiring: number | null | undefined,
  yearsLL: number | null | undefined
): number | null => {
  if (experienceAtHiring === null || experienceAtHiring === undefined || yearsLL === null || yearsLL === undefined) {
    return null;
  }
  return Math.round((experienceAtHiring + yearsLL) * 10) / 10;
};

export const getTauxGrade = (grade: Grade | 'Junior', yearsExpert: number) => {
  switch (grade) {
    case 'Expert':
      return Math.min(0.805, 0.765 + 0.01 * Math.floor(yearsExpert / 2));
    case 'Senior':
      return 0.752;
    case 'Confirmé':
      return 0.729;
    default:
      return 0.71; // Junior
  }
};

export const getPrimeAnciennete = (yearsLL: number | null | undefined) => {
  if (yearsLL === null || yearsLL === undefined || yearsLL < 3) return 0;
  if (yearsLL < 6) return 500;
  return 1000;
};

// Formula: Salaire = (taux_grade × 193 days × TJ - 6000 - prime_ancienneté - 216 × 5,5) / 1.45 / 1.01
export const calculateSalaryFormule = (
  tj: number, 
  grade: Grade | 'Junior', 
  yearsExpert: number | null | undefined = 0, 
  prime: number = 0
) => {
  const rate = getTauxGrade(grade, yearsExpert || 0);
  const ticketsResto = 216 * 5.5;
  const raw = (rate * 193 * tj) - 6000 - prime - ticketsResto;
  return Math.round(raw / 1.45 / 1.01);
};

export const calculateMargin = (tj: number, salary: number, prime: number) => {
  if (!tj || tj === 0) return 0;
  const ticketsRestoValue = 216 * 5.5;
  const totalCostAnnual = (salary * 1.45 * 1.01) + 6000 + prime + ticketsRestoValue;
  const costPerDay = totalCostAnnual / 193;
  const rawMargin = ((tj - costPerDay) / tj) * 100;
  return Math.min(100, Math.max(0, rawMargin));
};
