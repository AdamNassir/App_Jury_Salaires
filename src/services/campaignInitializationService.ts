import { defaultReportData } from '../data/defaultAnnualReport';
import * as XLSX from 'xlsx';
import { collection, getDocs, doc, writeBatch, query, where } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { Personne, CampaignParticipant, Dossier, Grade, UserProfile, Campaign } from '../types';
import { UserDirectoryService } from './userDirectoryService';
import { LocalDatabaseService } from './localDatabaseService';

export interface RawRow {
  [key: string]: any;
}

export interface SheetParsingResult {
  fileName: string;
  tabName?: string;
  rows: RawRow[];
  headers: string[];
}

export interface CandidateInitData {
  idProfil: string;
  matricule?: string;
  nom: string;
  prenom: string;
  displayName: string;
  email: string;
  grade: Grade;
  currentSalary: number; // Salaire_vendu (Col K)
  currentTJM: number;    // TJ vendu (01/07) (Col J)
  entryDate?: string;    // Date entrée LL (Col E)
  expertPassageDate?: string; // Date de passage au grade expert (Col F)
  ancienneteLL?: number; // Ancienneté chez LL (Col G)
  experienceEmbauche?: number; // Déduit de Boond_Liste_Valeur via Id_Annees_Experience_A_Embauche
  experienceYears?: number; // Total = Ancienneté LL + Expérience à l'embauche
  isExistingPersonne: boolean;
  isExistingParticipant: boolean;
  isExistingUser: boolean;
  action: 'CREATE' | 'UPDATE' | 'SKIP';
  changes?: Record<string, { before: any; after: any }>;
  warnings: string[];
}

