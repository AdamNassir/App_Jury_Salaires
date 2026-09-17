import { getGoogleAccessToken, requestGoogleSheetsAccess } from '../lib/firebase';
import { Dossier, UserProfile, JuryDecision, UserRole, Grade } from '../types';
import { 
  calculateYears, 
  getPrimeAnciennete, 
  calculateSalaryFormule, 
  calculateMargin 
} from '../lib/salaryUtils';
import { GoogleSheetsConfigService } from './googleSheetsConfigService';

// Predetermined Spreadsheet IDs specified by the code / configuration
const metaEnv = (import.meta as any).env || {};
export const PREDEFINED_EXPORT_SPREADSHEET_ID = 
  metaEnv.VITE_GOOGLE_SHEET_EXPORT_ID || 
  GoogleSheetsConfigService.findAnyTabByPurpose('EXPORT_SALARY_DELIBERATIONS')?.spreadsheetId || 
  GoogleSheetsConfigService.getDefaultSpreadsheetId();

export const PREDEFINED_IMPORT_SPREADSHEET_ID = 
  metaEnv.VITE_GOOGLE_SHEET_IMPORT_ID || 
  GoogleSheetsConfigService.findAnyTabByPurpose('IMPORT_ACCOUNTS')?.spreadsheetId || 
  GoogleSheetsConfigService.getDefaultSpreadsheetId();

export const DEFAULT_SHEET_TAB_NAME = 
  GoogleSheetsConfigService.findTabByPurpose(PREDEFINED_EXPORT_SPREADSHEET_ID, 'EXPORT_SALARY_DELIBERATIONS')?.tabName || 
  'Délibérations_Jury';

export interface SheetExportResult {
  success: boolean;
  rowsExported: number;
  spreadsheetId: string;
  sheetUrl: string;
  timestamp: string;
  error?: string;
}

export interface SheetImportResult {
  success: boolean;
  headers: string[];
  rows: (string | number)[][];
  totalRows: number;
  spreadsheetId: string;
  timestamp: string;
  error?: string;
}

/**
 * Ensures an active Google OAuth access token is present with sheets scope
 */
async function getValidToken(): Promise<string> {
  let token = getGoogleAccessToken();
  if (!token) {
    token = await requestGoogleSheetsAccess();
  }
  if (!token) {
    throw new Error("Authentification Google requise pour accéder aux Google Sheets.");
  }
  return token;
}

/**
 * Checks if a specific sheet tab exists, if not creates it
 */
async function ensureSheetTabExists(spreadsheetId: string, sheetTitle: string, token: string): Promise<void> {
  try {
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!metaRes.ok) {
      if (metaRes.status === 404) {
        throw new Error(`Le Google Sheet configuré (ID: ${spreadsheetId}) est introuvable ou vous n'y avez pas accès.`);
      }
      if (metaRes.status === 403) {
        throw new Error(`Accès non autorisé au Google Sheet. Vérifiez les permissions de partage.`);
      }
      const errJson = await metaRes.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `Erreur API Google Sheets (${metaRes.status})`);
    }

    const metaData = await metaRes.json();
    const sheetExists = metaData.sheets?.some(
      (s: any) => s.properties?.title?.toLowerCase() === sheetTitle.toLowerCase()
    );

    if (!sheetExists) {
      // Add sheet tab
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetTitle,
                  gridProperties: {
                    frozenRowCount: 1
                  }
                }
              }
            }
          ]
        })
      });
    }
  } catch (err: any) {
    console.warn("Could not check/create sheet tab:", err.message);
  }
}

/**
 * Resolves Id_Annees_Experience_A_Embauche from Boond_Liste_Valeur
 * Strictly filters by Nom_Valeur === 'Annees_Experience_A_Embauche' to prevent key collisions between families
 */
