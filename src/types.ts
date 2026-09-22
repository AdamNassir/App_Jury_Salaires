export type UserRole = 'CANDIDATE' | 'JURY' | 'ADMIN' | 'EVALUATOR';
export type DossierStatus = 'OUVERT' | 'COMPLET' | 'VALIDE';
export type CampaignStatus = 'OUVERTE' | 'CLÔTURÉE' | 'EN_PRÉPARATION';

export interface CampaignFile {
  id: string;
  name: string;
  category: 'RH_EFFECTIFS' | 'PAIRS_CONFIG' | 'AUTRE';
  url: string;
  size?: number;
  uploadedAt: string;
}

export interface Campaign {
  id: string;
  year: number;
  title: string;
  description?: string;
  status: CampaignStatus;
  rhDocuments: CampaignFile[];
  pairsDocuments: CampaignFile[];
  otherDocuments: CampaignFile[];
  createdBy?: string;
  createdAt: any;
  updatedAt?: any;
  closedAt?: any;
  closedBy?: string;
}
export type Grade = 'Junior' | 'Confirmé' | 'Senior' | 'Expert';

export type EvaluationRelationType = 
  | 'Auto_Evaluation'
  | 'Commerciale'
  | 'Encadrement'
  | 'Meteo_Client'
  | 'Coach'
  | 'Logiclever'
  | 'Coach Logiclever'
  | 'Collègue_Mission';

export type ConsultationType = 
  | EvaluationRelationType
  | 'Commerciale' 
  | 'Encadrement' 
  | 'Météo Client' 
  | 'Coach' 
  | 'Logiclever' 
  | 'Collègue en mission' 
  | 'COP & Epic';

export type PersonneStatus = 'ACTIF' | 'INACTIF' | 'SORTI';
export type PersonneType = 'COLLABORATEUR' | 'ASSOCIE' | 'FREELANCE' | 'EXTERNE';

/**
 * Personne : Entité canonique du référentiel (clé métier canonique = idProfil APP_LL ou Boond)
 * Distincte de l'UID d'authentification Firebase (qui est l'identifiant du compte de connexion).
 * Une personne peut exister sans être candidate à une campagne.
 */
export interface Personne {
  idProfil: string; // Canonique métier (ex: ID Boond, matricule ou idProfil)
  matricule?: string;
  trigramme?: string;
  nom: string;
  prenom: string;
  displayName: string;
  email: string;
  statut: PersonneStatus;
  type: PersonneType;
  entryDate?: string;
  experienceYearsEmbauche?: number;
  expertGradeDate?: string;
  firebaseUid?: string; // UID Firebase Auth associé (si un compte de connexion existe)
  notes?: string;
  createdAt: any;
  updatedAt?: any;
}

/**
 * Snapshot RH d'une personne pour une campagne spécifique.
 * Préserve l'indépendance historique de chaque campagne :
 * Modifier les valeurs d'une nouvelle campagne ne touche pas les campagnes antérieures.
 */
export interface CampaignParticipant {
  id: string; // Ex: `${campaignId}_${idProfil}`
  campaignId: string;
  campaignYear: number;
  idProfil: string; // Clé canonique vers la Personne
  matricule?: string;
  displayName: string;
  email: string;
  team?: string;
  position?: string;
  
  // Données RH figées pour la campagne
  grade: Grade | 'Junior';
  salary: number; // Salaire de référence au 30/06 de l'année
  tjm: number; // TJ vendu de référence (legacy field name)
  tjSalaire?: number; // TJ salaire de référence
  entryDate?: string;
  expertGradeDate?: string;
  totalExperienceYears?: number;
  ancienneteLL?: number;
  yearsExpert?: number;
  
  // Rôles sur la campagne
  isCandidate: boolean; // Si true, a un dossier de campagne
  isEvaluator: boolean; // Si true, peut évaluer des pairs (même freelance/associé sans dossier candidat)
  dossierId?: string; // Référence vers le dossier si isCandidate = true
  
  assignedCandidateIds?: string[]; // IDs des candidats que cet évaluateur doit noter
  createdAt: any;
  updatedAt?: any;
}

/**
 * Diagnostic de réconciliation des données existantes
 */
export interface ReconciliationStatus {
  id: string; // idProfil ou uid ou matricule
  source: 'users' | 'dossiers' | 'personnes';
  idProfil?: string;
  firebaseUid?: string;
  email?: string;
  displayName?: string;
  status: 'MATCHED' | 'UNRESOLVED' | 'CONFLICT' | 'LEGACY';
  reason?: string;
}

