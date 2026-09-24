import { UserProfile, Dossier, Grade } from '../types';
import { UserDirectoryService } from './userDirectoryService';
import { LocalDatabaseService } from './localDatabaseService';
import { commitMutations } from './localStore';

const FIRST_NAMES = [
  'Thomas', 'Camille', 'Lucas', 'Sarah', 'Alexandre', 'Julie', 'Maxime', 'Emma', 
  'Antoine', 'Léa', 'Nicolas', 'Chloé', 'Pierre', 'Manon', 'Julien', 'Laura', 
  'Hugo', 'Mathilde', 'Romain', 'Inès', 'Paul', 'Clara', 'Arthur', 'Anaïs', 
  'Valentin', 'Charlotte', 'Théo', 'Marine', 'Clément', 'Lucie', 'Bastien', 'Pauline', 
  'Quentin', 'Marion', 'Nathan', 'Juliette', 'Adrien', 'Louise', 'Florian', 'Eva', 
  'Gabriel', 'Alice', 'Louis', 'Zoé', 'Simon', 'Noémie', 'Victor', 'Justine', 
  'Raphaël', 'Agathe'
];

const LAST_NAMES = [
  'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 
  'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 
  'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Lefevre', 
  'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez', 'Legrand', 'Garnier', 
  'Faure', 'Rousseau', 'Blanc', 'Guerin', 'Muller', 'Henry', 'Roussel', 'Nicolas', 
  'Perrin', 'Morin', 'Mathieu', 'Clement', 'Gauthier', 'Dumont', 'Lopez', 'Fontaine', 
  'Chevalier', 'Robin'
];

const GRADES: Grade[] = ['Confirmé', 'Senior', 'Expert'];