export function resolveBoondExperience(
  idAnneesExperience: string | number | null | undefined,
  valeurRows: Array<{ Id_Valeur?: any; Nom_Valeur?: any; ID_Boond?: any; Libelle_Valeur?: any }>
): number | null {
  if (idAnneesExperience === null || idAnneesExperience === undefined || idAnneesExperience === '') {
    return null;
  }
  const targetId = String(idAnneesExperience).trim();
  
  const expRow = valeurRows.find(row => {
    const nomValeur = String(row.Nom_Valeur || '').trim();
    if (nomValeur !== 'Annees_Experience_A_Embauche') return false;
    const boondId = String(row.ID_Boond ?? '').trim();
    const idVal = String(row.Id_Valeur ?? '').trim();
    return boondId === targetId || idVal === targetId;
  });

  if (!expRow || !expRow.Libelle_Valeur) return null;
  
  const lib = String(expRow.Libelle_Valeur).trim();
  const match = lib.match(/(\d+(?:[.,]\d+)?)/);
  if (match) {
    return parseFloat(match[1].replace(',', '.'));
  }
  return null;
}

/**
 * Prepares the deliberation row matrix from app data
 */
export function prepareDeliberationsData(
  dossiers: Dossier[], 
  candidates: Record<string, UserProfile>,
  referenceDate?: string | Date | null
): { headers: string[]; rows: (string | number)[][] } {
  const headers = [
    'Matricule',
    'Collaborateur',
    'Expérience (années)',
    'Date Entrée LL',
    'Date Grade Expert',
    'Ancienneté LL (ans)',
    'Années Expert',
    'Grade Actuel',
    'TJ Vendu (€)',
    'Salaire Vendu (€)',
    'Salaire Vendu 100% (€)',
    'TJ Cible (€)',
    'Salaire Cible (€)',
    'Salaire Cible 100% (€)',
    'Salaire Actuel (€)',
    'Marge Mission (%)',
    'Salaire Souhaité (€)',
    'Grade Souhaité',
    'Marge Souhaitée (%)',
    '% Investissement',
    '% Mission',
    'Salaire Proposé Jury (€)',
    'Prime Ancienneté (€)',
    '% Augmentation',
    'Marge Post-Jury (%)',
    'Salaire Formule (€)',
    'Salaire Max si Hausse TJ (€)',
    'Verdict Jury',
    'Pourquoi ce salaire',
    'Actions Progrès',
    'Référent Jury',
    'Ressenti Consultant',
    'Horodatage Export'
  ];

  const nowStr = new Date().toLocaleString('fr-FR');
  
  // Deduplicate dossiers by candidateId
  const candidateIdsSeen = new Set<string>();
  const rows: (string | number)[][] = [];

  dossiers.forEach(dossier => {
    if (!dossier.candidateId || candidateIdsSeen.has(dossier.candidateId)) return;
    candidateIdsSeen.add(dossier.candidateId);

    const candidate = candidates[dossier.candidateId];
    if (!candidate) return;

    const yearsLL = calculateYears(candidate.entryDate, referenceDate);
    const yearsExpert = candidate.currentGrade === 'Expert' ? calculateYears(candidate.expertGradeDate, referenceDate) : 0;
    const prime = getPrimeAnciennete(yearsLL);
    const tjVendu = candidate.currentTJM || 0;
    const currentSalary = candidate.currentSalary || 0;

    const tjCible = dossier.annualReport?.targetTJM || 0;
    const salaireVendu = calculateSalaryFormule(tjVendu, candidate.currentGrade || 'Junior', yearsExpert, prime);
    const salaireVendu100 = calculateSalaryFormule(tjVendu + 30, candidate.currentGrade || 'Junior', yearsExpert, prime);

    const targetGrade = dossier.annualReport?.wishedGrade || candidate.currentGrade || 'Junior';
    const targetYearsExpert = targetGrade === 'Expert' ? calculateYears(candidate.expertGradeDate, referenceDate) : 0;
    const salaireCible = calculateSalaryFormule(tjCible, targetGrade, targetYearsExpert, prime);
    const salaireCible100 = calculateSalaryFormule(tjCible + 30, targetGrade, targetYearsExpert, prime);

    const decision = (dossier.juryDecision || {}) as JuryDecision;
    const wishedSalary = dossier.annualReport?.wishedSalary || 0;

    const realMargin = calculateMargin(tjVendu, currentSalary, prime);
    const wishedMargin = calculateMargin(tjVendu, wishedSalary, prime);
    const proposedSalary = decision.amount || currentSalary;
    const marginPostJury = calculateMargin(tjVendu, proposedSalary, prime);
    const percentage = currentSalary ? Math.round(((proposedSalary - currentSalary) / currentSalary) * 1000) / 10 : 0;

    const invest = decision.investmentPercentage ?? 60;
    const mission = decision.missionPercentage ?? 98;

    const calc1 = (mission / 100) * (((invest * (salaireCible100 - salaireCible)) / 100) + salaireCible);
    const calc2 = (mission / 100) * (((invest * (salaireVendu100 - salaireVendu)) / 100) + salaireVendu);

    let resFormule = currentSalary;
    if (currentSalary >= calc1 && currentSalary >= calc2) {
      resFormule = currentSalary;
    } else if (calc1 > currentSalary && calc1 <= calc2) {
      resFormule = calc1;
    } else if (calc2 > currentSalary && calc2 <= calc1) {
      resFormule = calc2;
    }

    rows.push([
      candidate.matricule || 'N/A',
      candidate.displayName || 'Inconnu',
      candidate.experienceYears ?? '-',
      candidate.entryDate ? new Date(candidate.entryDate).toLocaleDateString('fr-FR') : '-',
      candidate.expertGradeDate ? new Date(candidate.expertGradeDate).toLocaleDateString('fr-FR') : '-',
      yearsLL !== null ? yearsLL : '-',
      yearsExpert !== null ? yearsExpert : '-',
      candidate.currentGrade || 'Junior',
      tjVendu,
      Math.round(salaireVendu),
      Math.round(salaireVendu100),
      tjCible,
      Math.round(salaireCible),
      Math.round(salaireCible100),
      currentSalary,
      realMargin !== null ? `${realMargin}%` : '-',
      wishedSalary,
      targetGrade,
      wishedMargin !== null ? `${wishedMargin}%` : '-',
      invest,
      mission,
      proposedSalary,
      prime,
      `${percentage}%`,
      marginPostJury !== null ? `${marginPostJury}%` : '-',
      Math.round(resFormule),
      decision.maxSalaryIfTJIncreases || 0,
      decision.verdict || 'Favorable',
      decision.whyThisSalary || '',
      decision.whatToDoMore || '',
      decision.referentJury || '',
      decision.consultantFeeling || '',
      nowStr
    ]);
  });

  return { headers, rows };
}

