import React, { useState } from 'react';
import { motion } from 'motion/react';
import { UserProfile, UserRole, Grade } from '../../types';
import { Users, Shield, Search, Check, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  allUsers: UserProfile[];
  isOperatingAdmin: boolean;
  onCreateUser: (userData: {
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
  }) => Promise<void>;
  onShowNotification: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function CreateUserModal({
  isOpen,
  onClose,
  allUsers,
  isOperatingAdmin,
  onCreateUser,
  onShowNotification
}: CreateUserModalProps) {
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRoles, setNewRoles] = useState<UserRole[]>(['CANDIDATE']);
  const [newTeam, setNewTeam] = useState('Logiclever');
  const [newMatricule, setNewMatricule] = useState('');
  const [newGrade, setNewGrade] = useState<Grade>('Confirmé');
  const [newEntryDate, setNewEntryDate] = useState('');
  const [newExperience, setNewExperience] = useState(0);
  const [newSalary, setNewSalary] = useState(0);
  const [newTJM, setNewTJM] = useState(0);
  const [newAssignedCandidates, setNewAssignedCandidates] = useState<string[]>([]);
  const [newCandidatesSearch, setNewCandidatesSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleRoleToggle = (role: UserRole) => {
    if (role === 'ADMIN' && !isOperatingAdmin) {
      onShowNotification('error', "Seul un Administrateur peut attribuer le rôle Administrateur.");
      return;
    }
    if (newRoles.includes(role)) {
      setNewRoles(newRoles.filter(r => r !== role));
    } else {
      setNewRoles([...newRoles, role]);
    }
  };

  const handleAssignmentToggle = (candId: string) => {
    if (newAssignedCandidates.includes(candId)) {
      setNewAssignedCandidates(newAssignedCandidates.filter(id => id !== candId));
    } else {
      setNewAssignedCandidates([...newAssignedCandidates, candId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newDisplayName) {
      onShowNotification('error', "L'adresse email et le nom complet sont obligatoires.");
      return;
    }
    if (newRoles.length === 0) {
      onShowNotification('error', "Veuillez sélectionner au moins un rôle.");
      return;
    }

    setIsSaving(true);
    try {
      await onCreateUser({
        email: newEmail.trim(),
        displayName: newDisplayName.trim(),
        roles: newRoles,
        team: newTeam.trim() || 'Logiclever',
        matricule: newMatricule.trim() || `M-${Date.now().toString().slice(-6)}`,
        currentGrade: newGrade || 'Confirmé',
        entryDate: newEntryDate || new Date().toISOString().split('T')[0],
        experienceYears: Number(newExperience) || 0,
        currentSalary: Number(newSalary) || 0,
        currentTJM: Number(newTJM) || 0,
        assignedCandidateIds: newAssignedCandidates
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-accent/60 backdrop-blur-sm flex items-center justify-center p-6 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        className="bg-white rounded-2xl border border-accent/10 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-8 border-b border-accent/10 bg-accent/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center text-white shadow-lg">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-accent tracking-tight">Ajouter un utilisateur</h3>
              <p className="text-[10px] text-accent/40 uppercase tracking-[0.2em] font-black mt-1">Saisie des informations de profil, rôles et assignations</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-accent/30 hover:text-accent font-light text-3xl leading-none transition-colors font-sans"
          >
            &times;
          </button>
        </div>

        {/* Modal Body / Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          
          {/* Section 1: Identity & Roles */}
          <div className="bg-accent/5 p-6 rounded-xl border border-accent/10 space-y-6">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/40 mb-2">1. Identité & Rôles d'accès</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2 px-1">Nom complet</label>
                <input 
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={e => setNewDisplayName(e.target.value)}
                  placeholder="Ex: Jean Dupont"
                  className="w-full bg-white border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2 px-1">Adresse Email</label>
                <input 
                  type="email"
                  required
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="jean.dupont@logiclever.com"
                  className="w-full bg-white border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4 px-1">Sélectionner le ou les rôles</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(['CANDIDATE', 'EVALUATOR', 'JURY', 'ADMIN'] as UserRole[]).map((r) => {
                  const isActive = newRoles.includes(r);
                  const isRestrictedAdmin = r === 'ADMIN' && !isOperatingAdmin;
                  const roleLabel = 
                    r === 'ADMIN' ? 'Admin' : 
                    r === 'JURY' ? 'Membre Jury' : 
                    r === 'EVALUATOR' ? 'Évaluateur' : 
                    'Candidat';

                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRoleToggle(r)}
                      title={isRestrictedAdmin ? "Réservé aux Administrateurs" : undefined}
                      className={cn(
                        "px-3 py-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-between border cursor-pointer",
                        isActive 
                          ? "bg-accent border-accent text-white shadow-md ring-2 ring-primary ring-offset-1" 
                          : "bg-white border-accent/10 text-accent/40 hover:bg-accent/5",
                        isRestrictedAdmin && "opacity-60"
                      )}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Shield className={cn("w-4 h-4 opacity-35 shrink-0", isActive && "opacity-100 text-primary")} />
                        {roleLabel}
                        {isRestrictedAdmin && (
                          <span className="text-[8px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-bold uppercase tracking-normal shrink-0">Admin</span>
                        )}
                      </span>
                      {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 2: RH / Profile Data */}
          <div className="p-6 border border-accent/10 rounded-xl space-y-6 bg-white shadow-sm">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/40 mb-2">2. Données RH & Profil</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2 px-1">Matricule</label>
                <input 
                  type="text"
                  value={newMatricule}
                  onChange={e => setNewMatricule(e.target.value)}
                  placeholder="Ex: M-124"
                  className="w-full bg-accent/5 border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2 px-1">Grade Actuel</label>
                <select 
                  value={newGrade}
                  onChange={e => setNewGrade(e.target.value as Grade)}
                  className="w-full bg-accent/5 border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                >
                  <option value="Junior">Junior</option>
                  <option value="Confirmé">Confirmé</option>
                  <option value="Senior">Senior</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2 px-1">Équipe / BU</label>
                <input 
                  type="text"
                  value={newTeam}
                  onChange={e => setNewTeam(e.target.value)}
                  placeholder="Ex: Tech, Cloud"
                  className="w-full bg-accent/5 border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2 px-1">Date d'entrée</label>
                <input 
                  type="date"
                  value={newEntryDate}
                  onChange={e => setNewEntryDate(e.target.value)}
                  className="w-full bg-accent/5 border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2 px-1">Exp. (années)</label>
                <input 
                  type="number"
                  min="0"
                  value={newExperience || ''}
                  onChange={e => setNewExperience(Number(e.target.value))}
                  className="w-full bg-accent/5 border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2 px-1">TJM Quotidien (€)</label>
                <input 
                  type="number"
                  min="0"
                  value={newTJM || ''}
                  onChange={e => setNewTJM(Number(e.target.value))}
                  placeholder="Ex: 650"
                  className="w-full bg-accent/5 border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2 px-1">Salaire Fixe Annuel (€)</label>
                <input 
                  type="number"
                  min="0"
                  value={newSalary || ''}
                  onChange={e => setNewSalary(Number(e.target.value))}
                  placeholder="Ex: 45000"
                  className="w-full bg-accent/5 border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Assignations (only visible if roles contain CANDIDATE or JURY) */}
          {(newRoles.includes('CANDIDATE') || newRoles.includes('JURY')) ? (
            <div className="bg-accent/5 p-6 rounded-xl border border-accent/10 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/40">3. Assigner des collègues à évaluer (Optionnel)</h4>
                  <p className="text-xs text-accent/40 mt-1">Cet utilisateur aura un accès direct à l'évaluation des dossiers des candidats sélectionnés</p>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-accent/25" />
                  <input 
                    type="text" 
                    placeholder="RECHERCHER..." 
                    value={newCandidatesSearch}
                    onChange={e => setNewCandidatesSearch(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-white border border-accent/10 rounded-base text-[10px] font-black focus:ring-2 focus:ring-primary/20 w-44 uppercase tracking-widest outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                {allUsers
                  .filter(u => u.roles.includes('CANDIDATE'))
                  .filter(u => u.displayName?.toLowerCase().includes(newCandidatesSearch.toLowerCase()) || u.email.toLowerCase().includes(newCandidatesSearch.toLowerCase()))
                  .map(cand => {
                    const isAssigned = newAssignedCandidates.includes(cand.id);
                    return (
                      <button
                        key={cand.id}
                        type="button"
                        onClick={() => handleAssignmentToggle(cand.id)}
                        className={cn(
                          "p-4 rounded-xl text-left border transition-all flex items-center justify-between group/cand shadow-sm cursor-pointer",
                          isAssigned 
                            ? "border-primary bg-primary/5 text-primary" 
                            : "border-accent/10 bg-white hover:border-secondary hover:bg-accent/[0.02]"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-accent truncate">{cand.displayName}</p>
                          <p className="text-[10px] font-light text-accent/40 truncate">{cand.email}</p>
                        </div>
                        {isAssigned ? (
                          <Check className="w-5 h-5 text-primary shrink-0" />
                        ) : (
                          <Plus className="w-5 h-5 text-accent/25 opacity-0 group-hover/cand:opacity-100 transition-opacity shrink-0" />
                        )}
                      </button>
                    );
                  })}
                {allUsers.filter(u => u.roles.includes('CANDIDATE')).length === 0 && (
                  <p className="text-xs text-accent/30 italic col-span-2 text-center py-6">Aucun candidat disponible pour l'assignation</p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-6 bg-black/[0.02] border border-dashed border-black/10 rounded-xl text-center">
              <p className="text-xs text-black/40 italic">
                Les options d'assignation de dossiers s'activent si vous attribuez le rôle <strong>Candidat</strong> ou <strong>Jury</strong> à cet utilisateur.
              </p>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-4 pt-6 border-t border-accent/10 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-4 border border-accent/10 text-accent/60 hover:text-accent hover:bg-accent/5 rounded-base text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-8 py-4 bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              {isSaving ? "Création..." : "Créer l'utilisateur"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
