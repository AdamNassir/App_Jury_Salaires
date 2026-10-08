import { getGoogleAccessToken, requestGoogleSheetsAccess } from '../lib/firebase';
import { Dossier, UserProfile, JuryDecision, UserRole, Grade } from '../types';
import { AppLinkItem } from './appLinksService';
import { 
  calculateYears, 
  getPrimeAnciennete, 
  calculateSalaryFormule, 
  calculateMargin,
  resolveTargetGrade
} from '../lib/salaryUtils';
import { GoogleSheetsConfigService } from './googleSheetsConfigService';

// Predetermined Spreadsheet IDs specified by the code / configuration
const metaEnv = (import.meta as any).env || {};
export const PREDEFINED_EXPORT_SPREADSHEET_ID = 
  metaEnv.VITE_GOOGLE_SHEET_EXPORT_ID || 
  GoogleSheetsConfigService.findAnyTabByPurpose('EXPORT_SALARY_DELIBERATIONS')?.spreadsheetId || 
  GoogleSheetsConfigService.getDefaultSpreadsheetId();

/**
 * Dossier Google Drive de destination pour l'export des Délibérations :
 * https://drive.google.com/drive/folders/1BHFi8Z_0K1tTUalK6BKC-B4eXh6PLOx5
 */
export const EXPORT_DRIVE_FOLDER_ID = 
  metaEnv.VITE_GOOGLE_DRIVE_EXPORT_FOLDER_ID || 
  (GoogleSheetsConfigService.getConfig() as any).exportDriveFolderId ||
  '1BHFi8Z_0K1tTUalK6BKC-B4eXh6PLOx5';

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
 * Ensures an active Google OAuth access token is present with sheets and drive.file scope
 */
async function getValidToken(forceFresh: boolean = false): Promise<string> {
  let token = forceFresh ? null : getGoogleAccessToken();
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
    'Écart Formule (€)',
    'Salaire Max si Hausse TJ (€)',
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

    const candidate = candidates[dossier.candidateId] ||
      (dossier.idProfil ? candidates[dossier.idProfil] : undefined) || ({
        id: dossier.candidateId,
        idProfil: dossier.idProfil,
        matricule: '',
        displayName: dossier.candidateName || 'Inconnu',
        email: dossier.candidateEmail || '',
        roles: ['CANDIDATE'] as UserRole[],
        createdAt: null
      } as UserProfile);

    const yearsLL = calculateYears(candidate.entryDate, referenceDate);
    const currentGrade = dossier.annualReport?.currentGrade || candidate.currentGrade || 'Junior';
    const yearsExpert = currentGrade === 'Expert' ? calculateYears(candidate.expertGradeDate, referenceDate) : 0;
    const prime = getPrimeAnciennete(yearsLL);
    const tjVendu = dossier.annualReport?.currentTJM ?? candidate.currentTJM ?? 0;
    const currentSalary = dossier.annualReport?.currentSalary ?? candidate.currentSalary ?? 0;

    const tjCible = dossier.annualReport?.targetTJM || 0;
    const salaireVendu = calculateSalaryFormule(tjVendu, currentGrade, yearsExpert, prime);
    const salaireVendu100 = calculateSalaryFormule(tjVendu + 30, currentGrade, yearsExpert, prime);

    const targetGrade = resolveTargetGrade(currentGrade, dossier.annualReport?.wishedGrade);
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
      currentGrade,
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
      Math.round((proposedSalary || currentSalary) - resFormule),
      decision.maxSalaryIfTJIncreases || 0,
      decision.referentJury || '',
      decision.consultantFeeling || '',
      nowStr
    ]);
  });

  return { headers, rows };
}

/**
 * Resolves an existing Google Sheet in the specific Drive folder or creates one in it.
 */
