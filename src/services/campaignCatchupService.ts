import * as XLSX from 'xlsx';
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  serverTimestamp,
  writeBatch,
  query
} from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { 
  Dossier, 
  JuryDecision, 
  EvaluationRelationType, 
  Campaign, 
  Personne,
  UserProfile
} from '../types';
import { cleanString, normalizeHeader, parseFrenchNumber } from './campaignInitializationService';

// Relations canoniques strictes incluant Coach et Logiclever
export const VALID_RELATION_TYPES: EvaluationRelationType[] = [
  'Auto_Evaluation',
  'Commerciale',
  'Encadrement',
  'Meteo_Client',
  'Coach',
  'Logiclever',
  'Coach Logiclever',
  'Collègue_Mission'
];

export interface ProfileReferenceItem {
  idProfil: string;
  matricule?: string;
  nom: string;
  prenom: string;
  displayName: string;
  email?: string;
  idProfilBoond?: string;
  entryDate?: string;
  expertGradeDate?: string;
}

export interface DeliberationParsedRow {
  rawRowIndex: number;
  matricule?: string;
  nom?: string;
  prenom?: string;
  nomPrenom?: string;
  experience?: string;
  resolvedIdProfil?: string;
  newGrade?: string;
  tjVendu0107?: number;
  tjCible?: number;
  salaire3006?: number;
  wishedSalary0107?: number;
  investPercent?: number;
  missionPercent?: number;
  proposedSalary0107?: number;
  maxSalaryIfTjVenduIncreases?: number;
  whyThisSalary?: string;
  whatToDoMore?: string;
  referentJury?: string;
  consultantFeeling?: string;
  secondTourFeedback?: string;
}

export interface EvaluationParsedRow {
  rawRowIndex: number;
  matricule?: string;
  experience?: string;
  tjVendu0107?: number;
  candidatePrenom?: string;
  candidateNom?: string;
  candidateName?: string;
  resolvedCandidateIdProfil?: string;
  grade?: string;
  client: string;
  project: string;
  evaluatorName?: string;
  evaluatorIdProfil?: string;
  rawTypeEvaluation: string;
  mappedRelationType?: EvaluationRelationType;
  requiresTypeConversion: boolean;
  tjCibleMin?: number;
  tjCibleMax?: number;
  justification?: string;
  improvementAxes?: string;
  confidenceIndex?: number;
}

export interface CatchupCandidateConflict {
  idProfil: string;
  matricule?: string;
  candidateName: string;
  existingDossierId?: string;
  dossierStatus: string;
  deliberationChanges: Record<string, { before: any; after: any }>;
  evaluationsToAdd: {
    client: string;
    project: string;
    evaluator: string;
    type: string;
    isUpdate: boolean;
  }[];
  warnings: string[];
}

export interface CatchupPreview {
  year: number;
  campaignId: string;
  campaignExists: boolean;
  campaignStatus?: string;
  totalProfilesReferenced: number;
  totalDeliberationsParsed: number;
  totalEvaluationsParsed: number;
  matchedCandidatesCount: number;
  unmatchedCandidatesCount: number;
  conflicts: CatchupCandidateConflict[];
  unresolvedDeliberations: { nomPrenom: string; matricule?: string }[];
  typeConversionWarnings: {
    rawType: string;
    count: number;
    explanation: string;
  }[];
  canProceed: boolean;
  blockingErrors: string[];
}

export interface CatchupApplyResult {
  success: boolean;
  campaignId: string;
  dossiersUpdatedCount: number;
  evaluationsUpdatedCount: number;
  evaluationsCreatedCount: number;
  preservedClosedStatus: boolean;
  errors: string[];
}

/**
 * Normalise un nom pour comparaison insensible aux accents, tirets et casse
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
 * Service de rattrapage / complétion de campagne historique
 * Basé sur l'extraction positionnelle exacte des colonnes
 */
