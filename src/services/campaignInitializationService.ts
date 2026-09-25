import { defaultReportData } from '../data/defaultAnnualReport';
import * as XLSX from 'xlsx';
import { collection, getDocs, doc, writeBatch, query, where } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { Personne, CampaignParticipant, Dossier, Grade, UserProfile, Campaign, UserRole, ClientFeedback } from '../types';
import { UserDirectoryService } from './userDirectoryService';
import { LocalDatabaseService } from './localDatabaseService';
import { extractPlainTextUrl } from '../utils/urlUtils';

export interface RawRow {
  [key: string]: any;
}

export interface SheetParsingResult {
  fileName: string;
  tabName?: string;
  rows: RawRow[];
  headers: string[];
}

export interface MeteoLinkItem {
  idProfil: string;
  link: string;
  rawRowIndex?: number;
}

/**
 * CSV exports from French Excel installations are commonly Windows-1252,
 * while newer exports are UTF-8. Decode text explicitly so SheetJS does not
 * guess the code page and corrupt accented characters.
 */
export async function readImportWorkbook(file: File): Promise<XLSX.WorkBook> {
  const data = await file.arrayBuffer();
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.toLowerCase().includes('csv');

  if (!isCsv) {
    return XLSX.read(data, { type: 'array', cellDates: true, raw: true });
  }

  let csvText: string;
  try {
    csvText = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    csvText = new TextDecoder('windows-1252').decode(data);
  }

  return XLSX.read(csvText.replace(/^\uFEFF/, ''), {
    type: 'string',
    cellDates: true,
    raw: true
  });
}

export interface CandidateInitData {
  idProfil: string;
  matricule?: string;
  nom: string;
  prenom: string;
  displayName: string;
  email: string;
  grade: Grade;
  currentSalary: number; // Salaire_Annuel (Col V)
  currentTJSalaire?: number; // TJ_Salaire (Col AE)
  currentTJM: number;       // TJ_Vendu (Col AF), legacy field name
  entryDate?: string;    // Date entrée LL
  expertPassageDate?: string; // Date_Expert (Col U)
  ancienneteLL?: number; // Anciennete_LL (Col AS)
  experienceArrivee?: number; // Experience_Arrivee_Valorisee_LL (Col S)
  anneesExpertise?: number; // Années Exp. si Expert
  experienceEmbauche?: number;
  experienceYears?: number; // Total = Experience_Arrivee_Valorisee_LL + Anciennete_LL
  meteoLinks?: string[]; // Liens issus de Vues_Meteos (Col Q)
  isExistingPersonne: boolean;
  isExistingParticipant: boolean;
  isExistingUser: boolean;
  action: 'CREATE' | 'UPDATE' | 'SKIP';
  changes?: Record<string, { before: any; after: any }>;
  warnings: string[];
  isEligibleCandidate?: boolean;
  colAQValue?: string;
}

export interface PrimeAssignmentRow {
  rawRowIndex: number;
  evaluatorMatricule: string;
  candidateMatricule: string;
  typePrime: string;
  debutPrime?: string;
  finPrime?: string;
  project?: string;
  client?: string;
  resolvedEvaluatorIdProfil?: string;
  resolvedCandidateIdProfil?: string;
  isActive: boolean;
  explanation?: string;
}

export interface EvaluatorInitData {
  idProfil: string;
  matricule: string;
  nom: string;
  prenom: string;
  displayName: string;
  email: string;
  grade?: Grade;
  isCandidate: boolean;
  isExistingPersonne: boolean;
  isExistingUser: boolean;
  assignedCandidateIds: string[];
}

export interface CampaignInitPreview {
  year: number;
  totalCandidatesParsed: number;
  candidatesToProcess: CandidateInitData[];
  evaluatorsToProcess: EvaluatorInitData[];
  newPersonnesCount: number;
  existingPersonnesCount: number;
  participantsToCreateCount: number;
  participantsToUpdateCount: number;
  evaluatorsCount: number;
  newEvaluatorsOnlyCount: number;
  newUsersCount: number;
  totalPrimesParsed: number;
  activePrimesCount: number;
  expiredPrimesCount: number;
  meteoLinksCount: number;
  meteoLinksByCandidate: Record<string, string[]>;
  assignmentsByCandidate: Record<string, string[]>; // candidateIdProfil -> evaluatorIdProfils[]
  assignmentsDetailsByCandidate?: Record<string, Record<string, { project?: string; client?: string }>>; // candidateIdProfil -> { [evaluatorIdProfil]: { project, client } }
  warnings: string[];
  blockingErrors: string[];
  canProceed: boolean;
}

/**
 * Normalise un en-tête en enlevant les retours à la ligne, espaces superflus et accents
 */
export function normalizeHeader(header: string): string {
  if (!header) return '';
  return header
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Nettoie une chaîne de caractères
 */
export function cleanString(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Normalise un nom pour comparaison insensible aux accents et à la casse
 */
export function normalizePersonName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Normalise un matricule pour matching robuste (enlève .0, espaces, etc.)
 */
export function normalizeMatricule(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim().toUpperCase();
  if (str.endsWith('.0')) {
    str = str.slice(0, -2);
  }
  return str;
}

/**
 * Tente de convertir une chaîne ou nombre en montant numérique
 * Prend en compte la virgule décimale française
 */
export function parseFrenchNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    if (isNaN(val)) return 0;
    // Sécurité : si un nombre comme 5800008 ou 4500050 a été produit
    // par la suppression de la virgule décimale lors d'un parsing CSV préalable (ex: 58000,08 -> 5800008)
    if (val >= 1000000 && val <= 30000000 && Number.isInteger(val)) {
      return Math.max(0, Math.round((val / 100) * 100) / 100);
    }
    return Math.max(0, val);
  }
  let str = String(val)
    .replace(/[\s\u00A0\u202F]+/g, '')
    .replace(/€/g, '')
    .replace(/k€/i, '000');
  
  // Si présence simultanée d'un point et d'une virgule (ex: 45.000,50), le point sépare les milliers
  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '');
  }
  
  // La virgule est la virgule décimale française
  str = str.replace(',', '.');
  const num = parseFloat(str);
  if (isNaN(num)) return 0;

  // Sécurité supplémentaire si la chaîne d'origine avait déjà été altérée en entier > 1M
  if (num >= 1000000 && num <= 30000000 && Number.isInteger(num)) {
    return Math.max(0, Math.round((num / 100) * 100) / 100);
  }
  return Math.max(0, num);
}

/**
 * Analyse une date issue d'Excel (numérique de série ou chaîne)
 */
