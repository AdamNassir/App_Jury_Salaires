import React, { useMemo } from 'react';
import { Dossier, UserProfile } from '../../types';
import { Award, Mail, TrendingUp, Banknote, Clock, UserCheck } from 'lucide-react';
import { cn, formatCurrency } from '../../lib/utils';
import { calculateYears } from '../../lib/salaryUtils';
import { StatusPill } from './JuryUI';
import { UserDirectoryService } from '../../services/userDirectoryService';
import { updateDoc, doc, serverTimestamp } from '../../lib/localDatabase';
import { db } from '../../lib/localDatabase';

interface JuryCandidateHeaderProps {
  dossier: Dossier;
  candidate: UserProfile | null;
  calculateAverageTargetTJM: (dossier: Dossier) => number | null;
  referenceDate?: string | Date | null;
}

export function JuryCandidateHeader({
  dossier,
  candidate,
  calculateAverageTargetTJM,
  referenceDate
}: JuryCandidateHeaderProps) {
  const yearsLL = candidate?.entryDate ? calculateYears(candidate.entryDate, referenceDate) : null;
  const juryMembers = useMemo(() => UserDirectoryService.getJuryMembers(), []);

  const handleAssignReferent = async (referentName: string) => {
    try {
      const dossierRef = doc(db, 'dossiers', dossier.id);
      const existingDecision = dossier.juryDecision || {};

      await updateDoc(dossierRef, {
        juryDecision: {
          ...existingDecision,
          referentJury: referentName,
          updatedAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Erreur lors de l'assignation du référent jury:", err);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12 pb-10 border-b border-accent/10 relative">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-accent/5 rounded-2xl flex items-center justify-center text-accent/20 border border-accent/10 shrink-0">
            <Award className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-secondary mb-2 leading-none">{dossier.candidateName}</h2>
            <div className="flex items-center gap-4 text-accent/40 flex-wrap">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span className="text-lg font-light italic">{dossier.candidateEmail}</span>
              </div>
              {candidate?.matricule && (
                <>
                  <span className="w-1 h-1 bg-accent/20 rounded-full" />
                  <span className="text-xs font-black uppercase tracking-widest">{candidate.matricule}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          {/* Sélecteur Référent Jury */}
          <div className="text-left sm:text-right">
            <div className="text-[10px] font-black text-accent/40 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5 justify-start sm:justify-end">
              <UserCheck className="w-3.5 h-3.5 text-secondary" />
              <span>Référent Jury</span>
            </div>
            <select
              value={dossier.juryDecision?.referentJury || ''}
              onChange={e => handleAssignReferent(e.target.value)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-xl border outline-none font-semibold transition-all cursor-pointer shadow-xs",
                dossier.juryDecision?.referentJury
                  ? "bg-secondary/5 border-secondary/30 text-secondary"
                  : "bg-white border-accent/20 text-accent/50 italic hover:border-accent/40"
              )}
            >
              <option value="">Non assigné</option>
              {juryMembers.map(m => (
                <option key={m.id} value={m.displayName}>{m.displayName}</option>
              ))}
            </select>
          </div>

          <div className="h-10 w-px bg-accent/10 hidden sm:block" />

          {/* Statut Dossier */}
          <div className="text-right">
            <div className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-3">Statut Dossier</div>
            <StatusPill status={dossier.status} />
          </div>
        </div>
      </div>

      {/* Summary Profiles & Wishes - 4 paired blocks */}
      <div className="flex flex-col gap-4 mb-12">
        {/* Block 1: TJM Actuel et TJM Cible */}
        <div className="p-6 rounded-xl border border-accent/10 bg-white hover:shadow-lg transition-all shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-accent/60">TJM Actuel & TJM Cible</h4>
              <p className="text-[10px] text-accent/30 uppercase tracking-widest mt-0.5">Tarif Journalier Moyen</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 sm:gap-12">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-accent/30">Actuel :</span>
              <span className="text-base font-bold text-accent">
                {candidate?.currentTJM ? `${candidate.currentTJM}€ / j` : 'N/A'}
              </span>
            </div>
            <div className="h-4 w-px bg-accent/10 hidden sm:block" />
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-primary">Cible :</span>
              <span className="text-base font-bold text-primary">
                {dossier.annualReport?.targetTJM 
                  ? `${dossier.annualReport.targetTJM}€ / j` 
                  : calculateAverageTargetTJM(dossier) 
                    ? `${calculateAverageTargetTJM(dossier)}€ / j (Moy)` 
                    : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Block 2: Grade Actuel et Grade Souhaité */}
        <div className="p-6 rounded-xl border border-accent/10 bg-white hover:shadow-lg transition-all shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent/5 rounded-lg text-accent border border-accent/10">
              <Award className="w-5 h-5 text-accent opacity-80" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-accent/60">Grade Actuel & Grade Souhaité</h4>
              <p className="text-[10px] text-accent/30 uppercase tracking-widest mt-0.5">Séniorité & Rôle</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 sm:gap-12">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-accent/30">Actuel :</span>
              <span className="text-base font-bold text-accent">
                {candidate?.currentGrade || 'Junior'}
              </span>
            </div>
            <div className="h-4 w-px bg-accent/10 hidden sm:block" />
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-secondary">Souhaité :</span>
              <span className="text-base font-bold text-secondary uppercase">
                {dossier.annualReport?.wishedGrade || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Block 3: Salaire Actuel et Salaire Souhaité */}
        <div className="p-6 rounded-xl border border-accent/10 bg-white hover:shadow-lg transition-all shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600 border border-emerald-100">
              <Banknote className="w-5 h-5 text-emerald-600 opacity-80" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-accent/60">Salaire Actuel & Salaire Souhaité</h4>
              <p className="text-[10px] text-accent/30 uppercase tracking-widest mt-0.5">Rémunération Annuelle Brute</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 sm:gap-12">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-accent/30">Actuel :</span>
              <span className="text-base font-bold text-accent">
                {candidate?.currentSalary ? formatCurrency(candidate.currentSalary) : 'N/A'}
              </span>
            </div>
            <div className="h-4 w-px bg-accent/10 hidden sm:block" />
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Souhaité :</span>
              <span className="text-base font-bold text-emerald-600">
                {dossier.annualReport?.wishedSalary ? formatCurrency(dossier.annualReport.wishedSalary) : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Block 4: Années d’expérience & Ancienneté chez LL */}
        <div className="p-6 rounded-xl border border-accent/10 bg-white hover:shadow-lg transition-all shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 rounded-lg text-indigo-600 border border-indigo-100">
              <Clock className="w-5 h-5 text-indigo-600 opacity-80" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-accent/60">Années d’expérience & Ancienneté chez LL</h4>
              <p className="text-[10px] text-accent/30 uppercase tracking-widest mt-0.5">Parcours & Fidélité</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 sm:gap-12">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-accent/30">Total XP :</span>
              <span className="text-base font-bold text-accent">
                {candidate?.experienceYears !== undefined && candidate?.experienceYears !== null ? `${candidate.experienceYears} ans` : 'N/A'}
              </span>
            </div>
            <div className="h-4 w-px bg-accent/10 hidden sm:block" />
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Chez LL :</span>
              <span className="text-base font-bold text-indigo-600" title={candidate?.entryDate ? `Arrivé le ${new Date(candidate.entryDate).toLocaleDateString()}` : undefined}>
                {yearsLL !== null ? `${yearsLL} ans` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