export class CampaignCatchupService {
  /**
   * Mappage strict des types d'évaluation
   * Coach et Logiclever sont deux types distincts
   */
  static mapEvaluationType(rawType: string): { 
    relationType?: EvaluationRelationType; 
    requiresConversion: boolean; 
    explanation?: string 
  } {
    if (!rawType || cleanString(rawType) === '') {
      return { 
        relationType: 'Collègue_Mission', 
        requiresConversion: true, 
        explanation: 'Type vide dans la source, typé par défaut en Collègue_Mission.' 
      };
    }

    const clean = cleanString(rawType);
    const norm = normalizeHeader(clean);

    if (clean === 'Coach' || norm === 'coach') {
      return { relationType: 'Coach', requiresConversion: false };
    }
    if (clean === 'Logiclever' || norm === 'logiclever') {
      return { relationType: 'Logiclever', requiresConversion: false };
    }
    if (clean === 'Coach Logiclever' || norm === 'coach_logiclever') {
      return { relationType: 'Coach Logiclever', requiresConversion: false };
    }
    if (clean === 'Auto_Evaluation' || norm === 'auto_evaluation' || norm === 'auto_eval') {
      return { relationType: 'Auto_Evaluation', requiresConversion: false };
    }
    if (clean === 'Commerciale' || norm === 'commerciale' || norm === 'commerce') {
      return { relationType: 'Commerciale', requiresConversion: false };
    }
    if (clean === 'Encadrement' || norm === 'encadrement' || norm === 'manager') {
      return { relationType: 'Encadrement', requiresConversion: false };
    }
    if (clean === 'Meteo_Client' || norm === 'meteo_client' || norm === 'meteo') {
      return { relationType: 'Meteo_Client', requiresConversion: false };
    }
    if (clean === 'Collégue_Mission' || clean === 'Collègue_Mission' || norm === 'collegue_mission' || norm === 'collegue_en_mission' || norm === 'collegue') {
      return { relationType: 'Collègue_Mission', requiresConversion: false };
    }

    // Convert old COP & EPIC to Encadrement
    if (norm === 'cop_epic' || norm.includes('epic') || norm.includes('cop')) {
      return { 
        relationType: 'Encadrement', 
        requiresConversion: true, 
        explanation: 'Ancien libellé "COP & Epic" converti vers "Encadrement".' 
      };
    }

    return { 
      relationType: undefined, 
      requiresConversion: true, 
      explanation: `Libellé historique non reconnu "${clean}".` 
    };
  }