/**
 * EXPORT: Writes the complete deliberation data to the predetermined Google Sheet
 * No file selection prompt is shown to the user; destination is fully governed by code.
 * Directly utilizes the Service Account on the server, with seamless client OAuth fallback.
 */
export async function exportDeliberationsToGoogleSheet(
  dossiers: Dossier[],
  candidates: Record<string, UserProfile>,
  customSpreadsheetId?: string,
  tabName: string = DEFAULT_SHEET_TAB_NAME,
  referenceDate?: string | Date | null
): Promise<SheetExportResult> {
  const spreadsheetId = customSpreadsheetId || PREDEFINED_EXPORT_SPREADSHEET_ID;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  // 1. Prepare data rows
  const { headers, rows } = prepareDeliberationsData(dossiers, candidates, referenceDate);
  const allValues = [headers, ...rows];

  // 2. Attempt server-side export via Google Service Account
  try {
    const serverRes = await fetch('/api/sheets/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId,
        tabName,
        values: allValues
      })
    });

    if (serverRes.ok) {
      const serverData = await serverRes.json();
      return {
        success: true,
        rowsExported: serverData.rowsExported ?? rows.length,
        spreadsheetId,
        sheetUrl,
        timestamp: serverData.timestamp || new Date().toLocaleTimeString('fr-FR')
      };
    }

    const serverErrJson = await serverRes.json().catch(() => ({}));
    const errorMsg = serverErrJson?.error || '';

    // If error is about missing server key, log and proceed to client OAuth
    if (errorMsg.includes('GOOGLE_PRIVATE_KEY is missing')) {
      console.info("Notice: GOOGLE_PRIVATE_KEY non renseignée sur le serveur. Utilisation du jeton OAuth connecté...");
    } else {
      throw new Error(errorMsg || `Erreur serveur (${serverRes.status})`);
    }
  } catch (err: any) {
    if (!err.message?.includes('GOOGLE_PRIVATE_KEY is missing')) {
      console.warn("Notice backend Sheets:", err.message);
    }
  }

  // 3. Client-side OAuth fallback
  const token = await getValidToken();

  // Ensure sheet tab exists
  await ensureSheetTabExists(spreadsheetId, tabName, token);

  // Clear existing values in this sheet tab to ensure a clean sync
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (clearErr) {
    console.warn("Could not clear range before update:", clearErr);
  }

  // Write data to range A1
  const updateRange = `${tabName}!A1`;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: updateRange,
        majorDimension: 'ROWS',
        values: allValues
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Erreur d'écriture dans Google Sheets (${response.status})`;
    throw new Error(message);
  }

  return {
    success: true,
    rowsExported: rows.length,
    spreadsheetId,
    sheetUrl,
    timestamp: new Date().toLocaleTimeString('fr-FR')
  };
}

