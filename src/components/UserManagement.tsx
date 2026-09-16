import { defaultReportData } from '../data/defaultAnnualReport';
import React, { useState, useEffect } from 'react';
import { collection, query, doc, updateDoc, getDoc, getDocs, where, setDoc, deleteDoc } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { UserProfile, UserRole, Grade } from '../types';
import { Users, User as UserIcon, ChevronDown, Plus, Database, Trash2, Check, FileSpreadsheet, Loader2, RefreshCw, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { seedMockData } from '../services/mockSeeder';
import { cleanDatabase } from '../services/dataCleansing';
import { importAccountsFromGoogleSheet } from '../services/googleSheetsService';
import { DataReconciliationService, ReconciliationReport } from '../services/dataReconciliationService';
import { UserDirectoryService } from '../services/userDirectoryService';
import { LocalDatabaseService } from '../services/localDatabaseService';
import { Personne, PersonneType } from '../types';

// Subcomponents
import { RoleBadge } from './users/UserCommonUI';
import { UserRowDrawer } from './users/UserRowDrawer';
import { CreateUserModal } from './users/CreateUserModal';
import { DeleteUserModal } from './users/DeleteUserModal';

const sanitizeForStorage = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForStorage);
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeForStorage(value);
  }
  return result;
};

interface UserManagementProps {
  currentUser?: UserProfile | null;
}