export interface UserProfile {
  id: string; // Firebase Auth UID
  idProfil?: string; // Référence vers Personne.idProfil
  email: string;
  displayName: string;
  roles: UserRole[];
  team?: string;
  position?: string;
  experienceYears?: number;
  ancienneteLL?: number;
  yearsExpert?: number;
  entryDate?: string;
  expertGradeDate?: string;
  currentGrade?: Grade;
  currentSalary?: number;
  currentTJM?: number; // TJ Vendu (legacy field name kept for compatibility)
  currentTJSalaire?: number; // TJ Salaire issu de la colonne AE du rapport RH
  matricule?: string;
  assignedCandidateIds?: string[];
  createdAt: any;
  updatedAt?: any;
}

export interface DossierDocument {
  type: string;
  name: string;
  url: string;
  uploadedAt: any;
  fieldsPopulated?: boolean;
}

export interface ClientFeedback {
  id: string;
  client: string;
  mission: string;
  satisfactionItems: string;
  improvementAxes: string;
  perspectives: string;
  recommendation: string;
  clientVision?: string;
  consultantVision?: string;
  clientRating?: number; // Note sur 10 Client
  consultantRating?: number; // Note sur 10 Consultant
  realizationDate?: string; // Date de réalisation de la météo
  liensMeteo?: string;
  fileUrl?: string;
}

export interface PreviousObjective {
  objective: string;
  comments: string;
  reached: 'OUI' | 'NON' | 'PARTIEL';
}

export interface NextObjective {
  objective: string;
  benefit: string;
  means: string;
  measures: string;
  result?: string;
}

export interface Satisfaction {
  tasks: 'TR' | 'M' | 'C' | 'S'; // Très Insatisfait, Moyen, Content, Super
  wellBeingMission: 'TR' | 'M' | 'C' | 'S';
  wellBeingClient: 'TR' | 'M' | 'C' | 'S';
  wellBeingLogiclever: 'TR' | 'M' | 'C' | 'S';
  comment?: string;
}

export interface AnnualReport {
  // Synthesis & Context
  yearSummary: string; // July 1 to June 30
  synthesis: string;
  
  // Previous Year
  previousObjectives: PreviousObjective[];
  
  // Sections based on PDF
  commercialActivities: string;
  training: string;
  
  // Savoir-faire
  cv?: { name: string; url: string };
  skillsProfileType?: string;
  skillsExperience?: string;
  skillsDeliverables?: string;
  skillsProjectStage?: string;
  skillsCategory?: string;
  skillsDetails?: Record<string, { exp?: string; level?: string; summary?: string; role?: string }>;
  knowHow: string; 
  progressionDetails: string; // Sur quelles compétences métier / applicatifs ?
  techDetails: string; // Sur quels logiciels / technologies ?
  certificationsDetail: string; // Avez-vous de nouvelles certifications ?
  meetingPrep: string; // Préparation / Animation de réunion ?
  deliverables: string; // Quels livrables avez-vous faits ?
  
  // Autonomy
  missionAutonomy: string;
  missionAutonomies?: any[];
  missionClients?: { client: string; actions: string; grade: Grade | ''; comment: string }[];
  autonomyLevel: Grade | 'Junior'; // Level claimed by candidate
  autonomyJustification: string;
  
  // Vente / Commercial
  commercialPresentation: string; // Présenté Logiclever ?
  commercialAdvice: string; // Conseils donnés clients ?
  commercialProposition: string; // Force de proposition ?
  commercialOffers: string; // Propositions commerciales faites ?
  
  // Vie Logiclever
  lifeLogiclever: string;
  lifeOther?: string;
  lifeKnowledgeSharing: string; // Capitalisation (Drive)
  lifeSlack: string; // Partage d'information (SLACK)
  lifeTeamSpirit: string; // Lien entre consultants
  lifeBusinessModel: string; // Maîtrise business model
  internalInvestment?: number; // Estimation de l'investissement interne (0-100)

  // Intercontrat
  hadIntercontrat?: boolean;
  intercontratDays?: number;
  intercontratAchievements?: string;
  
  // Recrutement
  recruitmentPromotion: string; // Promouvoir Logiclever
  recruitmentInterviews: string; // Interviewé des candidats ?
  recruitmentSocial: string; // Réseaux sociaux
  
  // Encadrement
  encadrementCoach: string; // Sollicité mon coach ?
  encadrementManager: string; // Sollicité mon encadrant ?
  
  // Amélioration Continue (SQUAD)
  squadEntries?: { squad: string; contributions: string }[];
  squadName: string;
  squadRole: string;
  squadContributions: string;
  