/**
 * IMPORT: Reads data from the predetermined Google Sheet range
 * Entirely determined by code without file dialogs.
 */
export async function importDataFromGoogleSheet(
  range: string = 'A1:Z100',
  customSpreadsheetId?: string,
  tabName?: string
): Promise<SheetImportResult> {
  const spreadsheetId = customSpreadsheetId || PREDEFINED_IMPORT_SPREADSHEET_ID;
  const fullRange = tabName ? `${tabName}!${range}` : range;

  // 1. Attempt server-side import via Service Account
  try {
    const serverRes = await fetch(
      `/api/sheets/import?spreadsheetId=${encodeURIComponent(spreadsheetId)}&range=${encodeURIComponent(fullRange)}`
    );
    if (serverRes.ok) {
      const serverData = await serverRes.json();
      const values: (string | number)[][] = serverData.values || [];
      const [headerRow, ...dataRows] = values.length > 0 ? values : [[], []];
      return {
        success: true,
        headers: (headerRow || []).map(h => String(h)),
        rows: dataRows || [],
        totalRows: (dataRows || []).length,
        spreadsheetId,
        timestamp: serverData.timestamp || new Date().toLocaleTimeString('fr-FR')
      };
    }
  } catch (serverErr) {
    console.warn("Server import notice, falling back to client OAuth:", serverErr);
  }

  // 2. Client-side OAuth fallback
  const token = await getValidToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(fullRange)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Erreur de lecture du Google Sheet (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  const values: (string | number)[][] = data.values || [];

  if (values.length === 0) {
    return {
      success: true,
      headers: [],
      rows: [],
      totalRows: 0,
      spreadsheetId,
      timestamp: new Date().toLocaleTimeString('fr-FR')
    };
  }

  const [headerRow, ...dataRows] = values;

  return {
    success: true,
    headers: headerRow.map(h => String(h)),
    rows: dataRows,
    totalRows: dataRows.length,
    spreadsheetId,
    timestamp: new Date().toLocaleTimeString('fr-FR')
  };
}

export interface ImportedAccount {
  email: string;
  displayName: string;
  roles: UserRole[];
  matricule: string;
  currentGrade: Grade;
  entryDate: string;
  experienceYears: number;
  currentSalary: number;
  currentTJM: number;
  team: string;
}

export interface AccountsImportResult {
  success: boolean;
  tabName: string;
  accounts: ImportedAccount[];
  ignoredRowsCount: number;
  totalRows: number;
  error?: string;
}

/**
 * Normalizes grade strings into valid Grade types
 */
function normalizeGrade(val: string): Grade {
  const clean = (val || '').trim().toLowerCase();
  if (clean.includes('junior')) return 'Junior';
  if (clean.includes('senior')) return 'Senior';
  if (clean.includes('expert') || clean.includes('manager') || clean.includes('direct')) return 'Expert';
  return 'Confirmé';
}

/**
 * Normalizes roles strings into valid UserRole[]
 */
function normalizeRoles(val: string): UserRole[] {
  const clean = (val || '').trim().toUpperCase();
  const roles: UserRole[] = [];
  
  if (clean.includes('ADMIN')) roles.push('ADMIN');
  if (clean.includes('JURY')) roles.push('JURY');
  if (clean.includes('EVALUAT') || clean.includes('ÉVALUAT') || clean.includes('PAIR')) roles.push('EVALUATOR');
  if (clean.includes('CANDIDAT') || clean.includes('CANDIDATE') || roles.length === 0) {
    roles.push('CANDIDATE');
  }

  return roles;
}

/**
 * Normalizes date format (converts DD/MM/YYYY to YYYY-MM-DD if needed)
 */
function normalizeDate(val: string): string {
  if (!val) return new Date().toISOString().split('T')[0];
  const str = String(val).trim();
  // If format is DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toISOString().split('T')[0];
  }
  return str;
}

