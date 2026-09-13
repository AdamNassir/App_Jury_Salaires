import { Grade } from '../types';

/** Legacy helper now requires a source-provided reference date. Never uses the execution date. */
export const calculateYears = (fromDate?: string, referenceDate?: string) => {
  if (!fromDate || !referenceDate) return Number.NaN;
  const from = Date.parse(fromDate), to = Date.parse(referenceDate);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return Number.NaN;
  return (to - from) / (1000 * 60 * 60 * 24 * 365.25);
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

export const getPrimeAnciennete = (yearsLL: number) => {
  if (!Number.isFinite(yearsLL)) return Number.NaN;
  if (yearsLL < 3) return 0;
  if (yearsLL < 6) return 500;
  return 1000;
};

// Formula: Salaire = (taux_grade × 193 days × TJ - 6000 - prime_ancienneté - 216 × 5,5) / 1.45 / 1.01
export const calculateSalaryFormule = (tj: number, grade: Grade | 'Junior', yearsExpert: number, prime: number) => {
  const rate = getTauxGrade(grade, yearsExpert);
  const ticketsResto = 216 * 5.5;
  const raw = (rate * 193 * tj) - 6000 - prime - ticketsResto;
  return Math.round(raw / 1.45 / 1.01);
};

export const calculateMargin = (tj: number, salary: number, prime: number) => {
  if (!tj || tj === 0) return 0;
  const ticketsRestoValue = 216 * 5.5;
  const totalCostAnnual = (salary * 1.45 * 1.01) + 6000 + prime + ticketsRestoValue;
  const costPerDay = totalCostAnnual / 193;
  return ((tj - costPerDay) / tj) * 100;
};
