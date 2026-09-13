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
  mode?: 'NEW' | 'HISTORY';
  importState?: 'RUNNING' | 'FAILED' | 'READY';
  sourceFiles?: string[];
  importRunId?: string;
}
export type Grade = 'Junior' | 'Confirmé' | 'Senior' | 'Expert';
export type ConsultationType = 'Auto_Evaluation' | 'Commerciale' | 'Encadrement' | 'Meteo_Client' | 'Coach Logiclever' | 'Collègue_Mission';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  team?: string;
  position?: string;
  experienceYears?: number;
  entryDate?: string;
  expertGradeDate?: string;
  currentGrade?: Grade;
  currentSalary?: number;
  currentTJM?: number;
  matricule?: string;
  assignedCandidateIds?: string[];
  createdAt: any;
  updatedAt?: any;
  profileId?: string;
  firstName?: string;
  lastName?: string;
  profileType?: string;
  boondId?: string;
  experienceAtHire?: number;
  seniorityYears?: number;
  expertYears?: number;
  active?: boolean;
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
  sourceId?: string;
  sourceUrl?: string;
  clientId?: string;
  authorProfileId?: string;
  sourceStatus?: string;
  consultantSatisfaction?: string;
  consultantImprovement?: string;
  consultantPerspectives?: string;
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
  knowHow: string; 
  progressionDetails: string; // Sur quelles compétences métier / applicatifs ?
  techDetails: string; // Sur quels logiciels / technologies ?
  certificationsDetail: string; // Avez-vous de nouvelles certifications ?
  meetingPrep: string; // Préparation / Animation de réunion ?
  deliverables: string; // Quels livrables avez-vous faits ?
  
  // Autonomy
  missionAutonomy: string;
  autonomyLevel: Grade | 'Junior'; // Level claimed by candidate
  autonomyJustification: string;
  
  // Vente / Commercial
  commercialPresentation: string; // Présenté Logiclever ?
  commercialAdvice: string; // Conseils donnés clients ?
  commercialProposition: string; // Force de proposition ?
  commercialOffers: string; // Propositions commerciales faites ?
  
  // Vie Logiclever
  lifeLogiclever: string;
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
  
  // Objectives & Career
  careerGoals: string; // Vision moyen-terme (Vision / Carrière)
  nextObjectives: NextObjective[]; // Vision court-terme (Mise en oeuvre)
  
  // Pretentions
  salaryExpectations: string; // Commentaire libre pour le Jury
  wishedGrade: Grade;
  wishedSalary: number;
  currentSalary: number;
  currentGrade?: Grade;
  currentTJM: number;
  targetTJM: number;
  
  satisfaction: Satisfaction;
}

export interface ConsultantFeedback {
  consultantId: string;
  consultantName: string;
  type: ConsultationType;
  targetTJMin: number;
  targetTJMax: number;
  justification: string;
  improvementAxes: string;
  confidenceIndex: number; // 0-5 or 1-10
  validated: boolean;
  updatedAt: any;
  id?: string;
  candidateId?: string;
  campaignYear?: number;
  client?: string;
  project?: string;
  sourceGrade?: string;
  sourceTJM?: number;
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
  // Analytical columns for Salary Table
  investmentPercentage?: number; // % Investissement (objectif 60)
  missionPercentage?: number;    // % Mission (objectif 98)
  whyThisSalary?: string;
  whatToDoMore?: string;
  consultantFeeling?: string;
  primeBefore?: number;
  primeAfter?: number;
  proposedSalaryFormule?: number; 
  maxSalaryIfTJIncreases?: number;
  maxSalaryIfVenduIncreases?: number;
  finalGrade?: string;
  secondRoundFeedback?: string;
}

export interface Dossier {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  campaignYear: number;
  status: DossierStatus;
  
  // Data from Candidate
  annualReport?: AnnualReport;
  clientFeedbacks?: ClientFeedback[];
  documents?: DossierDocument[];
  
  // Assignments
  assignedConsultantIds: string[];
  
  // Feedbacks from Consultants
  consultantFeedbacks: Record<string, ConsultantFeedback>; // Key is consultantId
  
  // Decision
  juryDecision?: JuryDecision;
  
  createdAt: any;
  updatedAt: any;
  rhSnapshot?: Partial<UserProfile>;
  campaignLocked?: boolean;
  archived?: boolean;
  sourceFiles?: string[];
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
