/**
 * Service pour la recherche et l'extraction des objectifs de l'année passée depuis Google Drive.
 * Dossier racine Entreprise : 1A2DLQku7fGLkV3XthSIi34pJ9TC-_2Bv
 */

export interface ExtractedObjectiveItem {
  objective: string;
  comments: string;
  reached: 'OUI' | 'NON' | 'PARTIEL';
}

export interface DriveImportResult {
  success: boolean;
  file?: {
    id: string;
    name: string;
    webViewLink?: string;
  };
  priorYear: number;
  objectives: ExtractedObjectiveItem[];
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
   * Extrait les objectifs de la table "Les objectifs pour l’année prochaine" depuis un Google Doc
   */
  static async extractFromGoogleDoc(accessToken: string, fileId: string): Promise<string[]> {
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
    let isInsideTargetSection = false;

    for (let i = 0; i < content.length; i++) {
      const element = content[i];

      // Vérifie si le paragraphe annonce les objectifs futurs
      if (element.paragraph) {
        const text = element.paragraph.elements
          ?.map((e: any) => e.textRun?.content || '')
          .join('')
          .toLowerCase() || '';

        if (text.includes('objectifs pour l’année prochaine') || text.includes("objectifs pour l'année prochaine")) {
          isInsideTargetSection = true;
        }
      }

      // Si une table apparaît
      if (element.table) {
        const tableRows = element.table.tableRows || [];
        if (tableRows.length > 0) {
          // Si nous sommes dans la section ciblée ou si la première ligne de la table est l'en-tête des objectifs
          const firstRowCells = tableRows[0].tableCells || [];
          const headerText = firstRowCells
            .map((c: any) =>
              (c.content || [])
                .map((p: any) => (p.paragraph?.elements || []).map((e: any) => e.textRun?.content || '').join(''))
                .join(' ')
            )
            .join(' ')
            .toLowerCase();

          const isObjectivesTable =
            isInsideTargetSection ||
            headerText.includes('objectif') ||
            headerText.includes('bénéfice') ||
            headerText.includes('indicateur');

          if (isObjectivesTable) {
            // Parcourir chaque ligne après l'en-tête (index 1+)
            for (let r = 1; r < tableRows.length; r++) {
              const cells = tableRows[r].tableCells || [];
              if (cells.length > 0) {
                // La 1ère colonne est l'objectif
                const objectiveCellText = (cells[0].content || [])
                  .map((p: any) => (p.paragraph?.elements || []).map((e: any) => e.textRun?.content || '').join(''))
                  .join(' ')
                  .trim();

                // Filtrer les chaînes vides et en-têtes parasites
                if (
                  objectiveCellText &&
                  objectiveCellText.length > 2 &&
                  !objectiveCellText.toLowerCase().startsWith('objectif')
                ) {
                  objectives.push(objectiveCellText);
                }
              }
            }

            // Si on a extrait les objectifs, on s'arrête
            if (objectives.length > 0) break;
          }
        }
      }
    }

    return objectives;
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

      // 3. Extraction selon le type
      if (file.mimeType === 'application/vnd.google-apps.document') {
        extractedTexts = await this.extractFromGoogleDoc(accessToken, file.id);
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
      }

      if (extractedTexts.length === 0) {
        throw new Error(
          `Le document "${file.name}" a été trouvé, mais aucun objectif n'a pu être extrait du tableau "Les objectifs pour l’année prochaine".`
        );
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
          webViewLink: file.webViewLink
        },
        priorYear,
        objectives: formattedObjectives
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
}