async function resolveDriveFolderSpreadsheet(
  initialToken: string, 
  folderId: string = EXPORT_DRIVE_FOLDER_ID, 
  desiredTitle: string = 'Délibérations_Jury'
): Promise<{ spreadsheetId: string; sheetUrl: string; token: string }> {
  let activeToken = initialToken;

  // 1. Search if a spreadsheet already exists in the destination folder
  const searchInFolder = async (tok: string) => {
    const query = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
      q: query,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
      fields: 'files(id, name, webViewLink)'
    })}`;
    return fetch(searchUrl, {
      headers: { Authorization: `Bearer ${tok}` }
    });
  };

  let searchRes = await searchInFolder(activeToken);

  // If unauthorized or insufficient scope (e.g. drive.file required), re-prompt for fresh token
  if (searchRes.status === 401 || searchRes.status === 403) {
    try {
      activeToken = await getValidToken(true);
      searchRes = await searchInFolder(activeToken);
    } catch (authErr) {
      console.warn("Re-authorization for Google Drive scope failed:", authErr);
    }
  }

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    const existing = (searchData.files || []).find((f: any) => 
      f.name === desiredTitle || f.name.includes('Délibérations') || f.name.includes('Salaires')
    ) || (searchData.files || [])[0];

    if (existing) {
      return {
        spreadsheetId: existing.id,
        sheetUrl: existing.webViewLink || `https://docs.google.com/spreadsheets/d/${existing.id}`,
        token: activeToken
      };
    }
  }

  // 2. If not found, create directly inside the folder via Drive API
  const createInFolder = async (tok: string) => {
    return fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: desiredTitle,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [folderId]
      })
    });
  };

  let createRes = await createInFolder(activeToken);
  if (createRes.status === 401 || createRes.status === 403) {
    activeToken = await getValidToken(true);
    createRes = await createInFolder(activeToken);
  }

  if (createRes.ok) {
    const createData = await createRes.json();
    if (createData.id) {
      return {
        spreadsheetId: createData.id,
        sheetUrl: createData.webViewLink || `https://docs.google.com/spreadsheets/d/${createData.id}`,
        token: activeToken
      };
    }
  }

  const errJson = await createRes.json().catch(() => ({}));
  const errorDetails = errJson?.error?.message || `Statut HTTP ${createRes.status}`;
  throw new Error(`Impossible de créer le fichier dans votre dossier Google Drive (${folderId}) : ${errorDetails}`);
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
  let spreadsheetId = customSpreadsheetId || '';
  let sheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : '';

  // 1. Prepare data rows
  const { headers, rows } = prepareDeliberationsData(dossiers, candidates, referenceDate);
  const allValues = [headers, ...rows];

  // 2. Attempt server-side export via Google Service Account (if configured)
  try {
    const serverRes = await fetch('/api/sheets/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId: spreadsheetId || undefined,
        folderId: EXPORT_DRIVE_FOLDER_ID,
        tabName,
        values: allValues
      })
    });

    if (serverRes.ok) {
      const serverData = await serverRes.json();
      return {
        success: true,
        rowsExported: serverData.rowsExported ?? rows.length,
        spreadsheetId: serverData.spreadsheetId,
        sheetUrl: serverData.sheetUrl || `https://docs.google.com/spreadsheets/d/${serverData.spreadsheetId}`,
        timestamp: serverData.timestamp || new Date().toLocaleTimeString('fr-FR')
      };
    }

    const serverErrJson = await serverRes.json().catch(() => ({}));
    const errorMsg = serverErrJson?.error || '';

    // If error is about missing server key, log and proceed to client OAuth
    if (errorMsg.includes('GOOGLE_PRIVATE_KEY is missing') || errorMsg.includes('client OAuth')) {
      console.info("Notice: Utilisation du compte Google connecté pour l'export Drive...");
    } else {
      throw new Error(errorMsg || `Erreur serveur (${serverRes.status})`);
    }
  } catch (err: any) {
    if (!err.message?.includes('GOOGLE_PRIVATE_KEY is missing') && !err.message?.includes('client OAuth')) {
      console.warn("Notice backend Sheets:", err.message);
    }
  }

  // 3. Client-side OAuth
  let token = await getValidToken();

  // If no custom spreadsheet was given, locate or create file inside the specified Drive folder
  if (!customSpreadsheetId && EXPORT_DRIVE_FOLDER_ID) {
    const folderSheet = await resolveDriveFolderSpreadsheet(token, EXPORT_DRIVE_FOLDER_ID, 'Délibérations_Jury');
    spreadsheetId = folderSheet.spreadsheetId;
    sheetUrl = folderSheet.sheetUrl;
    token = folderSheet.token;
  }

  if (!spreadsheetId) {
    throw new Error("Aucun identifiant de classeur Google Sheet n'a pu être obtenu.");
  }

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

export const APP_LINKS_SPREADSHEET_ID = '1edQ_U90-A8karQ1R4MkoUwhG4j-vZdYcqrLWoKZe15E';
export const APP_LINKS_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${APP_LINKS_SPREADSHEET_ID}/edit?gid=0#gid=0`;

/**
 * Exporte l'intégralité de la table des hyperliens vers le classeur Google Sheets cible.
 * Tente d'abord le Service Account serveur, puis bascule gracieusement sur OAuth client si besoin.
 */
export async function exportAppLinksToGoogleSheet(
  links: AppLinkItem[],
  customSpreadsheetId: string = APP_LINKS_SPREADSHEET_ID,
  targetTabName: string = 'Hyperliens'
): Promise<SheetExportResult> {
  const spreadsheetId = customSpreadsheetId;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=0#gid=0`;

  const headers = [
    'Libelle_Lien',
    'Url_Lien',
    'Emplacement_Dans_App',
    'Type_Acces',
    'Categorie',
    'Description'
  ];

  const rows = links.map(l => [
    l.libelle || '',
    l.url || '',
    l.appLocation || '',
    l.inAppAccessType || '',
    l.category || '',
    l.description || ''
  ]);

  const allValues = [headers, ...rows];

  // 1. Tenter via l'API serveur (Service Account)
  try {
    const serverRes = await fetch('/api/sheets/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId,
        folderId: null,
        tabName: targetTabName,
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
  } catch (serverErr) {
    console.warn("Notice: Export serveur non disponible, bascule OAuth client:", serverErr);
  }

  // 2. Repli côté client avec le token OAuth Google
  let token = await getValidToken();

  // Identifier le nom du premier onglet si l'onglet cible n'existe pas
  let effectiveTabName = targetTabName;
  try {
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      const tabExists = metaData.sheets?.some(
        (s: any) => s.properties?.title?.toLowerCase() === targetTabName.toLowerCase()
      );
      if (!tabExists && metaData.sheets && metaData.sheets.length > 0) {
        effectiveTabName = metaData.sheets[0].properties?.title || targetTabName;
      }
    }
  } catch (tabErr) {
    console.warn("Could not probe sheet tabs:", tabErr);
  }

  // Ensure sheet tab exists
  await ensureSheetTabExists(spreadsheetId, effectiveTabName, token);

  // Clear existing values in this tab
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(effectiveTabName)}:clear`,
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

  // Write data to A1
  const updateRange = `${effectiveTabName}!A1`;
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