export interface PrimeAssignmentRow {
  rawRowIndex: number;
  evaluatorMatricule: string;
  candidateMatricule: string;
  typePrime: string;
  debutPrime?: string;
  finPrime?: string;
  project?: string;
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
  assignmentsByCandidate: Record<string, string[]>; // candidateIdProfil -> evaluatorIdProfils[]
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
 * Tente de convertir une chaîne ou nombre en montant numérique
 */
export function parseFrenchNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val)
    .replace(/\s+/g, '')
    .replace(/€/g, '')
    .replace(/k€/i, '000')
    .replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
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

  // Format français JJ/MM/AAAA
  const frMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (frMatch) {
    return new Date(parseInt(frMatch[3]), parseInt(frMatch[2]) - 1, parseInt(frMatch[1]));
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
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
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
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });

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

    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(5, rawMatrix.length); i++) {
      const row = rawMatrix[i] || [];
      const colA = normalizeHeader(String(row[0] || ''));
      if (colA.includes('matricule') || colA.includes('prime')) {
        headerRowIndex = i;
        break;
      }
    }

    const rows: PrimeAssignmentRow[] = [];
    const thresholdDate = new Date(campaignYear, 6, 1); // 01/07 de l'année de campagne

    for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
      const rowArr = rawMatrix[i];
      if (!rowArr || rowArr.length === 0) continue;

      // Col A (0) : Matricule_Percoit_Prime (Evaluateur)
      const evaluatorMatricule = cleanString(rowArr[0]);
      // Col B (1) : Matricule_Consultant_Place (Candidat)
      const candidateMatricule = cleanString(rowArr[1]);
      if (!evaluatorMatricule || !candidateMatricule) continue;

      // Col C (2) : Type_Prime
      const typePrime = cleanString(rowArr[2]);
      // Col D (3) : Debut_Prime
      const debutRaw = rowArr[3];
      // Col E (4) : Fin_Prime
      const finRaw = rowArr[4];
      // Col G (6) : Projet
      const project = cleanString(rowArr[6]);

      const finDate = parseExcelDate(finRaw);
      let isActive = true;
      let explanation = 'Prime active';

      if (finDate && finDate.getTime() < thresholdDate.getTime()) {
        isActive = false;
        explanation = `Prime expirée au ${finDate.toLocaleDateString('fr-FR')} (antérieure au 01/07/${campaignYear}) : aucune obligation d'évaluation.`;
      }

      rows.push({
        rawRowIndex: i + 1,
        evaluatorMatricule,
        candidateMatricule,
        typePrime,
        debutPrime: debutRaw ? String(debutRaw) : undefined,
        finPrime: finRaw ? String(finRaw) : undefined,
        project: project || undefined,
        isActive,
        explanation
      });
    }

    return rows;
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
      profilFile?: File | null;
      boondFile?: File | null;
      analyseJuryFile?: File | null;
      rhFile?: File | null;
      primesFile?: File | null;
    }
  ): Promise<CampaignInitPreview> {
    const warnings: string[] = [];
    const blockingErrors: string[] = [];

    const jurySpreadsheet = files.analyseJuryFile || files.rhFile;

    if (!year || year < 2020 || year > 2100) {
      blockingErrors.push(`L'année de campagne spécifiée (${year}) est invalide.`);
    }

    if (!files.profilFile) {
      blockingErrors.push("Le fichier BDD_LL_NEW_DRIVE (onglet 'Profil') est obligatoire (Col A: Id_Profil, Col B: Nom, Col C: Prénom).");
    }

    if (!jurySpreadsheet) {
      blockingErrors.push("Le fichier Analyse_Jury_Salaires (onglet 'Analyse_Jury') est obligatoire.");
    }

    // 1. Lire BDD_LL_NEW_DRIVE (feuille "Profil")
    interface ProfilItem {
      idProfil: string;
      nom: string;
      prenom: string;
    }
    const profilsById = new Map<string, ProfilItem>();
    const profilsByName = new Map<string, ProfilItem[]>();

    if (files.profilFile) {
      const data = await files.profilFile.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('profil')) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });

      // Recherche de la ligne d'en-tête
      let headerRow = 0;
      for (let r = 0; r < Math.min(5, matrix.length); r++) {
        const row = matrix[r] || [];
        const normA = normalizeHeader(String(row[0] || ''));
        if (normA.includes('id_profil') || normA.includes('profil') || normA.includes('id')) {
          headerRow = r;
          break;
        }
      }

      for (let r = headerRow + 1; r < matrix.length; r++) {
        const row = matrix[r] || [];
        const idProfil = cleanString(row[0]);
        const nom = cleanString(row[1]);
        const prenom = cleanString(row[2]);

        if (!idProfil && !nom && !prenom) continue;

        if (idProfil) {
          const item: ProfilItem = { idProfil, nom, prenom };
          profilsById.set(idProfil, item);
          const nameKey = `${normalizePersonName(prenom)}_${normalizePersonName(nom)}`;
          if (nameKey !== '_') {
            if (!profilsByName.has(nameKey)) profilsByName.set(nameKey, []);
            profilsByName.get(nameKey)!.push(item);
          }
        }
      }

      if (profilsById.size === 0) {
        blockingErrors.push("Aucun Id_Profil trouvé dans le fichier BDD_LL_NEW_DRIVE (feuille 'Profil', Colonne A).");
      }
    }

    // 2. Lire BDD_API_BOOND_NEW_DRIVE (feuilles "Boond_Liste_Valeur" et "Boond_Ressources")
    const boondValuesExperienceMap = new Map<string, number>(); // id_valeur ou string -> number d'années
    interface BoondResourceItem {
      prenom: string;
      nom: string;
      matricule: string;
      grade: string;
      experienceYearsEmbauche: number;
    }
    const boondByMatricule = new Map<string, BoondResourceItem>();
    const boondByName = new Map<string, BoondResourceItem[]>();

    if (files.boondFile) {
      const data = await files.boondFile.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: true });

      // A. Feuille "Boond_Liste_Valeur" :
      // Col B : Nom_Valeur ("Annees_Experience_A_Embauche")
      // Col D : Libelle_Valeur (ex: "3 ans", "2", etc.)
      // Clé d'ID : Col A ou Col C (index de la valeur)
      const listValSheetName = wb.SheetNames.find(s => {
        const n = normalizeHeader(s);
        return n.includes('liste_valeur') || n.includes('valeur') || n.includes('liste');
      });

      if (listValSheetName) {
        const ws = wb.Sheets[listValSheetName];
        const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
        let hRow = 0;
        for (let r = 0; r < Math.min(5, matrix.length); r++) {
          const row = matrix[r] || [];
          if (row.some(c => normalizeHeader(String(c)).includes('valeur'))) {
            hRow = r;
            break;
          }
        }

        for (let r = hRow + 1; r < matrix.length; r++) {
          const row = matrix[r] || [];
          const idValA = cleanString(row[0]);
          const nomValeur = normalizeHeader(String(row[1] || '')); // Col B
          const idValC = cleanString(row[2]);
          const libelleValeur = cleanString(row[3]); // Col D

          if (nomValeur.includes('annees_experience_a_embauche') || nomValeur.includes('experience_a_embauche') || nomValeur.includes('experience')) {
            const expYears = parseFrenchNumber(libelleValeur);
            if (idValA) boondValuesExperienceMap.set(idValA, expYears);
            if (idValC) boondValuesExperienceMap.set(idValC, expYears);
            // Par sécurité, indexer aussi le libellé brut
            if (libelleValeur) boondValuesExperienceMap.set(cleanString(libelleValeur), expYears);
          }
        }
      }

      // B. Feuille "Boond_Ressources" :
      // Col C (2) : Prenom_Ressource
      // Col D (3) : Nom_Ressource
      // Col E (4) : Matricule_Ressource
      // Col H (7) : Titre_Ressource (Grade actuel)
      // Col M (12) : Id_Annees_Experience_A_Embauche
      const resSheetName = wb.SheetNames.find(s => {
        const n = normalizeHeader(s);
        return n.includes('ressource') || n.includes('boond_ressources');
      }) || wb.SheetNames[0];

      if (resSheetName) {
        const ws = wb.Sheets[resSheetName];
        const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
        let hRow = 0;
        for (let r = 0; r < Math.min(5, matrix.length); r++) {
          const row = matrix[r] || [];
          if (row.some(c => normalizeHeader(String(c)).includes('ressource') || normalizeHeader(String(c)).includes('matricule'))) {
            hRow = r;
            break;
          }
        }

        for (let r = hRow + 1; r < matrix.length; r++) {
          const row = matrix[r] || [];
          const prenom = cleanString(row[2]); // Col C
          const nom = cleanString(row[3]);    // Col D
          const matricule = cleanString(row[4]).toUpperCase(); // Col E
          const gradeTitre = cleanString(row[7]); // Col H
          const idExpEmbauche = cleanString(row[12]); // Col M

          if (!prenom && !nom && !matricule) continue;

          let expEmbauche = 0;
          if (idExpEmbauche && boondValuesExperienceMap.has(idExpEmbauche)) {
            expEmbauche = boondValuesExperienceMap.get(idExpEmbauche) || 0;
          } else if (idExpEmbauche) {
            expEmbauche = parseFrenchNumber(idExpEmbauche);
          }

          const resItem: BoondResourceItem = {
            prenom,
            nom,
            matricule,
            grade: gradeTitre,
            experienceYearsEmbauche: expEmbauche
          };

          if (matricule) boondByMatricule.set(matricule, resItem);
          const nameKey = `${normalizePersonName(prenom)}_${normalizePersonName(nom)}`;
          if (nameKey !== '_') {
            if (!boondByName.has(nameKey)) boondByName.set(nameKey, []);
            boondByName.get(nameKey)!.push(resItem);
          }
        }
      }
    }

    // 3. Lire Analyse_Jury_Salaires (feuille "Analyse_Jury", en-têtes à la ligne 2 / index 1)
    interface RawJuryRow {
      matricule: string;     // Col A
      prenom: string;        // Col B
      nom: string;           // Col C
      dateEntreeLL?: string; // Col E
      datePassageExpert?: string; // Col F
      ancienneteLL: number;  // Col G
      tjVendu0107: number;   // Col J
      salaireVendu: number;  // Col K
    }
    const rawJuryRows: RawJuryRow[] = [];

    if (jurySpreadsheet) {
      const data = await jurySpreadsheet.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      
      // Recherche de l'onglet :
      // 1. Recherche par nom (insensible aux accents, espaces, tirets, underscores)
      let targetSheetName = wb.SheetNames.find(s => {
        const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
        return clean.includes('analysejury') || clean.includes('jury') || clean.includes('salaires');
      });

      // 2. Si pas trouvé par nom, recherche heuristique par contenu (recherche de la feuille contenant "matricule" et "salaire" ou "anciennete")
      if (!targetSheetName) {
        for (const sName of wb.SheetNames) {
          const testWs = wb.Sheets[sName];
          const testMatrix = XLSX.utils.sheet_to_json<any[]>(testWs, { header: 1, defval: '' });
          const hasJuryHeaders = testMatrix.slice(0, 5).some(row => {
            if (!Array.isArray(row)) return false;
            const rowStr = row.map(c => normalizeHeader(String(c))).join(' ');
            return rowStr.includes('matricule') && (rowStr.includes('salaire') || rowStr.includes('expert') || rowStr.includes('anciennete'));
          });
          if (hasJuryHeaders) {
            targetSheetName = sName;
            break;
          }
        }
      }

      // 3. Fallback sur la première feuille si aucune autre n'est trouvée
      if (!targetSheetName && wb.SheetNames.length > 0) {
        targetSheetName = wb.SheetNames[0];
      }

      if (!targetSheetName) {
        blockingErrors.push(`Le classeur Analyse_Jury_Salaires ne contient aucune feuille lisible.`);
      } else {
        const ws = wb.Sheets[targetSheetName];
        const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });

        // Ligne 2 (index 1) : En-têtes spécifiés
        // Données à partir de la ligne 3 (index 2)
        let startRow = 2;
        let detectedHeaderRow = -1;

        for (let r = 0; r < Math.min(6, matrix.length); r++) {
          const norm = (matrix[r] || []).map(c => normalizeHeader(String(c)));
          if (norm.includes('matricule') || (norm.includes('prenom') && norm.includes('nom')) || norm.some(x => x.includes('matricule'))) {
            detectedHeaderRow = r;
            break;
          }
        }

        if (detectedHeaderRow >= 0) {
          startRow = detectedHeaderRow + 1;
        } else if (matrix.length > 2) {
          startRow = 2;
        }

        for (let r = startRow; r < matrix.length; r++) {
          const row = matrix[r] || [];
          if (!row || row.length === 0) continue;

          const matricule = cleanString(row[0]).toUpperCase(); // Col A
          const prenom = cleanString(row[1]); // Col B
          const nom = cleanString(row[2]);    // Col C

          if (!matricule && !prenom && !nom) continue;

          const dateEntreeLLRaw = row[4]; // Col E
          const dateExpertRaw = row[5];   // Col F
          const ancienneteLL = parseFrenchNumber(row[6]); // Col G
          const tjVendu0107 = parseFrenchNumber(row[9]);  // Col J
          const salaireVendu = parseFrenchNumber(row[10]); // Col K

          const dEntree = parseExcelDate(dateEntreeLLRaw);
          const dExpert = parseExcelDate(dateExpertRaw);

          rawJuryRows.push({
            matricule,
            prenom,
            nom,
            dateEntreeLL: dEntree ? dEntree.toISOString().split('T')[0] : (dateEntreeLLRaw ? cleanString(dateEntreeLLRaw) : undefined),
            datePassageExpert: dExpert ? dExpert.toISOString().split('T')[0] : (dateExpertRaw ? cleanString(dateExpertRaw) : undefined),
            ancienneteLL,
            tjVendu0107,
            salaireVendu
          });
        }

        if (rawJuryRows.length === 0) {
          blockingErrors.push(
            `Aucune donnée exploitable trouvée dans l'onglet '${targetSheetName}'. ` +
            `Onglets présents dans votre fichier : [${wb.SheetNames.join(', ')}]. ` +
            `Veuillez vérifier que les données commencent à la ligne 3 avec Matricule en Col A, Prénom en Col B, Nom en Col C.`
          );
        }
      }
    }

    // 4. Lire Primes (optionnel)
    let primeRows: PrimeAssignmentRow[] = [];
    if (files.primesFile) {
      try {
        primeRows = await this.parsePrimesFile(files.primesFile, year);
      } catch (e: any) {
        warnings.push(`Erreur lors de la lecture du fichier Primes : ${e.message}`);
      }
    }

    // 5. Charger données existantes LocalStorage pour rapprochement & préservation
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

    // 6. Croisement et construction des Candidats à initialiser
    const candidatesToProcess: CandidateInitData[] = [];
    const processedIdProfils = new Set<string>();

    for (let i = 0; i < rawJuryRows.length; i++) {
      const jury = rawJuryRows[i];
      const nameKey = `${normalizePersonName(jury.prenom)}_${normalizePersonName(jury.nom)}`;
      const nameKeyInv = `${normalizePersonName(jury.nom)}_${normalizePersonName(jury.prenom)}`;

      // A. Recherche du Profil canonique dans BDD_LL_NEW_DRIVE (Col B & C) ou LocalStorage
      let matchedProfil: ProfilItem | undefined;
      const profCandidates = profilsByName.get(nameKey) || profilsByName.get(nameKeyInv);
      if (profCandidates && profCandidates.length > 0) {
        matchedProfil = profCandidates[0];
      }

      // Recherche dans Personnes existantes
      let matchedPersonne: Personne | undefined;
      if (jury.matricule && personnesByMatricule.has(jury.matricule)) {
        matchedPersonne = personnesByMatricule.get(jury.matricule);
      } else {
        const persCandidates = personnesByName.get(nameKey) || personnesByName.get(nameKeyInv);
        if (persCandidates && persCandidates.length > 0) {
          matchedPersonne = persCandidates[0];
        }
      }

      // B. Résolution de l'Id_Profil canonique (Col A de BDD_LL_NEW_DRIVE prioritaire)
      let resolvedIdProfil = '';
      if (matchedProfil) {
        resolvedIdProfil = matchedProfil.idProfil;
      } else if (matchedPersonne && matchedPersonne.idProfil) {
        resolvedIdProfil = matchedPersonne.idProfil;
      } else if (jury.matricule) {
        resolvedIdProfil = `PROF_${jury.matricule}`;
        warnings.push(`Id_Profil non trouvé dans BDD_LL_NEW_DRIVE pour ${jury.prenom} ${jury.nom} (Matricule: ${jury.matricule}). Identifiant généré : ${resolvedIdProfil}.`);
      } else {
        resolvedIdProfil = `PROF_${normalizePersonName(jury.nom).toUpperCase()}_${normalizePersonName(jury.prenom).toUpperCase()}`;
        warnings.push(`Id_Profil non trouvé dans BDD_LL_NEW_DRIVE pour ${jury.prenom} ${jury.nom}. Identifiant généré : ${resolvedIdProfil}.`);
      }

      if (processedIdProfils.has(resolvedIdProfil)) {
        continue;
      }
      processedIdProfils.add(resolvedIdProfil);

      // C. Recherche Boond pour le Grade (Col H) et Expérience à l'embauche (Col M / Col D)
      let matchedBoond: BoondResourceItem | undefined;
      if (jury.matricule && boondByMatricule.has(jury.matricule)) {
        matchedBoond = boondByMatricule.get(jury.matricule);
      } else {
        const boondCandidates = boondByName.get(nameKey) || boondByName.get(nameKeyInv);
        if (boondCandidates && boondCandidates.length > 0) {
          matchedBoond = boondCandidates[0];
        }
      }

      // Normalisation du Grade (issu de Boond Titre_Ressource Col H)
      let finalGrade: Grade | undefined = undefined;
      const rawGradeTitle = matchedBoond?.grade?.trim().toLowerCase() || '';
      if (rawGradeTitle.includes('expert')) finalGrade = 'Expert';
      else if (rawGradeTitle.includes('senior')) finalGrade = 'Senior';
      else if (rawGradeTitle.includes('confirm') || rawGradeTitle.includes('confirme')) finalGrade = 'Confirmé';
      else if (rawGradeTitle.includes('junior')) finalGrade = 'Junior';

      // D. Calcul de l'Expérience Totale :
      // Ancienneté chez LL (Col G de Analyse_Jury) + Expérience à l'embauche (Boond)
      const expEmbauche = matchedBoond?.experienceYearsEmbauche || matchedPersonne?.experienceYearsEmbauche || 0;
      const anciennete = jury.ancienneteLL || 0;
      const totalExp = Math.round((expEmbauche + anciennete) * 10) / 10;

      const prenomFinal = matchedProfil?.prenom || jury.prenom || matchedPersonne?.prenom || 'Collaborateur';
      const nomFinal = matchedProfil?.nom || jury.nom || matchedPersonne?.nom || 'Logiclever';
      const displayNameFinal = `${prenomFinal} ${nomFinal}`.trim();
      let emailFinal = matchedPersonne?.email || '';
      if (!emailFinal && prenomFinal && nomFinal) {
        emailFinal = `${normalizePersonName(prenomFinal)}.${normalizePersonName(nomFinal)}@logiclever.com`;
      }

      const existingParticipant = existingParticipants.find(p => p.idProfil === resolvedIdProfil || (p.matricule && p.matricule === jury.matricule));
      const existingUser = existingUsers.find((u: any) => u.idProfil === resolvedIdProfil || (u.matricule && u.matricule === jury.matricule) || (u.email && u.email.toLowerCase() === emailFinal.toLowerCase()));

      candidatesToProcess.push({
        idProfil: resolvedIdProfil,
        matricule: jury.matricule || matchedBoond?.matricule || matchedPersonne?.matricule || undefined,
        nom: nomFinal,
        prenom: prenomFinal,
        displayName: displayNameFinal,
        email: emailFinal,
        grade: finalGrade,
        currentSalary: jury.salaireVendu || existingParticipant?.salary || (existingUser as any)?.currentSalary || 0,
        currentTJM: jury.tjVendu0107 || existingParticipant?.tjm || (existingUser as any)?.currentTJM || 0,
        entryDate: jury.dateEntreeLL || matchedPersonne?.entryDate || undefined,
        expertPassageDate: jury.datePassageExpert || (matchedPersonne as any)?.expertGradeDate || undefined,
        ancienneteLL: anciennete,
        experienceEmbauche: expEmbauche,
        experienceYears: totalExp,
        isExistingPersonne: !!matchedPersonne,
        isExistingParticipant: !!existingParticipant,
        isExistingUser: !!existingUser,
        action: existingParticipant ? 'UPDATE' : 'CREATE',
        warnings: []
      });
    }

    // 7. Calculer les affectations d'évaluateurs via la feuille Primes
    const matriculeToIdProfil = new Map<string, string>();
    const detailsByMatricule = new Map<string, { idProfil: string; nom: string; prenom: string; grade?: Grade; email?: string }>();

    candidatesToProcess.forEach(c => {
      if (c.matricule) {
        const m = c.matricule.trim().toUpperCase();
        matriculeToIdProfil.set(m, c.idProfil);
        detailsByMatricule.set(m, {
          idProfil: c.idProfil,
          nom: c.nom,
          prenom: c.prenom,
          grade: c.grade,
          email: c.email
        });
      }
    });

    existingPersonnes.forEach(p => {
      if (p.matricule) {
        const m = p.matricule.trim().toUpperCase();
        if (!matriculeToIdProfil.has(m)) {
          matriculeToIdProfil.set(m, p.idProfil);
          detailsByMatricule.set(m, {
            idProfil: p.idProfil,
            nom: p.nom,
            prenom: p.prenom,
            email: p.email
          });
        }
      }
    });

    // Helper pour résoudre un matricule présent dans Primes mais pas dans Analyse_Jury
    // En utilisant Boond_Ressources (Col E Matricule, Col C Prenom, Col D Nom, Col H Grade)
    // puis BDD_LL_NEW_DRIVE (feuille "Profil" Col B Nom, Col C Prenom -> Col A Id_Profil)
    const resolveMatriculeThroughBoondAndProfil = (rawMatricule: string) => {
      const mat = rawMatricule.trim().toUpperCase();
      if (matriculeToIdProfil.has(mat)) {
        return matriculeToIdProfil.get(mat)!;
      }

      // Recherche dans Boond
      const boondItem = boondByMatricule.get(mat);
      let nom = '';
      let prenom = '';
      let grade: Grade | undefined = undefined;

      if (boondItem) {
        nom = boondItem.nom;
        prenom = boondItem.prenom;
        const rawG = (boondItem.grade || '').toLowerCase();
        if (rawG.includes('expert')) grade = 'Expert';
        else if (rawG.includes('senior')) grade = 'Senior';
        else if (rawG.includes('confirm') || rawG.includes('confirme')) grade = 'Confirmé';
        else if (rawG.includes('junior')) grade = 'Junior';
      }

      // Recherche dans BDD_LL_NEW_DRIVE (Profil)
      let resolvedIdProfil = '';
      if (prenom && nom) {
        const nameKey = `${normalizePersonName(prenom)}_${normalizePersonName(nom)}`;
        const nameKeyInv = `${normalizePersonName(nom)}_${normalizePersonName(prenom)}`;
        const profMatches = profilsByName.get(nameKey) || profilsByName.get(nameKeyInv);
        if (profMatches && profMatches.length > 0) {
          resolvedIdProfil = profMatches[0].idProfil;
        }
      }

      // Si toujours pas trouvé, recherche dans les Personnes LocalStorage existantes
      if (!resolvedIdProfil && prenom && nom) {
        const nameKey = `${normalizePersonName(prenom)}_${normalizePersonName(nom)}`;
        const nameKeyInv = `${normalizePersonName(nom)}_${normalizePersonName(prenom)}`;
        const persMatches = personnesByName.get(nameKey) || personnesByName.get(nameKeyInv);
        if (persMatches && persMatches.length > 0 && persMatches[0].idProfil) {
          resolvedIdProfil = persMatches[0].idProfil;
        }
      }

      // Fallback si pas de correspondance dans Profil
      if (!resolvedIdProfil) {
        resolvedIdProfil = `PROF_${mat}`;
      }

      matriculeToIdProfil.set(mat, resolvedIdProfil);
      detailsByMatricule.set(mat, {
        idProfil: resolvedIdProfil,
        nom: nom || 'Collaborateur',
        prenom: prenom || mat,
        grade,
        email: prenom && nom ? `${normalizePersonName(prenom)}.${normalizePersonName(nom)}@logiclever.com` : undefined
      });

      return resolvedIdProfil;
    };

    const assignmentsByCandidate: Record<string, string[]> = {};
    const assignmentsByEvaluator: Record<string, string[]> = {};
    let activePrimesCount = 0;
    let expiredPrimesCount = 0;

    primeRows.forEach(pr => {
      const candMat = pr.candidateMatricule.trim().toUpperCase();
      const evalMat = pr.evaluatorMatricule.trim().toUpperCase();

      const candIdProfil = matriculeToIdProfil.get(candMat) || resolveMatriculeThroughBoondAndProfil(candMat);
      const evalIdProfil = matriculeToIdProfil.get(evalMat) || resolveMatriculeThroughBoondAndProfil(evalMat);

      if (candIdProfil) pr.resolvedCandidateIdProfil = candIdProfil;
      if (evalIdProfil) pr.resolvedEvaluatorIdProfil = evalIdProfil;

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
        // Rechercher par idProfil dans detailsByMatricule
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
      totalCandidatesParsed: rawJuryRows.length,
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
      assignmentsByCandidate,
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
        entryDate: cand.entryDate || '',
        expertGradeDate: cand.expertPassageDate || '',
        totalExperienceYears: cand.experienceYears || 0,
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

      const existingDossier = LocalDatabaseService.getDossierById(dossierId);
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
          currentTJM: cand.currentTJM,
          currentSalary: cand.currentSalary,
        },
        clientFeedbacks: [],
        documents: [],
        consultantFeedbacks: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(existingDossier ? {
          status: existingDossier.status,
          annualReport: { ...defaultReportData, currentGrade: cand.grade, currentTJM: cand.currentTJM, currentSalary: cand.currentSalary, ...existingDossier.annualReport },
          clientFeedbacks: existingDossier.clientFeedbacks || [],
          documents: existingDossier.documents || [],
          consultantFeedbacks: existingDossier.consultantFeedbacks || {},
          createdAt: existingDossier.createdAt,
        } : {}),
      };

      safeAddToBatch((b) => {
        b.set(dossierRef, dossierObj, { merge: true });
      });

      // D. Prepare the user profile for the same local commit.
      const candUserRoles: ('CANDIDATE' | 'JURY')[] = isAlsoEvaluator ? ['CANDIDATE', 'JURY'] : ['CANDIDATE'];
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
        currentTJM: cand.currentTJM,
        entryDate: cand.entryDate || '',
        experienceYears: cand.experienceYears || 0,
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
        roles: ['JURY'],
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
    for (const user of UserDirectoryService.prepareUsers(usersToRegister)) {
      batch.set(doc(db, 'users', user.id), user);
    }
    await batch.commit();

    return { 
      success: true, 
      created, 
      updated, 
      evaluatorsInitialized: preview.evaluatorsToProcess.length 
    };
  }
}