export function parseExcelDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const str = cleanString(val);
  if (!str) return null;

  // Formats français JJ/MM/AAAA et JJ/MM/AA
  const frMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})(?:\D|$)/);
  if (frMatch) {
    const shortYear = parseInt(frMatch[3]);
    const year = frMatch[3].length === 2
      ? (shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear)
      : shortYear;
    const month = parseInt(frMatch[2]) - 1;
    const day = parseInt(frMatch[1]);
    const parsed = new Date(year, month, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day
      ? parsed
      : null;
  }

  // Format ISO AAAA-MM-JJ
  const isoMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse un fichier Excel ou CSV et extrait toutes les feuilles sous forme de tableau d'objets
 */
export async function parseFileToSheets(file: File): Promise<SheetParsingResult[]> {
  const workbook = await readImportWorkbook(file);
  const results: SheetParsingResult[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    if (!rawMatrix || rawMatrix.length === 0) continue;

    // Détection de la ligne d'en-tête (la première qui contient au moins 2 colonnes non vides)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(5, rawMatrix.length); i++) {
      const row = rawMatrix[i];
      if (Array.isArray(row) && row.filter(cell => cleanString(cell) !== '').length >= 2) {
        headerRowIndex = i;
        break;
      }
    }

    const rawHeaders = (rawMatrix[headerRowIndex] || []).map(cell => cleanString(cell));
    const normalizedHeaders = rawHeaders.map(h => normalizeHeader(h));

    const rows: RawRow[] = [];
    for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
      const rawRow = rawMatrix[i];
      if (!rawRow || rawRow.every(c => cleanString(c) === '')) continue;

      const rowObj: RawRow = {};
      normalizedHeaders.forEach((key, colIndex) => {
        if (key) {
          rowObj[key] = rawRow[colIndex];
        }
      });
      rows.push(rowObj);
    }

    results.push({
      fileName: file.name,
      tabName: sheetName,
      headers: rawHeaders,
      rows
    });
  }

  return results;
}

export class CampaignInitializationService {
  /**
   * Parse la feuille "Primes" d'un fichier Excel
   * Colonnes exactes par position :
   * - Col A (0) : Matricule_Percoit_Prime (l'évaluateur qui perçoit la prime)
   * - Col B (1) : Matricule_Consultant_Place (le candidat évalué / dossier)
   * - Col C (2) : Type_Prime
   * - Col D (3) : Debut_Prime (date première perception)
   * - Col E (4) : Fin_Prime (date dernière perception ; si Fin_Prime < 01/07/{campaignYear}, aucune obligation d'évaluation)
   * - Col G (6) : Projet (mission concernée)
   */
  static async parsePrimesFile(file: File, campaignYear: number): Promise<PrimeAssignmentRow[]> {
    const workbook = await readImportWorkbook(file);

    let targetSheetName = workbook.SheetNames.find(s => {
      const norm = normalizeHeader(s);
      return norm === 'primes' || norm.includes('prime') || norm.includes('affectation');
    });

    if (!targetSheetName) {
      targetSheetName = workbook.SheetNames[0];
    }

    const worksheet = workbook.Sheets[targetSheetName];
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    if (!rawMatrix || rawMatrix.length === 0) return [];

    let headerRowIndex = -1;
    let colEvalIndex = 0; // Col A par défaut
    let colCandIndex = 1; // Col B par défaut
    let colTypeIndex = 2; // Col C par défaut
    let colDebutIndex = 3; // Col D par défaut
    let colFinIndex = 4; // Col E par défaut
    let colProjectIndex = 6; // Col G par défaut

    for (let i = 0; i < Math.min(10, rawMatrix.length); i++) {
      const row = (rawMatrix[i] || []).map(c => normalizeHeader(String(c)));
      const hasKeywords = row.some(h => 
        h.includes('matricule') || h.includes('prime') || h.includes('percoit') || h.includes('place')
      );
      if (hasKeywords) {
        headerRowIndex = i;
        row.forEach((h, colIdx) => {
          if (
            (h.includes('matricule') && (h.includes('percoit') || h.includes('beneficiaire') || h.includes('evaluat') || h.includes('manager') || h.includes('parrain'))) ||
            (h.includes('percoit') && h.includes('prime'))
          ) {
            colEvalIndex = colIdx;
          } else if (
            (h.includes('matricule') && (h.includes('place') || h.includes('candidat') || h.includes('consultant') || h.includes('filleul'))) ||
            (h.includes('consultant') && h.includes('place'))
          ) {
            colCandIndex = colIdx;
          } else if (h.includes('type') && (h.includes('prime') || h.includes('commission'))) {
            colTypeIndex = colIdx;
          } else if (h.includes('debut')) {
            colDebutIndex = colIdx;
          } else if (h.includes('fin')) {
            colFinIndex = colIdx;
          } else if (h.includes('projet') || h.includes('mission')) {
            colProjectIndex = colIdx;
          }
        });
        break;
      }
    }

    const rows: PrimeAssignmentRow[] = [];
    const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 1;

    for (let i = startIndex; i < rawMatrix.length; i++) {
      const rowArr = rawMatrix[i];
      if (!rowArr || rowArr.length === 0) continue;

      // Col Evaluateur (perçoit prime)
      const evaluatorMatricule = normalizeMatricule(rowArr[colEvalIndex]);
      // Col Candidat (consultant placé)
      const candidateMatricule = normalizeMatricule(rowArr[colCandIndex]);
      if (!evaluatorMatricule || !candidateMatricule) continue;

      // Type_Prime
      const typePrime = cleanString(rowArr[colTypeIndex]);
      // Debut_Prime
      const debutRaw = rowArr[colDebutIndex];
      // Fin_Prime
      const finRaw = rowArr[colFinIndex];
      // Projet (Col G)
      const project = cleanString(rowArr[colProjectIndex]);

      // Extraction du Client à partir de la valeur de la colonne G :
      // Découper le texte selon " - " (avec espaces) et prendre la dernière valeur
      let client: string | undefined = undefined;
      if (project) {
        const parts = project.split(' - ');
        const lastPart = parts[parts.length - 1]?.trim();
        if (lastPart) {
          client = lastPart;
        }
      }

      const finDate = parseExcelDate(finRaw);
      let isActive = true;
      let explanation = 'Prime active';

      // Règle spécifique : Si Col Type contient "Freelance" ET ne contient PAS "Commerciale",
      // alors ignorer la prime et l'attribution de dossier
      const normalizedType = normalizeHeader(typePrime);
      const containsFreelance = normalizedType.includes('freelance');
      const containsCommerciale = normalizedType.includes('commerciale') || normalizedType.includes('commercial');

      if (containsFreelance && !containsCommerciale) {
        isActive = false;
        explanation = 'Prime Freelance non commerciale ignorée : aucune obligation ni attribution de dossier.';
      } else if (finDate) {
        // Si la prime s'est terminée strictement avant l'année de campagne en cours, elle est expirée
        if (finDate.getFullYear() < campaignYear) {
          isActive = false;
          explanation = `Prime expirée au ${finDate.toLocaleDateString('fr-FR')} (antérieure à l'année de campagne ${campaignYear}).`;
        }
      }

      rows.push({
        rawRowIndex: i + 1,
        evaluatorMatricule,
        candidateMatricule,
        typePrime,
        debutPrime: debutRaw ? String(debutRaw) : undefined,
        finPrime: finRaw ? String(finRaw) : undefined,
        project: project || undefined,
        client: client || undefined,
        isActive,
        explanation
      });
    }

    return rows;
  }

