/**
 * Service pour la recherche et l'extraction des objectifs de l'année passée depuis Google Drive.
 * Dossier racine Entreprise : 1A2DLQku7fGLkV3XthSIi34pJ9TC-_2Bv
 */

export interface ExtractedObjectiveItem {
  objective: string;
  comments: string;
  reached: 'OUI' | 'NON' | 'PARTIEL';
}

export interface DebugTableInfo {
  index: number;
  rowCount: number;
  colCount: number;
  headers: string[];
  rows: string[][];
}

export interface DriveDebugInfo {
  fileName: string;
  fileMimeType: string;
  headingsFound: string[];
  tables: DebugTableInfo[];
  rawTextPreview?: string;
  message?: string;
}

export interface DriveImportResult {
  success: boolean;
  file?: {
    id: string;
    name: string;
    mimeType?: string;
    webViewLink?: string;
  };
  priorYear: number;
  objectives: ExtractedObjectiveItem[];
  debugInfo?: DriveDebugInfo;
  error?: string;
}

const ROOT_FOLDER_ID = '1A2DLQku7fGLkV3XthSIi34pJ9TC-_2Bv';

export class DriveObjectivesService {
  /**
   * Cherche le dossier de l'année passée (ex: 2025 pour une campagne 2026)
   */
  static async findPriorYearFolder(accessToken: string, priorYear: number): Promise<{ id: string; name: string }> {
    const query = `'${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?` + new URLSearchParams({
      q: query,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
      fields: 'files(id, name)'
    });

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Erreur lors de l'accès au dossier racine Drive (${res.status})`);
    }

    const data = await res.json();
    const files: Array<{ id: string; name: string }> = data.files || [];

    const targetYearStr = priorYear.toString();
    const match = files.find(f => f.name.includes(targetYearStr));

    if (!match) {
      const available = files.map(f => `"${f.name}"`).join(', ');
      throw new Error(
        `Le sous-dossier de l'année passée (${targetYearStr}) est introuvable dans le Drive. Dossiers trouvés : ${available || 'aucun'}.`
      );
    }