  // Specific for Referents or Aspiring Referents
  isReferentOrAspiring: boolean;
  coachedConsultantsCount: number;
  recruitmentInterviewsCount: number;
  clientFollowUpMeteos: string;
  coordinationPoints: string;
  referentSquadRole: string;
  donorNetworkActions: string;
  encadrementMissionDetails: string;
  encadrementCoachingDetails: string;
  referentMissionFollowUps?: { client: string; meteosMenees: string; pointsRemontes: string }[];
  referentNetworkEntries?: { clientProspect: string; actions: string }[];
  referentMissionEncadrements?: { client: string; personneEncadree: string; commentaire: string }[];
  referentCoachingEntries?: { personneCoachee: string; commentaire: string }[];
  referentOnboardingAnimation?: string;
  referentAccountEntries?: { compte: string; actions: string }[];
  referentAccountTeamMeetings?: string;
  referentOtherActions?: string;
  referentOffersEntries?: { offre: string; details: string }[];
  
  // Objectives & Career
  careerGoals: string; // Vision moyen-terme (Vision / Carrière)
  careerGoal1?: string;
  careerGoal2?: string;
  careerGoalsList?: string[];
  nextObjectives: NextObjective[]; // Vision court-terme (Mise en oeuvre)
  
  // Pretentions
  salaryExpectations: string; // Commentaire libre pour le Jury
  wishedGrade: Grade;
  wishedSalary: number;
  wishedSalaryDate?: string; // Date d'effet / date de référence souhaitée (ex: 2026-07-01)
  currentSalary: number;
  currentGrade?: Grade;
  currentTJM: number; // TJ Vendu (legacy field name kept for compatibility)
  currentTJSalaire?: number; // TJ Salaire issu de la colonne AE du rapport RH
  targetTJM: number;
  
  satisfaction: Satisfaction;
}

export interface ConsultantFeedback {
  id?: string;
  consultantId: string;
  consultantName: string;
  type: ConsultationType;
  relationType?: EvaluationRelationType | string;
  campaignId?: string;
  client?: string;
  project?: string;
  evaluatorUid?: string;
  evaluatorIdProfil?: string;
  isLegacyType?: boolean;
  status?: 'BROUILLON' | 'VALIDE';
  targetTJMin: number;
  targetTJMax: number;
  missionPercentage?: number; // % Mission préconisé par l'évaluateur (ex: 98)
  investmentPercentage?: number; // % Investissement préconisé par l'évaluateur (ex: 60)
  justification: string;
  improvementAxes: string;
  confidenceIndex: number; // 1-5
  validated: boolean;
  updatedAt: any;
}

export interface JuryDecision {
  verdict: string;
  amount: number;
  percentage: number;
  advice: string;
  conclusion: string;
  date: any;
  unanimous?: boolean;
  referentJury?: string;
  // Analytical and historical deliberation columns
  gradeDecision?: Grade | string;
  tjVendu0107?: number;
  tjCibleDecision?: number;
  salaire3006?: number;
  wishedSalary0107?: number;
  proposedSalary0107?: number;
  maxSalaryIfTjVenduIncreases?: number;
  whyThisSalary?: string;
  whatToDoMore?: string;
  consultantFeeling?: string;
  secondTourFeedback?: string;
  investmentPercentage?: number; // % Investissement (objectif 60)
  missionPercentage?: number;    // % Mission (objectif 98)
  primeBefore?: number;
  primeAfter?: number;
  proposedSalaryFormule?: number; 
  maxSalaryIfTJIncreases?: number;
  maxSalaryIfVenduIncreases?: number;
}

export interface JuryMemberReview extends Partial<JuryDecision> {
  juryUid: string;
  juryName: string;
  juryEmail: string;
  whyThisSalary: string;
  whatToDoMore: string;
  verdict?: string;
  proposedSalary?: number;
  percentage?: number;
  isFinalized?: boolean;
  finalizedAt?: string;
  updatedAt: string;
}

export interface Dossier {
  id: string;
  candidateId: string; // idProfil (ou legacy UID pour les anciens dossiers)
  idProfil?: string; // Clé canonique APP_LL / Boond
  campaignId?: string; // Référence vers la campagne spécifique
  candidateName: string;
  candidateEmail: string;
  campaignYear: number;
  status: DossierStatus;
  
  // Data from Candidate
  annualReport?: AnnualReport;
  clientFeedbacks?: ClientFeedback[];
  meteoLinks?: any;
  documents?: DossierDocument[];
  
  // Assignments
  assignedConsultantIds: string[];
  
  // Feedbacks from Consultants
  consultantFeedbacks: Record<string, ConsultantFeedback>; // Key is consultantId
  
  // Decision
  juryDecision?: JuryDecision;
  juryMemberReviews?: Record<string, JuryMemberReview>; // Key is juryUid or email
  
  createdAt: any;
  updatedAt: any;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}