function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomFloat(min: number, max: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round((Math.random() * (max - min) + min) * factor) / factor;
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generates values strongly biased towards the higher end (power < 1)
function getRandomHighBiased(min: number, max: number, power = 0.35, decimals = 1): number {
  const factor = 10 ** decimals;
  const biasedRatio = Math.pow(Math.random(), power);
  const val = min + biasedRatio * (max - min);
  return Math.round(Math.min(max, Math.max(min, val)) * factor) / factor;
}

export interface GeneratedDummyData {
  users: UserProfile[];
  dossiers: Dossier[];
}

export function generate50DummyUsers(campaignId = 'campaign_2025'): GeneratedDummyData {
  const users: UserProfile[] = [];
  const dossiers: Dossier[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < 50; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[i % LAST_NAMES.length];
    const displayName = `${firstName} ${lastName}`;
    const idProfil = `DUMMY_USR_${String(i + 1).padStart(3, '0')}`;
    const dossierId = `DUMMY_DOS_${String(i + 1).padStart(3, '0')}`;
    const matricule = `TEST-${String(i + 1).padStart(2, '0')}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@test-consultant.com`;

    const currentGrade = getRandomItem(GRADES);
    const wishedGrade = currentGrade === 'Confirmé' ? 'Senior' : currentGrade === 'Senior' ? 'Expert' : 'Expert';
    const currentSalary = getRandomInt(38, 78) * 1000;
    const currentTJM = getRandomInt(60, 95) * 10;
    const targetTJM = currentTJM - getRandomInt(2, 8) * 10;

    // % Mission strictly integers between 95 and 100, leaning heavily towards higher values (98 - 100)
    // to test optimizer decreasing candidates near the average and protecting high performers
    const randomMission = getRandomHighBiased(95, 100, 0.35, 0);

    // % Investissement strictly discrete multiples of 10 between 0 and 100, leaning towards higher values (70 - 100)
    // so global average starts around ~70-80% (> 60%), requiring optimizer to decrease
    const randomInvestment = Math.round(getRandomHighBiased(40, 100, 0.4, 0) / 10) * 10;

    const user: UserProfile = {
      id: idProfil,
      idProfil,
      matricule,
      displayName,
      email,
      roles: ['CANDIDATE'],
      team: 'Logic Clever Test',
      position: 'Consultant',
      currentGrade,
      currentSalary,
      currentTJM,
      currentTJSalaire: currentTJM,
      entryDate: `202${getRandomInt(0, 3)}-0${getRandomInt(1, 9)}-15`,
      expertGradeDate: currentGrade === 'Expert' ? '2023-01-01' : undefined,
      experienceYears: getRandomInt(2, 12),
      ancienneteLL: getRandomInt(1, 6),
      yearsExpert: currentGrade === 'Expert' ? getRandomInt(1, 4) : 0,
      assignedCandidateIds: [],
      createdAt: now,
      updatedAt: now,
    };

    const dossier: Dossier = {
      id: dossierId,
      candidateId: idProfil,
      idProfil,
      candidateName: displayName,
      candidateEmail: email,
      campaignId,
      campaignYear: 2025,
      status: 'VALIDE',
      clientFeedbacks: [],
      annualReport: {
        yearSummary: 'Année 2024-2025 marquée par des réussites opérationnelles.',
        synthesis: 'Excellente implication.',
        previousObjectives: [],
        commercialActivities: 'Participation avant-vente',
        training: 'Formations cloud',
        knowHow: 'Expertise technique reconnue',
        progressionDetails: 'Architecture et devops',
        techDetails: 'React, TypeScript, Node.js, Cloud',
        certificationsDetail: 'Certifié GCP',
        meetingPrep: 'Animation comités techniques',
        deliverables: 'Spécifications et code de production',
        missionAutonomy: 'Autonomie totale',
        autonomyLevel: currentGrade,
        autonomyJustification: 'Gestion autonome des missions',
        commercialPresentation: 'Présentation aux prospects',
        commercialAdvice: 'Conseil en cadrage',
        commercialProposition: 'Propositions de modernisation',
        commercialOffers: 'Réponse à 2 AO',
        lifeLogiclever: 'Participation active aux squad meetings',
        currentGrade,
        wishedGrade,
        currentSalary,
        wishedSalary: currentSalary + getRandomInt(2, 6) * 1000,
        currentTJM,
        currentTJSalaire: currentTJM,
        targetTJM,
        salaryExpectations: 'Revalorisation annuelle suite aux missions réalisées.',
        careerGoals: 'Poursuivre la montée en compétences et le rayonnement interne.',
        nextObjectives: [],
        satisfaction: {
          tasks: 'S',
          wellBeingMission: 'S',
          wellBeingClient: 'C',
          wellBeingLogiclever: 'S',
        },
        coachedConsultantsCount: getRandomInt(0, 3),
        recruitmentInterviewsCount: getRandomInt(0, 5),
        clientFollowUpMeteos: 'Régulières',
        coordinationPoints: 'Hebdomadaires',
        referentSquadRole: 'Membre actif',
        donorNetworkActions: 'Présentation de 2 profils',
        encadrementMissionDetails: 'Accompagnement de juniors',
        encadrementCoachingDetails: 'Mentorat technique',
      } as any as import('../types').AnnualReport,
      juryDecision: {
        verdict: 'FAVORABLE',
        amount: currentSalary + getRandomInt(2, 5) * 1000,
        percentage: getRandomFloat(3.5, 9.0, 1),
        advice: 'Très bon parcours.',
        conclusion: 'Augmentation validée.',
        date: now,
        // The two key test values
        missionPercentage: randomMission,
        investmentPercentage: randomInvestment,
        gradeDecision: wishedGrade,
        tjVendu0107: currentTJM,
        tjCibleDecision: targetTJM,
        salaire3006: currentSalary,
      },
      assignedConsultantIds: [],
      consultantFeedbacks: {},
      juryMemberReviews: {},
      documents: [],
      createdAt: now,
      updatedAt: now,
    };

    users.push(user);
    dossiers.push(dossier);
  }

  return { users, dossiers };
}

/**
 * Inserts the 50 dummy users and dossiers into LocalDatabaseService & localStore.
 */
export function seed50DummyUsers(campaignId = 'campaign_2025'): { userCount: number; dossierCount: number } {
  const { users, dossiers } = generate50DummyUsers(campaignId);

  // 1. Commit users
  commitMutations(users.map(u => ({
    collection: 'users',
    id: u.id,
    kind: 'set',
    data: u
  })));

  // 2. Commit dossiers
  commitMutations(dossiers.map(d => ({
    collection: 'dossiers',
    id: d.id,
    kind: 'set',
    data: d
  })));

  // 3. Sync to disk in background
  UserDirectoryService.syncUsersToDisk(users);

  return {
    userCount: users.length,
    dossierCount: dossiers.length
  };
}

/**
 * Removes all dummy users and dossiers created by the test generator,
 * as well as any orphaned dossiers without a corresponding user profile.
 */
export function clearDummyUsers(): { removedDossiers: number; removedUsers: number } {
  const allUsers = UserDirectoryService.getAllUsers();
  const dummyUsers = allUsers.filter(u => u.id.startsWith('DUMMY_USR_') || u.idProfil?.startsWith('DUMMY_USR_'));
  
  const validUserIds = new Set(
    allUsers
      .filter(u => !u.id.startsWith('DUMMY_USR_') && !u.idProfil?.startsWith('DUMMY_USR_'))
      .map(u => u.id)
  );
  allUsers.forEach(u => {
    if (u.idProfil) validUserIds.add(u.idProfil);
  });

  const allDossiers = LocalDatabaseService.getDossiers();
  const dossiersToDelete = allDossiers.filter(d => {
    const isExplicitDummy = 
      d.id.startsWith('DUMMY_DOS_') || 
      (d.candidateId && d.candidateId.startsWith('DUMMY_USR_')) ||
      (d.idProfil && d.idProfil.startsWith('DUMMY_USR_'));

    if (isExplicitDummy) return true;

    // Orphaned dossier: candidateId doesn't belong to any valid user
    const hasCandidate = d.candidateId && validUserIds.has(d.candidateId);
    const hasProfil = d.idProfil && validUserIds.has(d.idProfil);
    return !hasCandidate && !hasProfil;
  });

  commitMutations([
    ...dummyUsers.map(u => ({ collection: 'users' as const, id: u.id, kind: 'delete' as const })),
    ...dossiersToDelete.map(d => ({ collection: 'dossiers' as const, id: d.id, kind: 'delete' as const }))
  ]);

  return {
    removedUsers: dummyUsers.length,
    removedDossiers: dossiersToDelete.length
  };
}
