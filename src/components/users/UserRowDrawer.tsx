import React, { useState } from 'react';
import { doc, updateDoc } from '../../lib/localDatabase';
import { db } from '../../lib/localDatabase';
import { UserProfile, UserRole } from '../../types';
import { Shield, Settings, Users, Search, Check, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ProfileField } from './UserCommonUI';

interface UserRowDrawerProps {
  user: UserProfile;
  allUsers: UserProfile[];
  isOperatingAdmin: boolean;
  updatingId: string | null;
  onRoleToggle: (user: UserProfile, role: UserRole) => void;
  onAssignmentToggle: (consultant: UserProfile, candidateId: string) => void;
  assignmentsLoading: string | null;
}

export function UserRowDrawer({
  user,
  allUsers,
  isOperatingAdmin,
  updatingId,
  onRoleToggle,
  onAssignmentToggle,
  assignmentsLoading
}: UserRowDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
      {/* Column 1: Roles Management */}
      <div className="p-10 bg-white rounded-xl border border-accent/10 shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary/10 rounded-base flex items-center justify-center text-primary">
            <Shield className="w-5 h-5" />
          </div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/30">Attributions Rôles</h4>
        </div>
        <div className="space-y-3">
          {(['CANDIDATE', 'JURY', 'ADMIN'] as UserRole[]).map((r) => {
            const isActive = user.roles?.includes(r);
            const isRestrictedAdmin = r === 'ADMIN' && !isOperatingAdmin;
            return (
              <button
                key={r}
                type="button"
                disabled={updatingId === user.id}
                onClick={() => onRoleToggle(user, r)}
                title={isRestrictedAdmin ? "Réservé aux Administrateurs" : undefined}
                className={cn(
                  "w-full px-6 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-between group cursor-pointer",
                  isActive 
                    ? "bg-accent text-white shadow-lg ring-2 ring-primary ring-offset-2" 
                    : "bg-accent/5 text-accent/40 hover:bg-white hover:border-accent/20 border border-transparent",
                  isRestrictedAdmin && "opacity-60"
                )}
              >
                <span className="flex items-center gap-3">
                  <Shield className={cn("w-5 h-5 opacity-20 transition-opacity", isActive && "opacity-100 text-primary")} />
                  {r === 'ADMIN' ? 'Administrateur' : r === 'CANDIDATE' ? 'Candidat & Évaluateur' : 'Membre Jury'}
                  {isRestrictedAdmin && (
                    <span className="text-[9px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold tracking-normal uppercase">Réservé Admin</span>
                  )}
                </span>
                {isActive && <Check className="w-5 h-5 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Column 2: Profile Details */}
      <div className="p-10 bg-white rounded-xl border border-accent/10 shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-secondary/10 rounded-base flex items-center justify-center text-secondary">
            <Settings className="w-5 h-5" />
          </div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/30">Données RH / Profil</h4>
        </div>
        <div className="grid grid-cols-1 gap-8">
          <div className="bg-accent/5 p-4 rounded-lg border border-accent/10 space-y-1">
            <div className="text-[10px] font-black text-accent/40 uppercase tracking-[0.2em]">Id Métier Canonique (APP_LL)</div>
            <div className="text-xs font-mono font-bold text-accent">{user.idProfil || user.matricule || 'Non rattaché'}</div>
            <div className="text-[9px] text-accent/40 font-mono">UID Auth: {user.id}</div>
          </div>
          <ProfileField 
            label="Matricule Collaborateur" 
            value={user.matricule || ''} 
            onSave={v => updateDoc(doc(db, 'users', user.id), { matricule: v })} 
          />
          <div className="w-full">
            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4 px-2">Grade Actuel</label>
            <select 
              value={user.currentGrade || 'Confirmé'} 
              onChange={e => updateDoc(doc(db, 'users', user.id), { currentGrade: e.target.value })} 
              className="w-full bg-accent/5 border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none shadow-inner cursor-pointer"
            >
              <option value="Junior">Junior</option>
              <option value="Confirmé">Confirmé</option>
              <option value="Senior">Senior</option>
              <option value="Expert">Expert</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <ProfileField 
              label="Date d'entrée" 
              value={user.entryDate || ''} 
              onSave={v => updateDoc(doc(db, 'users', user.id), { entryDate: v })} 
              type="date"
            />
            <ProfileField 
              label="Exp. (années)" 
              value={user.experienceYears || 0} 
              onSave={v => updateDoc(doc(db, 'users', user.id), { experienceYears: parseInt(v) || 0 })} 
              type="number"
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <ProfileField 
              label="Salaire Fixe" 
              value={user.currentSalary || 0} 
              onSave={v => updateDoc(doc(db, 'users', user.id), { currentSalary: parseFloat(v) || 0 })} 
              type="number"
            />
            <ProfileField 
              label="TJM Quotidien" 
              value={user.currentTJM || 0} 
              onSave={v => updateDoc(doc(db, 'users', user.id), { currentTJM: parseFloat(v) || 0 })} 
              type="number"
            />
          </div>
        </div>
      </div>

      {/* Column 3: Assignments section */}
      <div className="lg:col-span-1">
        {(user.roles.includes('CANDIDATE') || user.roles.includes('JURY')) ? (
          <div className="p-10 bg-white rounded-xl border border-accent/10 shadow-sm h-full">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-base flex items-center justify-center text-primary">
                  <Users className="w-5 h-5" />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/30">Assignations Évaluation</h4>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-accent/20" />
                <input 
                  type="text" 
                  placeholder="FILTRER..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-accent/5 border-none rounded-base text-[10px] font-black focus:ring-2 focus:ring-primary/40 w-36 uppercase tracking-widest outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
              {allUsers
                .filter(u => u.roles.includes('CANDIDATE') && u.id !== user.id)
                .filter(u => u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(cand => {
                  const isAssigned = user.assignedCandidateIds?.includes(cand.id);
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => onAssignmentToggle(user, cand.id)}
                      disabled={!!assignmentsLoading}
                      className={cn(
                        "px-5 py-4 rounded-xl text-sm font-bold border text-left transition-all flex items-center justify-between group/btn shadow-sm cursor-pointer",
                        isAssigned 
                          ? "border-primary bg-primary/5 text-primary" 
                          : "border-accent/10 bg-white hover:border-secondary hover:bg-accent/[0.02]"
                      )}
                    >
                      <div className="flex flex-col min-w-0 text-left">
                        <span className="truncate text-accent group-hover/btn:text-secondary transition-colors">{cand.displayName || cand.email.split('@')[0]}</span>
                        <span className={cn("text-[10px] font-light truncate", isAssigned ? "text-primary/60" : "text-accent/30")}>{cand.email}</span>
                      </div>
                      {isAssigned ? (
                        <Check className="w-5 h-5 shrink-0 text-primary" />
                      ) : (
                        <Plus className="w-5 h-5 shrink-0 opacity-0 group-hover/btn:opacity-20 text-accent" />
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        ) : (
          <div className="p-8 bg-black/[0.02] border border-dashed border-black/10 rounded-3xl h-full flex flex-col items-center justify-center text-center">
            <Shield className="w-8 h-8 mb-4 text-black/10" />
            <p className="text-xs text-black/40 italic">
              Seuls les utilisateurs avec le rôle <br/><strong>Candidat ou Jury</strong> peuvent évaluer des dossiers.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
