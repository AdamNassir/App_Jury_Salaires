import { defaultReportData } from '../data/defaultAnnualReport';
import React, { useState, useEffect } from 'react';
import { collection, query, doc, updateDoc, getDoc, getDocs, where, setDoc, deleteDoc } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { UserProfile, UserRole, Grade } from '../types';
import { Users, User as UserIcon, ChevronDown, Plus, Trash2, Check, Download, Gavel } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { cleanDatabase } from '../services/dataCleansing';
import { UserDirectoryService } from '../services/userDirectoryService';
import { LocalDatabaseService } from '../services/localDatabaseService';
import { Personne, PersonneType } from '../types';

// Subcomponents
import { RoleBadge } from './users/UserCommonUI';
import { UserRowDrawer } from './users/UserRowDrawer';
import { CreateUserModal } from './users/CreateUserModal';
import { DeleteUserModal } from './users/DeleteUserModal';
import { MassDeleteUsersModal } from './users/MassDeleteUsersModal';
import { ConstituerJuryModal } from './users/ConstituerJuryModal';

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
  const adminUsers = users.filter(u => u.roles?.includes('ADMIN'));
  const nonAdminUsers = users.filter(u => !u.roles?.includes('ADMIN'));
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  // States for "Mass Delete Non-Admin Users" Confirmation Modal
  const [isMassDeleteModalOpen, setIsMassDeleteModalOpen] = useState(false);
  const [isMassDeleting, setIsMassDeleting] = useState(false);

  // States for "Constituer Jury" Modal
  const [isConstituerJuryModalOpen, setIsConstituerJuryModalOpen] = useState(false);

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

      // 2. Delete all candidate dossiers associated with this user
      const candidateDossiers = LocalDatabaseService.getDossiers().filter(
        d => d.candidateId === user.id || d.idProfil === user.id || (user.idProfil && (d.candidateId === user.idProfil || d.idProfil === user.idProfil))
      );
      for (const d of candidateDossiers) {
        try {
          await deleteDoc(doc(db, 'dossiers', d.id));
        } catch (e) {
          console.warn(`Could not delete dossier doc ${d.id}:`, e);
        }
        LocalDatabaseService.deleteDossier(d.id);
      }

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

  const handleConfirmMassDelete = async (deleteRelatedDossiers: boolean) => {
    setIsMassDeleting(true);
    try {
      const nonAdminList = users.filter(u => !u.roles?.includes('ADMIN'));
      const adminList = users.filter(u => u.roles?.includes('ADMIN'));
      const nonAdminIds = new Set(nonAdminList.map(u => u.id));

      // 1. Supprimer les documents utilisateurs non-admins
      for (const user of nonAdminList) {
        try {
          await deleteDoc(doc(db, 'users', user.id));
        } catch (e) {
          console.warn(`Could not delete user ${user.id}:`, e);
        }
      }

      // 2. Nettoyer les assignations chez les évaluateurs restants
      const dossiersSnap = await getDocs(collection(db, 'dossiers'));
      for (const docRef of dossiersSnap.docs) {
        const data = docRef.data();
        const consultants = data.assignedConsultantIds || [];
        const filteredConsultants = consultants.filter((id: string) => !nonAdminIds.has(id));
        if (filteredConsultants.length !== consultants.length) {
          await updateDoc(docRef.ref, {
            assignedConsultantIds: filteredConsultants,
            updatedAt: new Date().toISOString()
          });
        }
      }

      // 3. Supprimer les dossiers associés si demandé
      if (deleteRelatedDossiers) {
        const dossiers = LocalDatabaseService.getDossiers();
        for (const dossier of dossiers) {
          if (nonAdminIds.has(dossier.candidateId) || (dossier.idProfil && nonAdminIds.has(dossier.idProfil))) {
            try {
              await deleteDoc(doc(db, 'dossiers', dossier.id));
            } catch (e) {
              console.warn(`Could not delete dossier ${dossier.id}:`, e);
            }
            LocalDatabaseService.deleteDossier(dossier.id);
          }
        }
      }

      // 4. Mettre à jour atomiquement UserDirectoryService et synchroniser data/users.json
      UserDirectoryService.replaceAllUsers(adminList);
      setUsers(adminList);

      showNotification('success', `${nonAdminList.length} utilisateur(s) non-admin supprimé(s). ${adminList.length} administrateur(s) conservé(s).`);
      setIsMassDeleteModalOpen(false);
    } catch (err: any) {
      console.error("Error mass deleting non-admin users:", err);
      showNotification('error', `Erreur lors de la suppression massive : ${err.message || String(err)}`);
    } finally {
      setIsMassDeleting(false);
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
          {isOperatingAdmin && (
            <button 
              onClick={() => setIsConstituerJuryModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-primary hover:brightness-110 text-white rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-primary/20 cursor-pointer active:scale-95"
              title="Constituer le jury pour une campagne en sélectionnant les experts éligibles"
            >
              <Gavel className="w-4 h-4" />
              Constituer Jury
            </button>
          )}

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

          {nonAdminUsers.length > 0 && (
            <button 
              onClick={() => setIsMassDeleteModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md cursor-pointer"
              title="Supprimer massivement tous les utilisateurs hors administrateurs"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer les non-admins ({nonAdminUsers.length})
            </button>
          )}

          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-secondary text-white hover:bg-secondary/90 rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Ajouter un utilisateur
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

      <AnimatePresence>
        {isMassDeleteModalOpen && (
          <MassDeleteUsersModal
            isOpen={isMassDeleteModalOpen}
            onClose={() => setIsMassDeleteModalOpen(false)}
            onConfirmMassDelete={handleConfirmMassDelete}
            isDeleting={isMassDeleting}
            nonAdminCount={nonAdminUsers.length}
            adminUsers={adminUsers}
          />
        )}
      </AnimatePresence>

      <ConstituerJuryModal
        isOpen={isConstituerJuryModalOpen}
        onClose={() => setIsConstituerJuryModalOpen(false)}
        onSuccess={(msg) => showNotification('success', msg)}
        currentUser={currentUser}
      />

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