  /**
   * Parse le classeur Référentiel des Profils (BDD_LL_New_Drive -> feuille "Profil")
   * Colonnes exactes :
   * - Col A (index 0) : Id_Profil
   * - Col B (index 1) : Nom_Profil
   * - Col C (index 2) : Prenom_Profil
   */
  static async parseProfilesReferenceFile(file: File): Promise<ProfileReferenceItem[]> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });

    let targetSheetName = workbook.SheetNames.find(s => normalizeHeader(s) === 'profil' || normalizeHeader(s).includes('profil'));
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
      if (colA === 'id_profil' || colA === 'idprofil' || colA.includes('profil')) {
        headerRowIndex = i;
        break;
      }
    }

    const profiles: ProfileReferenceItem[] = [];

    for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
      const rowArr = rawMatrix[i];
      if (!rowArr || rowArr.length === 0) continue;

      // Col A (0) : Id_Profil
      const idProfil = cleanString(rowArr[0]);
      if (!idProfil) continue;

      // Col B (1) : Nom_Profil
      const nom = cleanString(rowArr[1]);
      // Col C (2) : Prenom_Profil
      const prenom = cleanString(rowArr[2]);

      let matricule = '';
      for (let c = 3; c < rowArr.length; c++) {
        const val = cleanString(rowArr[c]);
        const hName = normalizeHeader(String(rawMatrix[headerRowIndex]?.[c] || ''));
        if (hName.includes('matricule')) {
          matricule = val;
          break;
        }
      }

      const displayName = `${prenom} ${nom}`.trim() || nom || idProfil;

      profiles.push({
        idProfil,
        matricule: matricule || undefined,
        nom,
        prenom,
        displayName
      });
    }

    return profiles;
  }

  /**
   * Parse le classeur Analyse_Jury_Salaire -> feuille "Analyse_Jury"
   * En-tête à la deuxième ligne (index 1), Données dès la ligne 3 (index 2)
   * Colonnes exactes :
   * - Matricule : Col A (index 0)
   * - Prénom : Col B (index 1)
   * - Nom : Col C (index 2)
   * - Exp. : Col D (index 3)
   * - Nouveau Titre : Col I (index 8)
   * - TJ vendu (01/07) : Col J (index 9)
   * - Salaire au 30/06/... (TJ salaire) : Col P (index 15)
   */
  static async parseDeliberationFile(file: File): Promise<DeliberationParsedRow[]> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });

    let targetSheetName = workbook.SheetNames.find(s => {
      const norm = normalizeHeader(s);
      return norm === 'analyse_jury' || norm.includes('analyse') || norm.includes('jury');
    });

    if (!targetSheetName) {
      targetSheetName = workbook.SheetNames[0];
    }

    const worksheet = workbook.Sheets[targetSheetName];
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    if (!rawMatrix || rawMatrix.length === 0) return [];

    let headerRowIndex = 1;
    if (rawMatrix.length > 0) {
      for (let i = 0; i < Math.min(5, rawMatrix.length); i++) {
        const row = rawMatrix[i] || [];
        const normColA = normalizeHeader(String(row[0] || ''));
        if (normColA.includes('matricule')) {
          headerRowIndex = i;
          break;
        }
      }
    }

    const rows: DeliberationParsedRow[] = [];

    for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
      const rowArr = rawMatrix[i];
      if (!rowArr || rowArr.length === 0) continue;

      // Col A (index 0) : Matricule
      const matricule = cleanString(rowArr[0]);
      // Col B (index 1) : Prénom
      const prenom = cleanString(rowArr[1]);
      // Col C (index 2) : Nom
      const nom = cleanString(rowArr[2]);
      // Col D (index 3) : Exp.
      const experience = cleanString(rowArr[3]);

      const nomPrenom = `${prenom} ${nom}`.trim() || nom || prenom || '';
      if (!nomPrenom && !matricule) continue;

      // Col I (index 8) : "Nouveau Titre" (Grade textuel précis)
      const newGrade = cleanString(rowArr[8]);

      // Col J (index 9) : "TJ vendu (01/07)"
      const tjVendu0107 = parseFrenchNumber(rowArr[9]);

      // Col P (index 15) : "Salaire au 30/06/... (TJ salaire)"
      const salaire3006 = parseFrenchNumber(rowArr[15]);

      let proposedSalary0107: number | undefined = undefined;
      let wishedSalary0107: number | undefined = undefined;
      let tjCible: number | undefined = undefined;
      let whyThisSalary = '';
      let referentJury = '';

      for (let c = 0; c < rowArr.length; c++) {
        const h = normalizeHeader(String(rawMatrix[headerRowIndex]?.[c] || ''));
        if (h.includes('propose') && !h.includes('max')) {
          proposedSalary0107 = parseFrenchNumber(rowArr[c]);
        } else if (h.includes('souhaite') || h.includes('pretention')) {
          wishedSalary0107 = parseFrenchNumber(rowArr[c]);
        } else if (h === 'tj_cible' || (h.includes('tj') && h.includes('cible'))) {
          tjCible = parseFrenchNumber(rowArr[c]);
        } else if (h.includes('pourquoi') || h.includes('justification')) {
          whyThisSalary = cleanString(rowArr[c]);
        } else if (h.includes('referent') || h.includes('jury')) {
          referentJury = cleanString(rowArr[c]);
        }
      }

      rows.push({
        rawRowIndex: i + 1,
        matricule: matricule || undefined,
        prenom: prenom || undefined,
        nom: nom || undefined,
        nomPrenom: nomPrenom || undefined,
        experience: experience || undefined,
        newGrade: newGrade || undefined,
        tjVendu0107: tjVendu0107 || undefined,
        salaire3006: salaire3006 || undefined,
        proposedSalary0107: proposedSalary0107 || undefined,
        wishedSalary0107: wishedSalary0107 || undefined,
        tjCible: tjCible || undefined,
        whyThisSalary: whyThisSalary || undefined,
        referentJury: referentJury || undefined
      });
    }

    return rows;
  }

  /**
   * Parse la feuille "TJ Cible" (dans Analyse_Jury_Salaires)
   * Colonnes exactes :
   * - Col A (0) : Matricule
   * - Col B (1) : Exp
   * - Col C (2) : TJ_Vendu (01/07)
   * - Col D (3) : Prénom
   * - Col E (4) : Nom
   * - Col F (5) : Grade
   * - Col G (6) : Client
   * - Col H (7) : Projet
   * - Col I (8) : Evaluateur
   * - Col J à P : Relations (Auto_Evaluation, Commerciale, Encadrement, Meteo_Client, Coach, Logiclever, Collégue_Mission)
   */
  static async parseEvaluationsFile(file: File): Promise<EvaluationParsedRow[]> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });

    let targetSheetName = workbook.SheetNames.find(s => {
      const norm = normalizeHeader(s);
      return norm === 'tj_cible' || norm.includes('cible') || norm.includes('eval');
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
      const normColA = normalizeHeader(String(row[0] || ''));
      if (normColA.includes('matricule')) {
        headerRowIndex = i;
        break;
      }
    }

    const rows: EvaluationParsedRow[] = [];

    for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
      const rowArr = rawMatrix[i];
      if (!rowArr || rowArr.length === 0) continue;

      // Col A (0) : Matricule
      const matricule = cleanString(rowArr[0]);
      // Col B (1) : Exp
      const experience = cleanString(rowArr[1]);
      // Col C (2) : TJ_Vendu (01/07)
      const tjVendu0107 = parseFrenchNumber(rowArr[2]);
      // Col D (3) : Prénom
      const candidatePrenom = cleanString(rowArr[3]);
      // Col E (4) : Nom
      const candidateNom = cleanString(rowArr[4]);
      const candidateName = `${candidatePrenom} ${candidateNom}`.trim() || candidateNom || candidatePrenom || '';
      if (!candidateName && !matricule) continue;

      // Col F (5) : Grade
      const grade = cleanString(rowArr[5]);
      // Col G (6) : Client
      const client = cleanString(rowArr[6]) || 'Client Historique';
      // Col H (7) : Projet
      const project = cleanString(rowArr[7]) || 'Mission Historique';
      // Col I (8) : Evaluateur
      const evaluatorName = cleanString(rowArr[8]);

      // Détecter le type de relation d'après les colonnes J à P
      const isChecked = (colIdx: number) => {
        const val = cleanString(rowArr[colIdx]).toLowerCase();
        return val === 'x' || val === '1' || val === 'oui' || val === 'true' || val === 'vrai';
      };

      let detectedType: EvaluationRelationType = 'Collègue_Mission';
      if (isChecked(9)) detectedType = 'Auto_Evaluation';
      else if (isChecked(10)) detectedType = 'Commerciale';
      else if (isChecked(11)) detectedType = 'Encadrement';
      else if (isChecked(12)) detectedType = 'Meteo_Client';
      else if (isChecked(13)) detectedType = 'Coach';
      else if (isChecked(14)) detectedType = 'Logiclever';
      else if (isChecked(15)) detectedType = 'Collègue_Mission';

      let tjCibleMin: number | undefined;
      let tjCibleMax: number | undefined;
      let justification = '';
      let improvementAxes = '';

      for (let c = 16; c < rowArr.length; c++) {
        const h = normalizeHeader(String(rawMatrix[headerRowIndex]?.[c] || ''));
        if (h.includes('min') && h.includes('tj')) tjCibleMin = parseFrenchNumber(rowArr[c]);
        else if (h.includes('max') && h.includes('tj')) tjCibleMax = parseFrenchNumber(rowArr[c]);
        else if (h.includes('justification') || h.includes('argumentaire')) justification = cleanString(rowArr[c]);
        else if (h.includes('axe') || h.includes('augmenter')) improvementAxes = cleanString(rowArr[c]);
      }

      rows.push({
        rawRowIndex: i + 1,
        matricule: matricule || undefined,
        experience: experience || undefined,
        tjVendu0107: tjVendu0107 || undefined,
        candidatePrenom: candidatePrenom || undefined,
        candidateNom: candidateNom || undefined,
        candidateName: candidateName || undefined,
        grade: grade || undefined,
        client,
        project,
        evaluatorName: evaluatorName || undefined,
        rawTypeEvaluation: detectedType,
        mappedRelationType: detectedType,
        requiresTypeConversion: false,
        tjCibleMin: tjCibleMin || undefined,
        tjCibleMax: tjCibleMax || undefined,
        justification: justification || undefined,
        improvementAxes: improvementAxes || undefined,
        confidenceIndex: 5
      });
    }

    return rows;
  }

  /**
   * Analyse et prévisualise l'ensemble des modifications sans écriture
   * Rapproche Analyse_Jury et TJ Cible avec les profils de référence via Matricule ou Nom/Prénom
   */
  static async previewCatchup(
    year: number,
    profilesRef: ProfileReferenceItem[],
    deliberations: DeliberationParsedRow[],
    evaluations: EvaluationParsedRow[]
  ): Promise<CatchupPreview> {
    const campaignId = `campaign_${year}`;

    // 1. Vérifier si la campagne existe
    let campaignExists = false;
    let campaignStatus: string | undefined = undefined;
    try {
      const campDoc = await getDoc(doc(db, 'campaigns', campaignId));
      campaignExists = campDoc.exists();
      const campData = campaignExists ? (campDoc.data() as Campaign) : undefined;
      campaignStatus = campData?.status;
    } catch (e) {
      console.warn("Could not fetch campaign doc:", e);
    }

    // 2. Index de réconciliation unifié (Matricule, Nom/Prénom, Id_Profil)
    const profileByIdProfil = new Map<string, ProfileReferenceItem>();
    const profileByMatricule = new Map<string, ProfileReferenceItem>();
    const profileByName = new Map<string, ProfileReferenceItem>();

    profilesRef.forEach(p => {
      profileByIdProfil.set(p.idProfil.trim().toUpperCase(), p);
      if (p.matricule) {
        profileByMatricule.set(p.matricule.trim().toUpperCase(), p);
      }
      const normName = normalizePersonName(p.displayName || `${p.nom} ${p.prenom}`);
      if (normName) {
        profileByName.set(normName, p);
      }
      const normInverted = normalizePersonName(`${p.prenom} ${p.nom}`);
      if (normInverted) {
        profileByName.set(normInverted, p);
      }
    });

    try {
      const personnesSnap = await getDocs(collection(db, 'personnes'));
      personnesSnap.docs.forEach(d => {
        const p = { ...d.data(), idProfil: d.id } as Personne;
        const normId = p.idProfil.trim().toUpperCase();
        if (!profileByIdProfil.has(normId)) {
          const item: ProfileReferenceItem = {
            idProfil: p.idProfil,
            matricule: p.matricule,
            nom: p.nom,
            prenom: p.prenom,
            displayName: p.displayName || `${p.prenom} ${p.nom}`,
            email: p.email
          };
          profileByIdProfil.set(normId, item);
          if (p.matricule) {
            profileByMatricule.set(p.matricule.trim().toUpperCase(), item);
          }
          const n1 = normalizePersonName(p.displayName || `${p.nom} ${p.prenom}`);
          if (n1) profileByName.set(n1, item);
          const n2 = normalizePersonName(`${p.prenom} ${p.nom}`);
          if (n2) profileByName.set(n2, item);
        }
      });
    } catch (e) {
      console.warn("Could not fetch personnes collection:", e);
    }

    // 3. Charger les dossiers existants de cette campagne
    const campaignDossiersMap = new Map<string, Dossier>();
    try {
      const dossiersSnap = await getDocs(query(collection(db, 'dossiers')));
      const allDossiers: Dossier[] = dossiersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Dossier));
      
      allDossiers.forEach(d => {
        const dYear = d.campaignYear || (d.campaignId ? parseInt(d.campaignId.replace('campaign_', '')) : 0);
        if (dYear === year || d.campaignId === campaignId) {
          if (d.idProfil) campaignDossiersMap.set(d.idProfil.trim().toUpperCase(), d);
          if (d.candidateId) campaignDossiersMap.set(d.candidateId.trim().toUpperCase(), d);
        }
      });
    } catch (e) {
      console.warn("Could not fetch dossiers collection:", e);
    }

    // 4. Fonction de résolution du Id_Profil
    const resolveIdProfil = (matricule?: string, name?: string, explicitId?: string): ProfileReferenceItem | undefined => {
      if (explicitId && profileByIdProfil.has(explicitId.trim().toUpperCase())) {
        return profileByIdProfil.get(explicitId.trim().toUpperCase());
      }
      if (matricule && profileByMatricule.has(matricule.trim().toUpperCase())) {
        return profileByMatricule.get(matricule.trim().toUpperCase());
      }
      if (name) {
        const norm = normalizePersonName(name);
        if (profileByName.has(norm)) {
          return profileByName.get(norm);
        }
      }
      return undefined;
    };

    // 5. Réconcilier les lignes de Délibération (Analyse_Jury)
    const unresolvedDeliberations: { nomPrenom: string; matricule?: string }[] = [];
    deliberations.forEach(d => {
      const match = resolveIdProfil(d.matricule, d.nomPrenom || `${d.prenom} ${d.nom}`, d.resolvedIdProfil);
      if (match) {
        d.resolvedIdProfil = match.idProfil;
      } else {
        unresolvedDeliberations.push({
          nomPrenom: d.nomPrenom || `${d.prenom} ${d.nom}` || 'Inconnu',
          matricule: d.matricule
        });
      }
    });

    // 6. Réconcilier les lignes d'Évaluation (TJ Cible)
    evaluations.forEach(e => {
      const match = resolveIdProfil(e.matricule, e.candidateName, e.resolvedCandidateIdProfil);
      if (match) {
        e.resolvedCandidateIdProfil = match.idProfil;
      }
    });

    // 7. Rassembler tous les Id_Profil réconciliés
    const allResolvedIdProfils = new Set<string>();
    deliberations.forEach(d => {
      if (d.resolvedIdProfil) allResolvedIdProfils.add(d.resolvedIdProfil.trim().toUpperCase());
    });
    evaluations.forEach(e => {
      if (e.resolvedCandidateIdProfil) allResolvedIdProfils.add(e.resolvedCandidateIdProfil.trim().toUpperCase());
    });

    const conflicts: CatchupCandidateConflict[] = [];

    // 8. Construire les conflits et changements prévus par candidat
    allResolvedIdProfils.forEach(idProfilNorm => {
      const delib = deliberations.find(d => d.resolvedIdProfil && d.resolvedIdProfil.trim().toUpperCase() === idProfilNorm);
      const candidateEvals = evaluations.filter(e => e.resolvedCandidateIdProfil && e.resolvedCandidateIdProfil.trim().toUpperCase() === idProfilNorm);
      
      const profileItem = profileByIdProfil.get(idProfilNorm);
      const existingDossier = campaignDossiersMap.get(idProfilNorm);

      const candidateName = profileItem?.displayName || delib?.nomPrenom || candidateEvals[0]?.candidateName || `Profil ${idProfilNorm}`;
      const matricule = profileItem?.matricule || delib?.matricule;

      const deliberationChanges: Record<string, { before: any; after: any }> = {};
      const warnings: string[] = [];

      if (delib) {
        const existingDecision: Partial<JuryDecision> = existingDossier?.juryDecision || {};

        if (delib.proposedSalary0107 !== undefined) {
          deliberationChanges['proposedSalary0107'] = {
            before: existingDecision.proposedSalary0107 || existingDecision.amount || 0,
            after: delib.proposedSalary0107
          };
        }
        if (delib.tjVendu0107 !== undefined) {
          deliberationChanges['tjVendu0107'] = {
            before: existingDecision.tjVendu0107 || existingDossier?.annualReport?.currentTJM || 0,
            after: delib.tjVendu0107
          };
        }
        if (delib.tjCible !== undefined) {
          deliberationChanges['tjCible'] = {
            before: existingDecision.tjCibleDecision || existingDossier?.annualReport?.targetTJM || 0,
            after: delib.tjCible
          };
        }
        if (delib.newGrade) {
          deliberationChanges['newGrade'] = {
            before: existingDecision.gradeDecision || '',
            after: delib.newGrade
          };
        }
        if (delib.salaire3006 !== undefined) {
          deliberationChanges['salaire3006'] = {
            before: existingDecision.salaire3006 || 0,
            after: delib.salaire3006
          };
        }
      }

      const evaluationsToAdd = candidateEvals.map(e => {
        const existingEvalEntries = Object.entries(existingDossier?.consultantFeedbacks || {});
        const isUpdate = existingEvalEntries.some(([_, ef]) => {
          const evalMatch = (ef.evaluatorIdProfil && ef.evaluatorIdProfil === e.evaluatorIdProfil) || ef.consultantId === e.evaluatorIdProfil;
          return evalMatch && (ef.client || '').toLowerCase() === e.client.toLowerCase() && (ef.project || '').toLowerCase() === e.project.toLowerCase();
        });

        return {
          client: e.client,
          project: e.project,
          evaluator: e.evaluatorName || e.evaluatorIdProfil || 'Jury',
          type: e.mappedRelationType || e.rawTypeEvaluation,
          isUpdate
        };
      });

      conflicts.push({
        idProfil: idProfilNorm,
        matricule,
        candidateName,
        existingDossierId: existingDossier?.id,
        dossierStatus: existingDossier?.status || 'NON_CREE',
        deliberationChanges,
        evaluationsToAdd,
        warnings
      });
    });

    const blockingErrors: string[] = [];
    if (deliberations.length === 0 && evaluations.length === 0) {
      blockingErrors.push("Aucune ligne de délibération ou d'évaluation n'a pu être extraite.");
    }

    return {
      year,
      campaignId,
      campaignExists,
      campaignStatus,
      totalProfilesReferenced: profilesRef.length,
      totalDeliberationsParsed: deliberations.length,
      totalEvaluationsParsed: evaluations.length,
      matchedCandidatesCount: conflicts.length,
      unmatchedCandidatesCount: unresolvedDeliberations.length,
      conflicts,
      unresolvedDeliberations,
      typeConversionWarnings: [],
      canProceed: blockingErrors.length === 0,
      blockingErrors
    };
  }

  /**
   * Applique le rattrapage avec écriture dans LocalStorage
   * Enregistre les dossiers par lots dans la base locale.
   */
  static async applyCatchup(
    preview: CatchupPreview,
    profilesRef: ProfileReferenceItem[],
    deliberations: DeliberationParsedRow[],
    evaluations: EvaluationParsedRow[],
    adminUser?: UserProfile | null
  ): Promise<CatchupApplyResult> {
    const adminName = adminUser?.displayName || 'Administrateur';
    let preservedClosedStatus = false;

    // 1. Initialiser ou préserver la campagne
    const campaignRef = doc(db, 'campaigns', preview.campaignId);
    if (!preview.campaignExists) {
      const newCamp: Campaign = {
        id: preview.campaignId,
        year: preview.year,
        title: `Campagne Historique ${preview.year}`,
        status: 'OUVERTE',
        rhDocuments: [],
        pairsDocuments: [],
        otherDocuments: [],
        createdAt: serverTimestamp(),
        createdBy: adminName
      };
      const b = writeBatch(db);
      b.set(campaignRef, newCamp);
      await b.commit();
    } else if (preview.campaignStatus === 'CLÔTURÉE') {
      preservedClosedStatus = true;
      const b = writeBatch(db);
      b.update(campaignRef, { updatedAt: serverTimestamp() });
      await b.commit();
    }

    // 2. Synchroniser les profils personnes par lots de 250
    if (profilesRef.length > 0) {
      for (let i = 0; i < profilesRef.length; i += 250) {
        const batch = writeBatch(db);
        const chunk = profilesRef.slice(i, i + 250);
        for (const p of chunk) {
          const personneRef = doc(db, 'personnes', p.idProfil);
          batch.set(personneRef, {
            idProfil: p.idProfil,
            matricule: p.matricule || '',
            nom: p.nom || '',
            prenom: p.prenom || '',
            displayName: p.displayName || `${p.prenom} ${p.nom}`,
            statut: 'ACTIF',
            type: 'COLLABORATEUR',
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
        await batch.commit();
      }
    }

    // 3. Charger les dossiers existants
    const allDossiersMap = new Map<string, Dossier>();
    try {
      const dossiersSnap = await getDocs(collection(db, 'dossiers'));
      dossiersSnap.docs.forEach(d => {
        const data = { ...d.data(), id: d.id } as Dossier;
        const dYear = data.campaignYear || (data.campaignId ? parseInt(data.campaignId.replace('campaign_', '')) : 0);
        if (dYear === preview.year || data.campaignId === preview.campaignId) {
          if (data.idProfil) allDossiersMap.set(data.idProfil.trim().toUpperCase(), data);
          if (data.candidateId) allDossiersMap.set(data.candidateId.trim().toUpperCase(), data);
        }
      });
    } catch (e) {
      console.warn("Could not fetch existing dossiers:", e);
    }

    const profileMap = new Map<string, ProfileReferenceItem>();
    profilesRef.forEach(p => {
      profileMap.set(p.idProfil.trim().toUpperCase(), p);
    });

    let dossiersUpdatedCount = 0;
    let evaluationsUpdatedCount = 0;
    let evaluationsCreatedCount = 0;

    // 4. Mettre à jour les dossiers par lots de 150
    for (let i = 0; i < preview.conflicts.length; i += 150) {
      const batch = writeBatch(db);
      const chunk = preview.conflicts.slice(i, i + 150);

      for (const conflict of chunk) {
        const idProfilNorm = conflict.idProfil;
        const deliberation = deliberations.find(d => d.resolvedIdProfil && d.resolvedIdProfil.trim().toUpperCase() === idProfilNorm);
        const candidateEvals = evaluations.filter(e => e.resolvedCandidateIdProfil && e.resolvedCandidateIdProfil.trim().toUpperCase() === idProfilNorm);

        const profileItem = profileMap.get(idProfilNorm);
        const existingDossier = allDossiersMap.get(idProfilNorm);

        const dossierId = existingDossier?.id || `${idProfilNorm}_${preview.year}`;
        const dossierRef = doc(db, 'dossiers', dossierId);

        const existingDecision = existingDossier?.juryDecision || ({} as JuryDecision);
        const updatedDecision: JuryDecision = {
          ...existingDecision,
          verdict: existingDecision.verdict || (deliberation?.proposedSalary0107 ? `Augmentation ${preview.year}` : 'Délibéré'),
          amount: deliberation?.proposedSalary0107 ?? existingDecision.amount ?? 0,
          percentage: existingDecision.percentage ?? 0,
          advice: existingDecision.advice ?? '',
          conclusion: existingDecision.conclusion ?? '',
          date: existingDecision.date || serverTimestamp(),
          unanimous: existingDecision.unanimous ?? true,
          ...(deliberation?.newGrade ? { gradeDecision: deliberation.newGrade } : {}),
          ...(deliberation?.tjVendu0107 !== undefined ? { tjVendu0107: deliberation.tjVendu0107 } : {}),
          ...(deliberation?.tjCible !== undefined ? { tjCibleDecision: deliberation.tjCible } : {}),
          ...(deliberation?.salaire3006 !== undefined ? { salaire3006: deliberation.salaire3006 } : {}),
          ...(deliberation?.proposedSalary0107 !== undefined ? { proposedSalary0107: deliberation.proposedSalary0107 } : {}),
          ...(deliberation?.whyThisSalary ? { whyThisSalary: deliberation.whyThisSalary } : {}),
          ...(deliberation?.referentJury ? { referentJury: deliberation.referentJury } : {})
        };

        const existingFeedbacks = { ...(existingDossier?.consultantFeedbacks || {}) };

        candidateEvals.forEach(e => {
          const existingKey = Object.keys(existingFeedbacks).find(k => {
            const ef = existingFeedbacks[k];
            const evalMatch = (ef.evaluatorIdProfil && ef.evaluatorIdProfil === e.evaluatorIdProfil) || ef.consultantId === e.evaluatorIdProfil;
            return evalMatch && (ef.client || '').toLowerCase() === e.client.toLowerCase() && (ef.project || '').toLowerCase() === e.project.toLowerCase();
          });

          const feedbackId = existingKey || `eval_${e.evaluatorIdProfil || 'jury'}_${encodeURIComponent(e.client)}_${Date.now()}`;
          const prevFeedback = existingKey ? existingFeedbacks[existingKey] : undefined;

          if (existingKey) {
            evaluationsUpdatedCount++;
          } else {
            evaluationsCreatedCount++;
          }

          const mappedType = e.mappedRelationType || 'Collègue_Mission';

          existingFeedbacks[feedbackId] = {
            id: feedbackId,
            consultantId: e.evaluatorIdProfil || 'ANONYME',
            consultantName: e.evaluatorName || e.evaluatorIdProfil || 'Jury',
            evaluatorIdProfil: e.evaluatorIdProfil || 'ANONYME',
            type: mappedType,
            relationType: mappedType,
            campaignId: preview.campaignId,
            client: e.client,
            project: e.project,
            targetTJMin: e.tjCibleMin ?? prevFeedback?.targetTJMin ?? 0,
            targetTJMax: e.tjCibleMax ?? prevFeedback?.targetTJMax ?? 0,
            confidenceIndex: e.confidenceIndex ?? prevFeedback?.confidenceIndex ?? 5,
            justification: e.justification || prevFeedback?.justification || '',
            improvementAxes: e.improvementAxes || prevFeedback?.improvementAxes || '',
            status: 'VALIDE',
            validated: true,
            isLegacyType: e.requiresTypeConversion,
            updatedAt: new Date().toISOString()
          };
        });

        const finalStatus = existingDossier?.status || (deliberation ? 'VALIDE' : 'OUVERT');

        const dossierPayload: Partial<Dossier> = {
          id: dossierId,
          idProfil: idProfilNorm,
          candidateId: existingDossier?.candidateId || idProfilNorm,
          candidateName: existingDossier?.candidateName || profileItem?.displayName || conflict.candidateName,
          candidateEmail: existingDossier?.candidateEmail || profileItem?.email || '',
          campaignId: preview.campaignId,
          campaignYear: preview.year,
          status: finalStatus,
          juryDecision: updatedDecision,
          consultantFeedbacks: existingFeedbacks,
          updatedAt: serverTimestamp(),
          createdAt: existingDossier?.createdAt || serverTimestamp()
        };

        batch.set(dossierRef, dossierPayload, { merge: true });
        dossiersUpdatedCount++;
      }

      await batch.commit();
    }

    return {
      success: true,
      campaignId: preview.campaignId,
      dossiersUpdatedCount,
      evaluationsUpdatedCount,
      evaluationsCreatedCount,
      preservedClosedStatus,
      errors: []
    };
  }
}
