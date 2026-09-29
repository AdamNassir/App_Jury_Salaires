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
    const cleanMatricule = matricule.trim().toLowerCase();
    if (!cleanMatricule) {
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

    // Recherche par matricule dans le nom du fichier
    const candidateFiles = files.filter(f => f.name.toLowerCase().includes(cleanMatricule));

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

    let isInsideTargetSection = false;
    let hasFoundSmartTable = false;
    let activeSmartCol = 0; // Par défaut colonne 0 (première colonne)

    let tableCounter = 0;

    for (let i = 0; i < content.length; i++) {
      const element = content[i];

      // Détection des paragraphes et titres
      if (element.paragraph) {
        const rawText = element.paragraph.elements
          ?.map((e: any) => e.textRun?.content || '')
          .join('')
          .trim() || '';

        const normText = DriveObjectivesService.normalizeText(rawText);

        if (normText.includes('objectif')) {
          headingsFound.push(rawText);
        }

        // Ignorer explicitement la section Vision / Carrière moyen-terme
        if (
          normText.includes('moyen terme') ||
          normText.includes('vision carriere')
        ) {
          isInsideTargetSection = false;
        }

        // Détection de la section des objectifs de l'année prochaine (tolère ponctuation, deux-points, etc.)
        if (
          normText.includes('objectifs pour lannee prochaine') ||
          normText.includes('objectifs de lannee prochaine') ||
          normText.includes('objectifs lannee prochaine') ||
          normText.includes('objectifs pour lannee a venir')
        ) {
          isInsideTargetSection = true;
        }

        // Si une section terminale commence après la table
        if (
          hasFoundSmartTable &&
          (normText.includes('commentaires generaux') ||
            normText.includes('avis du manager') ||
            normText.includes('visa du collaborateur') ||
            normText.includes('synthese'))
        ) {
          break;
        }
      }

      // Analyse des tableaux Google Docs
      if (element.table) {
        tableCounter++;
        const tableRows = element.table.tableRows || [];
        const currentTableIndex = tableCounter;

        if (tableRows.length > 0) {
          // Extraire toutes les cellules pour le diagnostic et l'analyse
          const extractedGrid: string[][] = [];
          for (let r = 0; r < tableRows.length; r++) {
            const cells = tableRows[r].tableCells || [];
            const rowCells: string[] = [];
            for (let c = 0; c < cells.length; c++) {
              const cellText = (cells[c].content || [])
                .map((p: any) => (p.paragraph?.elements || []).map((e: any) => e.textRun?.content || '').join(''))
                .join('\n')
                .trim();
              rowCells.push(cellText);
            }
            extractedGrid.push(rowCells);
          }

          const headerRow = extractedGrid[0] || [];
          const colCount = headerRow.length;

          debugTables.push({
            index: currentTableIndex,
            rowCount: tableRows.length,
            colCount,
            headers: headerRow,
            rows: extractedGrid.slice(0, 10) // Échantillon des 10 premières lignes
          });

          // Détecter si cette table est la table d'objectifs SMART
          let tableSmartCol = -1;

          // Vérifier d'abord si une cellule d'en-tête (ligne 0 ou 1) contient les mots-clés SMART
          for (let r = 0; r < Math.min(2, extractedGrid.length); r++) {
            for (let c = 0; c < extractedGrid[r].length; c++) {
              const normCell = DriveObjectivesService.normalizeText(extractedGrid[r][c]);
              if (
                normCell.includes('specifique') ||
                normCell.includes('s de smart') ||
                normCell.includes('doivent etre specifiques') ||
                (normCell.includes('objectif') && normCell.includes('smart'))
              ) {
                tableSmartCol = c;
                break;
              }
            }
            if (tableSmartCol !== -1) break;
          }

          // Si on est dans la section "objectifs pour l'année prochaine" et qu'aucune colonne n'a le label SMART explicite
          if (tableSmartCol === -1 && isInsideTargetSection) {
            // Dans ce tableau, chercher la colonne dont l'en-tête parle d'objectif (sans moyen terme)
            for (let c = 0; c < headerRow.length; c++) {
              const normCell = DriveObjectivesService.normalizeText(headerRow[c]);
              if (normCell.includes('objectif') && !normCell.includes('moyen terme') && !normCell.includes('vision')) {
                tableSmartCol = c;
                break;
              }
            }
            // Par défaut dans cette section, si au moins 2 colonnes, la colonne 0 est la numérotation et la colonne 1 est l'objectif
            if (tableSmartCol === -1 && colCount >= 2) {
              tableSmartCol = 1;
            } else if (tableSmartCol === -1) {
              tableSmartCol = 0;
            }
          }

          // Vérification supplémentaire : si tableSmartCol pointe sur la colonne 0 mais que la colonne 0 ne contient
          // que la numérotation (1, 2, 3...) et que la colonne 1 contient le libellé des objectifs
          if (tableSmartCol === 0 && colCount >= 2) {
            let col0IsNumbering = true;
            let col1HasText = false;
            for (let r = 1; r < extractedGrid.length; r++) {
              const c0 = (extractedGrid[r][0] || '').trim();
              const c1 = (extractedGrid[r][1] || '').trim();
              if (c0 && !/^\d+[\.\)\:\-]?$/.test(c0)) {
                col0IsNumbering = false;
              }
              if (c1 && c1.length > 3 && !/^\d+$/.test(c1)) {
                col1HasText = true;
              }
            }
            if (col0IsNumbering && col1HasText) {
              tableSmartCol = 1;
            }
          }

          // Extraction des données
          if (tableSmartCol !== -1) {
            hasFoundSmartTable = true;
            activeSmartCol = tableSmartCol;

            for (let r = 1; r < extractedGrid.length; r++) {
              let rawCellText = extractedGrid[r][activeSmartCol] || '';
              // Si la cellule sélectionnée est un simple numéro et que la colonne 1 existe avec du texte
              if ((/^\d+[\.\)\:\-]?$/.test(rawCellText.trim()) || !rawCellText.trim()) && extractedGrid[r].length > 1) {
                const altText = (extractedGrid[r][1] || '').trim();
                if (altText.length > 3 && !/^\d+$/.test(altText)) {
                  rawCellText = altText;
                }
              }

              const cleanObjective = rawCellText.replace(/^[\s\d]+[\.\)\:\-\n\s]+/, '').trim();
              const normClean = DriveObjectivesService.normalizeText(cleanObjective);
              if (
                cleanObjective &&
                cleanObjective.length > 3 &&
                !/^\d+$/.test(cleanObjective) &&
                !normClean.startsWith('objectif') &&
                !normClean.includes('specifique') &&
                !normClean.includes('moyen terme') &&
                !normClean.includes('vision carriere')
              ) {
                objectives.push(cleanObjective);
              }
            }
          } else if (hasFoundSmartTable && activeSmartCol !== -1) {
            // Continuation multi-pages sur la page suivante sans en-tête
            for (let r = 0; r < extractedGrid.length; r++) {
              let rawCellText = extractedGrid[r][activeSmartCol] || '';
              if ((/^\d+[\.\)\:\-]?$/.test(rawCellText.trim()) || !rawCellText.trim()) && extractedGrid[r].length > 1) {
                const altText = (extractedGrid[r][1] || '').trim();
                if (altText.length > 3 && !/^\d+$/.test(altText)) {
                  rawCellText = altText;
                }
              }

              const cleanObjective = rawCellText.replace(/^[\s\d]+[\.\)\:\-\n\s]+/, '').trim();
              const normClean = DriveObjectivesService.normalizeText(cleanObjective);
              if (
                cleanObjective &&
                cleanObjective.length > 3 &&
                !/^\d+$/.test(cleanObjective) &&
                !normClean.startsWith('objectif') &&
                !normClean.includes('specifique') &&
                !normClean.includes('moyen terme') &&
                !normClean.includes('vision carriere')
              ) {
                objectives.push(cleanObjective);
              }
            }
          }
        }
      }
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
