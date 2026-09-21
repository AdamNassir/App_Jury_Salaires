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
  UserProfile,
  UserRole,
  Grade,
  AnnualReport,
  CampaignParticipant
} from '../types';
import { cleanString, normalizeHeader, parseFrenchNumber } from './campaignInitializationService';
import { UserDirectoryService } from './userDirectoryService';
import { LocalDatabaseService } from './localDatabaseService';

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
  grade?: string;
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
  entryDate?: string;
  expertGradeDate?: string;
  ancienneteLL?: string | number;
  yearsExpert?: string | number;
  newGrade?: string;
  tjVendu0107?: number;
  tjCible?: number;
  salaire3006?: number;
  wishedSalary0107?: number;
  investPercent?: number;
  missionPercent?: number;
  proposedSalaryPercent0107?: number;
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
  evaluatorMatricule?: string;
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

    let targetSheetName = workbook.SheetNames.find(s => {
      const norm = normalizeHeader(s);
      return norm === 'profils' || norm === 'profil' || norm.includes('profil');
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
      if (colA === 'id_profil' || colA === 'idprofil' || colA.includes('profil')) {
        headerRowIndex = i;
        break;
      }
    }

    const profiles: ProfileReferenceItem[] = [];

    for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
      const rowArr = rawMatrix[i];
      if (!rowArr || rowArr.length === 0) continue;

      // Col A (index 0) : Id_Profil
      const idProfil = cleanString(rowArr[0]);
      if (!idProfil) continue;

      // Col B (index 1) : Nom_Profil
      const nom = cleanString(rowArr[1]);
      // Col C (index 2) : Prenom_Profil
      const prenom = cleanString(rowArr[2]);

      // Col H (index 7) : Matricule (selon classeur BDD_Profils, onglet Profils)
      let matricule = cleanString(rowArr[7]);
      let email = '';

      for (let c = 3; c < rowArr.length; c++) {
        const val = cleanString(rowArr[c]);
        const hName = normalizeHeader(String(rawMatrix[headerRowIndex]?.[c] || ''));
        if (!matricule && hName.includes('matricule')) {
          matricule = val;
        }
        if (!email && (hName.includes('mail') || val.includes('@'))) {
          email = val.toLowerCase();
        }
      }

      if (!email && (prenom || nom)) {
        const normP = prenom.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normN = nom.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normP && normN) {
          email = `${normP}.${normN}@logiclever.com`;
        }
      }

      const displayName = `${prenom} ${nom}`.trim() || nom || idProfil;

      profiles.push({
        idProfil,
        matricule: matricule || undefined,
        nom,
        prenom,
        displayName,
        email: email || undefined
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

      // Col A (index 0) : "Matricule"
      const matricule = cleanString(rowArr[0]);
      // Col B (index 1) : "Prénom"
      const prenom = cleanString(rowArr[1]);
      // Col C (index 2) : "Nom"
      const nom = cleanString(rowArr[2]);
      // Col D (index 3) : "Exp.", total experience
      const experience = cleanString(rowArr[3]);
      // Col E (index 4) : "Date entrée LL"
      const entryDate = cleanString(rowArr[4]);
      // Col F (index 5) : "Date de passage au grade expert (si concerné)"
      const expertGradeDate = cleanString(rowArr[5]);
      // Col G (index 6) : "Ancienneté chez LL"
      const ancienneteLL = cleanString(rowArr[6]);
      // Col H (index 7) : "Année en tant qu'expert"
      const yearsExpert = cleanString(rowArr[7]);

      const nomPrenom = `${prenom} ${nom}`.trim() || nom || prenom || '';
      if (!nomPrenom && !matricule) continue;

      // Col J (index 9) : "Nouveau Titre" (Grade)
      const newGrade = cleanString(rowArr[9]) || cleanString(rowArr[8]);

      // Col K (index 10) : "TJ vendu (01/07)"
      const tjVendu0107 = parseFrenchNumber(rowArr[10]) ?? parseFrenchNumber(rowArr[9]);

      // Col M (index 12) : "TJ Cible"
      const tjCible = parseFrenchNumber(rowArr[12]);

      // Col P (index 15) : "Salaire au 30/06/2025 (TJ salaire)"
      const salaire3006 = parseFrenchNumber(rowArr[15]);

      // Col R (index 17) : "Salaire souhaité au 01/07/2026"
      const wishedSalary0107 = parseFrenchNumber(rowArr[17]);

      // Col U (index 20) : "% Investissement"
      const investPercent = parseFrenchNumber(rowArr[20]);

      // Col V (index 21) : "% Mission"
      const missionPercent = parseFrenchNumber(rowArr[21]);

      // Col W (index 22) : "% Salaire proposé au 01/07"
      const proposedSalaryPercent0107 = parseFrenchNumber(rowArr[22]);

      // Col AD (index 29) : "Salaire MAX proposé si TJ augmente"
      const maxSalaryIfTjVenduIncreases = parseFrenchNumber(rowArr[29]);

      // Col AF (index 31) : "Pourquoi ce salaire proposé"
      const whyThisSalary = cleanString(rowArr[31]);

      // Col AG (index 32) : "Ce qu'il faut faire pour avoir plus"
      const whatToDoMore = cleanString(rowArr[32]);

      // Col AH (index 33) : "Référent Jury de salaire"
      const referentJury = cleanString(rowArr[33]);

      // Col AI (index 34) : "Ressenti consultant"
      const consultantFeeling = cleanString(rowArr[34]);

      // Col AJ (index 35) : "Retour Second tour"
      const secondTourFeedback = cleanString(rowArr[35]);

      // Détection de secours par en-têtes si décalage de colonnes
      let proposedSalary0107Val: number | undefined = undefined;
      for (let c = 0; c < rowArr.length; c++) {
        const h = normalizeHeader(String(rawMatrix[headerRowIndex]?.[c] || ''));
        if (h.includes('propose') && !h.includes('max') && !h.includes('%') && proposedSalary0107Val === undefined) {
          const val = parseFrenchNumber(rowArr[c]);
          if (val && val > 1000) proposedSalary0107Val = val;
        }
      }

      rows.push({
        rawRowIndex: i + 1,
        matricule: matricule || undefined,
        prenom: prenom || undefined,
        nom: nom || undefined,
        nomPrenom: nomPrenom || undefined,
        experience: experience || undefined,
        entryDate: entryDate || undefined,
        expertGradeDate: expertGradeDate || undefined,
        ancienneteLL: ancienneteLL || undefined,
        yearsExpert: yearsExpert || undefined,
        newGrade: newGrade || undefined,
        tjVendu0107: tjVendu0107 || undefined,
        tjCible: tjCible || undefined,
        salaire3006: salaire3006 || undefined,
        wishedSalary0107: wishedSalary0107 || undefined,
        investPercent: investPercent || undefined,
        missionPercent: missionPercent || undefined,
        proposedSalaryPercent0107: proposedSalaryPercent0107 || undefined,
        proposedSalary0107: proposedSalary0107Val || undefined,
        maxSalaryIfTjVenduIncreases: maxSalaryIfTjVenduIncreases || undefined,
        whyThisSalary: whyThisSalary || undefined,
        whatToDoMore: whatToDoMore || undefined,
        referentJury: referentJury || undefined,
        consultantFeeling: consultantFeeling || undefined,
        secondTourFeedback: secondTourFeedback || undefined
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
      // Col I (8) : Matricule de l'évaluateur (dans la feuille TJ Cible)
      const rawEvaluatorColI = cleanString(rowArr[8]);
      const evaluatorMatricule = rawEvaluatorColI;
      const evaluatorName = rawEvaluatorColI;

      // Détecter le type de relation d'après les colonnes J à P
      const isChecked = (colIdx: number) => {
        const val = cleanString(rowArr[colIdx]).toLowerCase();
        return val === 'x' || val === '1' || val === 'oui' || val === 'true' || val === 'vrai' || val.length > 0;
      };

      let detectedType: EvaluationRelationType = 'Collègue_Mission';
      if (isChecked(9)) detectedType = 'Auto_Evaluation';
      else if (isChecked(10)) detectedType = 'Commerciale';
      else if (isChecked(11)) detectedType = 'Encadrement';
      else if (isChecked(12)) detectedType = 'Meteo_Client';
      else if (isChecked(13)) detectedType = 'Coach';
      else if (isChecked(14)) detectedType = 'Logiclever';
      else if (isChecked(15)) detectedType = 'Collègue_Mission';

      // Col S (index 18) : "TJ Cible Min"
      let tjCibleMin = parseFrenchNumber(rowArr[18]);
      // Col T (index 19) : "TJ Cible Max"
      let tjCibleMax = parseFrenchNumber(rowArr[19]);
      // Col U (index 20) : "Justification TJ Cible"
      let justification = cleanString(rowArr[20]);
      // Col V (index 21) : "Axes pour augmenter le TJ"
      let improvementAxes = cleanString(rowArr[21]);
      // Col W (index 22) : "Indice de confiance"
      let confidenceIndex = parseFrenchNumber(rowArr[22]);

      // Recherche de secours par en-têtes si décalage
      for (let c = 16; c < rowArr.length; c++) {
        const h = normalizeHeader(String(rawMatrix[headerRowIndex]?.[c] || ''));
        if (h.includes('min') && h.includes('tj') && tjCibleMin === undefined) tjCibleMin = parseFrenchNumber(rowArr[c]);
        else if (h.includes('max') && h.includes('tj') && tjCibleMax === undefined) tjCibleMax = parseFrenchNumber(rowArr[c]);
        else if ((h.includes('justification') || h.includes('argumentaire')) && !justification) justification = cleanString(rowArr[c]);
        else if ((h.includes('axe') || h.includes('augmenter')) && !improvementAxes) improvementAxes = cleanString(rowArr[c]);
        else if ((h.includes('confiance') || h.includes('indice')) && confidenceIndex === undefined) confidenceIndex = parseFrenchNumber(rowArr[c]);
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
        evaluatorMatricule: evaluatorMatricule || undefined,
        rawTypeEvaluation: detectedType,
        mappedRelationType: detectedType,
        requiresTypeConversion: false,
        tjCibleMin: tjCibleMin || undefined,
        tjCibleMax: tjCibleMax || undefined,
        justification: justification || undefined,
        improvementAxes: improvementAxes || undefined,
        confidenceIndex: confidenceIndex !== undefined && !isNaN(confidenceIndex) ? confidenceIndex : 5
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
      // Candidat
      const matchCandidate = resolveIdProfil(e.matricule, e.candidateName, e.resolvedCandidateIdProfil);
      if (matchCandidate) {
        e.resolvedCandidateIdProfil = matchCandidate.idProfil;
      }

      // Évaluateur (depuis la colonne I "Matricule" résolu vers Id_Profil de BDD_Profils)
      const matchEvaluator = resolveIdProfil(e.evaluatorMatricule, e.evaluatorName, e.evaluatorIdProfil);
      if (matchEvaluator) {
        e.evaluatorIdProfil = matchEvaluator.idProfil;
        e.evaluatorName = matchEvaluator.displayName || `${matchEvaluator.prenom} ${matchEvaluator.nom}`.trim() || matchEvaluator.nom || e.evaluatorName;
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

        // 1. Rattachement ou création du compte utilisateur CANDIDAT
        let candidateUser = UserDirectoryService.getUserById(idProfilNorm) ||
          (profileItem?.matricule ? UserDirectoryService.getUserByMatricule(profileItem.matricule) : undefined) ||
          (conflict.matricule ? UserDirectoryService.getUserByMatricule(conflict.matricule) : undefined) ||
          (profileItem?.email ? UserDirectoryService.getUserByEmail(profileItem.email) : undefined);

        const candidateGrade = (['Junior', 'Confirmé', 'Senior', 'Expert'].includes(deliberation?.newGrade || '') ? deliberation?.newGrade as Grade : (profileItem?.grade as Grade) || 'Confirmé');
        const expNum = deliberation?.experience ? Number(deliberation.experience) || undefined : undefined;
        const ancienneteNum = deliberation?.ancienneteLL ? Number(deliberation.ancienneteLL) || undefined : undefined;
        const yearsExpertNum = deliberation?.yearsExpert ? Number(deliberation.yearsExpert) || undefined : undefined;

        if (!candidateUser) {
          const defaultEmail = profileItem?.email || (profileItem ? `${profileItem.prenom.toLowerCase().replace(/[^a-z0-9]/g, '')}.${profileItem.nom.toLowerCase().replace(/[^a-z0-9]/g, '')}@logiclever.com` : `candidat_${idProfilNorm.toLowerCase()}@logiclever.com`);
          candidateUser = UserDirectoryService.addUser({
            id: idProfilNorm,
            idProfil: idProfilNorm,
            matricule: profileItem?.matricule || conflict.matricule || deliberation?.matricule || '',
            displayName: profileItem?.displayName || conflict.candidateName,
            email: defaultEmail,
            roles: ['CANDIDATE'],
            currentGrade: candidateGrade,
            currentSalary: deliberation?.proposedSalary0107 || deliberation?.salaire3006 || 0,
            currentTJM: deliberation?.tjVendu0107 || 0,
            experienceYears: expNum,
            entryDate: deliberation?.entryDate || profileItem?.entryDate,
            expertGradeDate: deliberation?.expertGradeDate || profileItem?.expertGradeDate,
            ancienneteLL: ancienneteNum,
            yearsExpert: yearsExpertNum,
          });
        } else {
          // Mettre à jour les informations du profil utilisateur
          const updatedRoles: UserRole[] = candidateUser.roles.includes('CANDIDATE') 
            ? candidateUser.roles 
            : [...candidateUser.roles, 'CANDIDATE'];
          UserDirectoryService.updateUser(candidateUser.id, {
            roles: updatedRoles,
            idProfil: idProfilNorm,
            matricule: candidateUser.matricule || profileItem?.matricule || conflict.matricule || deliberation?.matricule || '',
            ...(deliberation?.newGrade ? { currentGrade: candidateGrade } : {}),
            ...(deliberation?.tjVendu0107 !== undefined ? { currentTJM: deliberation.tjVendu0107 } : {}),
            ...(deliberation?.salaire3006 !== undefined ? { currentSalary: deliberation.salaire3006 } : {}),
            ...(expNum !== undefined ? { experienceYears: expNum } : {}),
            ...(deliberation?.entryDate ? { entryDate: deliberation.entryDate } : {}),
            ...(deliberation?.expertGradeDate ? { expertGradeDate: deliberation.expertGradeDate } : {}),
            ...(ancienneteNum !== undefined ? { ancienneteLL: ancienneteNum } : {}),
            ...(yearsExpertNum !== undefined ? { yearsExpert: yearsExpertNum } : {}),
          });
        }

        const dossierId = existingDossier?.id || `${idProfilNorm}_${preview.year}`;
        const dossierRef = doc(db, 'dossiers', dossierId);

        const existingDecision = existingDossier?.juryDecision || ({} as JuryDecision);
        const updatedDecision: JuryDecision = {
          ...existingDecision,
          verdict: existingDecision.verdict || (deliberation?.proposedSalary0107 || deliberation?.proposedSalaryPercent0107 ? `Augmentation ${preview.year}` : 'Délibéré'),
          amount: deliberation?.proposedSalary0107 ?? existingDecision.amount ?? 0,
          percentage: deliberation?.proposedSalaryPercent0107 ?? existingDecision.percentage ?? 0,
          advice: existingDecision.advice ?? '',
          conclusion: existingDecision.conclusion ?? '',
          date: existingDecision.date || serverTimestamp(),
          unanimous: existingDecision.unanimous ?? true,
          ...(deliberation?.newGrade ? { gradeDecision: deliberation.newGrade } : {}),
          ...(deliberation?.tjVendu0107 !== undefined ? { tjVendu0107: deliberation.tjVendu0107 } : {}),
          ...(deliberation?.tjCible !== undefined ? { tjCibleDecision: deliberation.tjCible } : {}),
          ...(deliberation?.salaire3006 !== undefined ? { salaire3006: deliberation.salaire3006 } : {}),
          ...(deliberation?.wishedSalary0107 !== undefined ? { wishedSalary0107: deliberation.wishedSalary0107 } : {}),
          ...(deliberation?.investPercent !== undefined ? { investmentPercentage: deliberation.investPercent } : {}),
          ...(deliberation?.missionPercent !== undefined ? { missionPercentage: deliberation.missionPercent } : {}),
          ...(deliberation?.proposedSalary0107 !== undefined ? { proposedSalary0107: deliberation.proposedSalary0107 } : {}),
          ...(deliberation?.maxSalaryIfTjVenduIncreases !== undefined ? { maxSalaryIfTjVenduIncreases: deliberation.maxSalaryIfTjVenduIncreases } : {}),
          ...(deliberation?.whyThisSalary ? { whyThisSalary: deliberation.whyThisSalary } : {}),
          ...(deliberation?.whatToDoMore ? { whatToDoMore: deliberation.whatToDoMore } : {}),
          ...(deliberation?.referentJury ? { referentJury: deliberation.referentJury } : {}),
          ...(deliberation?.consultantFeeling ? { consultantFeeling: deliberation.consultantFeeling } : {}),
          ...(deliberation?.secondTourFeedback ? { secondTourFeedback: deliberation.secondTourFeedback } : {})
        };

        const existingAnnualReport = existingDossier?.annualReport;
        const updatedAnnualReport: Partial<AnnualReport> = {
          ...(existingAnnualReport || {}),
          currentGrade: (deliberation?.newGrade as Grade) || existingAnnualReport?.currentGrade || candidateGrade,
          wishedGrade: (deliberation?.newGrade as Grade) || existingAnnualReport?.wishedGrade || candidateGrade,
          currentTJM: deliberation?.tjVendu0107 ?? existingAnnualReport?.currentTJM ?? 0,
          targetTJM: deliberation?.tjCible ?? existingAnnualReport?.targetTJM ?? 0,
          currentSalary: deliberation?.salaire3006 ?? existingAnnualReport?.currentSalary ?? 0,
          wishedSalary: deliberation?.wishedSalary0107 ?? existingAnnualReport?.wishedSalary ?? 0,
          internalInvestment: deliberation?.investPercent ?? existingAnnualReport?.internalInvestment ?? 0,
          yearSummary: existingAnnualReport?.yearSummary || `Bilan Campagne ${preview.year}`,
          synthesis: existingAnnualReport?.synthesis || deliberation?.consultantFeeling || '',
          previousObjectives: existingAnnualReport?.previousObjectives || [],
          commercialActivities: existingAnnualReport?.commercialActivities || '',
          training: existingAnnualReport?.training || '',
          knowHow: existingAnnualReport?.knowHow || '',
          progressionDetails: existingAnnualReport?.progressionDetails || '',
          techDetails: existingAnnualReport?.techDetails || ''
        };

        const existingFeedbacks = { ...(existingDossier?.consultantFeedbacks || {}) };
        const assignedConsultantIdsSet = new Set<string>(existingDossier?.assignedConsultantIds || []);

        candidateEvals.forEach(e => {
          // 2. Rattachement ou création du compte utilisateur ÉVALUATEUR / JURY
          let evaluatorUser = (e.evaluatorIdProfil ? UserDirectoryService.getUserById(e.evaluatorIdProfil) : undefined) ||
            (e.evaluatorMatricule ? UserDirectoryService.getUserByMatricule(e.evaluatorMatricule) : undefined);

          const evalProfileItem = (e.evaluatorIdProfil ? profileMap.get(e.evaluatorIdProfil.trim().toUpperCase()) : undefined) ||
            (e.evaluatorMatricule ? Array.from(profileMap.values()).find(p => p.matricule === e.evaluatorMatricule) : undefined);

          if (!evaluatorUser && evalProfileItem) {
            const evalEmail = evalProfileItem.email || `${evalProfileItem.prenom.toLowerCase().replace(/[^a-z0-9]/g, '')}.${evalProfileItem.nom.toLowerCase().replace(/[^a-z0-9]/g, '')}@logiclever.com`;
            evaluatorUser = UserDirectoryService.addUser({
              id: evalProfileItem.idProfil,
              idProfil: evalProfileItem.idProfil,
              matricule: evalProfileItem.matricule || e.evaluatorMatricule || '',
              displayName: evalProfileItem.displayName,
              email: evalEmail,
              roles: ['EVALUATOR']
            });
          } else if (evaluatorUser && !evaluatorUser.roles.includes('EVALUATOR') && !evaluatorUser.roles.includes('JURY')) {
            UserDirectoryService.updateUser(evaluatorUser.id, {
              roles: [...evaluatorUser.roles, 'EVALUATOR']
            });
          }

          const existingKey = Object.keys(existingFeedbacks).find(k => {
            const ef = existingFeedbacks[k];
            const evalMatch = (ef.evaluatorIdProfil && ef.evaluatorIdProfil === e.evaluatorIdProfil) || 
              ef.consultantId === e.evaluatorIdProfil ||
              (evaluatorUser && (ef.consultantId === evaluatorUser.id || ef.evaluatorIdProfil === evaluatorUser.idProfil));
            return evalMatch && (ef.client || '').toLowerCase() === e.client.toLowerCase() && (ef.project || '').toLowerCase() === e.project.toLowerCase();
          });

          const finalEvaluatorIdProfil = evaluatorUser?.idProfil || e.evaluatorIdProfil || 'ANONYME';
          const finalEvaluatorUserId = evaluatorUser?.id || e.evaluatorIdProfil || 'ANONYME';
          const finalEvaluatorName = evaluatorUser?.displayName || e.evaluatorName || 'Jury';

          // Assignation bidirectionnelle : ajouter l'évaluateur aux assignations du dossier
          if (finalEvaluatorUserId && finalEvaluatorUserId !== 'ANONYME') {
            assignedConsultantIdsSet.add(finalEvaluatorUserId);
          }
          if (finalEvaluatorIdProfil && finalEvaluatorIdProfil !== 'ANONYME') {
            assignedConsultantIdsSet.add(finalEvaluatorIdProfil);
          }
          if (e.evaluatorMatricule) {
            assignedConsultantIdsSet.add(e.evaluatorMatricule);
          }

          // Assigner le candidat au profil de l'évaluateur
          if (evaluatorUser) {
            const currentAssigned = new Set<string>(evaluatorUser.assignedCandidateIds || []);
            currentAssigned.add(candidateUser.id);
            if (idProfilNorm) currentAssigned.add(idProfilNorm);
            if (profileItem?.matricule) currentAssigned.add(profileItem.matricule);
            if (conflict.matricule) currentAssigned.add(conflict.matricule);
            UserDirectoryService.updateUser(evaluatorUser.id, {
              assignedCandidateIds: Array.from(currentAssigned)
            });
          }

          const feedbackId = existingKey || `eval_${finalEvaluatorIdProfil}_${encodeURIComponent(e.client)}_${Date.now()}`;
          const prevFeedback = existingKey ? existingFeedbacks[existingKey] : undefined;

          if (existingKey) {
            evaluationsUpdatedCount++;
          } else {
            evaluationsCreatedCount++;
          }

          const mappedType = e.mappedRelationType || 'Collègue_Mission';

          existingFeedbacks[feedbackId] = {
            id: feedbackId,
            consultantId: finalEvaluatorUserId,
            consultantName: finalEvaluatorName,
            evaluatorUid: finalEvaluatorUserId,
            evaluatorIdProfil: finalEvaluatorIdProfil,
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
          candidateId: candidateUser.id,
          candidateName: candidateUser.displayName || profileItem?.displayName || conflict.candidateName,
          candidateEmail: candidateUser.email || profileItem?.email || '',
          campaignId: preview.campaignId,
          campaignYear: preview.year,
          status: finalStatus,
          assignedConsultantIds: Array.from(assignedConsultantIdsSet),
          annualReport: updatedAnnualReport as AnnualReport,
          juryDecision: updatedDecision,
          consultantFeedbacks: existingFeedbacks,
          updatedAt: serverTimestamp(),
          createdAt: existingDossier?.createdAt || serverTimestamp()
        };

        // Sauvegarder également les métriques participant à la campagne
        try {
          LocalDatabaseService.bulkSaveParticipants([{
            id: `${preview.campaignId}_${candidateUser.id}`,
            campaignId: preview.campaignId,
            campaignYear: preview.year,
            idProfil: idProfilNorm,
            displayName: candidateUser.displayName || conflict.candidateName,
            email: candidateUser.email || '',
            grade: (candidateGrade as Grade) || 'Confirmé',
            salary: deliberation?.salaire3006 || candidateUser.currentSalary || 0,
            tjm: deliberation?.tjVendu0107 || candidateUser.currentTJM || 0,
            entryDate: deliberation?.entryDate || profileItem?.entryDate,
            expertGradeDate: deliberation?.expertGradeDate || profileItem?.expertGradeDate,
            totalExperienceYears: expNum,
            ancienneteLL: ancienneteNum,
            yearsExpert: yearsExpertNum,
            isCandidate: true,
            isEvaluator: false,
            dossierId: dossierId,
            createdAt: new Date().toISOString()
          }]);
        } catch (e) {
          console.warn("Could not save participant record:", e);
        }

        batch.set(dossierRef, dossierPayload, { merge: true });
        LocalDatabaseService.saveDossier(dossierPayload as Dossier);
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
