import { collection, doc, writeBatch, serverTimestamp, getDocs, query, where } from '../lib/localDatabase';
import { auth } from '../lib/firebase';
import { db } from '../lib/localDatabase';
import { UserProfile, Dossier, Grade, ConsultationType, UserRole } from '../types';
import { v4 as uuidv4 } from 'uuid';

const TEAMS = ['Cloud & DevOps', 'Data & AI', 'Digital Experience', 'Business Consulting'];
const CLIENTS = ['BNP Paribas', 'Société Générale', 'AXA', 'L\'Oréal', 'TotalEnergies', 'Air France'];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CANDIDATES_DATA = [
  { m: 'ADO', p: 'Alexandre', n: 'A', exp: 7.7, entry: '2018-02-12', expertDate: '2022-07-01', grade: 'Expert' as Grade, tj: 670, salary: 65004, wishSalary: 66000, wishGrade: 'Expert' as Grade },
  { m: 'ANN', p: 'Anny', n: 'B', exp: 7.0, entry: '2024-05-13', expertDate: '', grade: 'Confirmé' as Grade, tj: 543, salary: 46000, wishSalary: 48000, wishGrade: 'Confirmé' as Grade },
  { m: 'ANO', p: 'Alice', n: 'C', exp: 9.9, entry: '2023-05-29', expertDate: '', grade: 'Expert' as Grade, tj: 650, salary: 58000, wishSalary: 60000, wishGrade: 'Expert' as Grade },
  { m: 'ARA', p: 'Aurélie', n: 'A', exp: 12.7, entry: '2018-09-10', expertDate: '2018-09-10', grade: 'Expert' as Grade, tj: 710, salary: 67000, wishSalary: 69000, wishGrade: 'Expert' as Grade },
  { m: 'ASA', p: 'Ahmed', n: 'B', exp: 6.2, entry: '2021-02-08', expertDate: '', grade: 'Senior' as Grade, tj: 620, salary: 54000, wishSalary: 58000, wishGrade: 'Senior' as Grade },
  { m: 'AVA', p: 'Arthur', n: 'C', exp: 10.5, entry: '2020-11-02', expertDate: '2022-07-01', grade: 'Expert' as Grade, tj: 720, salary: 68004, wishSalary: 70000, wishGrade: 'Expert' as Grade },
  { m: 'BMO', p: 'Baptiste', n: 'A', exp: 9.7, entry: '2024-09-04', expertDate: '', grade: 'Senior' as Grade, tj: 720, salary: 59000, wishSalary: 65000, wishGrade: 'Expert' as Grade },
  { m: 'CAL', p: 'Charlie', n: 'A', exp: 4.7, entry: '2024-09-04', expertDate: '', grade: 'Senior' as Grade, tj: 601, salary: 54000, wishSalary: 56000, wishGrade: 'Senior' as Grade },
  { m: 'CLM', p: 'Camille', n: 'C', exp: 11.3, entry: '2024-01-02', expertDate: '2024-01-02', grade: 'Expert' as Grade, tj: 695, salary: 63000, wishSalary: 68000, wishGrade: 'Expert' as Grade },
  { m: 'CME', p: 'Chloé', n: 'A', exp: 10.3, entry: '2020-02-03', expertDate: '2023-07-01', grade: 'Expert' as Grade, tj: 699, salary: 66000, wishSalary: 68000, wishGrade: 'Expert' as Grade },
  { m: 'DLA', p: 'David', n: 'B', exp: 7.9, entry: '2022-06-27', expertDate: '', grade: 'Senior' as Grade, tj: 590, salary: 55000, wishSalary: 56000, wishGrade: 'Senior' as Grade },
  { m: 'GBE', p: 'Guillaume', n: 'A', exp: 11.2, entry: '2021-03-08', expertDate: '2024-07-01', grade: 'Expert' as Grade, tj: 680, salary: 63000, wishSalary: 64000, wishGrade: 'Expert' as Grade },
  { m: 'GTA', p: 'Ghizlane', n: 'A', exp: 5.7, entry: '2021-02-08', expertDate: '', grade: 'Senior' as Grade, tj: 563, salary: 51000, wishSalary: 56000, wishGrade: 'Senior' as Grade },
  { m: 'ICH', p: 'Isselt', n: 'C', exp: 7.0, entry: '2022-05-16', expertDate: '', grade: 'Senior' as Grade, tj: 640, salary: 54000, wishSalary: 60000, wishGrade: 'Senior' as Grade },
  { m: 'IHA', p: 'Ikram', n: 'A', exp: 3.2, entry: '2024-03-12', expertDate: '', grade: 'Confirmé' as Grade, tj: 530, salary: 43000, wishSalary: 49000, wishGrade: 'Confirmé' as Grade },
];