    return match;
  }

  /**
   * Cherche le document du collaborateur contenant son matricule dans le sous-dossier de l'année passée
   */
  static async findCandidateFile(
    accessToken: string,
    folderId: string,
    matricule: string
  ): Promise<{ id: string; name: string; mimeType: string; webViewLink?: string }> {
    const upperMatricule = matricule.trim().toUpperCase();
    if (!upperMatricule) {
      throw new Error("Le matricule du collaborateur n'est pas renseigné sur son profil.");
    }

    const query = `'${folderId}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?` + new URLSearchParams({
      q: query,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
      fields: 'files(id, name, mimeType, webViewLink)'
    });

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Erreur lors de la lecture du dossier Drive (${res.status})`);
    }

    const data = await res.json();
    const files: Array<{ id: string; name: string; mimeType: string; webViewLink?: string }> = data.files || [];

    // Recherche par matricule : nom découpé par '_' avec un élément de longueur 3 en majuscules (ou substring)
    const candidateFiles = files.filter(f => {
      const fileMatricule = f.name
        .split('_')
        .map(part => part.trim())
        .find(part => /^[A-Z]{3}$/.test(part));
      return fileMatricule === upperMatricule;
    });

    if (candidateFiles.length === 0) {
      throw new Error(
        `Aucun document trouvé contenant le matricule "${matricule}" dans le dossier de l'année passée (${files.length} fichiers scannés).`
      );
    }

    // Privilégier Google Docs ou Word (.docx)
    const docMatch = candidateFiles.find(
      f =>
        f.mimeType === 'application/vnd.google-apps.document' ||
        f.name.endsWith('.docx') ||
        f.name.endsWith('.doc')
    ) || candidateFiles[0];

    return docMatch;
  }

  /**
   * Normalise une chaîne pour comparaison robuste (sans accents, sans ponctuation, sans deux-points, etc.)
   */
  static normalizeText(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’'"`]/g, "'")
      .replace(/[\s\u00A0]+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }

  /**
   * Extrait les objectifs de la table "Les objectifs pour l’année prochaine" depuis un Google Doc
   */
  static async extractFromGoogleDoc(
    accessToken: string,
    fileId: string,
    fileName: string
  ): Promise<{ objectives: string[]; debugInfo: DriveDebugInfo }> {
    const url = `https://docs.googleapis.com/v1/documents/${fileId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Erreur de lecture du Google Doc (${res.status})`);
    }

    const doc = await res.json();
    const content = doc.body?.content || [];

    const objectives: string[] = [];
    const debugTables: DebugTableInfo[] = [];
    const headingsFound: string[] = [];

    // Only the table directly after the exact annual-objectives heading is relevant.
    let awaitingObjectivesTable = false;
    let tableCounter = 0;
    const targetHeading = 'les objectifs pour lannee prochaine';

    const readCellText = (parts: any[]): string => parts.map((part: any) => {
      if (part.paragraph) {
        return (part.paragraph.elements || []).map((run: any) => run.textRun?.content || '').join('');
      }
      return '';
    }).join('\n').trim();

    for (const element of content) {
      if (element.paragraph) {
        const rawText = readCellText([element]);
        const normalized = DriveObjectivesService.normalizeText(rawText);
        if (normalized.includes('objectif')) headingsFound.push(rawText);
        if (normalized.includes(targetHeading)) {
          awaitingObjectivesTable = true;
        } else if (awaitingObjectivesTable && normalized &&
          /^(visa|synthese|commentaires generaux|avis du manager)/.test(normalized)) {
          awaitingObjectivesTable = false;
        }
      }
      if (!element.table) continue;
      tableCounter++;
      const grid: string[][] = (element.table.tableRows || []).map((row: any) =>
        (row.tableCells || []).map((cell: any) => readCellText(cell.content || []))
      );
      debugTables.push({
        index: tableCounter, rowCount: grid.length, colCount: grid[0]?.length || 0,
        headers: grid[0] || [], rows: grid.slice(0, 10)
      });
      if (!awaitingObjectivesTable) continue;
      const header = DriveObjectivesService.normalizeText((grid[0] || []).join(' '));
      if (!header.includes('objectif') || !header.includes('benefice')) continue;
      // Row 0 is the SMART header. In this format column 0 is numbering,
      // column 1 contains the actual objective (not Benefits / Means / Measures).
      for (const row of grid.slice(1)) {
        const numberCell = (row[0] || '').trim();
        const objectiveCell = (row[1] || '').trim();
        const normalized = DriveObjectivesService.normalizeText(objectiveCell);
        if (/^\d+[.)\s-]*$/.test(numberCell) && objectiveCell &&
            !normalized.startsWith('objectifs') && !normalized.includes('specifique')) {
          objectives.push(objectiveCell);
        }
      }
      // Never scan unrelated tables after the objectives table.
      break;
    }

    const debugInfo: DriveDebugInfo = {
      fileName,
      fileMimeType: 'application/vnd.google-apps.document',
      headingsFound,
      tables: debugTables,
      message: `${objectives.length} objectif(s) extrait(s), ${debugTables.length} tableau(x) analysé(s)`
    };

    return { objectives, debugInfo };
  }

  /**
   * Orchestrateur principal : Lance la récupération de bout en bout
   */
  static async importPastYearObjectives(
    accessToken: string,
    campaignYear: number,
    matricule: string
  ): Promise<DriveImportResult> {
    const priorYear = campaignYear - 1;

    try {
      // 1. Trouver le dossier de l'année passée
      const yearFolder = await this.findPriorYearFolder(accessToken, priorYear);

      // 2. Trouver le fichier du collaborateur
      const file = await this.findCandidateFile(accessToken, yearFolder.id, matricule);

      let extractedTexts: string[] = [];
      let debugInfo: DriveDebugInfo | undefined;

      // 3. Extraction selon le type
      if (file.mimeType === 'application/vnd.google-apps.document') {
        const res = await this.extractFromGoogleDoc(accessToken, file.id, file.name);
        extractedTexts = res.objectives;
        debugInfo = res.debugInfo;
      } else {
        // Fichier Word (.docx) : appel à l'endpoint serveur dédié
        const parseRes = await fetch('/api/drive/extract-word-objectives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: file.id,
            accessToken
          })
        });

        if (!parseRes.ok) {
          const err = await parseRes.json().catch(() => ({}));
          throw new Error(err?.error || `Impossible d'extraire les objectifs du document Word (${parseRes.status})`);
        }

        const data = await parseRes.json();
        extractedTexts = data.objectives || [];
        debugInfo = data.debugInfo;
      }

      if (extractedTexts.length === 0) {
        return {
          success: false,
          file: {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            webViewLink: file.webViewLink
          },
          priorYear,
          objectives: [],
          debugInfo,
          error: `Le document "${file.name}" a été trouvé, mais aucun objectif n'a pu être extrait du tableau "Les objectifs pour l’année prochaine".`
        };
      }

      const formattedObjectives: ExtractedObjectiveItem[] = extractedTexts.map(text => ({
        objective: text,
        comments: '', // Laisse l'espace pour les commentaires du candidat
        reached: 'OUI'
      }));

      return {
        success: true,
        file: {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink
        },
        priorYear,
        objectives: formattedObjectives,
        debugInfo
      };
    } catch (error: any) {
      return {
        success: false,
        priorYear,
        objectives: [],
        error: error.message || 'Une erreur inconnue est survenue.'
      };
    }
  }

  /**
   * Extrait les objectifs de l'année passée depuis un fichier déposé manuellement par le candidat (.docx, .pdf, .json)
   */
  static async extractObjectivesFromUploadedFile(file: File): Promise<{
    success: boolean;
    objectives: ExtractedObjectiveItem[];
    error?: string;
  }> {
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = err => reject(err);
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/candidate/extract-file-objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileData: base64Data,
          mimeType: file.type || 'application/octet-stream'
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur lors de l'analyse du document (${res.status})`);
      }

      const data = await res.json();
      const rawObjectives: string[] = data.objectives || [];

      if (rawObjectives.length === 0) {
        return {
          success: false,
          objectives: [],
          error: "Aucun objectif n'a pu être extrait du fichier déposé."
        };
      }

      const formattedObjectives: ExtractedObjectiveItem[] = rawObjectives.map(text => ({
        objective: text,
        comments: '',
        reached: 'OUI'
      }));

      return {
        success: true,
        objectives: formattedObjectives
      };
    } catch (err: any) {
      return {
        success: false,
        objectives: [],
        error: err.message || "Erreur lors de l'extraction des objectifs du fichier."
      };
    }
  }
}
