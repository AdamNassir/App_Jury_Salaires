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
import { cleanString, normalizeHeader, parseFrenchNumber, readImportWorkbook } from './campaignInitializationService';
import { UserDirectoryService } from './userDirectoryService';
import { LocalDatabaseService } from './localDatabaseService';
import { CampaignColumnsSpecificationService } from './campaignColumnsSpecificationService';
import campaignColumnSpecs from '../config/campaign_column_specifications.json';

function getColumnIndexFromSpecs(sheet: 'Analyse_Jury' | 'TJ_Cible', year: number, ...fieldNames: string[]): number {
  const yearKey = year >= 2025 ? '2025_and_later' : year === 2024 ? '2024' : year === 2023 ? '2023' : '2022_and_earlier';
  const sheetCols = (campaignColumnSpecs as any).campaigns?.[yearKey]?.sheets?.[sheet]?.columns || {};
  for (const fieldName of fieldNames) {
    for (const [colKey, def] of Object.entries(sheetCols) as [string, any][]) {
      if (def?.field === fieldName) {
        const letter = colKey.split(' ')[0].trim().toUpperCase();
        return letter.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
      }
    }
  }
  return -1;
}

// Relations canoniques strictes incluant Coach et Logiclever
export const VALID_RELATION_TYPES: EvaluationRelationType[] = [
  'Auto_Evaluation',
  'Commerciale',
  'Encadrement',
  'Meteo_Client',
  'Coach',
  'Logiclever',
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
  isObsolete: boolean;
  obsoleteValue?: string;
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

export interface CatchupMeteoItem {
  idProfil: string; // Col B
  year?: string | number; // Col Z
  link: string; // Col Q
  date?: string; // Col F
  client?: string; // Col S
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
    if (norm === 'coach_logiclever') {
      return {
        relationType: undefined,
        requiresConversion: true,
        explanation: 'Ancien libellé combiné : sélectionner Coach et/ou Logiclever séparément.'
      };
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
    const workbook = await readImportWorkbook(file);

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
      const idProfilIndex = CampaignColumnsSpecificationService.getStaticColumnIndex('BDD_LL_New_Drive', 'Profil', 'idProfil');
      const nomIndex = CampaignColumnsSpecificationService.getStaticColumnIndex('BDD_LL_New_Drive', 'Profil', 'nom');
      const prenomIndex = CampaignColumnsSpecificationService.getStaticColumnIndex('BDD_LL_New_Drive', 'Profil', 'prenom');
      const emailIndex = CampaignColumnsSpecificationService.getStaticColumnIndex('BDD_LL_New_Drive', 'Profil', 'email');
      const matriculeIndex = CampaignColumnsSpecificationService.getStaticColumnIndex('BDD_LL_New_Drive', 'Profil', 'matricule');
      const obsoleteIndex = CampaignColumnsSpecificationService.getStaticColumnIndex('BDD_LL_New_Drive', 'Profil', 'obsoleteValue');
      const idProfil = cleanString(rowArr[idProfilIndex]);
      if (!idProfil) continue;

      // Col B (index 1) : Nom_Profil
      const nom = cleanString(rowArr[nomIndex]);
      // Col C (index 2) : Prenom_Profil
      const prenom = cleanString(rowArr[prenomIndex]);

      // Col H (index 7) : Matricule (selon classeur BDD_Profils, onglet Profils)
      let matricule = cleanString(rowArr[matriculeIndex]);
      // Col D (index 3) : Email direct dans BDD_LL_New_Drive (onglet Profil)
      let email = cleanString(rowArr[emailIndex]).toLowerCase();
      const obsoleteValue = cleanString(rowArr[obsoleteIndex]);

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
        email: email || undefined,
        isObsolete: Boolean(obsoleteValue),
        obsoleteValue: obsoleteValue || undefined
      });
    }

    return profiles;
  }

  /**
   * Cœur de parsing de la feuille "Analyse_Jury" pour n'importe quel millésime (2022 à 2025+)
   * Combine une détection dynamique par en-têtes réels et un repli strict sur les colonnes documentées par année.
   */
  static parseDeliberationMatrixCore(rawMatrix: any[][], campaignYear?: number): DeliberationParsedRow[] {
    if (!rawMatrix || rawMatrix.length === 0) return [];

    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, rawMatrix.length); i++) {
      const row = rawMatrix[i] || [];
      const hasMatricule = row.some(cell => {
        const norm = normalizeHeader(String(cell || ''));
        return norm === 'matricule' || norm.includes('matricule');
      });
      if (hasMatricule) {
        headerRowIndex = i;
        break;
      }
    }

    const headerRow = rawMatrix[headerRowIndex] || [];

    // Détection dynamique des colonnes par leurs libellés d'en-tête
    let colMatricule = -1;
    let colPrenom = -1;
    let colNom = -1;
    let colExperience = -1;
    let colEntryDate = -1;
    let colExpertGradeDate = -1;
    let colAncienneteLL = -1;
    let colYearsExpert = -1;
    let colNewGrade = -1;
    let colTjVendu = -1;
    let colTjCible = -1;
    let colSalaire3006 = -1;
    let colWishedSalary = -1;
    let colGradeChange = -1;
    let colInvest = -1;
    let colMission = -1;
    let colCoachName = -1;
    let colProposedSalary = -1;
    let colProposedPercent = -1;
    let colMaxSalary = -1;
    let colWhyThisSalary = -1;
    let colWhatToDoMore = -1;
    let colReferentJury = -1;
    let colConsultantFeeling = -1;

    for (let c = 0; c < headerRow.length; c++) {
      const h = normalizeHeader(String(headerRow[c] || ''));
      if (!h) continue;

      if (colMatricule === -1 && h.includes('matricule')) {
        colMatricule = c;
      } else if (colPrenom === -1 && h.includes('prenom')) {
        colPrenom = c;
      } else if (colNom === -1 && (h === 'nom' || (h.includes('nom') && !h.includes('prenom') && !h.includes('coach')))) {
        colNom = c;
      } else if (colExperience === -1 && (h === 'exp' || h === 'experience' || h.startsWith('exp_') || h.includes('anciennete_totale'))) {
        colExperience = c;
      } else if (colEntryDate === -1 && (h.includes('entree') || h.includes('embauche'))) {
        colEntryDate = c;
      } else if (colExpertGradeDate === -1 && (h.includes('expert') && (h.includes('date') || h.includes('passage')))) {
        colExpertGradeDate = c;
      } else if (colAncienneteLL === -1 && (h.includes('anciennete') && !h.includes('totale'))) {
        colAncienneteLL = c;
      } else if (colYearsExpert === -1 && (h.includes('expert') && (h.includes('annee') || h.includes('nb')))) {
        colYearsExpert = c;
      } else if (colNewGrade === -1 && ((h.includes('grade') || h.includes('titre')) && !h.includes('date') && !h.includes('expert') && !h.includes('changement'))) {
        colNewGrade = c;
      } else if (colGradeChange === -1 && h.includes('changement')) {
        colGradeChange = c;
      } else if (colTjVendu === -1 && ((h.includes('tj') && h.includes('vendu')) || h === 'tj_vendu')) {
        colTjVendu = c;
      } else if (colTjCible === -1 && ((h.includes('tj') && h.includes('cible')) || h === 'tj_cible')) {
        colTjCible = c;
      } else if (colSalaire3006 === -1 && ((h.includes('salaire') || h.includes('tj_salaire')) && (h.includes('30_06') || h.includes('actuel') || h.includes('30')) && !h.includes('propose') && !h.includes('souhaite') && !h.includes('max'))) {
        colSalaire3006 = c;
      } else if (colWishedSalary === -1 && ((h.includes('salaire') || h.includes('pretention')) && (h.includes('souhaite') || h.includes('demande') || h.includes('pretention')) && !h.includes('propose') && !h.includes('max'))) {
        colWishedSalary = c;
      } else if (colCoachName === -1 && h.includes('coach')) {
        colCoachName = c;
      } else if (colProposedSalary === -1 && ((h.includes('propose') || h.includes('proposition')) && !h.includes('max') && !h.includes('%') && !h.includes('augm') && !h.includes('evolution') && !h.includes('pourquoi') && !h.includes('pour_avoir_plus') && !h.includes('avoir_plus') && !h.includes('ressenti') && !h.includes('referent'))) {
        colProposedSalary = c;
      } else if (colProposedPercent === -1 && (h.includes('augm') || h.includes('evolution') || (h.includes('%') && (h.includes('propose') || h.includes('salaire'))))) {
        colProposedPercent = c;
      } else if (colMaxSalary === -1 && h.includes('max')) {
        colMaxSalary = c;
      } else if (colWhyThisSalary === -1 && (h.includes('pourquoi') || (h.includes('explication') && h.includes('salaire')))) {
        colWhyThisSalary = c;
      } else if (colWhatToDoMore === -1 && (h.includes('avoir_plus') || h.includes('pour_avoir_plus') || (h.includes('faire') && (h.includes('plus') || h.includes('avantage'))))) {
        colWhatToDoMore = c;
      } else if (colReferentJury === -1 && h.includes('referent')) {
        colReferentJury = c;
      } else if (colConsultantFeeling === -1 && h.includes('ressenti')) {
        colConsultantFeeling = c;
      }
    }

    // Détection du millésime d'après les en-têtes et le paramètre campaignYear
    const colGHeader = normalizeHeader(String(headerRow[6] || ''));
    const is2025 = (campaignYear === 2025) || colGHeader.includes('anciennete') || colGHeader.includes('ll');
    const is2023 = !is2025 && ((campaignYear === 2023) || colCoachName !== -1 || headerRow.some(h => normalizeHeader(String(h || '')).includes('coach')));
    const is2022OrEarlier = !is2025 && !is2023 && ((campaignYear !== undefined && campaignYear <= 2022) || normalizeHeader(String(headerRow[4] || '')).includes('nouveau') || colGHeader.includes('vendu') || (headerRow[18] && normalizeHeader(String(headerRow[18] || '')).includes('propose')));

    // Année effective de la campagne
    const effectiveYear = campaignYear || (is2025 ? 2025 : is2023 ? 2023 : is2022OrEarlier ? 2022 : 2024);

    // RÉSOLUTION STRICTE DE TOUTES LES COLONNES D'APRÈS campaign_column_specifications.json
    const getCol = (...fieldNames: string[]) => getColumnIndexFromSpecs('Analyse_Jury', effectiveYear, ...fieldNames);

    const specMatricule = getCol('matricule');
    colMatricule = specMatricule >= 0 ? specMatricule : (colMatricule !== -1 ? colMatricule : 0);

    const specPrenom = getCol('prenom');
    colPrenom = specPrenom >= 0 ? specPrenom : (colPrenom !== -1 ? colPrenom : 1);

    const specNom = getCol('nom');
    colNom = specNom >= 0 ? specNom : (colNom !== -1 ? colNom : 2);

    const specEntryDate = getCol('dateEntree', 'entryDate');
    if (specEntryDate >= 0) colEntryDate = specEntryDate;

    const specAnciennete = getCol('anciennete', 'ancienneteLL');
    if (specAnciennete >= 0) colAncienneteLL = specAnciennete;

    const specGrade = getCol('grade', 'newGrade');
    if (specGrade >= 0) colNewGrade = specGrade;
    else if (colNewGrade === -1) colNewGrade = (effectiveYear === 2025 ? 8 : effectiveYear === 2024 ? 6 : 4);

    const specGradeChange = getCol('changementGrade', 'gradeChange');
    if (specGradeChange >= 0) colGradeChange = specGradeChange;

    const specTjVendu = getCol('tjVendu0107');
    if (specTjVendu >= 0) colTjVendu = specTjVendu;

    const specTjCible = getCol('tjCible');
    if (specTjCible >= 0) colTjCible = specTjCible;

    const specSalaire3006 = getCol('salaire3006');
    if (specSalaire3006 >= 0) colSalaire3006 = specSalaire3006;

    const specWishedSalary = getCol('salaireSouhaite', 'wishedSalary0107');
    if (specWishedSalary >= 0) colWishedSalary = specWishedSalary;

    const specInvest = getCol('pourcentInvestissement');
    colInvest = specInvest >= 0 ? specInvest : (effectiveYear === 2025 ? 20 : effectiveYear === 2024 ? 18 : 16);

    const specMission = getCol('pourcentMission');
    colMission = specMission >= 0 ? specMission : (effectiveYear === 2025 ? 21 : effectiveYear === 2024 ? 19 : 17);

    const specProposedSalary = getCol('salairePropose0107');
    if (specProposedSalary >= 0) colProposedSalary = specProposedSalary;

    const specProposedPercent = getCol('pourcentageAugmentation', 'proposedSalaryPercent0107');
    if (specProposedPercent >= 0) colProposedPercent = specProposedPercent;

    const specMaxSalary = getCol('maxSalaryIfTjVenduIncreases', 'maxSalaryIfTJIncreases');
    if (specMaxSalary >= 0) colMaxSalary = specMaxSalary;

    const specWhyThisSalary = getCol('pourquoiCeSalaire', 'whyThisSalary');
    if (specWhyThisSalary >= 0) colWhyThisSalary = specWhyThisSalary;

    const specWhatToDoMore = getCol('ceQuIlFautFairePourAvoirPlus', 'whatToDoMore');
    if (specWhatToDoMore >= 0) colWhatToDoMore = specWhatToDoMore;

    const specReferentJury = getCol('referentJury');
    if (specReferentJury >= 0) colReferentJury = specReferentJury;

    const specConsultantFeeling = getCol('ressentiConsultant', 'consultantFeeling');
    if (specConsultantFeeling >= 0) colConsultantFeeling = specConsultantFeeling;

    const rows: DeliberationParsedRow[] = [];

    for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
      const rowArr = rawMatrix[i];
      if (!rowArr || rowArr.length === 0) continue;

      const matricule = colMatricule !== -1 ? cleanString(rowArr[colMatricule]) : '';
      const prenom = colPrenom !== -1 ? cleanString(rowArr[colPrenom]) : '';
      const nom = colNom !== -1 ? cleanString(rowArr[colNom]) : '';
      const experience = colExperience !== -1 ? cleanString(rowArr[colExperience]) : '';

      const nomPrenom = `${prenom} ${nom}`.trim() || nom || prenom || '';
      if (!nomPrenom && !matricule) continue;

      const entryDate = colEntryDate !== -1 ? cleanString(rowArr[colEntryDate]) : '';
      const expertGradeDate = colExpertGradeDate !== -1 ? cleanString(rowArr[colExpertGradeDate]) : '';
      const ancienneteLL = colAncienneteLL !== -1 ? cleanString(rowArr[colAncienneteLL]) : '';
      const yearsExpert = colYearsExpert !== -1 ? cleanString(rowArr[colYearsExpert]) : '';
      let newGrade = colNewGrade !== -1 ? cleanString(rowArr[colNewGrade]) : '';
      if (newGrade.toLowerCase() === 'non' || newGrade.toLowerCase() === 'oui' || newGrade === '0') {
        newGrade = '';
      }

      const tjVendu0107 = colTjVendu !== -1 ? parseFrenchNumber(rowArr[colTjVendu]) : undefined;
      const tjCible = colTjCible !== -1 ? parseFrenchNumber(rowArr[colTjCible]) : undefined;
      const salaire3006 = colSalaire3006 !== -1 ? parseFrenchNumber(rowArr[colSalaire3006]) : undefined;
      const wishedSalary0107 = colWishedSalary !== -1 ? parseFrenchNumber(rowArr[colWishedSalary]) : undefined;

      const rawInvest = colInvest !== -1 ? parseFrenchNumber(rowArr[colInvest]) : undefined;
      let investPercent: number | undefined = undefined;
      if (rawInvest !== undefined && rawInvest > 0) {
        if (rawInvest <= 1) {
          investPercent = Math.round(rawInvest * 1000) / 10;
        } else if (rawInvest <= 100) {
          investPercent = rawInvest;
        }
      }

      const rawMission = colMission !== -1 ? parseFrenchNumber(rowArr[colMission]) : undefined;
      let missionPercent: number | undefined = undefined;
      if (rawMission !== undefined && rawMission > 0) {
        if (rawMission <= 1) {
          missionPercent = Math.round(rawMission * 1000) / 10;
        } else if (rawMission <= 100) {
          missionPercent = rawMission;
        }
      }

      let proposedSalary0107Val = colProposedSalary !== -1 ? parseFrenchNumber(rowArr[colProposedSalary]) : undefined;
      let proposedSalaryPercent0107 = colProposedPercent !== -1 ? parseFrenchNumber(rowArr[colProposedPercent]) : undefined;
      if (proposedSalaryPercent0107 !== undefined && proposedSalaryPercent0107 > 0 && proposedSalaryPercent0107 <= 1) {
        proposedSalaryPercent0107 = Math.round(proposedSalaryPercent0107 * 1000) / 10;
      }
      const maxSalaryIfTjVenduIncreases = colMaxSalary !== -1 ? parseFrenchNumber(rowArr[colMaxSalary]) : undefined;
      const whyThisSalary = colWhyThisSalary !== -1 ? cleanString(rowArr[colWhyThisSalary]) : '';
      const whatToDoMore = colWhatToDoMore !== -1 ? cleanString(rowArr[colWhatToDoMore]) : '';
      const referentJury = colReferentJury !== -1 ? cleanString(rowArr[colReferentJury]) : '';
      const consultantFeeling = colConsultantFeeling !== -1 ? cleanString(rowArr[colConsultantFeeling]) : '';

      // Détection de secours pour proposedSalary0107Val si non résolu ou égal à 0
      if (proposedSalary0107Val === undefined || proposedSalary0107Val <= 0) {
        for (let c = 0; c < rowArr.length; c++) {
          const h = normalizeHeader(String(headerRow[c] || ''));
          if (
            (h.includes('propose') || h.includes('proposition')) &&
            !h.includes('max') &&
            !h.includes('%') &&
            !h.includes('augm') &&
            !h.includes('pourquoi') &&
            !h.includes('avoir_plus') &&
            !h.includes('ressenti') &&
            !h.includes('referent')
          ) {
            const val = parseFrenchNumber(rowArr[c]);
            if (val && val > 1000) {
              proposedSalary0107Val = val;
              break;
            }
          }
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
        consultantFeeling: consultantFeeling || undefined
      });
    }

    return rows;
  }

  /**
   * Parse le classeur Analyse_Jury_Salaire -> feuille "Analyse_Jury"
   * Compatible avec tous les millésimes 2022, 2023, 2024, 2025+.
   */
  static async parseDeliberationFile(file: File, campaignYear?: number): Promise<DeliberationParsedRow[]> {
    const workbook = await readImportWorkbook(file);

    let targetSheetName = workbook.SheetNames.find(s => {
      const norm = normalizeHeader(s);
      return norm === 'analyse_jury' || norm.includes('analyse') || norm.includes('jury');
    });

    if (!targetSheetName) {
      targetSheetName = workbook.SheetNames[0];
    }

    const worksheet = workbook.Sheets[targetSheetName];
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    return this.parseDeliberationMatrixCore(rawMatrix, campaignYear);
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
  static async parseEvaluationsFile(file: File, campaignYear?: number): Promise<EvaluationParsedRow[]> {
    const workbook = await readImportWorkbook(file);

    let targetSheetName = workbook.SheetNames.find(s => {
      const norm = normalizeHeader(s);
      return norm === 'tj_cible' || norm.includes('cible') || norm.includes('eval');
    });

    if (!targetSheetName) {
      targetSheetName = workbook.SheetNames[0];
    }

    const worksheet = workbook.Sheets[targetSheetName];
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
    if (campaignYear) return this.parseEvaluationsFromMatrix(rawMatrix, campaignYear);
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

    const headerRow = rawMatrix[headerRowIndex] || [];
    const colGHeader = normalizeHeader(String(headerRow[6] || ''));
    const is2022_2023Format = colGHeader === 'cv' || colGHeader.includes('cv') || normalizeHeader(String(headerRow[10] || '')).includes('evaluat');

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

      let client: string = '';
      let project: string = '';
      let rawEvaluator: string = '';
      let relationStartIndex = 9; // Col J pour 2024/2025, Col L pour 2022/2023
      let tjCibleMin: number | undefined;
      let tjCibleMax: number | undefined;
      let justification: string = '';
      let improvementAxes: string = '';
      let confidenceIndex: number | undefined;

      if (is2022_2023Format) {
        // --- FORMAT 2022 & 2023 ---
        // Col H (7) : Client, Col J (9) : Projet, Col K (10) : Evaluateur
        client = cleanString(rowArr[7]);
        project = cleanString(rowArr[9]);
        rawEvaluator = cleanString(rowArr[10]);
        relationStartIndex = 11; // Col L (11) à Col R (17)

        // Col U (20) : "TJ Cible Min"
        tjCibleMin = parseFrenchNumber(rowArr[20]);
        // Col V (21) : "TJ Cible Max"
        tjCibleMax = parseFrenchNumber(rowArr[21]);
        // Col W (22) : "Justification TJ Cible"
        justification = cleanString(rowArr[22]);
        // Col X (23) : "Axes pour augmenter le TJ"
        improvementAxes = cleanString(rowArr[23]);
        // Col Y (24) : "Indice de confiance"
        confidenceIndex = parseFrenchNumber(rowArr[24]);
      } else {
        // --- FORMAT 2024 & 2025 ---
        // Col G (6) : Client, Col H (7) : Projet, Col I (8) : Evaluateur
        client = cleanString(rowArr[6]);
        project = cleanString(rowArr[7]);
        rawEvaluator = cleanString(rowArr[8]);
        relationStartIndex = 9; // Col J (9) à Col P (15)

        // Col S (18) : "TJ Cible Min"
        tjCibleMin = parseFrenchNumber(rowArr[18]);
        // Col T (19) : "TJ Cible Max"
        tjCibleMax = parseFrenchNumber(rowArr[19]);
        // Col U (20) : "Justification TJ Cible"
        justification = cleanString(rowArr[20]);
        // Col V (21) : "Axes pour augmenter le TJ"
        improvementAxes = cleanString(rowArr[21]);
        // Col W (22) : "Indice de confiance"
        confidenceIndex = parseFrenchNumber(rowArr[22]);
      }

      const evaluatorMatricule = rawEvaluator;
      const evaluatorName = rawEvaluator;

      // Détecter le type de relation
      const isChecked = (colIdx: number) => {
        const val = cleanString(rowArr[colIdx]).toLowerCase();
        return val === 'x' || val === '1' || val === 'oui' || val === 'true' || val === 'vrai' || val.length > 0;
      };

      let detectedType: EvaluationRelationType = 'Collègue_Mission';
      if (isChecked(relationStartIndex)) detectedType = 'Auto_Evaluation';
      else if (isChecked(relationStartIndex + 1)) detectedType = 'Commerciale';
      else if (isChecked(relationStartIndex + 2)) detectedType = 'Encadrement';
      else if (isChecked(relationStartIndex + 3)) detectedType = 'Meteo_Client';
      else if (isChecked(relationStartIndex + 4)) detectedType = 'Coach';
      else if (isChecked(relationStartIndex + 5)) detectedType = 'Logiclever';
      else if (isChecked(relationStartIndex + 6)) detectedType = 'Collègue_Mission';

      // Recherche de secours par en-têtes si décalage
      for (let c = 16; c < rowArr.length; c++) {
        const h = normalizeHeader(String(rawMatrix[headerRowIndex]?.[c] || ''));
        if (h.includes('min') && h.includes('tj') && tjCibleMin === undefined) tjCibleMin = parseFrenchNumber(rowArr[c]);
        else if (h.includes('max') && h.includes('tj') && tjCibleMax === undefined) tjCibleMax = parseFrenchNumber(rowArr[c]);
        else if ((h.includes('justification') || h.includes('argumentaire')) && !justification) justification = cleanString(rowArr[c]);
        else if ((h.includes('axe') || h.includes('augmenter')) && !improvementAxes) improvementAxes = cleanString(rowArr[c]);
        else if ((h.includes('confiance') || h.includes('indice')) && confidenceIndex === undefined) confidenceIndex = parseFrenchNumber(rowArr[c]);
      }

      let normalizedConfidence: number | undefined = undefined;
      if (confidenceIndex !== undefined && !isNaN(confidenceIndex) && confidenceIndex > 0) {
        normalizedConfidence = confidenceIndex > 5 ? Math.round(confidenceIndex / 2) : confidenceIndex;
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
        confidenceIndex: normalizedConfidence
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
            email: p.email,
            isObsolete: p.statut === 'INACTIF' || p.statut === 'SORTI'
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
      if (matricule) {
        const matUpper = matricule.trim().toUpperCase();
        if (profileByMatricule.has(matUpper)) {
          return profileByMatricule.get(matUpper);
        }
        // Match souple sans zéros initiaux
        const matNum = matUpper.replace(/^0+/, '');
        for (const [key, p] of profileByMatricule.entries()) {
          if (key.replace(/^0+/, '') === matNum) return p;
        }
      }
      if (name) {
        const norm = normalizePersonName(name);
        if (profileByName.has(norm)) {
          return profileByName.get(norm);
        }
        // Match souple par jetons (Nom Prénom ou Prénom Nom dans n'importe quel ordre)
        const tokens = norm.split('_').filter(t => t.length >= 2);
        if (tokens.length >= 2) {
          for (const p of profilesRef) {
            const pNorm = normalizePersonName(p.displayName || `${p.prenom} ${p.nom}`);
            const pTokens = pNorm.split('_').filter(t => t.length >= 2);
            if (tokens.every(t => pTokens.includes(t)) || pTokens.every(t => tokens.includes(t))) {
              return p;
            }
          }
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
    adminUser?: UserProfile | null,
    meteos?: CatchupMeteoItem[]
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

    // 2. Synchroniser les profils personnes : restreindre aux candidats et évaluateurs concernés
    // BDD_LL_New_Drive contient des centaines de lignes; on n'enregistre que ceux qui participent à la campagne
    const participantIdProfils = new Set<string>();
    preview.conflicts.forEach(c => {
      if (c.idProfil) participantIdProfils.add(c.idProfil.trim().toUpperCase());
      if (c.matricule) participantIdProfils.add(c.matricule.trim().toUpperCase());
    });
    deliberations.forEach(d => {
      if (d.resolvedIdProfil) participantIdProfils.add(d.resolvedIdProfil.trim().toUpperCase());
      if (d.matricule) participantIdProfils.add(d.matricule.trim().toUpperCase());
    });
    evaluations.forEach(e => {
      if (e.resolvedCandidateIdProfil) participantIdProfils.add(e.resolvedCandidateIdProfil.trim().toUpperCase());
      if (e.evaluatorIdProfil) participantIdProfils.add(e.evaluatorIdProfil.trim().toUpperCase());
      if (e.evaluatorMatricule) participantIdProfils.add(e.evaluatorMatricule.trim().toUpperCase());
    });
    deliberations.forEach(d => {
      if (!d.referentJury) return;
      const referentName = normalizePersonName(d.referentJury);
      const matchingProfiles = profilesRef.filter(p =>
        normalizePersonName(p.prenom) === referentName ||
        normalizePersonName(p.displayName) === referentName ||
        normalizePersonName(`${p.prenom} ${p.nom}`) === referentName
      );
      if (matchingProfiles.length === 1) {
        participantIdProfils.add(matchingProfiles[0].idProfil.trim().toUpperCase());
      }
    });

    const activeParticipantsProfiles = profilesRef.filter(p => {
      const idUpper = p.idProfil.trim().toUpperCase();
      const matUpper = p.matricule ? p.matricule.trim().toUpperCase() : '';
      return participantIdProfils.has(idUpper) || (matUpper && participantIdProfils.has(matUpper));
    });

    // Profiles marked unavailable in column L remain in historical records only.
    activeParticipantsProfiles.filter(p => p.isObsolete).forEach(p => {
      const existingUser = UserDirectoryService.getUserById(p.idProfil) ||
        UserDirectoryService.getUserByMatricule(p.matricule) ||
        UserDirectoryService.getUserByEmail(p.email);
      if (existingUser) UserDirectoryService.deleteUser(existingUser.id);
    });

    if (activeParticipantsProfiles.length > 0) {
      for (let i = 0; i < activeParticipantsProfiles.length; i += 250) {
        const batch = writeBatch(db);
        const chunk = activeParticipantsProfiles.slice(i, i + 250);
        for (const p of chunk) {
          const personneRef = doc(db, 'personnes', p.idProfil);
          batch.set(personneRef, {
            idProfil: p.idProfil,
            matricule: p.matricule || '',
            nom: p.nom || '',
            prenom: p.prenom || '',
            displayName: p.displayName || `${p.prenom} ${p.nom}`,
            email: p.email || '',
            statut: p.isObsolete ? 'SORTI' : 'ACTIF',
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

        const referentSourceName = deliberation?.referentJury?.trim() || '';
        const normalizedReferentName = normalizePersonName(referentSourceName);
        const matchingJuryProfiles = normalizedReferentName
          ? profilesRef.filter(p =>
              normalizePersonName(p.prenom) === normalizedReferentName ||
              normalizePersonName(p.displayName) === normalizedReferentName ||
              normalizePersonName(`${p.prenom} ${p.nom}`) === normalizedReferentName
            )
          : [];
        const juryProfile = matchingJuryProfiles.length === 1 ? matchingJuryProfiles[0] : undefined;
        const resolvedReferentName = juryProfile?.displayName || referentSourceName;
        let juryUser = juryProfile && !juryProfile.isObsolete
          ? UserDirectoryService.getUserById(juryProfile.idProfil) || UserDirectoryService.getUserByEmail(juryProfile.email)
          : undefined;
        if (juryProfile && !juryProfile.isObsolete && !juryUser) {
          juryUser = UserDirectoryService.addUser({
            id: juryProfile.idProfil,
            idProfil: juryProfile.idProfil,
            matricule: juryProfile.matricule || '',
            displayName: juryProfile.displayName,
            email: juryProfile.email || '',
            roles: ['JURY']
          });
        } else if (juryUser && !juryUser.roles.includes('JURY')) {
          juryUser = UserDirectoryService.updateUser(juryUser.id, {
            roles: [...juryUser.roles, 'JURY']
          }) || juryUser;
        }

        const profileItem = profileMap.get(idProfilNorm);
        const existingDossier = allDossiersMap.get(idProfilNorm);
        const isObsoleteCandidate = profileItem?.isObsolete === true;

        // 1. Rattachement ou création du compte utilisateur CANDIDAT
        let candidateUser = isObsoleteCandidate ? undefined : (
          UserDirectoryService.getUserById(idProfilNorm) ||
          (profileItem?.matricule ? UserDirectoryService.getUserByMatricule(profileItem.matricule) : undefined) ||
          (conflict.matricule ? UserDirectoryService.getUserByMatricule(conflict.matricule) : undefined) ||
          (profileItem?.email ? UserDirectoryService.getUserByEmail(profileItem.email) : undefined)
        );

        const candidateGrade = (['Junior', 'Confirmé', 'Senior', 'Expert'].includes(deliberation?.newGrade || '') ? deliberation?.newGrade as Grade : (profileItem?.grade as Grade) || 'Confirmé');
        const expNum = deliberation?.experience ? Number(deliberation.experience) || undefined : undefined;
        const ancienneteNum = deliberation?.ancienneteLL ? Number(deliberation.ancienneteLL) || undefined : undefined;
        const yearsExpertNum = deliberation?.yearsExpert ? Number(deliberation.yearsExpert) || undefined : undefined;

        if (isObsoleteCandidate) {
          candidateUser = {
            id: idProfilNorm,
            idProfil: idProfilNorm,
            matricule: profileItem?.matricule || conflict.matricule || deliberation?.matricule || '',
            displayName: profileItem?.displayName || conflict.candidateName,
            email: profileItem?.email || '',
            roles: ['CANDIDATE'],
            currentGrade: candidateGrade,
            currentSalary: deliberation?.salaire3006 || 0,
            currentTJM: deliberation?.tjVendu0107 || 0,
            createdAt: null
          };
        } else if (!candidateUser) {
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
          ...(deliberation?.maxSalaryIfTjVenduIncreases !== undefined ? { 
            maxSalaryIfTjVenduIncreases: deliberation.maxSalaryIfTjVenduIncreases,
            maxSalaryIfTJIncreases: deliberation.maxSalaryIfTjVenduIncreases 
          } : {}),
          ...(deliberation?.whyThisSalary ? { whyThisSalary: deliberation.whyThisSalary } : {}),
          ...(deliberation?.whatToDoMore ? { whatToDoMore: deliberation.whatToDoMore } : {}),
          ...(resolvedReferentName ? { referentJury: resolvedReferentName } : {}),
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

          if (evalProfileItem?.isObsolete) evaluatorUser = undefined;

          if (!evaluatorUser && evalProfileItem && !evalProfileItem.isObsolete) {
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
            confidenceIndex: e.confidenceIndex ?? prevFeedback?.confidenceIndex ?? undefined,
            justification: e.justification || prevFeedback?.justification || '',
            improvementAxes: e.improvementAxes || prevFeedback?.improvementAxes || '',
            status: 'VALIDE',
            validated: true,
            isLegacyType: e.requiresTypeConversion,
            updatedAt: new Date().toISOString()
          };
        });

        // Dans le cadre d'un Rattrapage de campagne passée (2022, 2023, 2024, 2025...),
        // tous les dossiers de l'exercice sont clôturés et doivent être validés à 100%.
        const finalStatus: Dossier['status'] = 'VALIDE';
        const nowIso = new Date().toISOString();
        const validationDate = existingDossier?.validationDate || nowIso;

        const juryMemberReviews = { ...(existingDossier?.juryMemberReviews || {}) };
        if (deliberation && (deliberation.whyThisSalary || deliberation.whatToDoMore || resolvedReferentName)) {
          const juryIdentity = juryUser?.id || juryProfile?.idProfil || `historical_${normalizePersonName(resolvedReferentName || 'jury')}`;
          juryMemberReviews[juryIdentity] = {
            ...(juryMemberReviews[juryIdentity] || {}),
            juryUid: juryUser?.id || juryProfile?.idProfil || juryIdentity,
            juryName: resolvedReferentName || 'Membre du Jury',
            juryEmail: juryUser?.email || juryProfile?.email || '',
            whyThisSalary: deliberation.whyThisSalary || '',
            whatToDoMore: deliberation.whatToDoMore || '',
            verdict: updatedDecision.verdict || (updatedDecision.amount ? 'AUGMENTATION_VALIDEE' : 'MAINTIEN_SALAIRE'),
            proposedSalary: updatedDecision.amount,
            percentage: updatedDecision.percentage,
            isFinalized: true,
            finalizedAt: validationDate,
            updatedAt: nowIso
          };
        }

        // Météos associées au candidat pour cette année de campagne (STRICTEMENT Colonne B)
        const targetYearStr = String(preview.year);
        const targetYearShort = targetYearStr.slice(-2);
        const candidateMeteos = (meteos || []).filter(m => {
          const idMatch = m.idProfil === idProfilNorm || (profileItem?.matricule && m.idProfil === profileItem.matricule.trim().toUpperCase());
          const yearMatch = !m.year || m.year === targetYearStr || String(m.year).includes(targetYearStr) || m.year === targetYearShort;
          return idMatch && yearMatch;
        });

        const mergedMeteoLinks = Array.from(new Set([
          ...(existingDossier?.meteoLinks || []),
          ...candidateMeteos.map(m => m.link)
        ]));

        const existingDetails = existingDossier?.meteoDetails || [];
        const newDetails = candidateMeteos
          .filter(m => !existingDetails.some(ed => ed.link === m.link))
          .map(m => ({ link: m.link, date: m.date, client: m.client }));
        const mergedMeteoDetails = [...existingDetails, ...newDetails];

        const dossierPayload: Partial<Dossier> = {
          id: dossierId,
          idProfil: idProfilNorm,
          candidateId: candidateUser.id,
          candidateName: candidateUser.displayName || profileItem?.displayName || conflict.candidateName,
          candidateEmail: candidateUser.email || profileItem?.email || '',
          campaignId: preview.campaignId,
          campaignYear: preview.year,
          status: 'VALIDE',
          validationDate,
          assignedConsultantIds: Array.from(assignedConsultantIdsSet),
          annualReport: updatedAnnualReport as AnnualReport,
          juryDecision: {
            ...updatedDecision,
            date: (updatedDecision as any).date || validationDate,
            decisionDate: (updatedDecision as any).decisionDate || validationDate,
            verdict: updatedDecision.verdict || (updatedDecision.amount ? 'AUGMENTATION_VALIDEE' : 'MAINTIEN_SALAIRE')
          },
          juryMemberReviews,
          consultantFeedbacks: existingFeedbacks,
          meteoLinks: mergedMeteoLinks,
          meteoDetails: mergedMeteoDetails,
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

    // Enregistrer ou mettre à jour la campagne avec le statut CLÔTURÉE (campagne passée scellée)
    try {
      const campaignId = preview.campaignId;
      const existingCampaign = LocalDatabaseService.getCampaignById(campaignId);
      const campaignPayload = {
        id: campaignId,
        year: preview.year,
        title: existingCampaign?.title || `Campagne ${preview.year}`,
        status: 'CLÔTURÉE' as const,
        rhDocuments: existingCampaign?.rhDocuments || [],
        pairsDocuments: existingCampaign?.pairsDocuments || [],
        otherDocuments: existingCampaign?.otherDocuments || [],
        createdAt: existingCampaign?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        closedAt: new Date().toISOString()
      };
      LocalDatabaseService.saveCampaign(campaignPayload);
    } catch (campaignErr) {
      console.warn("Could not register campaign as CLÔTURÉE:", campaignErr);
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

  /**
   * Parse une matrice brute de données pour les Profils (depuis API Google Sheets ou tableau JSON)
   */
  static parseProfilesReferenceFromMatrix(rawMatrix: any[][]): ProfileReferenceItem[] {
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
      const getIndex = (field: string) => CampaignColumnsSpecificationService.getStaticColumnIndex('BDD_LL_New_Drive', 'Profil', field);
      const idProfil = cleanString(rowArr[getIndex('idProfil')]);
      if (!idProfil) continue;

      // Col B (index 1) : Nom_Profil
      const nom = cleanString(rowArr[getIndex('nom')]);
      // Col C (index 2) : Prenom_Profil
      const prenom = cleanString(rowArr[getIndex('prenom')]);
      // Col H (index 7) : Matricule
      let matricule = cleanString(rowArr[getIndex('matricule')]);
      // Col D (index 3) : Email direct
      let email = cleanString(rowArr[getIndex('email')]).toLowerCase();
      const obsoleteValue = cleanString(rowArr[getIndex('obsoleteValue')]);

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
        email: email || undefined,
        isObsolete: Boolean(obsoleteValue),
        obsoleteValue: obsoleteValue || undefined
      });
    }

    return profiles;
  }

  /**
   * Parse une matrice brute pour les Délibérations (Google Sheets ou tableau 2D)
   * Supporte tous les formats (2022, 2023, 2024, 2025+) avec détection dynamique d'en-têtes.
   */
  static parseDeliberationFromMatrix(rawMatrix: any[][], campaignYear?: number): DeliberationParsedRow[] {
    return this.parseDeliberationMatrixCore(rawMatrix, campaignYear);
  }

  /**
   * Parse une matrice brute pour la feuille TJ Cible
   */
  static parseEvaluationsFromMatrix(rawMatrix: any[][], campaignYear?: number): EvaluationParsedRow[] {
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

    const headerRow = rawMatrix[headerRowIndex] || [];
    const colGHeader = normalizeHeader(String(headerRow[6] || ''));
    const colIHeader = normalizeHeader(String(headerRow[8] || ''));
    const colKHeader = normalizeHeader(String(headerRow[10] || ''));
    const is2022_2023Format = (campaignYear !== undefined && campaignYear <= 2023) ||
      colGHeader === 'cv' || colGHeader.includes('cv') ||
      colIHeader === 'date_fin' || colIHeader.includes('date') ||
      colKHeader.includes('evaluat');

    const effectiveYearTJ = campaignYear || (is2022_2023Format ? 2023 : 2024);
    const columnIndex = (field: string, fallback: number, ...altFields: string[]) => {
      const configured = getColumnIndexFromSpecs('TJ_Cible', effectiveYearTJ, field, ...altFields);
      return configured >= 0 ? configured : fallback;
    };

    const rows: EvaluationParsedRow[] = [];

    for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
      const rowArr = rawMatrix[i];
      if (!rowArr || rowArr.length === 0) continue;

      const matricule = cleanString(rowArr[columnIndex('matricule', 0)]);
      const experience = cleanString(rowArr[columnIndex('experience', 1)]);
      const tjVendu0107 = parseFrenchNumber(rowArr[columnIndex('tjVendu0107', 2)]);
      const candidatePrenom = cleanString(rowArr[columnIndex('candidatePrenom', 3)]);
      const candidateNom = cleanString(rowArr[columnIndex('candidateNom', 4)]);
      const candidateName = `${candidatePrenom} ${candidateNom}`.trim() || candidateNom || candidatePrenom || '';
      if (!candidateName && !matricule) continue;

      const grade = cleanString(rowArr[columnIndex('grade', 5)]);

      let client: string = '';
      let project: string = '';
      let rawEvaluator: string = '';
      let relationStartIndex = 9;
      let tjCibleMin: number | undefined;
      let tjCibleMax: number | undefined;
      let justification: string = '';
      let improvementAxes: string = '';
      let confidenceIndex: number | undefined;

      if (is2022_2023Format) {
        // --- FORMAT 2022 & 2023 ---
        // Col H (7) : Client, Col J (9) : Projet, Col K (10) : Evaluateur
        client = cleanString(rowArr[7]);
        project = cleanString(rowArr[9]);
        rawEvaluator = cleanString(rowArr[10]);
        relationStartIndex = 11; // Col L (11) à Col R (17)

        // Col U (20) : "TJ Cible Min"
        tjCibleMin = parseFrenchNumber(rowArr[20]);
        // Col V (21) : "TJ Cible Max"
        tjCibleMax = parseFrenchNumber(rowArr[21]);
        // Col W (22) : "Justification TJ Cible"
        justification = cleanString(rowArr[22]);
        // Col X (23) : "Axes pour augmenter le TJ"
        improvementAxes = cleanString(rowArr[23]);
        // Col Y (24) : "Indice de confiance"
        confidenceIndex = parseFrenchNumber(rowArr[24]);
      } else {
        // --- FORMAT 2024 & 2025 ---
        // Col G (6) : Client, Col H (7) : Projet, Col I (8) : Evaluateur
        client = cleanString(rowArr[6]);
        project = cleanString(rowArr[7]);
        rawEvaluator = cleanString(rowArr[8]);
        relationStartIndex = 9; // Col J (9) à Col P (15)

        // Col S (18) : "TJ Cible Min"
        tjCibleMin = parseFrenchNumber(rowArr[18]);
        // Col T (19) : "TJ Cible Max"
        tjCibleMax = parseFrenchNumber(rowArr[19]);
        // Col U (20) : "Justification TJ Cible"
        justification = cleanString(rowArr[20]);
        // Col V (21) : "Axes pour augmenter le TJ"
        improvementAxes = cleanString(rowArr[21]);
        // Col W (22) : "Indice de confiance"
        confidenceIndex = parseFrenchNumber(rowArr[22]);
      }

      client = cleanString(rowArr[columnIndex('client', is2022_2023Format ? 7 : 6)]);
      project = cleanString(rowArr[columnIndex('project', is2022_2023Format ? 9 : 7)]);
      rawEvaluator = cleanString(rowArr[columnIndex('evaluatorName', is2022_2023Format ? 10 : 8)]);
      relationStartIndex = columnIndex('relAutoEvaluation', is2022_2023Format ? 11 : 9);
      tjCibleMin = parseFrenchNumber(rowArr[columnIndex('tjCibleMin', is2022_2023Format ? 20 : 18)]);
      tjCibleMax = parseFrenchNumber(rowArr[columnIndex('tjCibleMax', is2022_2023Format ? 21 : 19)]);
      justification = cleanString(rowArr[columnIndex('justification', is2022_2023Format ? 22 : 20)]);
      improvementAxes = cleanString(rowArr[columnIndex('improvementAxes', is2022_2023Format ? 23 : 21)]);
      confidenceIndex = parseFrenchNumber(rowArr[columnIndex('confidenceIndex', is2022_2023Format ? 24 : 22)]);

      const evaluatorMatricule = rawEvaluator;
      const evaluatorName = rawEvaluator;

      const isChecked = (colIdx: number) => {
        const val = cleanString(rowArr[colIdx]).toLowerCase();
        return val === 'x' || val === '1' || val === 'oui' || val === 'true' || val === 'vrai' || val.length > 0;
      };

      let detectedType: EvaluationRelationType = 'Collègue_Mission';
      if (isChecked(relationStartIndex)) detectedType = 'Auto_Evaluation';
      else if (isChecked(relationStartIndex + 1)) detectedType = 'Commerciale';
      else if (isChecked(relationStartIndex + 2)) detectedType = 'Encadrement';
      else if (isChecked(relationStartIndex + 3)) detectedType = 'Meteo_Client';
      else if (isChecked(relationStartIndex + 4)) detectedType = 'Coach';
      else if (isChecked(relationStartIndex + 5)) detectedType = 'Logiclever';
      else if (isChecked(relationStartIndex + 6)) detectedType = 'Collègue_Mission';

      const searchStartCol = is2022_2023Format ? 18 : 16;
      for (let c = searchStartCol; c < rowArr.length; c++) {
        const h = normalizeHeader(String(rawMatrix[headerRowIndex]?.[c] || ''));
        if (h.includes('min') && h.includes('tj') && tjCibleMin === undefined) tjCibleMin = parseFrenchNumber(rowArr[c]);
        else if (h.includes('max') && h.includes('tj') && tjCibleMax === undefined) tjCibleMax = parseFrenchNumber(rowArr[c]);
        else if ((h.includes('justification') || h.includes('argumentaire')) && !justification) justification = cleanString(rowArr[c]);
        else if ((h.includes('axe') || h.includes('augmenter')) && !improvementAxes) improvementAxes = cleanString(rowArr[c]);
        else if ((h.includes('confiance') || h.includes('indice')) && confidenceIndex === undefined) confidenceIndex = parseFrenchNumber(rowArr[c]);
      }

      let normalizedConfidence: number | undefined = undefined;
      if (confidenceIndex !== undefined && !isNaN(confidenceIndex) && confidenceIndex > 0) {
        normalizedConfidence = confidenceIndex > 5 ? Math.round(confidenceIndex / 2) : confidenceIndex;
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
        confidenceIndex: normalizedConfidence
      });
    }

    return rows;
  }

  /**
   * Parse la feuille Vue_Meteo de Vues_LL_NEW_DRIVE
   * - Col B (index 1) : IdProfil du consultant évalué (STRICTEMENT Col B)
   * - Col Z (index 25) : Année de la campagne
   * - Col Q (index 16) : Liens_Meteo
   * - Col F (index 5) : Date Meteo
   * - Col S (index 18) : Client
   */
  static parseMeteosFromMatrix(rawMatrix: any[][]): CatchupMeteoItem[] {
    if (!rawMatrix || rawMatrix.length === 0) return [];
    const columnIndex = (field: string) =>
      CampaignColumnsSpecificationService.getStaticColumnIndex('Vues_LL_NEW_DRIVE', 'Vue_Meteo', field);
    const items: CatchupMeteoItem[] = [];
    for (let i = 1; i < rawMatrix.length; i++) {
      const row = rawMatrix[i];
      if (!row || row.length === 0) continue;
      const idProfil = cleanString(row[columnIndex('idProfil')]).toUpperCase();
      const year = cleanString(row[columnIndex('year')]);
      const link = cleanString(row[columnIndex('link')]);
      const date = cleanString(row[columnIndex('date')]);
      const client = cleanString(row[columnIndex('client')]);
      if (idProfil && link && link.startsWith('http')) {
        items.push({ idProfil, year, link, date: date || undefined, client: client || undefined });
      }
    }
    return items;
  }
}