export const seedMockData = async () => {
  console.log('Starting clear and seed process...');
  const batch = writeBatch(db);

  try {
    // 0. Clear existing dossiers
    const existingDossiers = await getDocs(collection(db, 'dossiers'));
    existingDossiers.forEach(d => batch.delete(d.ref));
    
    // We search for the admins to preserve their UIDs
    const existingUsers = await getDocs(collection(db, 'users'));
    const adminEmails = ['guillaumebestece@gmail.com', 'guillaume.best@logiclever.com'];
    const adminProfiles: Map<string, UserProfile> = new Map();
    
    existingUsers.forEach(u => {
      const data = u.data() as UserProfile;
      if (adminEmails.includes(data.email)) {
        adminProfiles.set(data.email, { ...data, id: u.id });
      } else if (data.roles?.includes('CANDIDATE')) {
        batch.delete(u.ref); // Delete mock candidates
      }
    });

    // 1. Ensure Admins work
    for (const email of adminEmails) {
      let profile = adminProfiles.get(email);
      if (!profile) {
        // If it's the current user, use their UID
        const currentUid = (auth.currentUser?.email === email) ? auth.currentUser.uid : `fixed-admin-${email.replace(/[@.]/g, '-')}`;
        profile = {
          id: currentUid,
          email: email,
          displayName: email === 'guillaumebestece@gmail.com' ? 'Guillaume Best' : 'Guillaume B.',
          roles: ['CANDIDATE', 'JURY', 'ADMIN'],
          team: 'Direction',
          currentGrade: 'Expert' as Grade,
          matricule: 'M-GB-' + email.split('@')[0],
          createdAt: serverTimestamp(),
        };
        batch.set(doc(db, 'users', profile.id), profile);
        adminProfiles.set(email, profile);
      } else {
        batch.update(doc(db, 'users', profile.id), {
          roles: Array.from(new Set([...(profile.roles || []), 'JURY' as UserRole, 'ADMIN' as UserRole])),
          updatedAt: serverTimestamp()
        });
      }
    }

    const primaryAdmin = adminProfiles.get('guillaumebestece@gmail.com') || Array.from(adminProfiles.values())[0];

    // 2. Create Jury/Reviewers
    console.log('Generating additional reviewers...');
    const consultants: UserProfile[] = Array.from(adminProfiles.values());
    const NAMES = ['Vincent', 'Alice', 'Camille', 'Arthur', 'Julien'];
    for (let i = 0; i < NAMES.length; i++) {
       const id = `consultant-${i}`;
       const consultant: UserProfile = {
         id,
         email: `${NAMES[i].toLowerCase()}@logiclever.mock`,
         displayName: NAMES[i],
         roles: ['JURY'],
         team: getRandomItem(TEAMS),
         currentGrade: 'Expert',
         experienceYears: 10,
         matricule: `C-${100 + i}`,
         createdAt: serverTimestamp(),
       };
       consultants.push(consultant);
       batch.set(doc(db, 'users', id), consultant);
    }

    // 3. Create Candidates
    console.log('Generating real candidates from data...');
    const assignedCandidateIdsByAdmin: string[] = [];

    CANDIDATES_DATA.forEach((data, i) => {
      const candidateId = `candidate-${data.m}`;
      const name = `${data.p} ${data.n}`;
      
      const candidate: UserProfile = {
        id: candidateId,
        email: `${data.p.toLowerCase()}.${data.n.toLowerCase()}@logiclever.mock`,
        displayName: name,
        roles: ['CANDIDATE'],
        team: getRandomItem(TEAMS),
        currentGrade: data.grade,
        currentSalary: data.salary,
        currentTJM: data.tj,
        experienceYears: data.exp,
        entryDate: data.entry,
        matricule: data.m,
        createdAt: serverTimestamp(),
        ...(data.expertDate ? { expertGradeDate: data.expertDate } : {})
      };
      batch.set(doc(db, 'users', candidateId), candidate);
      assignedCandidateIdsByAdmin.push(candidateId);

      const dossierId = `${candidateId}_2025`;
      const status: any = i % 3 === 0 ? 'VALIDE' : i % 3 === 1 ? 'COMPLET' : 'OUVERT';
      
      const dossier: Dossier = {
        id: dossierId,
        candidateId,
        candidateName: name,
        candidateEmail: candidate.email,
        campaignYear: 2025,
        status,
        assignedConsultantIds: [primaryAdmin.id, consultants[1 + (i % (consultants.length - 1)) % consultants.length].id],
        annualReport: {
          yearSummary: `Mission client ${getRandomItem(CLIENTS)} en tant que ${data.grade}.`,
          synthesis: "Une année d'apprentissage intense et de contribution technique majeure.",
          previousObjectives: [
            { objective: "Montée en compétence Cloud", comments: "Validé", reached: "OUI" },
            { objective: "Certification", comments: "En cours", reached: "PARTIEL" }
          ],
          commercialActivities: "Veille opportunités client.",
          training: "Formations internes Logiclever.",
          knowHow: "Expertise technique forte.",
          progressionDetails: "Prise d'autonomie confirmée.",
          techDetails: "React, Node.js, AWS.",
          certificationsDetail: "AWS Solutions Architect.",
          meetingPrep: "Points hebdomadaires.",
          deliverables: "Architecture technique, Codebase propre.",
          missionAutonomy: "Autonome sur son périmètre.",
          autonomyLevel: data.grade,
          autonomyJustification: "Capacité à gérer ses tâches sans supervision constante.",
          commercialPresentation: "Non",
          commercialAdvice: "Oui régulièrement",
          commercialProposition: "Force de proposition technique",
          commercialOffers: "Non",
          lifeLogiclever: "Participation aux afterworks.",
          lifeKnowledgeSharing: "Partage sur Slack.",
          lifeSlack: "Actif sur #tech.",
          lifeTeamSpirit: "Toujours solidaire.",
          lifeBusinessModel: "Compris.",
          recruitmentPromotion: "Relais LinkedIn.",
          recruitmentInterviews: "Non",
          recruitmentSocial: " LinkedIn actif",
          encadrementCoach: "Oui",
          encadrementManager: "Oui",
          squadName: "SQUAD TECH",
          squadRole: "Contributeur",
          squadContributions: "Mise à jour doc",
          isReferentOrAspiring: false,
          coachedConsultantsCount: 0,
          recruitmentInterviewsCount: 0,
          clientFollowUpMeteos: "",
          coordinationPoints: "",
          referentSquadRole: "",
          donorNetworkActions: "",
          encadrementMissionDetails: "",
          encadrementCoachingDetails: "",
          careerGoals: "Evoluer vers l'expertise technique et le coaching.",
          nextObjectives: [
            { objective: "Nouveaux sommets", benefit: "Carrière", means: "Travail Acharné", measures: "Juillet 2026" }
          ],
          salaryExpectations: "Je souhaite une revalorisation alignée avec ma progression.",
          wishedGrade: data.wishGrade,
          currentSalary: data.salary,
          wishedSalary: data.wishSalary,
          currentTJM: data.tj,
          targetTJM: data.tj + 30,
          satisfaction: {
            tasks: 'S',
            wellBeingMission: 'S',
            wellBeingClient: 'S',
            wellBeingLogiclever: 'S'
          },
        },
        clientFeedbacks: [
          {
            id: uuidv4(),
            client: getRandomItem(CLIENTS),
            mission: "Transformation Digitale",
            satisfactionItems: "Très pro, force de proposition.",
            improvementAxes: "RAS",
            perspectives: "Long terme",
            recommendation: "Hautement recommandé",
          }
        ],
        consultantFeedbacks: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Mock Feedback from assigned consultants
      dossier.assignedConsultantIds.forEach(cid => {
        const cons = consultants.find(c => c.id === cid);
        if (cons) {
          dossier.consultantFeedbacks[cid] = {
            consultantId: cid,
            consultantName: cons.displayName,
            type: 'Coach',
            targetTJMin: data.tj,
            targetTJMax: data.tj + 50,
            justification: "Le candidat est prêt pour le niveau supérieur.",
            improvementAxes: "Prendre plus la parole en public.",
            confidenceIndex: 9,
            validated: true,
            updatedAt: serverTimestamp(),
          };
        }
      });

      if (status === 'VALIDE') {
        const juryRef = consultants[Math.floor(Math.random() * consultants.length)];
        dossier.juryDecision = {
          verdict: 'Favorable',
          amount: data.wishSalary - 500,
          percentage: 5,
          advice: "Félicitations.",
          conclusion: "Profil à retenir.",
          investmentPercentage: 75,
          missionPercentage: 100,
          whyThisSalary: "En adéquation avec la politique de l'agence et les performances.",
          whatToDoMore: "Continuer sur cette lancée.",
          referentJury: juryRef.displayName,
          consultantFeeling: "Satisfait de la décision",
          date: serverTimestamp(),
        };
      }

      batch.set(doc(db, 'dossiers', dossierId), dossier);
    });

    // Update Admin assignments
    for (const admin of adminProfiles.values()) {
      batch.update(doc(db, 'users', admin.id), {
        assignedCandidateIds: assignedCandidateIdsByAdmin
      });
    }

    console.log('Committing batch...');
    await batch.commit();
    console.log('Seed process completed successfully');
  } catch (error: any) {
    console.error('Error during seeding:', error);
    throw error;
  }
};
