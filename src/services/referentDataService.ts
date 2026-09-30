import { getGoogleAccessToken, requestGoogleSheetsAccess } from '../lib/firebase';

export const REFERENT_SPREADSHEET_ID = '1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek';

export interface ReferentMeteoItem {
  id?: string;
  idProfil: string; // Col E (index 4)
  dateMeteo: string; // Col F (index 5)
  lienMeteo: string; // Col Q (index 16)
  consultantEvalue: string; // Col R (index 17)
  idProfilEvalue?: string; // Col B (index 1)
  client: string; // Col S (index 18)
  anneeJury: string; // Col Z (index 25)
}

export interface ReferentActionItem {
  id?: string;
  descriptionAction: string; // Col B (index 1)
  dateRealisation: string; // Col D (index 3)
  idProfil: string; // Col G (index 6)
  client: string; // Col L (index 11)
  statutAction: string; // Col P (index 15)
  compteRendu: string; // Col J (index 9)
  idPieceJointe: string; // Col K (index 10)
  lienPieceJointe?: string; // From sheet gid=581811371 Col C via Col A key
}

export interface ReferentMissionItem {
  id?: string;
  libelleMission: string; // Col B (index 1)
  idProfil: string; // Col C (index 2)
  dateCreation: string; // Col O (index 14)
  statut: string; // Col V (index 21)
  clientFinal: string; // Col W (index 22)
  idPieceJointe: string; // Col Q (index 16)
  lienPieceJointe?: string; // Jointure sheet gid=581811371 Col C via Col A
}

export interface ReferentAccompagnementItem {
  id?: string;
  type: 'COACHING' | 'ENCADREMENT' | 'PARRAIN';
  dateDebut?: string; // Col B (index 1)
  dateFin?: string; // Col C (index 2)
  nomAccompagne: string; // Col J (index 9)
  idProfilAccompagne: string; // Col D (index 3)
  idProfilAccompagnant: string; // Col E (index 4)
  typeAccompagnement: string; // Col L (index 11)
  libelleStatut: string; // Col N (index 13)
  lienFicheEncadrement?: string; // Col I (index 8)
}

export interface ReferentClientItem {
  id?: string;
  nomClient: string; // Col B (index 1)
  idProfil: string; // Col D (index 3)
  typeClient: string; // Col E (index 4)
}

export interface SheetAuditColumn {
  letter: string;
  name: string;
}

export interface SheetAuditItem {
  id: string;
  tableName: string;
  sheetName: string;
  url: string;
  columnTarget: string; // Ex: "Colonne E (IdProfil)"
  idProfilUsed: string;
  filterRule: string;
  rowsRetrievedTotal: number;
  rowsMatchedCandidate: number;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  details?: string;
  columns?: SheetAuditColumn[];
  sampleFirstRow?: string[];
}

export interface ReferentDatasets {
  meteos: ReferentMeteoItem[];
  actions: ReferentActionItem[];
  missions: ReferentMissionItem[];
  coaching: ReferentAccompagnementItem[];
  encadrement: ReferentAccompagnementItem[];
  parrain: ReferentAccompagnementItem[];
  clients: ReferentClientItem[];
  auditLog: SheetAuditItem[];
  loading: boolean;
  error?: string | null;
}

/**
 * Normalise une chaîne pour comparaison souple (insensible à la casse, espaces et accents)
 */
function normalizeStr(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Tente d'extraire un objet Date valide d'une chaîne
 */
function parseDateFlexible(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  // Format DD/MM/YYYY ou DD/MM/YY (ou avec séparateurs . ou -)
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) {
      year += 2000;
    }
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Format YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Année seule (ex: "2025")
  if (/^\d{4}$/.test(clean)) {
    return new Date(parseInt(clean, 10), 0, 1);
  }

  const parsed = Date.parse(clean);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

/**
 * Vérifie si l'intervalle [start_date, end_date] a une intersection avec la campagne [01/07/(campaignYear-1), 30/06/campaignYear]
 */
export function isDateIntervalInCampaign(
  startDateStr?: string | null,
  endDateStr?: string | null,
  campaignYear: number = new Date().getFullYear()
): boolean {
  const startCampaign = new Date(campaignYear - 1, 6, 1, 0, 0, 0); // 01/07/(campaignYear-1)
  const endCampaign = new Date(campaignYear, 5, 30, 23, 59, 59); // 30/06/campaignYear

  const dStart = parseDateFlexible(startDateStr);
  const dEnd = parseDateFlexible(endDateStr);

  // Si aucune date renseignée dans la ligne
  if (!dStart && !dEnd) {
    // Si la chaîne brute contient l'année de campagne ou l'année précédente
    const raw = `${startDateStr || ''} ${endDateStr || ''}`;
    if (raw.includes(String(campaignYear)) || raw.includes(String(campaignYear - 1))) {
      return true;
    }
    // Par défaut, si aucune date n'est précisée dans les colonnes B et C, on conserve pour ne pas masquer un accompagnement valide non daté
    return true;
  }

  // Si seule la date de début est fournie (accompagnement toujours actif / sans date de fin)
  // Il intersecte si son début est avant ou pendant la campagne
  if (dStart && !dEnd) {
    return dStart <= endCampaign;
  }

  // Si seule la date de fin est fournie
  // Il intersecte si sa fin est après ou pendant le début de campagne
  if (!dStart && dEnd) {
    return dEnd >= startCampaign;
  }

  // Si les deux dates sont renseignées : intersection de [dStart, dEnd] avec [startCampaign, endCampaign]
  // Condition mathématique d'intersection : dStart <= endCampaign ET dEnd >= startCampaign
  if (dStart && dEnd) {
    return dStart <= endCampaign && dEnd >= startCampaign;
  }

  return true;
}

/**
 * Vérifie si une date tombe dans l'année de campagne (01/07/N-1 au 30/06/N)
 */
export function isDateInCampaignYear(dateStr?: string | null, campaignYear: number = new Date().getFullYear()): boolean {
  if (!dateStr) return false;
  const clean = dateStr.trim();
  
  // Test année brute
  if (/^\d{4}$/.test(clean)) {
    return parseInt(clean, 10) === campaignYear || parseInt(clean, 10) === campaignYear - 1;
  }

  // Parse formats standard : YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY, etc.
  let d: Date | null = null;
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) {
      year += 2000;
    }
    d = new Date(year, month, day);
  } else {
    const parsed = Date.parse(clean);
    if (!isNaN(parsed)) {
      d = new Date(parsed);
    }
  }

  if (!d || isNaN(d.getTime())) {
    // Si la chaîne contient directement l'année de campagne ou l'année précédente
    return clean.includes(String(campaignYear)) || clean.includes(String(campaignYear - 1));
  }

  // Campagne N : du 1er Juillet (N-1) au 30 Juin (N) inclus
  const startCampaign = new Date(campaignYear - 1, 6, 1); // 1er Juillet N-1
  const endCampaign = new Date(campaignYear, 5, 30, 23, 59, 59); // 30 Juin N

  return d >= startCampaign && d <= endCampaign;
}