export function UserManagement({ currentUser }: UserManagementProps) {
  const isOperatingAdmin = currentUser?.roles?.includes('ADMIN');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState<string | null>(null);

  // Custom alert/toast notification states
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // States for "Add User" Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // States for "Delete User" Confirmation Modal
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  const handleRunSafeMigration = async () => {
    setIsMigrating(true);
    try {
      const report = await DataReconciliationService.executeSafeMigration();
      let msg = `Rapprochement terminé : ${report.matchedUsers} compte(s) lié(s), ${report.createdPersonnesCount} profil(s) canonique(s) créé(s).`;
      if (report.unresolvedUsers.length > 0) {
        msg += ` ${report.unresolvedUsers.length} compte(s) non rapproché(s) par précaution.`;
      }
      showNotification('success', msg);
    } catch (error: any) {
      console.error("Migration error:", error);
      showNotification('error', `Erreur lors du rapprochement : ${error.message || String(error)}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleImportFromSheet = async () => {
    setIsImporting(true);
    try {
      const result = await importAccountsFromGoogleSheet();
      if (!result.success || result.accounts.length === 0) {
        showNotification('info', `Aucun compte valide trouvé à importer dans l'onglet '${result.tabName}'.`);
        return;
      }

      let createdCount = 0;
      let updatedCount = 0;

      // Query current users to check existing emails
      const usersSnap = await getDocs(collection(db, 'users'));
      const existingUsersByEmail = new Map<string, { id: string; data: any }>();
      usersSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        if (d.email) {
          existingUsersByEmail.set(d.email.trim().toLowerCase(), { id: docSnap.id, data: d });
        }
      });

      for (const account of result.accounts) {
        const emailLower = account.email.trim().toLowerCase();
        const existing = existingUsersByEmail.get(emailLower);

        // 1. Déterminer l'Id_Profil canonique APP_LL
        const idProfil = account.matricule ? `LL_${account.matricule.trim()}` : (existing ? `PERS_${existing.id}` : `PERS_${account.email.replace(/[^a-zA-Z0-9]/g, '_')}`);
        
        // 2. Créer ou enrichir l'entité Personne dans le référentiel canonique
        const nameParts = (account.displayName || account.email).trim().split(' ');
        const prenom = nameParts[0] || '';
        const nom = nameParts.slice(1).join(' ') || prenom;
        const isCollaborateur = account.roles.includes('CANDIDATE');
        const pType: PersonneType = isCollaborateur ? 'COLLABORATEUR' : 'EXTERNE';

        const personneData: Partial<Personne> = {
          idProfil,
          matricule: account.matricule || undefined,
          nom,
          prenom,
          displayName: account.displayName || account.email,
          email: account.email,
          statut: 'ACTIF',
          type: pType,
          entryDate: account.entryDate,
          experienceYearsEmbauche: account.experienceYears,
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'personnes', idProfil), sanitizeForStorage(personneData), { merge: true });

        // 3. Créer ou mettre à jour le snapshot figé de la campagne 2025
        const participantId = `2025_${idProfil}`;
        const hasCandidateRole = account.roles.includes('CANDIDATE') || (existing && existing.data.roles?.includes('CANDIDATE'));
        const participantData = {
          id: participantId,
          campaignId: '2025',
          campaignYear: 2025,
          idProfil,
          matricule: account.matricule,
          displayName: account.displayName || (existing ? existing.data.displayName : account.email),
          email: account.email,
          team: account.team || 'Logic Clever',
          grade: account.currentGrade || 'Confirmé',
          salary: account.currentSalary || 0,
          tjm: account.currentTJM || 0,
          entryDate: account.entryDate,
          totalExperienceYears: account.experienceYears,
          isCandidate: !!hasCandidateRole,
          isEvaluator: true,
          dossierId: hasCandidateRole ? `${idProfil}_2025` : null,
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'campaign_participants', participantId), sanitizeForStorage(participantData), { merge: true });

        if (existing) {
          // Update existing user profile
          const userRef = doc(db, 'users', existing.id);
          const updatePayload: any = {
            idProfil,
            displayName: account.displayName || existing.data.displayName,
            matricule: account.matricule || existing.data.matricule,
            currentGrade: account.currentGrade || existing.data.currentGrade,
            entryDate: account.entryDate || existing.data.entryDate,
            experienceYears: account.experienceYears ?? existing.data.experienceYears,
            currentSalary: account.currentSalary ?? existing.data.currentSalary,
            currentTJM: account.currentTJM ?? existing.data.currentTJM,
            team: account.team || existing.data.team,
            updatedAt: new Date().toISOString()
          };

          // If role CANDIDATE is specified and dossier doesn't exist, ensure dossier is created
          if (hasCandidateRole) {
            const dossierId = `${existing.id}_2025`;
            const dossierRef = doc(db, 'dossiers', dossierId);
            const dossierSnap = await getDoc(dossierRef);
            if (!dossierSnap.exists()) {
              const newDossier = {
                id: dossierId,
                candidateId: existing.id,
                idProfil,
                campaignId: '2025',
                candidateName: updatePayload.displayName,
                candidateEmail: account.email,
                campaignYear: 2025,
                status: 'OUVERT',
                assignedConsultantIds: [],
                annualReport: {
                  ...defaultReportData,
                  currentGrade: updatePayload.currentGrade,
                  currentTJM: updatePayload.currentTJM,
                  currentSalary: updatePayload.currentSalary,
                },
                clientFeedbacks: [],
                documents: [],
                consultantFeedbacks: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              await setDoc(dossierRef, sanitizeForStorage(newDossier));
            } else {
              // Ensure idProfil is present on existing dossier without erasing contents
              await updateDoc(dossierRef, { idProfil, updatedAt: new Date().toISOString() });
            }
          }

          await updateDoc(userRef, sanitizeForStorage(updatePayload));
          updatedCount++;
        } else {
          // Create new user
          const newUserRef = doc(collection(db, 'users'));
          const newUserId = newUserRef.id;

          const userPayload: Partial<UserProfile> = {
            id: newUserId,
            idProfil,
            email: account.email,
            displayName: account.displayName,
            roles: account.roles,
            team: account.team,
            matricule: account.matricule,
            currentGrade: account.currentGrade,
            entryDate: account.entryDate,
            experienceYears: account.experienceYears,
            currentSalary: account.currentSalary,
            currentTJM: account.currentTJM,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await setDoc(newUserRef, sanitizeForStorage(userPayload));

          // Also link back firebaseUid in Personne
          await updateDoc(doc(db, 'personnes', idProfil), { firebaseUid: newUserId });

          // If CANDIDATE role is assigned, create their evaluation dossier
          if (account.roles.includes('CANDIDATE')) {
            const dossierId = `${newUserId}_2025`;
            const newDossier = {
              id: dossierId,
              candidateId: newUserId,
              idProfil,
              campaignId: '2025',
              candidateName: userPayload.displayName,
              candidateEmail: userPayload.email,
              campaignYear: 2025,
              status: 'OUVERT',
              assignedConsultantIds: [],
              annualReport: {
                ...defaultReportData,
                currentGrade: userPayload.currentGrade,
                currentTJM: userPayload.currentTJM,
                currentSalary: userPayload.currentSalary,
              },
              clientFeedbacks: [],
              documents: [],
              consultantFeedbacks: {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'dossiers', dossierId), sanitizeForStorage(newDossier));
          }

          createdCount++;
        }
      }

      showNotification(
        'success', 
        `Synchronisation Google Sheet (${result.tabName}) : ${createdCount} nouveau(x) compte(s) créé(s), ${updatedCount} mis à jour (${result.ignoredRowsCount} ligne(s) vide(s) ignorée(s)).`
      );
    } catch (err: any) {
      console.error("Erreur d'importation depuis Google Sheets:", err);
      showNotification('error', `Erreur lors de l'importation : ${err.message || String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    const syncFromDirectory = () => {
      setUsers(UserDirectoryService.getAllUsers());
      setLoading(false);
    };
    syncFromDirectory();
    return UserDirectoryService.subscribe(syncFromDirectory);
  }, []);

  useEffect(() => {
    // Non-destructive check: Do NOT automatically delete dossiers or users on mount
    console.log("[UserManagement] Preserving all historical dossiers, archives and non-matched accounts.");
  }, []);

  const handleCreateUser = async (data: {
    email: string;
    displayName: string;
    roles: UserRole[];
    team: string;
    matricule: string;
    currentGrade: Grade;
    entryDate: string;
    experienceYears: number;
    currentSalary: number;
    currentTJM: number;
    assignedCandidateIds: string[];
  }) => {
    try {
      const newUserRef = doc(collection(db, 'users'));
      const newUserId = newUserRef.id;

      const userPayload: Partial<UserProfile> = {
        id: newUserId,
        idProfil: data.matricule ? `LL_${data.matricule.trim()}` : `PERS_${newUserId}`,
        email: data.email,
        displayName: data.displayName,
        roles: data.roles,
        team: data.team,
        matricule: data.matricule,
        currentGrade: data.currentGrade,
        entryDate: data.entryDate,
        experienceYears: data.experienceYears,
        currentSalary: data.currentSalary,
        currentTJM: data.currentTJM,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (data.assignedCandidateIds && data.assignedCandidateIds.length > 0) {
        userPayload.assignedCandidateIds = data.assignedCandidateIds;
      }

      // Enregistrer immédiatement dans le UserDirectoryService local
      UserDirectoryService.addUser(userPayload as UserProfile);

      // If CANDIDATE role is assigned, create their dossier
      if (data.roles.includes('CANDIDATE')) {
        const dossierId = `${newUserId}_2025`;
        const newDossier = {
          id: dossierId,
          candidateId: newUserId,
          candidateName: userPayload.displayName,
          candidateEmail: userPayload.email,
          campaignYear: 2025,
          status: 'OUVERT' as const,
          assignedConsultantIds: [],
          annualReport: {
            ...defaultReportData,
            currentGrade: userPayload.currentGrade,
            currentTJM: userPayload.currentTJM,
            currentSalary: userPayload.currentSalary,
          },
          clientFeedbacks: [],
          documents: [],
          consultantFeedbacks: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        // 1. Sauvegarde locale instantanée
        LocalDatabaseService.saveDossier(newDossier);

      }

      // If candidates are assigned for evaluation
      if (data.assignedCandidateIds && data.assignedCandidateIds.length > 0) {
        for (const candidateId of data.assignedCandidateIds) {
          const candDossierId = `${candidateId}_2025`;
          const localExisting = LocalDatabaseService.getDossierById(candDossierId);
          if (localExisting) {
            const currentCons = localExisting.assignedConsultantIds || [];
            const newCons = Array.from(new Set([...currentCons, newUserId]));
            LocalDatabaseService.updateDossier(candDossierId, { assignedConsultantIds: newCons });
          }


        }
      }

      showNotification('success', "Utilisateur créé avec succès !");
    } catch (error: any) {
      console.error("Error creating user:", error);
      showNotification('error', `Erreur lors de la création de l'utilisateur : ${error.message || String(error)}`);
      throw error;
    }
  };

  const executeDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);

    try {
      const user = userToDelete;
      // 1. Delete user doc
      await deleteDoc(doc(db, 'users', user.id));

      // 2. If candidate, delete their dossier
      const dossierId = `${user.id}_2025`;
      await deleteDoc(doc(db, 'dossiers', dossierId));

      // 3. Remove this candidate from assignedCandidateIds in any users
      if (user.roles.includes('CANDIDATE')) {
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const docRef of usersSnap.docs) {
          const data = docRef.data();
          const assigned = data.assignedCandidateIds || [];
          if (assigned.includes(user.id)) {
            await updateDoc(docRef.ref, {
              assignedCandidateIds: assigned.filter((id: string) => id !== user.id),
              updatedAt: new Date().toISOString()
            });
          }
        }
      }

      // 4. Remove this user from assignedConsultantIds in all dossiers
      const dossiersQuery = query(collection(db, 'dossiers'), where('assignedConsultantIds', 'array-contains', user.id));
      const dossiersSnap = await getDocs(dossiersQuery);
      for (const docRef of dossiersSnap.docs) {
        const data = docRef.data();
        const consultants = data.assignedConsultantIds || [];
        await updateDoc(docRef.ref, {
          assignedConsultantIds: consultants.filter((id: string) => id !== user.id),
          updatedAt: new Date().toISOString()
        });
      }

      // Supprimer du répertoire local
      UserDirectoryService.deleteUser(user.id);

      showNotification('success', "Utilisateur supprimé avec succès.");
      setUserToDelete(null);
    } catch (error: any) {
      console.error("Error deleting user:", error);
      showNotification('error', `Erreur lors de la suppression de l'utilisateur : ${error.message || String(error)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      await seedMockData();
      await cleanDatabase();
      showNotification('success', "La base a été peuplée et nettoyée de tout doublon avec succès !");
    } catch (error: any) {
      console.error("Seed error detailed:", error);
      showNotification('error', `Erreur lors de la génération des données : ${error.message || String(error)}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleRoleToggle = async (user: UserProfile, toggledRole: UserRole) => {
    if (toggledRole === 'ADMIN' && !isOperatingAdmin) {
      showNotification('error', "Seul un Administrateur peut attribuer ou retirer le rôle Administrateur.");
      return;
    }
    const isAdding = !user.roles.includes(toggledRole);
    let newRoles: UserRole[];
    
    if (isAdding) {
      newRoles = [...user.roles, toggledRole];
    } else {
      if (user.roles.length <= 1) {
        showNotification('error', "Un utilisateur doit avoir au moins un rôle.");
        return;
      }
      newRoles = user.roles.filter(r => r !== toggledRole);
    }

    setUpdatingId(user.id);
    try {
      // Mettre à jour immédiatement dans le répertoire local
      UserDirectoryService.updateUser(user.id, { roles: newRoles });

    } catch (error) {
      console.error("Error updating roles:", error);
      showNotification('error', "Erreur lors de la mise à jour des rôles.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAssignmentToggle = async (consultant: UserProfile, candidateId: string) => {
    setAssignmentsLoading(consultant.id + candidateId);
    try {
      const currentAssigned = consultant.assignedCandidateIds || [];
      const isAdding = !currentAssigned.includes(candidateId);
      let newAssigned: string[];
      
      if (isAdding) {
        newAssigned = [...currentAssigned, candidateId];
      } else {
        newAssigned = currentAssigned.filter(id => id !== candidateId);
      }

      // Mettre à jour immédiatement dans le répertoire local
      UserDirectoryService.updateUser(consultant.id, { assignedCandidateIds: newAssigned });


      const candidateDossierId = `${candidateId}_2025`;
      const localDossier = LocalDatabaseService.getDossierById(candidateDossierId);
      if (localDossier) {
        const currentCons = localDossier.assignedConsultantIds || [];
        let newCons: string[];
        if (isAdding) {
          newCons = Array.from(new Set([...currentCons, consultant.id]));
        } else {
          newCons = currentCons.filter((id: string) => id !== consultant.id);
        }
        LocalDatabaseService.updateDossier(candidateDossierId, { assignedConsultantIds: newCons });
      }


    } catch (error) {
      console.error("Assignment error:", error);
    } finally {
      setAssignmentsLoading(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12 italic opacity-50">Chargement des utilisateurs...</div>;
  }

  return (
    <div className="bg-white rounded-xl border border-accent/10 overflow-hidden shadow-xl">
      <div className="p-10 border-b border-accent/10 bg-white flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-secondary rounded-xl flex items-center justify-center text-white shadow-lg">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-secondary tracking-tight">Utilisateurs</h2>
            <p className="text-[10px] text-accent/40 uppercase tracking-[0.3em] font-black mt-1">Droits & Accès Plateforme 2025</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleRunSafeMigration}
            disabled={isMigrating}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md disabled:opacity-50 cursor-pointer"
            title="Rapprochement non-destructif : associe les comptes aux personnes sans rien supprimer"
          >
            {isMigrating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {isMigrating ? "Rapprochement..." : "Rapprocher les profils"}
          </button>

          <button 
            onClick={handleImportFromSheet}
            disabled={isImporting}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md disabled:opacity-50 cursor-pointer"
            title="Importer et synchroniser les comptes depuis l'onglet Comptes du Google Sheet"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            {isImporting ? "Importation..." : "Importer depuis Google Sheet"}
          </button>

          <button 
            onClick={() => {
              UserDirectoryService.downloadUsersJson();
              showNotification('success', "Le fichier users.json a été téléchargé avec succès !");
            }}
            className="flex items-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md cursor-pointer"
            title="Télécharger le fichier users.json complet mis à jour pour l'intégrer au code"
          >
            <Download className="w-4 h-4" />
            Exporter users.json
          </button>

          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-secondary text-white hover:bg-secondary/90 rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Ajouter un utilisateur
          </button>

          <button 
            onClick={handleSeedData}
            disabled={isSeeding}
            className="flex items-center gap-2 px-4 py-3 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-base text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer"
          >
            <Database className="w-4 h-4" />
            {isSeeding ? "Génération..." : "Peupler la base (Demo)"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.3em] font-black text-accent/30 bg-accent/5">
              <th className="px-10 py-6">Identité</th>
              <th className="px-10 py-6">Rôles Attribués</th>
              <th className="px-10 py-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-accent/5">
            {users.map((user) => (
              <React.Fragment key={user.id}>
                <tr className={cn(
                  "hover:bg-accent/5 transition-colors group",
                  expandedId === user.id && "bg-accent/[0.02]"
                )}>
                  <td className="px-10 py-8">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-accent/5 rounded-base flex items-center justify-center border border-accent/10 shrink-0 group-hover:bg-white transition-colors shadow-inner">
                        <UserIcon className="w-6 h-6 text-accent/20" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-lg text-accent truncate mb-0.5">{user.displayName}</div>
                          {user.matricule && (
                            <span className="text-[10px] bg-accent/10 px-2 py-0.5 rounded font-mono font-bold text-accent/70">
                              {user.matricule}
                            </span>
                          )}
                          {user.idProfil && (
                            <span className="text-[9px] bg-secondary/10 text-secondary px-2 py-0.5 rounded font-mono font-bold" title="Id Profil Canonique APP_LL">
                              {user.idProfil}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-accent/40 truncate font-light flex items-center gap-2">
                          <span>{user.email}</span>
                          <span className="text-[9px] text-accent/30 font-mono">UID: {user.id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-8">
                    <div className="flex flex-wrap gap-2">
                      {user.roles?.length > 0 ? (
                        user.roles.map(role => (
                          <span key={role}>
                            <RoleBadge role={role} />
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-accent/20 italic font-light">Aucun rôle</span>
                      )}
                    </div>
                  </td>
                  <td className="px-10 py-8 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button 
                        onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}
                        className={cn(
                          "inline-flex items-center gap-3 px-6 py-3 rounded-base text-[10px] font-black uppercase tracking-[0.2em] transition-all cursor-pointer",
                          expandedId === user.id 
                            ? "bg-secondary text-white shadow-lg translate-y-[-2px]" 
                            : "bg-white border border-secondary/20 hover:border-secondary hover:text-secondary text-secondary/60 shadow-sm"
                        )}
                      >
                        {expandedId === user.id ? "REPLIER" : "ÉDITER PROFIL"}
                        <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", expandedId === user.id && "rotate-180")} />
                      </button>
                      <button
                        onClick={() => setUserToDelete(user)}
                        className="p-3 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white rounded-base border border-red-100 hover:border-red-500 transition-all shadow-sm cursor-pointer"
                        title="Supprimer l'utilisateur"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === user.id && (
                  <tr>
                    <td colSpan={3} className="px-10 py-12 bg-accent/5">
                      <UserRowDrawer 
                        user={user}
                        allUsers={users}
                        isOperatingAdmin={!!isOperatingAdmin}
                        updatingId={updatingId}
                        onRoleToggle={handleRoleToggle}
                        onAssignmentToggle={handleAssignmentToggle}
                        assignmentsLoading={assignmentsLoading}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {isAddModalOpen && (
          <CreateUserModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            allUsers={users}
            isOperatingAdmin={!!isOperatingAdmin}
            onCreateUser={handleCreateUser}
            onShowNotification={showNotification}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {userToDelete && (
          <DeleteUserModal
            userToDelete={userToDelete}
            onClose={() => setUserToDelete(null)}
            onConfirmDelete={executeDeleteUser}
            isDeleting={isDeleting}
          />
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={cn(
              "fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 border font-bold text-sm text-white",
              notification.type === 'success' ? "bg-emerald-600 border-emerald-500" : 
              notification.type === 'error' ? "bg-rose-600 border-rose-500" : "bg-blue-600 border-blue-500"
            )}
          >
            {notification.type === 'success' && <Check className="w-5 h-5 shrink-0" />}
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