/**
 * Cleans numeric strings (e.g. "45 000 €" -> 45000)
 */
function parseCleanNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]+/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Imports and parses user accounts from Google Sheet tab 'Comptes' / 'Utilisateurs'
 */
export async function importAccountsFromGoogleSheet(
  customSpreadsheetId?: string
): Promise<AccountsImportResult> {
  const spreadsheetId = customSpreadsheetId || PREDEFINED_IMPORT_SPREADSHEET_ID;

  let values: (string | number)[][] = [];
  let tabName = 'Comptes';

  // 1. Try server-side service account import
  try {
    const serverRes = await fetch(`/api/sheets/import-accounts?spreadsheetId=${encodeURIComponent(spreadsheetId)}`);
    if (serverRes.ok) {
      const serverData = await serverRes.json();
      values = serverData.values || [];
      tabName = serverData.tabName || 'Comptes';
    } else {
      const err = await serverRes.json().catch(() => ({}));
      throw new Error(err.error || `Erreur serveur (${serverRes.status})`);
    }
  } catch (err: any) {
    // 2. Fallback to client-side import if needed
    console.warn("Backend import accounts failed, attempting client OAuth:", err.message);
    const clientData = await importDataFromGoogleSheet('A1:Z500', spreadsheetId, 'Comptes');
    if (clientData.headers.length > 0) {
      values = [clientData.headers, ...clientData.rows];
    } else {
      throw err;
    }
  }

  if (values.length < 2) {
    return {
      success: true,
      tabName,
      accounts: [],
      ignoredRowsCount: 0,
      totalRows: 0
    };
  }

  const [rawHeaders, ...rawRows] = values;
  const cleanHeader = (h: any) => String(h || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const headers = rawHeaders.map(cleanHeader);

  // Use dynamic column mapping from google-sheets-config.json for this specific spreadsheetId and tabName
  const headerMap = GoogleSheetsConfigService.getHeaderToFieldMap(spreadsheetId, tabName);

  const getColIdx = (fieldKey: string, fallbackKeywords: string[]): number => {
    // 1. Look up exact configured header from google-sheets-config.json
    const configuredHeader = GoogleSheetsConfigService.getColumnHeader(spreadsheetId, tabName, fieldKey);
    if (configuredHeader) {
      const cleanedConfig = cleanHeader(configuredHeader);
      const idx = headers.indexOf(cleanedConfig);
      if (idx !== -1) return idx;
    }

    // 2. Fallback to reverse map
    for (let i = 0; i < headers.length; i++) {
      if (headerMap.get(headers[i]) === fieldKey) {
        return i;
      }
    }

    // 3. Fallback keyword scan
    const keywordIdx = headers.findIndex(h => fallbackKeywords.some(kw => h.includes(kw)));
    if (keywordIdx !== -1) return keywordIdx;

    // 4. Specific regex fallbacks for headers with variable campaign years or whitespace/newlines
    if (fieldKey === 'experienceYears') {
      const expIdx = headers.findIndex(h => /exp(\.|\s)*\(année pleine\)/i.test(h));
      if (expIdx !== -1) return expIdx;
    }
    if (fieldKey === 'currentSalary') {
      const salIdx = headers.findIndex(h => /salaire au 30\/06\/\d{4}/i.test(h));
      if (salIdx !== -1) return salIdx;
    }
    if (fieldKey === 'currentTJM') {
      const tjmIdx = headers.findIndex(h => /tj\s*vendu/i.test(h));
      if (tjmIdx !== -1) return tjmIdx;
    }

    return -1;
  };

  // Detect column indexes
  const colIndex = {
    email: getColIdx('email', ['mail']),
    name: getColIdx('displayName', ['nom', 'name', 'collaborateur', 'prenom']),
    roles: getColIdx('roles', ['rôle', 'role', 'statut', 'profil']),
    matricule: getColIdx('matricule', ['matricule', 'code', 'id']),
    grade: getColIdx('currentGrade', ['grade', 'niveau']),
    entryDate: getColIdx('entryDate', ['entr', 'arriv', 'date']),
    exp: getColIdx('experienceYears', ['exp']),
    salary: getColIdx('currentSalary', ['salaire', 'salary', 'fixe']),
    tjm: getColIdx('currentTJM', ['tjm', 'tj']),
    team: getColIdx('team', ['équipe', 'equipe', 'team', 'pole', 'bu'])
  };

  if (colIndex.email === -1) {
    throw new Error(
      `Impossible de trouver la colonne 'Email' dans l'onglet '${tabName}'. Colonnes détectées: ${rawHeaders.join(', ')}`
    );
  }

  const accounts: ImportedAccount[] = [];
  let ignoredRowsCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    let email = colIndex.email !== -1 ? String(row[colIndex.email] || '').trim() : '';
    
    // Ignore empty lines
    if (!email) {
      ignoredRowsCount++;
      continue;
    }

    // If no domain provided, auto-append @logiclever.com
    if (!email.includes('@')) {
      email = `${email.toLowerCase()}@logiclever.com`;
    }

    const displayName = colIndex.name !== -1 && row[colIndex.name] 
      ? String(row[colIndex.name]).trim() 
      : email.split('@')[0];

    const roles: UserRole[] = colIndex.roles !== -1 && row[colIndex.roles]
      ? normalizeRoles(String(row[colIndex.roles]))
      : (['CANDIDATE'] as UserRole[]);

    const matricule = colIndex.matricule !== -1 && row[colIndex.matricule]
      ? String(row[colIndex.matricule]).trim()
      : `LL-${100 + i}`;

    const currentGrade = colIndex.grade !== -1 && row[colIndex.grade]
      ? normalizeGrade(String(row[colIndex.grade]))
      : 'Confirmé';

    const entryDate = colIndex.entryDate !== -1 && row[colIndex.entryDate]
      ? normalizeDate(String(row[colIndex.entryDate]))
      : new Date().toISOString().split('T')[0];

    const expRaw = colIndex.exp !== -1 ? row[colIndex.exp] : undefined;
    const experienceYears = expRaw !== undefined && expRaw !== null && String(expRaw).trim() !== ''
      ? parseCleanNumber(expRaw)
      : 0;

    const salaryRaw = colIndex.salary !== -1 ? row[colIndex.salary] : undefined;
    const currentSalary = salaryRaw !== undefined && salaryRaw !== null && String(salaryRaw).trim() !== ''
      ? parseCleanNumber(salaryRaw)
      : 0;

    const tjmRaw = colIndex.tjm !== -1 ? row[colIndex.tjm] : undefined;
    const currentTJM = tjmRaw !== undefined && tjmRaw !== null && String(tjmRaw).trim() !== ''
      ? parseCleanNumber(tjmRaw)
      : 0;

    const team = colIndex.team !== -1 && row[colIndex.team]
      ? String(row[colIndex.team]).trim()
      : 'Logic Clever';

    accounts.push({
      email,
      displayName,
      roles,
      matricule,
      currentGrade,
      entryDate,
      experienceYears,
      currentSalary,
      currentTJM,
      team
    });
  }

  return {
    success: true,
    tabName,
    accounts,
    ignoredRowsCount,
    totalRows: rawRows.length
  };
}