// Cache des noms d'onglets pour résoudre un gid spécifique (ex: gid=581811371)
let spreadsheetMetadataCache: { sheets?: Array<{ properties: { sheetId: number; title: string } }> } | null = null;

async function getSheetTitleByGid(gid: number): Promise<string | null> {
  const token = getGoogleAccessToken();
  if (!token) return null;
  if (!spreadsheetMetadataCache) {
    try {
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${REFERENT_SPREADSHEET_ID}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (metaRes.ok) {
        spreadsheetMetadataCache = await metaRes.json();
      }
    } catch (e) {
      console.warn('Error fetching spreadsheet metadata for gid:', e);
    }
  }

  const sheet = spreadsheetMetadataCache?.sheets?.find(s => s.properties.sheetId === gid);
  return sheet ? sheet.properties.title : null;
}

/**
 * Convertit un index de colonne (0 = A, 1 = B, 25 = Z, 26 = AA...) en lettre Excel
 */
function indexToLetter(idx: number): string {
  let letter = '';
  let temp = idx;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export interface SheetFetchResult {
  headers: SheetAuditColumn[];
  rows: (string | number)[][];
  totalRows: number;
  sampleFirstRow?: string[];
  error?: string | null;
}

/**
 * Récupère les données d'un onglet via API Sheets dès la ligne 1 pour obtenir les noms réels des colonnes
 */
async function fetchSheetDataWithHeaders(tabName: string, range: string = 'A1:AZ2000'): Promise<SheetFetchResult> {
  const token = getGoogleAccessToken();
  if (!token) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      error: 'Token Google Sheets non présent en mémoire ou expiré (veuillez vous reconnecter).'
    };
  }

  const fullRange = `${tabName}!${range}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${REFERENT_SPREADSHEET_ID}/values/${encodeURIComponent(fullRange)}`;
  
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `Erreur HTTP ${response.status} (${response.statusText})`;
      console.warn(`Lecture Sheets ${tabName} (${response.status}):`, errData);
      return {
        headers: [],
        rows: [],
        totalRows: 0,
        error: errMsg
      };
    }

    const data = await response.json();
    const allValues: (string | number)[][] = data.values || [];
    if (allValues.length === 0) {
      return {
        headers: [],
        rows: [],
        totalRows: 0,
        error: null
      };
    }

    // Ligne 1 = En-têtes réels
    const headerRow = allValues[0] || [];
    const headers: SheetAuditColumn[] = headerRow.map((colName, idx) => ({
      letter: indexToLetter(idx),
      name: String(colName || '').trim() || `(Vide)`
    }));

    // Lignes de données = dès la ligne 2 (index 1)
    const dataRows = allValues.slice(1);
    const sampleFirstRow = dataRows.length > 0 ? dataRows[0].map(v => String(v || '')) : undefined;

    return {
      headers,
      rows: dataRows,
      totalRows: dataRows.length,
      sampleFirstRow,
      error: null
    };
  } catch (err: any) {
    console.warn(`Erreur réseau Sheets ${tabName}:`, err);
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      error: err?.message || 'Erreur réseau de communication avec Google Sheets'
    };
  }
}

/**
 * Service principal de synchronisation des données de l'onglet Référent
 */
export class ReferentDataService {
  private static cache: Record<string, ReferentDatasets> = {};

  /**
   * Retourne les données en cache mémoire si disponibles
   */
  static getCachedData(
    candidatIdProfil?: string,
    candidatName?: string,
    campaignYear: number = new Date().getFullYear()
  ): ReferentDatasets | null {
    const key = `${(candidatIdProfil || candidatName || '').trim().toLowerCase()}_${campaignYear}`;
    return this.cache[key] || null;
  }

