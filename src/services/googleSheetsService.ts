import { auth } from '../lib/firebase';
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
 * Prepares the deliberation row matrix from app data
 */
export function prepareDeliberationsData(dossiers: Dossier[], candidates: Record<string, UserProfile>): { headers: string[]; rows: (string | number)[][] } {
  const headers = ['Id_Profil','Campagne','Matricule','Prénom','Nom','Titre au 30/06','Salaire au 30/06','TJ vendu (01/07)','Exp.','Ancienneté LL',"Année en tant qu'expert",'TJ Cible','Salaire souhaité','Nouveau Grade','% Investissement','% Mission','Salaire proposé au 01/07','Salaire MAX proposé si TJ vendu augmente',"Salaire MAX proposé si TJ vendu augmenté en cours d'année",'Pourquoi ce salaire proposé',"Ce qu'il faut faire pour avoir plus",'Référent Jury de salaire','Ressenti consultant','Retour Second tour','Prime bureautique ancienneté (avant jury)','Prime bureautique ancienneté (après jury)','Statut dossier','Verdict'];
  const rows = dossiers.map(d => {
    const p = { ...candidates[d.candidateId], ...d.rhSnapshot }, j = d.juryDecision;
    return [d.candidateId,d.campaignYear,p.matricule,p.firstName,p.lastName,p.currentGrade,p.currentSalary,p.currentTJM,p.experienceYears,p.seniorityYears,p.expertYears,d.annualReport?.targetTJM,d.annualReport?.wishedSalary,j?.finalGrade,j?.investmentPercentage,j?.missionPercentage,j?.amount,j?.maxSalaryIfTJIncreases,j?.maxSalaryIfVenduIncreases,j?.whyThisSalary,j?.whatToDoMore,j?.referentJury,j?.consultantFeeling,j?.secondRoundFeedback,j?.primeBefore,j?.primeAfter,d.status,j?.verdict].map(v => v ?? '');
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
  tabName: string = DEFAULT_SHEET_TAB_NAME
): Promise<SheetExportResult> {
  const spreadsheetId = customSpreadsheetId || PREDEFINED_EXPORT_SPREADSHEET_ID;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  // 1. Prepare data rows
  const { headers, rows } = prepareDeliberationsData(dossiers, candidates);
  const allValues = [headers, ...rows];

  // 2. Attempt server-side export via Google Service Account
  try {
    const serverRes = await fetch('/api/sheets/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
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
      `/api/sheets/import?spreadsheetId=${encodeURIComponent(spreadsheetId)}&range=${encodeURIComponent(fullRange)}`,
      { headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` } }
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
  const headers = rawHeaders.map(h => String(h).trim().toLowerCase());

  // Use dynamic column mapping from google-sheets-config.json for this specific spreadsheetId and tabName
  const headerMap = GoogleSheetsConfigService.getHeaderToFieldMap(spreadsheetId, tabName);

  const getColIdx = (fieldKey: string, fallbackKeywords: string[]): number => {
    // 1. Look up exact configured header from google-sheets-config.json
    const configuredHeader = GoogleSheetsConfigService.getColumnHeader(spreadsheetId, tabName, fieldKey)?.trim().toLowerCase();
    if (configuredHeader) {
      const idx = headers.indexOf(configuredHeader);
      if (idx !== -1) return idx;
    }

    // 2. Fallback to reverse map
    for (let i = 0; i < headers.length; i++) {
      if (headerMap.get(headers[i]) === fieldKey) {
        return i;
      }
    }

    // 3. Fallback keyword scan
    return headers.findIndex(h => fallbackKeywords.some(kw => h.includes(kw)));
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

    const experienceYears = colIndex.exp !== -1 && row[colIndex.exp]
      ? parseCleanNumber(row[colIndex.exp])
      : 3;

    const currentSalary = colIndex.salary !== -1 && row[colIndex.salary]
      ? parseCleanNumber(row[colIndex.salary])
      : 42000;

    const currentTJM = colIndex.tjm !== -1 && row[colIndex.tjm]
      ? parseCleanNumber(row[colIndex.tjm])
      : 550;

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