  /**
   * Parse le fichier "Rapport_RH_Query_Salaries" :
   * - "Id_Profil", column C (index 2), unique identifier for users
   * - "Consultant", column I (index 8), contains name and surname (split par espace, 2ème et 3ème éléments)
   * - "Matricule", column L (index 11)
   * - "Grade", column M (index 12), split par espace et dernier élément
   * - "Date_Entree_LL", column R (index 17)
   * - "Experience_Arrivee_Valorisee_LL", column S (index 18)
   * - "Date_Expert", column U (index 20)
   * - "Salaire_Annuel", column V (index 21)
   * - "TJ_Vendu", column AF (index 31)
   * - "Anciennete_LL", column AS (index 44)
   * -> Expérience Totale = Experience_Arrivee_Valorisee_LL + Anciennete_LL
   */
  static async parseRapportRhSalariesFile(file: File): Promise<CandidateInitData[]> {
    const workbook = await readImportWorkbook(file);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    if (!rawMatrix || rawMatrix.length === 0) return [];

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, rawMatrix.length); i++) {
      const row = (rawMatrix[i] || []).map(c => normalizeHeader(String(c)));
      if (row.some(h => h.includes('id_profil') || h.includes('consultant') || h.includes('matricule') || h.includes('salaire'))) {
        headerRowIndex = i;
        break;
      }
    }

    const candidates: CandidateInitData[] = [];
    const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 1;

    for (let i = startIndex; i < rawMatrix.length; i++) {
      const row = rawMatrix[i];
      if (!row || row.length === 0) continue;

      // Col C (index 2) : Id_Profil
      const idProfil = cleanString(row[2]).toUpperCase();
      if (!idProfil) continue;

      // Col I (index 8) : Consultant (nom et prénom)
      const consultantRaw = cleanString(row[8]);
      const consultantParts = consultantRaw.trim().split(/\s+/).filter(Boolean);
      let prenom = '';
      let nom = '';
      if (consultantParts.length >= 3) {
        prenom = consultantParts[1];
        nom = consultantParts.slice(2).join(' ');
      } else if (consultantParts.length === 2) {
        prenom = consultantParts[0];
        nom = consultantParts[1];
      } else {
        nom = consultantParts[0] || consultantRaw;
      }
      const displayName = `${prenom} ${nom}`.trim() || consultantRaw;

      // Col L (index 11) : Matricule
      const matricule = cleanString(row[11]).toUpperCase();

      // Col M (index 12) : Grade (split par espace et dernier élément)
      const gradeRaw = cleanString(row[12]);
      const gradeParts = gradeRaw.trim().split(/\s+/).filter(Boolean);
      const lastGradeWord = (gradeParts[gradeParts.length - 1] || '').toLowerCase();
      let grade: Grade = 'Confirmé';
      if (lastGradeWord.includes('expert')) grade = 'Expert';
      else if (lastGradeWord.includes('senior')) grade = 'Senior';
      else if (lastGradeWord.includes('junior')) grade = 'Junior';
      else if (lastGradeWord.includes('confirm')) grade = 'Confirmé';

      // Helper pour récupérer la valeur textuelle brute de la cellule (préserve la virgule décimale française)
      const getRawCellVal = (colIdx: number) => {
        if (worksheet) {
          const cellAddress = XLSX.utils.encode_cell({ r: i, c: colIdx });
          const cell = worksheet[cellAddress];
          if (cell) {
            return cell.w ?? cell.v ?? row[colIdx];
          }
        }
        return row[colIdx];
      };

      // Col R (index 17) : Date_Entree_LL
      const dateEntreeRaw = getRawCellVal(17);
      const dEntree = parseExcelDate(dateEntreeRaw);
      const entryDate = dEntree ? dEntree.toISOString().split('T')[0] : (dateEntreeRaw ? cleanString(dateEntreeRaw) : undefined);

      // Col S (index 18) : Experience_Arrivee_Valorisee_LL
      const experienceArrivee = parseFrenchNumber(getRawCellVal(18));

      // Col U (index 20) : Date_Expert
      const dateExpertRaw = getRawCellVal(20);
      const dExpert = parseExcelDate(dateExpertRaw);
      const expertPassageDate = dExpert ? dExpert.toISOString().split('T')[0] : (dateExpertRaw ? cleanString(dateExpertRaw) : undefined);

      // Col V (index 21) : Salaire_Annuel (la virgule est la virgule décimale française)
      const currentSalary = parseFrenchNumber(getRawCellVal(21));

      // Col AE (index 30) : TJ_Salaire; Col AF (index 31) : TJ_Vendu
      const currentTJSalaire = parseFrenchNumber(getRawCellVal(30));
      const currentTJM = parseFrenchNumber(getRawCellVal(31));

      // Col AS (index 44) : Anciennete_LL
      const ancienneteLL = parseFrenchNumber(getRawCellVal(44));

      // Col AQ (index 42 en base 0) : Seuls ceux dont la colonne AQ est vide/nulle sont des candidats potentiels
      const colAQRaw = getRawCellVal(42);
      const colAQValue = cleanString(colAQRaw);
      const isEligibleCandidate = !colAQValue || colAQValue === '';

      // Expérience Totale = Experience_Arrivee_Valorisee_LL + Anciennete_LL
      const experienceYears = Math.round((experienceArrivee + ancienneteLL) * 10) / 10;

      const email = `${prenom.toLowerCase().replace(/[^a-z0-9]/g, '')}.${nom.toLowerCase().replace(/[^a-z0-9]/g, '')}@logiclever.com`;

      candidates.push({
        idProfil,
        matricule: matricule ? normalizeMatricule(matricule) : undefined,
        nom,
        prenom,
        displayName,
        email,
        grade,
        currentSalary,
        currentTJSalaire,
        currentTJM,
        entryDate,
        expertPassageDate,
        ancienneteLL,
        experienceArrivee,
        experienceYears,
        isExistingPersonne: false,
        isExistingParticipant: false,
        isExistingUser: false,
        action: 'CREATE',
        warnings: [],
        isEligibleCandidate,
        colAQValue: colAQValue || undefined
      });
    }

    return candidates;
  }

  /**
   * Parse le fichier "Vues_Meteos" :
   * - "Id_Profil", column B (index 1), savoir à quel consultant la météo est rattachée
   * - Date, column F (index 5), comprise entre le 01/07/N-1 et le 30/06/N inclus
   * - "Liens_Meteo", column Q (index 16), lien vers le document de la météo
   */
  static async parseVuesMeteosFile(file: File, campaignYear: number): Promise<MeteoLinkItem[]> {
    const workbook = await readImportWorkbook(file);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    if (!rawMatrix || rawMatrix.length === 0) return [];

    let headerRowIndex = -1;
    let colProfilIndex = 1; // Col B (1) par défaut
    const colDateIndex = 5; // Col F (index 5), imposée par le format Vues_Meteos
    const colLienIndex = 16; // Col Q (index 16), imposée par le format Vues_Meteos
    const periodStart = new Date(campaignYear - 1, 6, 1);
    const periodEnd = new Date(campaignYear, 5, 30, 23, 59, 59, 999);

    for (let i = 0; i < Math.min(10, rawMatrix.length); i++) {
      const row = (rawMatrix[i] || []).map(c => normalizeHeader(String(c)));
      if (row.some(h => h.includes('id_profil') || h.includes('lien') || h.includes('meteo'))) {
        headerRowIndex = i;
        row.forEach((h, colIdx) => {
          if (h.includes('id_profil') || (h.includes('profil') && h.includes('id'))) {
            colProfilIndex = colIdx;
          }
        });
        break;
      }
    }

    const items: MeteoLinkItem[] = [];
    const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 1;

    for (let i = startIndex; i < rawMatrix.length; i++) {
      const row = rawMatrix[i];
      if (!row || row.length === 0) continue;

      // Col B (ou colProfilIndex) : Id_Profil
      const idProfil = cleanString(row[colProfilIndex]).toUpperCase();

      // Col F : seules les météos de la période de campagne sont retenues.
      const meteoDate = parseExcelDate(row[colDateIndex]);
      if (!meteoDate || meteoDate < periodStart || meteoDate > periodEnd) continue;
      
      // Col Q : conserver le texte affiché dans la cellule, sans lire la cible hypertexte sous-jacente.
      let linkValue = '';
      if (worksheet) {
        const cellAddress = XLSX.utils.encode_cell({ r: i, c: colLienIndex });
        const cell = worksheet[cellAddress];
        if (cell) {
          const rawCellVal = cell.w ?? cell.v ?? row[colLienIndex] ?? '';
          linkValue = String(rawCellVal).trim();
        }
      }
      if (!linkValue) {
        linkValue = cleanString(row[colLienIndex]);
      }

      linkValue = linkValue.replace(/^["']|["']$/g, '').trim();

      if (idProfil && linkValue) {
        // Découpage si la cellule contient plusieurs liens séparés par un saut de ligne
        const splitLinks = linkValue.split(/\r?\n/).map(l => extractPlainTextUrl(l)).filter(Boolean);
        for (const singleLink of splitLinks) {
          items.push({
            idProfil,
            link: singleLink,
            rawRowIndex: i + 1
          });
        }
      }
    }

    return items;
  }

  /**
   * Analyse et croise les 4 classeurs demandés :
   * 1. BDD_LL_NEW_DRIVE (sheet "Profil") :
   *    - Col A (0) : Id_Profil (identifiant unique obligatoire)
   *    - Col B (1) : Nom_Profil
   *    - Col C (2) : Prenom_Profil (clés de rapprochement avec les autres classeurs)
   * 2. BDD_API_BOOND_NEW_DRIVE :
   *    - sheet "Boond_Liste_Valeur" : Col B = "Annees_Experience_A_Embauche" -> Col D (Libelle_Valeur) pour le nombre d'années
   *    - sheet "Boond_Ressources" :
   *      - Col C (2) : Prenom_Ressource
   *      - Col D (3) : Nom_Ressource
   *      - Col E (4) : Matricule_Ressource
   *      - Col H (7) : Titre_Ressource (Grade actuel)
   *      - Col M (12) : Id_Annees_Experience_A_Embauche (clé vers Boond_Liste_Valeur)
   * 3. Analyse_Jury_Salaires (sheet "Analyse_Jury", en-têtes à la ligne 2, données dès la ligne 3) :
   *    - Col A (0) : Matricule
   *    - Col B (1) : Prénom
   *    - Col C (2) : Nom
   *    - Col E (4) : Date entrée LL
   *    - Col F (5) : Date de passage au grade expert (si concerné)
   *    - Col G (6) : Ancienneté chez LL
   *    - Col J (9) : "TJ vendu (01/07)"
   *    - Col K (10) : Salaire_vendu
   *    -> Calcul Expérience Totale = Ancienneté chez LL (Col G) + Expérience à l'embauche (Boond)
   * 4. Primes :
   *    - Col A (0) : Matricule_Percoit_Prime
   *    - Col B (1) : Matricule_Consultant_Place
   *    - Col C (2) : Type_Prime
   *    - Col D (3) : Debut_Prime
   *    - Col E (4) : Fin_Prime (< 01/07/{campaignYear} => aucune obligation d'évaluer)
   *    - Col G (6) : Projet
   */
  static async prepareCampaignPreview(
    year: number,
    files: {
      rapportRhFile?: File | null;
      primesFile?: File | null;
      vuesMeteosFile?: File | null;
      // Compatibilité
      rhFile?: File | null;
      profilFile?: File | null;
      boondFile?: File | null;
      analyseJuryFile?: File | null;
    }
  ): Promise<CampaignInitPreview> {
    const warnings: string[] = [];
    const blockingErrors: string[] = [];

    if (!year || year < 2020 || year > 2100) {
      blockingErrors.push(`L'année de campagne spécifiée (${year}) est invalide.`);
    }

    const rapportRhSpreadsheet = files.rapportRhFile || files.rhFile || files.analyseJuryFile;
    const primesSpreadsheet = files.primesFile;
    const vuesMeteosSpreadsheet = files.vuesMeteosFile;

    // Vérification des 3 fichiers obligatoires
    if (!rapportRhSpreadsheet) {
      blockingErrors.push("Le fichier 'Rapport_RH_Query_Salaries' est obligatoire (Col C: Id_Profil, Col I: Consultant, Col L: Matricule, Col M: Grade, Col R: Date Entrée, Col S: Exp. Arrivée, Col U: Date Expert, Col V: Salaire Annuel, Col AF: TJ Vendu, Col AS: Ancienneté LL).");
    }

    if (!primesSpreadsheet) {
      blockingErrors.push("Le fichier 'Primes' est obligatoire pour déterminer les obligations d'évaluation.");
    }

    if (!vuesMeteosSpreadsheet) {
      blockingErrors.push("Le fichier 'Vues_Meteos' est obligatoire (Col B: Id_Profil, Col Q: Liens_Meteo).");
    }

    // 1. Lire Rapport_RH_Query_Salaries
    let parsedCandidates: CandidateInitData[] = [];
    if (rapportRhSpreadsheet) {
      try {
        parsedCandidates = await this.parseRapportRhSalariesFile(rapportRhSpreadsheet);
      } catch (e: any) {
        blockingErrors.push(`Erreur lors de la lecture du fichier Rapport_RH_Query_Salaries : ${e.message}`);
      }
    }

    // 2. Lire Primes
    let primeRows: PrimeAssignmentRow[] = [];
    if (primesSpreadsheet) {
      try {
        primeRows = await this.parsePrimesFile(primesSpreadsheet, year);
      } catch (e: any) {
        blockingErrors.push(`Erreur lors de la lecture du fichier Primes : ${e.message}`);
      }
    }

    // 3. Lire Vues_Meteos
    const meteoLinksByCandidate: Record<string, string[]> = {};
    let totalMeteoLinksCount = 0;
    if (vuesMeteosSpreadsheet) {
      try {
        const meteoItems = await this.parseVuesMeteosFile(vuesMeteosSpreadsheet, year);
        totalMeteoLinksCount = meteoItems.length;
        meteoItems.forEach(item => {
          if (!meteoLinksByCandidate[item.idProfil]) {
            meteoLinksByCandidate[item.idProfil] = [];
          }
          if (!meteoLinksByCandidate[item.idProfil].includes(item.link)) {
            meteoLinksByCandidate[item.idProfil].push(item.link);
          }
        });
      } catch (e: any) {
        blockingErrors.push(`Erreur lors de la lecture du fichier Vues_Meteos : ${e.message}`);
      }
    }

    // Associer les liens météos aux candidats
    parsedCandidates.forEach(cand => {
      cand.meteoLinks = meteoLinksByCandidate[cand.idProfil] || [];
    });

    // 4. Charger données existantes LocalStorage pour rapprochement & préservation
    const existingPersonnesSnap = await getDocs(collection(db, 'personnes'));
    const existingPersonnes: Personne[] = existingPersonnesSnap.docs.map(d => ({
      ...d.data(),
      idProfil: d.id
    } as Personne));

    const existingParticipantsSnap = await getDocs(
      query(collection(db, 'campaign_participants'), where('campaignYear', '==', year))
    );
    const existingParticipants: CampaignParticipant[] = existingParticipantsSnap.docs.map(d => ({
      ...d.data(),
      id: d.id
    } as CampaignParticipant));

    const existingUsersSnap = await getDocs(collection(db, 'users'));
    const existingUsers = existingUsersSnap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    // Index de recherche existants
    const personnesById = new Map<string, Personne>();
    const personnesByMatricule = new Map<string, Personne>();
    const personnesByName = new Map<string, Personne[]>();

    existingPersonnes.forEach(p => {
      if (p.idProfil) personnesById.set(p.idProfil.trim(), p);
      if (p.matricule) personnesByMatricule.set(p.matricule.trim().toUpperCase(), p);
      const nameKey = `${normalizePersonName(p.prenom)}_${normalizePersonName(p.nom)}`;
      if (nameKey !== '_') {
        if (!personnesByName.has(nameKey)) personnesByName.set(nameKey, []);
        personnesByName.get(nameKey)!.push(p);
      }
    });

    // 5. Indexation globale de TOUS les salariés de Rapport_RH_Query_Salaries
    const matriculeToIdProfil = new Map<string, string>();
    const detailsByMatricule = new Map<string, { idProfil: string; nom: string; prenom: string; grade?: Grade; email?: string }>();
    const allEmployeesByIdProfil = new Map<string, CandidateInitData>();

    const registerMatriculeMapping = (rawMat: string, idProfil: string, details: { idProfil: string; nom: string; prenom: string; grade?: Grade; email?: string }) => {
      const norm = normalizeMatricule(rawMat);
      if (!norm) return;
      matriculeToIdProfil.set(norm, idProfil);
      detailsByMatricule.set(norm, details);

      const num = parseInt(norm, 10);
      if (!isNaN(num)) {
        const numStr = num.toString();
        matriculeToIdProfil.set(numStr, idProfil);
        detailsByMatricule.set(numStr, details);

        const padStr = numStr.padStart(5, '0');
        matriculeToIdProfil.set(padStr, idProfil);
        detailsByMatricule.set(padStr, details);
      }
    };

    parsedCandidates.forEach(cand => {
      if (cand.idProfil) {
        allEmployeesByIdProfil.set(cand.idProfil, cand);
        const details = {
          idProfil: cand.idProfil,
          nom: cand.nom,
          prenom: cand.prenom,
          grade: cand.grade,
          email: cand.email
        };
        if (cand.matricule) {
          registerMatriculeMapping(cand.matricule, cand.idProfil, details);
        }
        matriculeToIdProfil.set(cand.idProfil.toUpperCase(), cand.idProfil);
        detailsByMatricule.set(cand.idProfil.toUpperCase(), details);
      }
    });

    existingPersonnes.forEach(p => {
      if (p.matricule && p.idProfil) {
        const details = {
          idProfil: p.idProfil,
          nom: p.nom,
          prenom: p.prenom,
          email: p.email
        };
        registerMatriculeMapping(p.matricule, p.idProfil, details);
      }
      if (p.idProfil) {
        matriculeToIdProfil.set(p.idProfil.trim().toUpperCase(), p.idProfil);
      }
    });

    // 6. Croisement et enrichissement des Candidats à initialiser
    // RÈGLE : Seuls ceux dont la colonne AQ est vide ou nulle sont des candidats potentiels
    const candidatesToProcess: CandidateInitData[] = [];
    const processedIdProfils = new Set<string>();

    for (const cand of parsedCandidates) {
      if (!cand.idProfil) continue;
      if (processedIdProfils.has(cand.idProfil)) continue;

      // FILTRE COLONNE AQ : S'il y a une valeur en colonne AQ, ce n'est PAS un candidat potentiel
      if (cand.isEligibleCandidate === false) {
        continue;
      }

      processedIdProfils.add(cand.idProfil);

      const nameKey = `${normalizePersonName(cand.prenom)}_${normalizePersonName(cand.nom)}`;
      const nameKeyInv = `${normalizePersonName(cand.nom)}_${normalizePersonName(cand.prenom)}`;

      // Recherche dans Personnes existantes
      let matchedPersonne: Personne | undefined;
      if (cand.matricule && personnesByMatricule.has(cand.matricule)) {
        matchedPersonne = personnesByMatricule.get(cand.matricule);
      } else if (personnesById.has(cand.idProfil)) {
        matchedPersonne = personnesById.get(cand.idProfil);
      } else {
        const persCandidates = personnesByName.get(nameKey) || personnesByName.get(nameKeyInv);
        if (persCandidates && persCandidates.length > 0) {
          matchedPersonne = persCandidates[0];
        }
      }

      if (!cand.email && matchedPersonne?.email) {
        cand.email = matchedPersonne.email;
      }
      if (!cand.email && cand.prenom && cand.nom) {
        cand.email = `${normalizePersonName(cand.prenom)}.${normalizePersonName(cand.nom)}@logiclever.com`;
      }

      const existingParticipant = existingParticipants.find(
        p => p.idProfil === cand.idProfil || (cand.matricule && p.matricule === cand.matricule)
      );
      const existingUser = existingUsers.find(
        (u: any) =>
          u.idProfil === cand.idProfil ||
          (cand.matricule && u.matricule === cand.matricule) ||
          (cand.email && u.email && u.email.toLowerCase() === cand.email.toLowerCase())
      );

      cand.isExistingPersonne = !!matchedPersonne;
      cand.isExistingParticipant = !!existingParticipant;
      cand.isExistingUser = !!existingUser;
      cand.action = existingParticipant ? 'UPDATE' : 'CREATE';

      candidatesToProcess.push(cand);
    }

    // 7. Calculer les affectations d'évaluateurs via la feuille Primes
    const lookupMatricule = (rawMatricule: string): string | null => {
      const norm = normalizeMatricule(rawMatricule);
      if (!norm) return null;
      if (matriculeToIdProfil.has(norm)) return matriculeToIdProfil.get(norm)!;

      const num = parseInt(norm, 10);
      if (!isNaN(num)) {
        const numStr = num.toString();
        if (matriculeToIdProfil.has(numStr)) return matriculeToIdProfil.get(numStr)!;
        const padStr = numStr.padStart(5, '0');
        if (matriculeToIdProfil.has(padStr)) return matriculeToIdProfil.get(padStr)!;
      }

      const existingPers = personnesByMatricule.get(norm);
      if (existingPers?.idProfil) return existingPers.idProfil;

      return null;
    };

    const resolveMatriculeThroughBoondAndProfil = (rawMatricule: string) => {
      const found = lookupMatricule(rawMatricule);
      if (found) return found;

      // Aucun Id_Profil ou profil n'est associé à ce matricule dans Rapport_RH_Query_Salaries ou les données existantes.
      return null;
    };

    const assignmentsByCandidate: Record<string, string[]> = {};
    const assignmentsDetailsByCandidate: Record<string, Record<string, { project?: string; client?: string }>> = {};
    const assignmentsByEvaluator: Record<string, string[]> = {};
    let activePrimesCount = 0;
    let expiredPrimesCount = 0;

    primeRows.forEach(pr => {
      const candMat = normalizeMatricule(pr.candidateMatricule);
      const evalMat = normalizeMatricule(pr.evaluatorMatricule);

      const candIdProfil = lookupMatricule(candMat) || resolveMatriculeThroughBoondAndProfil(candMat);
      const evalIdProfil = lookupMatricule(evalMat) || resolveMatriculeThroughBoondAndProfil(evalMat);

      if (candIdProfil) pr.resolvedCandidateIdProfil = candIdProfil;
      if (evalIdProfil) pr.resolvedEvaluatorIdProfil = evalIdProfil;

      // Si le matricule de l'évaluateur n'a pas de profil/nom trouvé dans le Rapport RH, on l'ignore lors du chargement des utilisateurs
      if (!evalIdProfil) {
        const warnMsg = `Matricule évaluateur « ${pr.evaluatorMatricule} » trouvé dans le fichier Primes (ligne ${pr.rawRowIndex}) mais absent du Rapport RH : évaluateur ignoré lors du chargement des utilisateurs.`;
        if (!warnings.includes(warnMsg)) {
          warnings.push(warnMsg);
        }
        return;
      }

      if (!pr.isActive) {
        expiredPrimesCount++;
        return;
      }

      activePrimesCount++;

      if (candIdProfil && evalIdProfil && candIdProfil !== evalIdProfil) {
        if (!assignmentsByCandidate[candIdProfil]) {
          assignmentsByCandidate[candIdProfil] = [];
        }
        if (!assignmentsByCandidate[candIdProfil].includes(evalIdProfil)) {
          assignmentsByCandidate[candIdProfil].push(evalIdProfil);
        }

        if (!assignmentsDetailsByCandidate[candIdProfil]) {
          assignmentsDetailsByCandidate[candIdProfil] = {};
        }
        if (!assignmentsDetailsByCandidate[candIdProfil][evalIdProfil]) {
          assignmentsDetailsByCandidate[candIdProfil][evalIdProfil] = {
            project: pr.project,
            client: pr.client
          };
        } else {
          // If not set yet, set project and client
          if (!assignmentsDetailsByCandidate[candIdProfil][evalIdProfil].project && pr.project) {
            assignmentsDetailsByCandidate[candIdProfil][evalIdProfil].project = pr.project;
          }
          if (!assignmentsDetailsByCandidate[candIdProfil][evalIdProfil].client && pr.client) {
            assignmentsDetailsByCandidate[candIdProfil][evalIdProfil].client = pr.client;
          }
        }

        if (!assignmentsByEvaluator[evalIdProfil]) {
          assignmentsByEvaluator[evalIdProfil] = [];
        }
        if (!assignmentsByEvaluator[evalIdProfil].includes(candIdProfil)) {
          assignmentsByEvaluator[evalIdProfil].push(candIdProfil);
        }
      }
    });

    // Construction de la liste des évaluateurs / jurys à initialiser
    const candidateIdSet = new Set(candidatesToProcess.map(c => c.idProfil));
    const evaluatorsMap = new Map<string, EvaluatorInitData>();

    Object.entries(assignmentsByEvaluator).forEach(([evalIdProfil, assignedCandIds]) => {
      const isCand = candidateIdSet.has(evalIdProfil);
      let nom = '';
      let prenom = '';
      let matricule = '';
      let email = '';
      let grade: Grade | undefined = undefined;

      if (isCand) {
        const candObj = candidatesToProcess.find(c => c.idProfil === evalIdProfil);
        if (candObj) {
          nom = candObj.nom;
          prenom = candObj.prenom;
          matricule = candObj.matricule || '';
          email = candObj.email;
          grade = candObj.grade;
        }
      } else {
        // 1. Chercher dans l'annuaire complet de Rapport_RH_Query_Salaries
        const emp = allEmployeesByIdProfil.get(evalIdProfil);
        if (emp) {
          nom = emp.nom;
          prenom = emp.prenom;
          matricule = emp.matricule || '';
          email = emp.email;
          grade = emp.grade;
        } else {
          // 2. Chercher dans detailsByMatricule
          for (const [m, det] of detailsByMatricule.entries()) {
            if (det.idProfil === evalIdProfil) {
              matricule = m;
              nom = det.nom;
              prenom = det.prenom;
              grade = det.grade;
              email = det.email || `${normalizePersonName(prenom)}.${normalizePersonName(nom)}@logiclever.com`;
              break;
            }
          }
        }
        // 3. Chercher dans les Personnes existantes
        if (!nom) {
          const matchedPers = personnesById.get(evalIdProfil);
          if (matchedPers) {
            nom = matchedPers.nom;
            prenom = matchedPers.prenom;
            matricule = matchedPers.matricule || '';
            email = matchedPers.email || '';
          }
        }
      }

      // Si aucun nom n'est associé à cet évaluateur (absent du Rapport RH et non réconcilié), l'ignorer lors du chargement des utilisateurs
      if (!nom || !nom.trim() || nom === 'Collaborateur') {
        const warnMsg = `Évaluateur IdProfil « ${evalIdProfil} » (Matricule: ${matricule || 'inconnu'}) sans nom associé dans le Rapport RH : ignoré lors du chargement des utilisateurs.`;
        if (!warnings.includes(warnMsg)) {
          warnings.push(warnMsg);
        }
        return;
      }

      const displayName = `${prenom} ${nom}`.trim() || evalIdProfil;
      const isExistingPersonne = personnesById.has(evalIdProfil);
      const isExistingUser = existingUsers.some((u: any) => u.idProfil === evalIdProfil || (email && u.email?.toLowerCase() === email.toLowerCase()));

      evaluatorsMap.set(evalIdProfil, {
        idProfil: evalIdProfil,
        matricule,
        nom,
        prenom,
        displayName,
        email: email || `${normalizePersonName(displayName.replace(/\s+/g, '.'))}@logiclever.com`,
        grade,
        isCandidate: isCand,
        isExistingPersonne,
        isExistingUser,
        assignedCandidateIds: assignedCandIds
      });
    });

    const evaluatorsToProcess = Array.from(evaluatorsMap.values());
    const newEvaluatorsOnlyCount = evaluatorsToProcess.filter(e => !e.isCandidate).length;
    const participantsToCreateCount = candidatesToProcess.filter(c => c.action === 'CREATE').length + newEvaluatorsOnlyCount;
    const participantsToUpdateCount = candidatesToProcess.filter(c => c.action === 'UPDATE').length;
    const newPersonnesCount = candidatesToProcess.filter(c => !c.isExistingPersonne).length + evaluatorsToProcess.filter(e => !e.isCandidate && !e.isExistingPersonne).length;
    const existingPersonnesCount = candidatesToProcess.filter(c => c.isExistingPersonne).length;
    const newUsersCount = candidatesToProcess.filter(c => !c.isExistingUser).length + evaluatorsToProcess.filter(e => !e.isCandidate && !e.isExistingUser).length;

    return {
      year,
      totalCandidatesParsed: candidatesToProcess.length,
      candidatesToProcess,
      evaluatorsToProcess,
      newPersonnesCount,
      existingPersonnesCount,
      participantsToCreateCount,
      participantsToUpdateCount,
      evaluatorsCount: evaluatorsToProcess.length,
      newEvaluatorsOnlyCount,
      newUsersCount,
      totalPrimesParsed: primeRows.length,
      activePrimesCount,
      expiredPrimesCount,
      meteoLinksCount: totalMeteoLinksCount,
      meteoLinksByCandidate,
      assignmentsByCandidate,
      assignmentsDetailsByCandidate,
      warnings,
      blockingErrors,
      canProceed: blockingErrors.length === 0 && candidatesToProcess.length > 0
    };
  }

  /**
   * Exécute l'initialisation idempotente dans LocalStorage avec création effective des dossiers, jurys et comptes utilisateurs
   */
  static async executeCampaignInitialization(
    preview: CampaignInitPreview,
    campaignData: {
      title: string;
      description?: string;
      rhDocuments: any[];
      pairsDocuments?: any[];
      otherDocuments?: any[];
      createdBy: string;
    },
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: boolean; created: number; updated: number; evaluatorsInitialized: number }> {
    const campaignId = `campaign_${preview.year}`;
    const campaignRef = doc(db, 'campaigns', campaignId);

    if (!preview.canProceed || preview.blockingErrors.length || !preview.candidatesToProcess.length) {
      throw new Error('Corrigez les erreurs de previsualisation avant de lancer la campagne.');
    }
    const batch = writeBatch(db);
    const safeAddToBatch = (action: (batch: ReturnType<typeof writeBatch>) => void) => action(batch);

    const existingCampaign = LocalDatabaseService.getCampaignById(campaignId);

    // 1. Initialiser le document Campagne
    safeAddToBatch((b) => {
      b.set(campaignRef, {
        id: campaignId,
        year: preview.year,
        title: campaignData.title,
        description: campaignData.description || '',
        status: existingCampaign?.status || 'OUVERTE',
        rhDocuments: campaignData.rhDocuments || [],
        pairsDocuments: campaignData.pairsDocuments || [],
        otherDocuments: campaignData.otherDocuments || [],
        createdAt: existingCampaign?.createdAt || new Date().toISOString(),
        createdBy: existingCampaign?.createdBy || campaignData.createdBy,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    });

    let created = 0;
    let updated = 0;

    const evaluatorIdSet = new Set(preview.evaluatorsToProcess.map(e => e.idProfil));
    const evaluatorsByIdProfil = new Map<string, EvaluatorInitData>();
    preview.evaluatorsToProcess.forEach(ev => evaluatorsByIdProfil.set(ev.idProfil, ev));

    const totalSteps = preview.candidatesToProcess.length + preview.evaluatorsToProcess.filter(e => !e.isCandidate).length;
    let currentStepNum = 0;
    const usersToRegister: Partial<UserProfile>[] = [];

    // 2. Traiter chaque collaborateur qualifié (Candidat de la campagne)
    for (let i = 0; i < preview.candidatesToProcess.length; i++) {
      const cand = preview.candidatesToProcess[i];
      const dossierId = `${cand.idProfil}_${preview.year}`;
      const participantId = `${cand.idProfil}_${preview.year}`;
      const isAlsoEvaluator = evaluatorIdSet.has(cand.idProfil);
      const evalObj = preview.evaluatorsToProcess.find(e => e.idProfil === cand.idProfil);

      // A. Mettre à jour ou créer la Personne pérenne
      const personneRef = doc(db, 'personnes', cand.idProfil);
      const personnePayload: Partial<Personne> = {
        idProfil: cand.idProfil,
        matricule: cand.matricule || '',
        nom: cand.nom,
        prenom: cand.prenom,
        displayName: cand.displayName,
        email: cand.email,
        statut: 'ACTIF',
        type: 'COLLABORATEUR',
        updatedAt: new Date().toISOString()
      };
      if (cand.entryDate) personnePayload.entryDate = cand.entryDate;
      if (cand.expertPassageDate) (personnePayload as any).expertGradeDate = cand.expertPassageDate;
      if (cand.experienceEmbauche !== undefined && cand.experienceEmbauche > 0) {
        personnePayload.experienceYearsEmbauche = cand.experienceEmbauche;
      }

      safeAddToBatch((b) => {
        b.set(personneRef, personnePayload, { merge: true });
      });

      // B. Créer / Mettre à jour le CampaignParticipant pour cette campagne
      const participantRef = doc(db, 'campaign_participants', participantId);
      const participantPayload: Partial<CampaignParticipant> = {
        id: participantId,
        campaignId,
        campaignYear: preview.year,
        idProfil: cand.idProfil,
        matricule: cand.matricule || '',
        displayName: cand.displayName,
        email: cand.email,
        team: 'Logic Clever',
        grade: cand.grade,
        salary: cand.currentSalary,
        tjm: cand.currentTJM,
        tjSalaire: cand.currentTJSalaire,
        entryDate: cand.entryDate || '',
        expertGradeDate: cand.expertPassageDate || '',
        totalExperienceYears: cand.experienceYears || 0,
        ancienneteLL: cand.ancienneteLL,
        yearsExpert: cand.anneesExpertise,
        isCandidate: true,
        isEvaluator: isAlsoEvaluator,
        assignedCandidateIds: evalObj?.assignedCandidateIds || [],
        dossierId: dossierId,
        updatedAt: new Date().toISOString()
      };

      safeAddToBatch((b) => {
        b.set(participantRef, participantPayload, { merge: true });
      });

      // C. Créer / sécuriser le Dossier d'évaluation pour cette campagne avec assignations issues des primes
      const dossierRef = doc(db, 'dossiers', dossierId);
      const assignedEvaluators = preview.assignmentsByCandidate[cand.idProfil] || [];
      const candAssignmentDetails = preview.assignmentsDetailsByCandidate?.[cand.idProfil] || {};

      const existingDossier = LocalDatabaseService.getDossierById(dossierId);
      // Liens météo issus de Vues_Meteos (valeur réelle dans la cellule, sans fabrication de faux feedbacks)
      const meteoLinks = cand.meteoLinks || [];
      const mergedMeteoLinks = Array.from(new Set([...(existingDossier?.meteoLinks || []), ...meteoLinks]));

      // Préparer les feedbacks évaluateurs en pré-remplissant Projet/Mission et Client Concerné issus du fichier Primes
      const mergedConsultantFeedbacks: Record<string, ConsultantFeedback> = {
        ...(existingDossier?.consultantFeedbacks || {})
      };

      assignedEvaluators.forEach(evalIdProfil => {
        const details = candAssignmentDetails[evalIdProfil];
        const evalInfo = evaluatorsByIdProfil.get(evalIdProfil);
        const evalDisplayName = evalInfo?.displayName || evalIdProfil;

        // Chercher si un feedback existe déjà pour cet évaluateur
        const existingKey = Object.keys(mergedConsultantFeedbacks).find(k => {
          const f = mergedConsultantFeedbacks[k];
          return f.evaluatorIdProfil === evalIdProfil || f.consultantId === evalIdProfil || f.evaluatorUid === evalIdProfil;
        });

        if (existingKey) {
          // Si le feedback existant n'a pas encore de client ou projet spécifié, injecter les valeurs du fichier Primes
          const curr = mergedConsultantFeedbacks[existingKey];
          if ((!curr.project && details?.project) || (!curr.client && details?.client)) {
            mergedConsultantFeedbacks[existingKey] = {
              ...curr,
              project: curr.project || details?.project || '',
              client: curr.client || details?.client || '',
              updatedAt: new Date().toISOString()
            };
          }
        } else if (details?.project || details?.client) {
          // Créer un brouillon pré-rempli pour cet évaluateur
          const draftKey = `eval_${evalIdProfil}_init`;
          mergedConsultantFeedbacks[draftKey] = {
            id: draftKey,
            consultantId: evalIdProfil,
            consultantName: evalDisplayName,
            evaluatorUid: evalIdProfil,
            evaluatorIdProfil: evalIdProfil,
            campaignId: campaignId,
            client: details?.client || '',
            project: details?.project || '',
            relationType: 'Collègue_Mission',
            type: 'Collègue_Mission',
            targetTJMin: 0,
            targetTJMax: 0,
            missionPercentage: 98,
            investmentPercentage: 60,
            confidenceIndex: 4,
            justification: '',
            improvementAxes: '',
            status: 'BROUILLON',
            validated: false,
            updatedAt: new Date().toISOString()
          };
        }
      });

      const dossierObj: Dossier = {
        id: dossierId,
        candidateId: cand.idProfil,
        idProfil: cand.idProfil,
        campaignId: campaignId,
        candidateName: cand.displayName,
        candidateEmail: cand.email,
        campaignYear: preview.year,
        status: 'OUVERT',
        assignedConsultantIds: assignedEvaluators,
        annualReport: {
          ...defaultReportData,
          currentGrade: cand.grade,
          currentTJSalaire: cand.currentTJSalaire,
          currentTJM: cand.currentTJM,
          currentSalary: cand.currentSalary,
        },
        meteoLinks: mergedMeteoLinks,
        clientFeedbacks: existingDossier?.clientFeedbacks || [],
        documents: existingDossier?.documents || [],
        consultantFeedbacks: mergedConsultantFeedbacks,
        createdAt: existingDossier?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(existingDossier ? {
          status: existingDossier.status,
          annualReport: { ...defaultReportData, currentGrade: cand.grade, currentTJSalaire: cand.currentTJSalaire, currentTJM: cand.currentTJM, currentSalary: cand.currentSalary, ...existingDossier.annualReport },
          meteoLinks: mergedMeteoLinks,
          clientFeedbacks: existingDossier.clientFeedbacks || [],
          documents: existingDossier.documents || [],
          consultantFeedbacks: mergedConsultantFeedbacks,
          createdAt: existingDossier.createdAt,
        } : {}),
      };

      safeAddToBatch((b) => {
        b.set(dossierRef, dossierObj, { merge: true });
      });

      // D. Prepare the user profile for the same local commit.
      const candUserRoles: UserRole[] = isAlsoEvaluator ? ['CANDIDATE', 'EVALUATOR'] : ['CANDIDATE'];
      usersToRegister.push({
        id: cand.idProfil,
        idProfil: cand.idProfil,
        matricule: cand.matricule || '',
        displayName: cand.displayName,
        email: cand.email,
        roles: candUserRoles,
        team: 'Logic Clever',
        currentGrade: cand.grade,
        currentSalary: cand.currentSalary,
        currentTJSalaire: cand.currentTJSalaire,
        currentTJM: cand.currentTJM,
        entryDate: cand.entryDate || '',
        expertGradeDate: cand.expertPassageDate || '',
        experienceYears: cand.experienceYears || 0,
        ancienneteLL: cand.ancienneteLL,
        yearsExpert: cand.anneesExpertise,
        assignedCandidateIds: evalObj?.assignedCandidateIds || [],
        updatedAt: new Date().toISOString()
      });

      if (cand.action === 'CREATE') created++;
      else updated++;

      currentStepNum++;
      if (onProgress) {
        onProgress(currentStepNum, totalSteps);
      }
    }

    // 3. Traiter les purs évaluateurs (Membres du Jury issus de Primes qui ne sont pas candidats)
    let evaluatorsInitialized = 0;
    const nonCandidateEvaluators = preview.evaluatorsToProcess.filter(e => !e.isCandidate);

    for (const ev of nonCandidateEvaluators) {
      const participantId = `${ev.idProfil}_${preview.year}`;

      // A. Mettre à jour ou créer la Personne pérenne
      const personneRef = doc(db, 'personnes', ev.idProfil);
      const evPersonne: Partial<Personne> = {
        idProfil: ev.idProfil,
        matricule: ev.matricule || '',
        nom: ev.nom,
        prenom: ev.prenom,
        displayName: ev.displayName,
        email: ev.email,
        statut: 'ACTIF',
        type: 'COLLABORATEUR',
        updatedAt: new Date().toISOString()
      };

      safeAddToBatch((b) => {
        b.set(personneRef, evPersonne, { merge: true });
      });

      // B. Créer / Mettre à jour le CampaignParticipant pour cette campagne
      const participantRef = doc(db, 'campaign_participants', participantId);
      const evParticipant: Partial<CampaignParticipant> = {
        id: participantId,
        campaignId,
        campaignYear: preview.year,
        idProfil: ev.idProfil,
        matricule: ev.matricule || '',
        displayName: ev.displayName,
        email: ev.email,
        team: 'Logic Clever',
        grade: ev.grade || 'Senior',
        isCandidate: false,
        isEvaluator: true,
        assignedCandidateIds: ev.assignedCandidateIds,
        updatedAt: new Date().toISOString()
      };

      safeAddToBatch((b) => {
        b.set(participantRef, evParticipant, { merge: true });
      });

      // C. Préparer le compte utilisateur évaluateur dans le répertoire local / JSON
      usersToRegister.push({
        id: ev.idProfil,
        idProfil: ev.idProfil,
        matricule: ev.matricule || '',
        displayName: ev.displayName,
        email: ev.email,
        roles: ['EVALUATOR'],
        team: 'Logic Clever',
        currentGrade: ev.grade || 'Senior',
        assignedCandidateIds: ev.assignedCandidateIds,
        updatedAt: new Date().toISOString()
      });

      evaluatorsInitialized++;
      currentStepNum++;
      if (onProgress) {
        onProgress(currentStepNum, totalSteps);
      }
    }

    // Commit every campaign entity together before reporting success.
    const preparedUsers = UserDirectoryService.prepareUsers(usersToRegister);
    for (const user of preparedUsers) {
      batch.set(doc(db, 'users', user.id), user);
    }
    await batch.commit();

    // Synchroniser automatiquement la nouvelle campagne et les nouveaux utilisateurs dans les fichiers JSON
    const createdCampaign: Campaign = {
      id: campaignId,
      year: preview.year,
      title: campaignData.title,
      description: campaignData.description || '',
      status: existingCampaign?.status || 'OUVERTE',
      rhDocuments: campaignData.rhDocuments || [],
      pairsDocuments: campaignData.pairsDocuments || [],
      otherDocuments: campaignData.otherDocuments || [],
      createdAt: existingCampaign?.createdAt || new Date().toISOString(),
      createdBy: existingCampaign?.createdBy || campaignData.createdBy,
      updatedAt: new Date().toISOString()
    };
    LocalDatabaseService.syncCampaignToDisk(createdCampaign);
    if (preparedUsers.length > 0) {
      UserDirectoryService.syncUsersToDisk(preparedUsers);
    }

    return { 
      success: true, 
      created, 
      updated, 
      evaluatorsInitialized: preview.evaluatorsToProcess.length 
    };
  }
}