  /**
   * Récupère les données préchargées et stockées dans l'application pour une campagne
   */
  static getStoredCampaignCandidateData(
    candidatIdProfil?: string,
    campaignYear: number = new Date().getFullYear()
  ): ReferentDatasets | null {
    if (!candidatIdProfil) return null;
    const cleanId = candidatIdProfil.trim().toLowerCase();
    const cacheKey = `${cleanId}_${campaignYear}`;
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }
    try {
      const storageKey = `campaign_referent_data_${campaignYear}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, ReferentDatasets>;
        if (parsed) {
          Object.entries(parsed).forEach(([k, v]) => {
            this.cache[k] = v;
          });
          if (parsed[cleanId]) return parsed[cleanId];
          if (parsed[candidatIdProfil.trim()]) return parsed[candidatIdProfil.trim()];
        }
      }
    } catch (e) {
      console.warn('Error reading stored campaign referent data:', e);
    }
    return null;
  }

  /**
   * Précharge les données Référent pour tous les candidats lors de l'initialisation de la campagne
   * et les stocke dans l'application pour un accès immédiat.
   */
  static async preloadCampaignReferentData(
    campaignYear: number = new Date().getFullYear(),
    candidates: Array<{ idProfil: string; displayName?: string }> = []
  ): Promise<Record<string, ReferentDatasets>> {
    const resultMap: Record<string, ReferentDatasets> = {};
    if (!candidates || candidates.length === 0) {
      return resultMap;
    }

    try {
      // Dictionnaire partagé des pièces jointes (gid 581811371)
      const pjMap = new Map<string, string>();
      try {
        const candidatePjTabs = ['Pièce_Jointe', 'Piece_Jointe', 'Pieces_Jointes', 'Pièces_Jointes'];
        let pjTabName: string | null = null;
        for (const candidateName of candidatePjTabs) {
          const testRes = await fetchSheetDataWithHeaders(candidateName, 'A1:D10');
          if (testRes.rows.length > 0 || (testRes.headers && testRes.headers.length > 0)) {
            pjTabName = candidateName;
            break;
          }
        }
        if (!pjTabName) {
          pjTabName = await getSheetTitleByGid(581811371);
        }

        if (pjTabName) {
          const pjRes = await fetchSheetDataWithHeaders(pjTabName, 'A1:Z5000');
          for (const r of pjRes.rows) {
            const idDoc = String(r[0] || '').trim();
            let linkDoc = String(r[2] || '').trim();
            if (!linkDoc.startsWith('http')) {
              for (let colIdx = 1; colIdx < r.length; colIdx++) {
                const val = String(r[colIdx] || '').trim();
                if (val.startsWith('http://') || val.startsWith('https://')) {
                  linkDoc = val;
                  break;
                }
              }
            }
            if (idDoc && linkDoc) {
              pjMap.set(idDoc, linkDoc);
              pjMap.set(idDoc.toLowerCase(), linkDoc);
              pjMap.set(normalizeStr(idDoc), linkDoc);
            }
          }
        }
      } catch (pjErr) {
        console.warn('Preload Pièce Jointe notice:', pjErr);
      }

      // Fetch all 5 sheets once
      const [meteoRes, actionRes, missionRes, accompRes, clientRes] = await Promise.all([
        fetchSheetDataWithHeaders('Vue_Meteo'),
        fetchSheetDataWithHeaders('Vue_Action'),
        fetchSheetDataWithHeaders('Vue_Mission'),
        fetchSheetDataWithHeaders('Vue_Accompagnement'),
        fetchSheetDataWithHeaders('Vue_Client')
      ]);

      const targetYearStr = String(campaignYear).trim();
      const targetYearShort = targetYearStr.slice(-2);

      // Parse every candidate against these loaded datasets
      for (const cand of candidates) {
        const targetId = (cand.idProfil || '').trim().toLowerCase();
        if (!targetId) continue;
        const isIdMatch = (cellVal?: string | number): boolean => {
          if (!targetId || cellVal === undefined || cellVal === null) return false;
          return String(cellVal).trim().toLowerCase() === targetId;
        };
        const userDisplayId = cand.idProfil.trim();

        // 1. Meteos
        const meteos: ReferentMeteoItem[] = meteoRes.rows
          .map(r => ({
            idProfilEvalue: String(r[1] || ''),
            idProfil: String(r[4] || ''),
            dateMeteo: String(r[5] || ''),
            lienMeteo: String(r[16] || ''),
            consultantEvalue: String(r[17] || ''),
            client: String(r[18] || ''),
            anneeJury: String(r[25] || '').trim()
          }))
          .filter(item => {
            const matchesCandidat = isIdMatch(item.idProfil);
            const matchesYearColZ = Boolean(
              item.anneeJury &&
              (item.anneeJury === targetYearStr ||
               item.anneeJury.includes(targetYearStr) ||
               item.anneeJury === targetYearShort)
            );
            const matchesDateMeteo = isDateInCampaignYear(item.dateMeteo, campaignYear);
            return matchesCandidat && (matchesYearColZ || matchesDateMeteo);
          });

        // 2. Actions
        const actions: ReferentActionItem[] = actionRes.rows
          .map(r => {
            const idPieceJointe = String(r[10] || '').trim();
            const lienPieceJointe = idPieceJointe.startsWith('http')
              ? idPieceJointe
              : (pjMap.get(idPieceJointe) || pjMap.get(idPieceJointe.toLowerCase()) || pjMap.get(normalizeStr(idPieceJointe)) || '');
            return {
              descriptionAction: String(r[1] || ''),
              dateRealisation: String(r[3] || ''),
              idProfil: String(r[6] || ''),
              client: String(r[11] || ''),
              statutAction: String(r[15] || ''),
              compteRendu: String(r[9] || ''),
              idPieceJointe,
              lienPieceJointe
            };
          })
          .filter(item => isIdMatch(item.idProfil) && isDateInCampaignYear(item.dateRealisation, campaignYear));

        // 3. Missions
        const missions: ReferentMissionItem[] = missionRes.rows
          .map(r => {
            const idPieceJointe = String(r[16] || '').trim();
            const lienPieceJointe = idPieceJointe.startsWith('http')
              ? idPieceJointe
              : (pjMap.get(idPieceJointe) || pjMap.get(idPieceJointe.toLowerCase()) || pjMap.get(normalizeStr(idPieceJointe)) || '');
            return {
              libelleMission: String(r[1] || 'Mission'),
              idProfil: String(r[2] || ''),
              dateCreation: String(r[14] || ''),
              statut: String(r[21] || 'En cours'),
              clientFinal: String(r[22] || ''),
              idPieceJointe,
              lienPieceJointe
            };
          })
          .filter(item => isIdMatch(item.idProfil) && isDateInCampaignYear(item.dateCreation, campaignYear));

        // 4. Accompagnements
        const accompagnements: ReferentAccompagnementItem[] = accompRes.rows
          .map(r => {
            const typeStr = String(r[11] || '');
            let typeAcc: 'COACHING' | 'ENCADREMENT' | 'PARRAIN' = 'COACHING';
            if (typeStr.includes('5') || normalizeStr(typeStr).includes('encadrement')) {
              typeAcc = 'ENCADREMENT';
            } else if (typeStr.includes('2') || normalizeStr(typeStr).includes('parrain')) {
              typeAcc = 'PARRAIN';
            }
            return {
              type: typeAcc,
              dateDebut: String(r[1] || '').trim(),
              dateFin: String(r[2] || '').trim(),
              idProfilAccompagne: String(r[3] || ''),
              idProfilAccompagnant: String(r[4] || ''),
              nomAccompagne: String(r[9] || '').trim(),
              typeAccompagnement: typeStr,
              libelleStatut: String(r[13] || ''),
              lienFicheEncadrement: String(r[8] || '').trim()
            };
          })
          .filter(item => isIdMatch(item.idProfilAccompagnant) && isDateIntervalInCampaign(item.dateDebut, item.dateFin, campaignYear));

        const coaching = accompagnements.filter(item => item.type === 'COACHING');
        const encadrement = accompagnements.filter(item => item.type === 'ENCADREMENT');
        const parrain = accompagnements.filter(item => item.type === 'PARRAIN');

        // 5. Clients (ignorer les lignes où la colonne C / index 2 vaut 28)
        const clients: ReferentClientItem[] = clientRes.rows
          .filter(r => String(r[2] ?? '').trim() !== '28')
          .map(r => ({
            nomClient: String(r[1] || r[0] || 'Client'),
            idProfil: String(r[3] || ''),
            typeClient: String(r[4] || '')
          }))
          .filter(item => isIdMatch(item.idProfil));

        const auditLog: SheetAuditItem[] = [
          {
            id: 'vue_meteo',
            tableName: 'Suivre les missions (Météos)',
            sheetName: 'Vue_Meteo',
            url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=0#gid=0',
            columnTarget: 'Colonne E (IdProfil Référent)',
            idProfilUsed: userDisplayId,
            filterRule: `Colonne E == "${userDisplayId}" ET Année ${campaignYear}`,
            rowsRetrievedTotal: meteoRes.totalRows,
            rowsMatchedCandidate: meteos.length,
            status: meteoRes.error ? 'ERROR' : (meteos.length > 0 ? 'SUCCESS' : (meteoRes.totalRows > 0 ? 'WARNING' : 'ERROR')),
            details: meteoRes.error || `${meteos.length} météo(s) retenue(s) sur ${meteoRes.totalRows} lignes`,
            columns: meteoRes.headers,
            sampleFirstRow: meteoRes.sampleFirstRow
          },
          {
            id: 'vue_action',
            tableName: 'Développement Logiclever (Actions)',
            sheetName: 'Vue_Action',
            url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1114972765#gid=1114972765',
            columnTarget: 'Colonne G (IdProfil)',
            idProfilUsed: userDisplayId,
            filterRule: `Colonne G == "${userDisplayId}" ET Date en campagne ${campaignYear}`,
            rowsRetrievedTotal: actionRes.totalRows,
            rowsMatchedCandidate: actions.length,
            status: actionRes.error ? 'ERROR' : (actions.length > 0 ? 'SUCCESS' : (actionRes.totalRows > 0 ? 'WARNING' : 'ERROR')),
            details: actionRes.error || `${actions.length} action(s) retenue(s) sur ${actionRes.totalRows} lignes`,
            columns: actionRes.headers,
            sampleFirstRow: actionRes.sampleFirstRow
          },
          {
            id: 'vue_mission',
            tableName: 'Recrutement (Missions créées)',
            sheetName: 'Vue_Mission',
            url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=28372804#gid=28372804',
            columnTarget: 'Colonne C (ID Profil)',
            idProfilUsed: userDisplayId,
            filterRule: `Colonne C == "${userDisplayId}" ET Date en campagne ${campaignYear}`,
            rowsRetrievedTotal: missionRes.totalRows,
            rowsMatchedCandidate: missions.length,
            status: missionRes.error ? 'ERROR' : (missions.length > 0 ? 'SUCCESS' : (missionRes.totalRows > 0 ? 'WARNING' : 'ERROR')),
            details: missionRes.error || `${missions.length} mission(s) créée(s) sur ${missionRes.totalRows} lignes`,
            columns: missionRes.headers,
            sampleFirstRow: missionRes.sampleFirstRow
          },
          {
            id: 'vue_accompagnement',
            tableName: 'Accompagnement (Coaching, Encadrement, Parrainage)',
            sheetName: 'Vue_Accompagnement',
            url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1762118320#gid=1762118320',
            columnTarget: 'Colonne E (Id Profil Accompagnant)',
            idProfilUsed: userDisplayId,
            filterRule: `Colonne E == "${userDisplayId}" ET Dates en campagne ${campaignYear}`,
            rowsRetrievedTotal: accompRes.totalRows,
            rowsMatchedCandidate: accompagnements.length,
            status: accompRes.error ? 'ERROR' : (accompagnements.length > 0 ? 'SUCCESS' : (accompRes.totalRows > 0 ? 'WARNING' : 'ERROR')),
            details: accompRes.error || `${coaching.length} coaching, ${encadrement.length} encadrement, ${parrain.length} parrainage`,
            columns: accompRes.headers,
            sampleFirstRow: accompRes.sampleFirstRow
          },
          {
            id: 'vue_client',
            tableName: "Responsabilité d'un compte (Clients)",
            sheetName: 'Vue_Client',
            url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1815147854#gid=1815147854',
            columnTarget: 'Colonne D (Id Profil)',
            idProfilUsed: userDisplayId,
            filterRule: `Colonne D == "${userDisplayId}"`,
            rowsRetrievedTotal: clientRes.totalRows,
            rowsMatchedCandidate: clients.length,
            status: clientRes.error ? 'ERROR' : (clients.length > 0 ? 'SUCCESS' : (clientRes.totalRows > 0 ? 'WARNING' : 'ERROR')),
            details: clientRes.error || `${clients.length} client(s) sous responsabilité`,
            columns: clientRes.headers,
            sampleFirstRow: clientRes.sampleFirstRow
          }
        ];

        const candDatasets: ReferentDatasets = {
          meteos,
          actions,
          missions,
          coaching,
          encadrement,
          parrain,
          clients,
          auditLog,
          loading: false,
          error: null
        };

        resultMap[targetId] = candDatasets;
        resultMap[cand.idProfil.trim()] = candDatasets;
        const cacheKey = `${targetId}_${campaignYear}`;
        this.cache[cacheKey] = candDatasets;
      }

      // Persistance dans localStorage pour consultation instantanée
      try {
        localStorage.setItem(`campaign_referent_data_${campaignYear}`, JSON.stringify(resultMap));
      } catch (storageErr) {
        console.warn('Could not persist campaign referent data to localStorage:', storageErr);
      }
    } catch (globalErr) {
      console.warn('Error during preloadCampaignReferentData:', globalErr);
    }

    return resultMap;
  }

  /**
   * Charge et filtre l'ensemble des données référent pour un profil et une année donnés
   */
  static async loadReferentData(
    candidatIdProfil?: string,
    candidatName?: string,
    campaignYear: number = new Date().getFullYear(),
    forceRefresh: boolean = false
  ): Promise<ReferentDatasets> {
    const cacheKey = `${(candidatIdProfil || candidatName || '').trim().toLowerCase()}_${campaignYear}`;

    if (!forceRefresh) {
      if (this.cache[cacheKey]) {
        return this.cache[cacheKey];
      }
      const stored = this.getStoredCampaignCandidateData(candidatIdProfil, campaignYear);
      if (stored) {
        return stored;
      }
    }
    const targetId = (candidatIdProfil || '').trim().toLowerCase();
    const isIdMatch = (cellVal?: string | number): boolean => {
      if (!targetId || cellVal === undefined || cellVal === null) return false;
      const str = String(cellVal).trim().toLowerCase();
      return str === targetId;
    };

    try {
      const auditLog: SheetAuditItem[] = [];
      const userDisplayId = (candidatIdProfil || '').trim() || '(non spécifié)';

      // Dictionnaire partagé des pièces jointes (gid 581811371)
      const pjMap = new Map<string, string>();
      try {
        // Tenter d'abord par les noms d'onglets directs, puis par le GID
        const candidatePjTabs = ['Pièce_Jointe', 'Piece_Jointe', 'Pieces_Jointes', 'Pièces_Jointes'];
        let pjTabName: string | null = null;
        for (const candidateName of candidatePjTabs) {
          const testRes = await fetchSheetDataWithHeaders(candidateName, 'A1:D10');
          if (testRes.rows.length > 0 || (testRes.headers && testRes.headers.length > 0)) {
            pjTabName = candidateName;
            break;
          }
        }
        if (!pjTabName) {
          pjTabName = await getSheetTitleByGid(581811371);
        }

        if (pjTabName) {
          const pjRes = await fetchSheetDataWithHeaders(pjTabName, 'A1:Z5000');
          for (const r of pjRes.rows) {
            const idDoc = String(r[0] || '').trim();
            // Le lien document peut être en Col C (index 2) ou Col B (index 1) ou Col D (index 3)
            let linkDoc = String(r[2] || '').trim();
            if (!linkDoc.startsWith('http')) {
              // Vérifier si une autre colonne contient une URL
              for (let colIdx = 1; colIdx < r.length; colIdx++) {
                const val = String(r[colIdx] || '').trim();
                if (val.startsWith('http://') || val.startsWith('https://')) {
                  linkDoc = val;
                  break;
                }
              }
            }

            if (idDoc && linkDoc) {
              pjMap.set(idDoc, linkDoc);
              pjMap.set(idDoc.toLowerCase(), linkDoc);
              pjMap.set(normalizeStr(idDoc), linkDoc);
            }
          }
        }
      } catch (pjErr) {
        console.warn('Notice Pièce Jointe load:', pjErr);
      }

      // 1. Charger Vue_Meteo
      // - IdProfil (Colonne E / index 4)
      // - Date Meteo (Colonne F / index 5)
      // - Lien Meteo (Colonne Q / index 16)
      // - Consultant évalué (Colonne R / index 17) [et IdProfil évalué en Colonne B / index 1]
      // - Client (Colonne S / index 18)
      // - Année Jury (Colonne Z / index 25, ex: 2026)
      let meteos: ReferentMeteoItem[] = [];
      try {
        const fetchRes = await fetchSheetDataWithHeaders('Vue_Meteo');
        const rows = fetchRes.rows;
        meteos = rows
          .map(r => ({
            idProfilEvalue: String(r[1] || ''), // Col B
            idProfil: String(r[4] || ''), // Col E
            dateMeteo: String(r[5] || ''), // Col F
            lienMeteo: String(r[16] || ''), // Col Q
            consultantEvalue: String(r[17] || ''), // Col R
            client: String(r[18] || ''), // Col S
            anneeJury: String(r[25] || '').trim() // Col Z
          }))
          .filter(item => {
            const matchesCandidat = isIdMatch(item.idProfil); // Colonne E strictement
            const targetYearStr = String(campaignYear).trim();
            const targetYearShort = targetYearStr.slice(-2); // ex: "26"

            const matchesYearColZ = Boolean(
              item.anneeJury &&
              (item.anneeJury === targetYearStr ||
               item.anneeJury.includes(targetYearStr) ||
               item.anneeJury === targetYearShort)
            );

            // Vérification par la Date Météo (Colonne F), supportant DD/MM/YY et DD/MM/YYYY
            const matchesDateMeteo = isDateInCampaignYear(item.dateMeteo, campaignYear);

            return matchesCandidat && (matchesYearColZ || matchesDateMeteo);
          });

        auditLog.push({
          id: 'vue_meteo',
          tableName: 'Suivre les missions (Météos)',
          sheetName: 'Vue_Meteo',
          url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=0#gid=0',
          columnTarget: 'Colonne E (IdProfil Référent)',
          idProfilUsed: userDisplayId,
          filterRule: `Colonne E == "${userDisplayId}" ET (Col Z == "${campaignYear}" OU Date Météo (Col F) en campagne ${campaignYear-1}-${campaignYear})`,
          rowsRetrievedTotal: fetchRes.totalRows,
          rowsMatchedCandidate: meteos.length,
          status: fetchRes.error ? 'ERROR' : (meteos.length > 0 ? 'SUCCESS' : (fetchRes.totalRows > 0 ? 'WARNING' : 'ERROR')),
          details: fetchRes.error || (fetchRes.totalRows > 0 ? `${meteos.length} météo(s) retenue(s) sur ${fetchRes.totalRows} lignes lues` : 'Feuille accessible mais vide'),
          columns: fetchRes.headers,
          sampleFirstRow: fetchRes.sampleFirstRow
        });
      } catch (e: any) {
        console.warn('Notice Vue_Meteo load:', e);
        auditLog.push({
          id: 'vue_meteo',
          tableName: 'Suivre les missions (Météos)',
          sheetName: 'Vue_Meteo',
          url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=0#gid=0',
          columnTarget: 'Colonne E (IdProfil Référent)',
          idProfilUsed: userDisplayId,
          filterRule: `Colonne E == "${userDisplayId}"`,
          rowsRetrievedTotal: 0,
          rowsMatchedCandidate: 0,
          status: 'ERROR',
          details: e?.message || 'Erreur réseau/accès'
        });
      }

      // 2. Charger Vue_Action + Pièces Jointes (gid 581811371)
      // - Date Réalisation (Colonne D / index 3, entre 01/07/(campaignYear-1) et 30/06/campaignYear)
      // - IdProfil (Colonne G / index 6)
      // - Compte Rendu (Colonne J / index 9)
      // - Id Pièce Jointe (Colonne K / index 10)
      // - Client (Colonne L / index 11)
      // - Sheet Pièces Jointes (gid 581811371): Col A = ID Pièce Jointe, Col C = Lien doc
      let actions: ReferentActionItem[] = [];
      try {
        const fetchRes = await fetchSheetDataWithHeaders('Vue_Action');
        const rows = fetchRes.rows;
        actions = rows
          .map(r => {
            const idPieceJointe = String(r[10] || '').trim();
            const lienPieceJointe = idPieceJointe.startsWith('http')
              ? idPieceJointe
              : (pjMap.get(idPieceJointe) || pjMap.get(idPieceJointe.toLowerCase()) || pjMap.get(normalizeStr(idPieceJointe)) || '');
            return {
              descriptionAction: String(r[1] || ''), // Col B
              dateRealisation: String(r[3] || ''), // Col D
              idProfil: String(r[6] || ''), // Col G
              client: String(r[11] || ''), // Col L
              statutAction: String(r[15] || ''), // Col P
              compteRendu: String(r[9] || ''), // Col J
              idPieceJointe, // Col K
              lienPieceJointe
            };
          })
          .filter(item => {
            const matchesCandidat = isIdMatch(item.idProfil); // Colonne G strictement
            const matchesDate = isDateInCampaignYear(item.dateRealisation, campaignYear);
            return matchesCandidat && matchesDate;
          });
        auditLog.push({
          id: 'vue_action',
          tableName: 'Développement Logiclever (Actions)',
          sheetName: 'Vue_Action',
          url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1114972765#gid=1114972765',
          columnTarget: 'Colonne G (IdProfil)',
          idProfilUsed: userDisplayId,
          filterRule: `Colonne G == "${userDisplayId}" ET Date (Col D) entre 01/07/${campaignYear-1} et 30/06/${campaignYear}`,
          rowsRetrievedTotal: fetchRes.totalRows,
          rowsMatchedCandidate: actions.length,
          status: fetchRes.error ? 'ERROR' : (actions.length > 0 ? 'SUCCESS' : (fetchRes.totalRows > 0 ? 'WARNING' : 'ERROR')),
          details: fetchRes.error || (fetchRes.totalRows > 0 ? `${actions.length} action(s) retenue(s) sur ${fetchRes.totalRows} lignes lues` : 'Feuille accessible mais vide'),
          columns: fetchRes.headers,
          sampleFirstRow: fetchRes.sampleFirstRow
        });
      } catch (e: any) {
        console.warn('Notice Vue_Action load:', e);
        auditLog.push({
          id: 'vue_action',
          tableName: 'Développement Logiclever (Actions)',
          sheetName: 'Vue_Action',
          url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1114972765#gid=1114972765',
          columnTarget: 'Colonne G (IdProfil)',
          idProfilUsed: userDisplayId,
          filterRule: `Colonne G == "${userDisplayId}"`,
          rowsRetrievedTotal: 0,
          rowsMatchedCandidate: 0,
          status: 'ERROR',
          details: e?.message || 'Erreur réseau/accès'
        });
      }

      // 3. Charger Vue_Mission (gid 28372804)
      // - Libelle Mission (colonne B / index 1)
      // - ID Profil (colonne C / index 2)
      // - Date Création Mission (colonne O / index 14, entre 01/07/(campaignYear-1) et 30/06/campaignYear)
      // - Statut Mission (colonne V / index 21)
      // - Client Final (colonne W / index 22)
      // - Id Pièce Jointe (colonne Q / index 16)
      let missions: ReferentMissionItem[] = [];
      try {
        const fetchRes = await fetchSheetDataWithHeaders('Vue_Mission');
        const rows = fetchRes.rows;
        missions = rows
          .map(r => {
            const idPieceJointe = String(r[16] || '').trim(); // Col Q
            const lienPieceJointe = idPieceJointe.startsWith('http')
              ? idPieceJointe
              : (pjMap.get(idPieceJointe) || pjMap.get(idPieceJointe.toLowerCase()) || pjMap.get(normalizeStr(idPieceJointe)) || '');
            return {
              libelleMission: String(r[1] || 'Mission'), // Col B
              idProfil: String(r[2] || ''), // Col C
              dateCreation: String(r[14] || ''), // Col O
              statut: String(r[21] || 'En cours'), // Col V
              clientFinal: String(r[22] || ''), // Col W
              idPieceJointe, // Col Q
              lienPieceJointe
            };
          })
          .filter(item => {
            const matchesCandidat = isIdMatch(item.idProfil); // Colonne C strictement
            const matchesYear = isDateInCampaignYear(item.dateCreation, campaignYear);
            return matchesCandidat && matchesYear;
          });

        auditLog.push({
          id: 'vue_mission',
          tableName: 'Recrutement (Missions créées)',
          sheetName: 'Vue_Mission',
          url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=28372804#gid=28372804',
          columnTarget: 'Colonne C (ID Profil)',
          idProfilUsed: userDisplayId,
          filterRule: `Colonne C == "${userDisplayId}" ET Date création (Col O) entre 01/07/${campaignYear-1} et 30/06/${campaignYear}`,
          rowsRetrievedTotal: fetchRes.totalRows,
          rowsMatchedCandidate: missions.length,
          status: fetchRes.error ? 'ERROR' : (missions.length > 0 ? 'SUCCESS' : (fetchRes.totalRows > 0 ? 'WARNING' : 'ERROR')),
          details: fetchRes.error || (fetchRes.totalRows > 0 ? `${missions.length} mission(s) créée(s) sur ${fetchRes.totalRows} lignes lues` : 'Feuille accessible mais vide'),
          columns: fetchRes.headers,
          sampleFirstRow: fetchRes.sampleFirstRow
        });
      } catch (e: any) {
        console.warn('Notice Vue_Mission load:', e);
        auditLog.push({
          id: 'vue_mission',
          tableName: 'Recrutement (Missions créées)',
          sheetName: 'Vue_Mission',
          url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=28372804#gid=28372804',
          columnTarget: 'Colonne C (ID Profil)',
          idProfilUsed: userDisplayId,
          filterRule: `Colonne C == "${userDisplayId}"`,
          rowsRetrievedTotal: 0,
          rowsMatchedCandidate: 0,
          status: 'ERROR',
          details: e?.message || 'Erreur réseau/accès'
        });
      }

      // 4. Charger Vue_Accompagnement
      // - Nom Accompagné (colonne K / index 10)
      // - Id Profil Accompagné (colonne D / index 3)
      // - Id Profil Accompagnant (colonne E / index 4)
      // - Libellé Statut (colonne N / index 13)
      // - Type Accompagnement (colonne L / index 11)
      let coaching: ReferentAccompagnementItem[] = [];
      let encadrement: ReferentAccompagnementItem[] = [];
      let parrain: ReferentAccompagnementItem[] = [];
      try {
        const fetchRes = await fetchSheetDataWithHeaders('Vue_Accompagnement');
        const rows = fetchRes.rows;
        const accompagnements: ReferentAccompagnementItem[] = rows
          .map(r => {
            const typeStr = String(r[11] || ''); // Col L
            let typeAcc: 'COACHING' | 'ENCADREMENT' | 'PARRAIN' = 'COACHING';
            if (typeStr.includes('5') || normalizeStr(typeStr).includes('encadrement')) {
              typeAcc = 'ENCADREMENT';
            } else if (typeStr.includes('2') || normalizeStr(typeStr).includes('parrain')) {
              typeAcc = 'PARRAIN';
            }

            const dateDebut = String(r[1] || '').trim(); // Col B (index 1)
            const dateFin = String(r[2] || '').trim(); // Col C (index 2)

            return {
              type: typeAcc,
              dateDebut,
              dateFin,
              idProfilAccompagne: String(r[3] || ''), // Col D
              idProfilAccompagnant: String(r[4] || ''), // Col E
              nomAccompagne: String(r[9] || '').trim(), // Col J strictement (index 9)
              typeAccompagnement: typeStr, // Col L
              libelleStatut: String(r[13] || ''), // Col N
              lienFicheEncadrement: String(r[8] || '').trim() // Col I (index 8)
            };
          })
          .filter(item => {
            const matchesCandidat = isIdMatch(item.idProfilAccompagnant); // Colonne E strictement
            const matchesDates = isDateIntervalInCampaign(item.dateDebut, item.dateFin, campaignYear);
            return matchesCandidat && matchesDates;
          });

        coaching = accompagnements.filter(item => item.type === 'COACHING');
        encadrement = accompagnements.filter(item => item.type === 'ENCADREMENT');
        parrain = accompagnements.filter(item => item.type === 'PARRAIN');

        auditLog.push({
          id: 'vue_accompagnement',
          tableName: 'Accompagnement (Coaching, Encadrement, Parrainage)',
          sheetName: 'Vue_Accompagnement',
          url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1762118320#gid=1762118320',
          columnTarget: 'Colonne E (Id Profil Accompagnant)',
          idProfilUsed: userDisplayId,
          filterRule: `Colonne E == "${userDisplayId}" ET intersection [Col B, Col C] avec 01/07/${campaignYear-1} et 30/06/${campaignYear}`,
          rowsRetrievedTotal: fetchRes.totalRows,
          rowsMatchedCandidate: accompagnements.length,
          status: fetchRes.error ? 'ERROR' : (accompagnements.length > 0 ? 'SUCCESS' : (fetchRes.totalRows > 0 ? 'WARNING' : 'ERROR')),
          details: fetchRes.error || (fetchRes.totalRows > 0 ? `${coaching.length} coaching, ${encadrement.length} encadrement, ${parrain.length} parrainage sur ${fetchRes.totalRows} lignes lues` : 'Feuille accessible mais vide'),
          columns: fetchRes.headers,
          sampleFirstRow: fetchRes.sampleFirstRow
        });
      } catch (e: any) {
        console.warn('Notice Vue_Accompagnement load:', e);
        auditLog.push({
          id: 'vue_accompagnement',
          tableName: 'Accompagnement (Coaching, Encadrement, Parrainage)',
          sheetName: 'Vue_Accompagnement',
          url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1762118320#gid=1762118320',
          columnTarget: 'Colonne E (Id Profil Accompagnant)',
          idProfilUsed: userDisplayId,
          filterRule: `Colonne E == "${userDisplayId}"`,
          rowsRetrievedTotal: 0,
          rowsMatchedCandidate: 0,
          status: 'ERROR',
          details: e?.message || 'Erreur réseau/accès'
        });
      }

      // 5. Charger Vue_Client
      // - Nom Client (colonne B / index 1)
      // - Id Profil (colonne D / index 3)
      // - Type Client (colonne E / index 4)
      let clients: ReferentClientItem[] = [];
      try {
        const fetchRes = await fetchSheetDataWithHeaders('Vue_Client');
        const rows = fetchRes.rows;
        // Ignorer les lignes où la colonne C (index 2) vaut 28
        clients = rows
          .filter(r => String(r[2] ?? '').trim() !== '28')
          .map(r => ({
            nomClient: String(r[1] || r[0] || 'Client'), // Col B
            idProfil: String(r[3] || ''), // Col D
            typeClient: String(r[4] || '') // Col E
          }))
          .filter(item => isIdMatch(item.idProfil)); // Colonne D strictement

        auditLog.push({
          id: 'vue_client',
          tableName: "Responsabilité d'un compte (Clients)",
          sheetName: 'Vue_Client',
          url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1815147854#gid=1815147854',
          columnTarget: 'Colonne D (Id Profil)',
          idProfilUsed: userDisplayId,
          filterRule: `Colonne D == "${userDisplayId}" ET Colonne C != "28"`,
          rowsRetrievedTotal: fetchRes.totalRows,
          rowsMatchedCandidate: clients.length,
          status: fetchRes.error ? 'ERROR' : (clients.length > 0 ? 'SUCCESS' : (fetchRes.totalRows > 0 ? 'WARNING' : 'ERROR')),
          details: fetchRes.error || (fetchRes.totalRows > 0 ? `${clients.length} client(s) sous responsabilité sur ${fetchRes.totalRows} lignes lues` : 'Feuille accessible mais vide'),
          columns: fetchRes.headers,
          sampleFirstRow: fetchRes.sampleFirstRow
        });
      } catch (e: any) {
        console.warn('Notice Vue_Client load:', e);
        auditLog.push({
          id: 'vue_client',
          tableName: "Responsabilité d'un compte (Clients)",
          sheetName: 'Vue_Client',
          url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1815147854#gid=1815147854',
          columnTarget: 'Colonne D (Id Profil)',
          idProfilUsed: userDisplayId,
          filterRule: `Colonne D == "${userDisplayId}"`,
          rowsRetrievedTotal: 0,
          rowsMatchedCandidate: 0,
          status: 'ERROR',
          details: e?.message || 'Erreur réseau/accès'
        });
      }

      const finalResult: ReferentDatasets = {
        meteos,
        actions,
        missions,
        coaching,
        encadrement,
        parrain,
        clients,
        auditLog,
        loading: false,
        error: null
      };

      this.cache[cacheKey] = finalResult;
      return finalResult;
    } catch (err: any) {
      return {
        meteos: [],
        actions: [],
        missions: [],
        coaching: [],
        encadrement: [],
        parrain: [],
        clients: [],
        auditLog: [],
        loading: false,
        error: err?.message || 'Erreur lors du chargement des données Référent'
      };
    }
  }
}
