import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { Personne, CampaignParticipant, UserProfile, Dossier, ReconciliationStatus, PersonneType } from '../types';

export interface ReconciliationReport {
  timestamp: string;
  totalUsers: number;
  totalDossiers: number;
  totalPersonnes: number;
  matchedUsers: number;
  unresolvedUsers: ReconciliationStatus[];
  matchedDossiers: number;
  unresolvedDossiers: ReconciliationStatus[];
  createdPersonnesCount: number;
}

/**
 * Service de réconciliation des données existantes.
 * 
 * Principes stricts :
 * 1. Jamais d'action destructive (aucune suppression de user ou de dossier).
 * 2. Rapprochement 1-à-1 non ambigu uniquement (par matricule exact, puis par email unique).
 * 3. En cas d'ambiguïté ou d'absence de correspondance, l'entité est marquée 'UNRESOLVED' sans altération.
 * 4. Id_Profil APP_LL / Boond est la clé canonique métier de la Personne.
 */
export class DataReconciliationService {
  /**
   * Analyse l'état actuel et propose un diagnostic complet des rapprochements sans modifier la base.
   */
  static async diagnoseReconciliation(): Promise<ReconciliationReport> {
    const usersSnap = await getDocs(collection(db, 'users'));
    const dossiersSnap = await getDocs(collection(db, 'dossiers'));
    const personnesSnap = await getDocs(collection(db, 'personnes'));

    const existingUsers: UserProfile[] = usersSnap.docs.map(d => ({ ...d.data(), id: d.id } as UserProfile));
    const existingDossiers: Dossier[] = dossiersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Dossier));
    const existingPersonnes: Personne[] = personnesSnap.docs.map(d => ({ ...d.data(), idProfil: d.id } as Personne));

    const unresolvedUsers: ReconciliationStatus[] = [];
    const unresolvedDossiers: ReconciliationStatus[] = [];

    // Map de personnes existantes
    const personneByMatricule = new Map<string, Personne>();
    const personneByEmail = new Map<string, Personne>();
    const emailDuplicates = new Set<string>();

    for (const p of existingPersonnes) {
      if (p.matricule) {
        personneByMatricule.set(p.matricule.trim().toUpperCase(), p);
      }
      if (p.email) {
        const cleanEmail = p.email.trim().toLowerCase();
        if (personneByEmail.has(cleanEmail)) {
          emailDuplicates.add(cleanEmail);
        } else {
          personneByEmail.set(cleanEmail, p);
        }
      }
    }

    let matchedUsers = 0;
    for (const u of existingUsers) {
      if (u.idProfil && existingPersonnes.some(p => p.idProfil === u.idProfil)) {
        matchedUsers++;
        continue;
      }

      const mat = u.matricule ? u.matricule.trim().toUpperCase() : '';
      const email = u.email ? u.email.trim().toLowerCase() : '';

      if (mat && personneByMatricule.has(mat)) {
        matchedUsers++;
      } else if (email && personneByEmail.has(email) && !emailDuplicates.has(email)) {
        matchedUsers++;
      } else {
        unresolvedUsers.push({
          id: u.id,
          source: 'users',
          firebaseUid: u.id,
          email: u.email,
          displayName: u.displayName,
          status: 'UNRESOLVED',
          reason: emailDuplicates.has(email) ? 'Email partagé ou ambigu' : 'Aucune correspondance dans les Personnes'
        });
      }
    }

    let matchedDossiers = 0;
    for (const d of existingDossiers) {
      if (d.idProfil && existingPersonnes.some(p => p.idProfil === d.idProfil)) {
        matchedDossiers++;
        continue;
      }

      const matchingUser = existingUsers.find(u => u.id === d.candidateId);
      const email = (d.candidateEmail || matchingUser?.email || '').trim().toLowerCase();
      const mat = (matchingUser?.matricule || '').trim().toUpperCase();

      if (mat && personneByMatricule.has(mat)) {
        matchedDossiers++;
      } else if (email && personneByEmail.has(email) && !emailDuplicates.has(email)) {
        matchedDossiers++;
      } else {
        unresolvedDossiers.push({
          id: d.id,
          source: 'dossiers',
          idProfil: d.idProfil,
          firebaseUid: d.candidateId,
          email: d.candidateEmail,
          displayName: d.candidateName,
          status: 'UNRESOLVED',
          reason: 'Dossier orphelin ou sans personne correspondante identifiée'
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalUsers: existingUsers.length,
      totalDossiers: existingDossiers.length,
      totalPersonnes: existingPersonnes.length,
      matchedUsers,
      unresolvedUsers,
      matchedDossiers,
      unresolvedDossiers,
      createdPersonnesCount: 0
    };
  }

  /**
   * Exécute une migration sécurisée non-destructive :
   * - Pour chaque utilisateur existant non lié, crée ou lie une entrée Personne pérenne
   * - Ne supprime jamais aucun dossier, document ni compte
   * - Met à jour les liens de manière idempotente
   */
  static async executeSafeMigration(): Promise<ReconciliationReport> {
    const usersSnap = await getDocs(collection(db, 'users'));
    const dossiersSnap = await getDocs(collection(db, 'dossiers'));
    const personnesSnap = await getDocs(collection(db, 'personnes'));

    const existingUsers: UserProfile[] = usersSnap.docs.map(d => ({ ...d.data(), id: d.id } as UserProfile));
    const existingDossiers: Dossier[] = dossiersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Dossier));
    const existingPersonnes: Personne[] = personnesSnap.docs.map(d => ({ ...d.data(), idProfil: d.id } as Personne));

    const personneByMatricule = new Map<string, Personne>();
    const personneByEmail = new Map<string, Personne>();
    const emailDuplicates = new Set<string>();

    for (const p of existingPersonnes) {
      if (p.matricule) {
        personneByMatricule.set(p.matricule.trim().toUpperCase(), p);
      }
      if (p.email) {
        const clean = p.email.trim().toLowerCase();
        if (personneByEmail.has(clean)) {
          emailDuplicates.add(clean);
        } else {
          personneByEmail.set(clean, p);
        }
      }
    }

    let createdPersonnesCount = 0;
    let matchedUsers = 0;
    const unresolvedUsers: ReconciliationStatus[] = [];

    for (const user of existingUsers) {
      const mat = user.matricule ? user.matricule.trim().toUpperCase() : '';
      const email = user.email ? user.email.trim().toLowerCase() : '';

      // 1. Chercher si la personne existe déjà
      let matchedPersonne: Personne | undefined;
      if (user.idProfil) {
        matchedPersonne = existingPersonnes.find(p => p.idProfil === user.idProfil);
      }
      if (!matchedPersonne && mat && personneByMatricule.has(mat)) {
        matchedPersonne = personneByMatricule.get(mat);
      }
      if (!matchedPersonne && email && !emailDuplicates.has(email) && personneByEmail.has(email)) {
        matchedPersonne = personneByEmail.get(email);
      }

      // Si aucune personne trouvée, créer l'enregistrement Personne à partir de ce compte utilisateur
      if (!matchedPersonne) {
        const canonicalId = user.matricule ? `LL_${user.matricule.trim()}` : `PERS_${user.id}`;
        const nameParts = (user.displayName || 'Utilisateur').trim().split(' ');
        const prenom = nameParts[0] || '';
        const nom = nameParts.slice(1).join(' ') || prenom;

        const isCollaborateur = user.roles?.includes('CANDIDATE');
        const pType: PersonneType = isCollaborateur ? 'COLLABORATEUR' : 'EXTERNE';

        const newPersonne: Personne = {
          idProfil: canonicalId,
          matricule: user.matricule || undefined,
          nom,
          prenom,
          displayName: user.displayName || user.email,
          email: user.email,
          statut: 'ACTIF',
          type: pType,
          entryDate: user.entryDate,
          expertGradeDate: user.expertGradeDate,
          experienceYearsEmbauche: user.experienceYears,
          firebaseUid: user.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, 'personnes', canonicalId), newPersonne, { merge: true });
        existingPersonnes.push(newPersonne);
        if (newPersonne.matricule) personneByMatricule.set(newPersonne.matricule.trim().toUpperCase(), newPersonne);
        if (newPersonne.email) personneByEmail.set(newPersonne.email.trim().toLowerCase(), newPersonne);

        matchedPersonne = newPersonne;
        createdPersonnesCount++;
      }

      // Lier l'utilisateur au profil canonique
      if (matchedPersonne) {
        matchedUsers++;
        if (user.idProfil !== matchedPersonne.idProfil) {
          await updateDoc(doc(db, 'users', user.id), {
            idProfil: matchedPersonne.idProfil,
            updatedAt: serverTimestamp()
          });
        }
        if (!matchedPersonne.firebaseUid) {
          await updateDoc(doc(db, 'personnes', matchedPersonne.idProfil), {
            firebaseUid: user.id,
            updatedAt: serverTimestamp()
          });
        }
      } else {
        unresolvedUsers.push({
          id: user.id,
          source: 'users',
          firebaseUid: user.id,
          email: user.email,
          displayName: user.displayName,
          status: 'UNRESOLVED',
          reason: 'Impossible d’établir un rapprochement strict'
        });
      }
    }

    // 2. Rapprochement des dossiers existants
    let matchedDossiers = 0;
    const unresolvedDossiers: ReconciliationStatus[] = [];

    for (const dossier of existingDossiers) {
      let resolvedIdProfil = dossier.idProfil;

      if (!resolvedIdProfil) {
        // Rapprochement par candidateId si c'est un user
        const matchingUser = existingUsers.find(u => u.id === dossier.candidateId);
        if (matchingUser?.idProfil) {
          resolvedIdProfil = matchingUser.idProfil;
        } else if (matchingUser?.matricule && personneByMatricule.has(matchingUser.matricule.trim().toUpperCase())) {
          resolvedIdProfil = personneByMatricule.get(matchingUser.matricule.trim().toUpperCase())?.idProfil;
        } else if (dossier.candidateEmail) {
          const cEmail = dossier.candidateEmail.trim().toLowerCase();
          if (!emailDuplicates.has(cEmail) && personneByEmail.has(cEmail)) {
            resolvedIdProfil = personneByEmail.get(cEmail)?.idProfil;
          }
        }
      }

      if (resolvedIdProfil) {
        matchedDossiers++;
        if (dossier.idProfil !== resolvedIdProfil) {
          await updateDoc(doc(db, 'dossiers', dossier.id), {
            idProfil: resolvedIdProfil,
            updatedAt: serverTimestamp()
          });
        }
      } else {
        unresolvedDossiers.push({
          id: dossier.id,
          source: 'dossiers',
          idProfil: dossier.idProfil,
          firebaseUid: dossier.candidateId,
          email: dossier.candidateEmail,
          displayName: dossier.candidateName,
          status: 'UNRESOLVED',
          reason: 'Dossier historique sans correspondance univoque'
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalUsers: existingUsers.length,
      totalDossiers: existingDossiers.length,
      totalPersonnes: existingPersonnes.length,
      matchedUsers,
      unresolvedUsers,
      matchedDossiers,
      unresolvedDossiers,
      createdPersonnesCount
    };
  }

  /**
   * Crée ou met à jour le snapshot RH d'une personne pour une campagne donnée
   * sans toucher aux autres campagnes.
   */
  static async upsertCampaignParticipant(
    campaignId: string,
    campaignYear: number,
    personne: Personne,
    rhSnapshot: {
      salary: number;
      grade: any;
      tjm: number;
      team?: string;
      position?: string;
      entryDate?: string;
      expertGradeDate?: string;
      totalExperienceYears?: number;
      isCandidate: boolean;
      isEvaluator: boolean;
    }
  ): Promise<CampaignParticipant> {
    const participantId = `${campaignId}_${personne.idProfil}`;
    const participantRef = doc(db, 'campaign_participants', participantId);

    const data: CampaignParticipant = {
      id: participantId,
      campaignId,
      campaignYear,
      idProfil: personne.idProfil,
      matricule: personne.matricule,
      displayName: personne.displayName,
      email: personne.email,
      team: rhSnapshot.team,
      position: rhSnapshot.position,
      grade: rhSnapshot.grade || 'Junior',
      salary: rhSnapshot.salary || 0,
      tjm: rhSnapshot.tjm || 0,
      entryDate: rhSnapshot.entryDate || personne.entryDate,
      expertGradeDate: rhSnapshot.expertGradeDate || personne.expertGradeDate,
      totalExperienceYears: rhSnapshot.totalExperienceYears,
      isCandidate: rhSnapshot.isCandidate,
      isEvaluator: rhSnapshot.isEvaluator,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(participantRef, data, { merge: true });
    return data;
  }
}
