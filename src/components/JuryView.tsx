import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Dossier } from '../types';
import { UserDirectoryService } from '../services/userDirectoryService';
import { Gavel, Table, Users, CheckSquare, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import { SalaryTable } from './SalaryTable';
import { FilterSelect, JuryZoomModal } from './jury/JuryUI';
import { JuryCandidateList } from './jury/JuryCandidateList';
import { JuryCandidateHeader } from './jury/JuryCandidateHeader';
import { JuryDossierViewer } from './jury/JuryDossierViewer';

interface JuryViewProps {
  dossiers: Dossier[];
  profile: UserProfile;
  campaignYear: number;
}

export function JuryView({ dossiers, profile, campaignYear }: JuryViewProps) {
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'DELIBERATIONS' | 'SALARY_TABLE'>('DELIBERATIONS');
  const [expandedTabs, setExpandedTabs] = useState<Record<string, boolean>>({
    SYNTHESE: true
  });
  const toggleTab = (tab: string) => {
    setExpandedTabs({ [tab]: true });
  };
  const [zoomData, setZoomData] = useState<{ title: string; content: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<Dossier['status'] | 'ALL'>('ALL');
  const [onlyAssigned, setOnlyAssigned] = useState<boolean>(true);
  const [candidates, setCandidates] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    // 1. Initialiser instantanément depuis UserDirectoryService
    const syncCandidates = () => {
      const all = UserDirectoryService.getCandidates();
      const users: Record<string, UserProfile> = {};
      all.forEach(u => {
        users[u.id] = u;
        if (u.idProfil) users[u.idProfil] = u;
        if (u.matricule) users[u.matricule] = u;
      });
      setCandidates(users);
    };
    syncCandidates();
    return UserDirectoryService.subscribe(syncCandidates);
  }, []);

  // Détection de l'assignation d'un dossier pour le membre du jury connecté
  const isAssignedToCurrentUser = (dossier: Dossier) => {
    // 1. Présent dans les candidats assignés au profil
    const hasAssignedCandidate = (profile.assignedCandidateIds || []).some(cid => 
      cid === dossier.candidateId || (dossier.idProfil && cid === dossier.idProfil)
    );
    if (hasAssignedCandidate) return true;

    // 2. Assigné dans les consultants / jurys du dossier
    const hasAssignedConsultant = (dossier.assignedConsultantIds || []).some(id => 
      id === profile.id || (profile.idProfil && id === profile.idProfil)
    );
    if (hasAssignedConsultant) return true;

    // 3. Référent jury indiqué dans la décision
    if (dossier.juryDecision?.referentJury) {
      const ref = dossier.juryDecision.referentJury.trim().toLowerCase();
      if (ref) {
        if (profile.displayName && ref === profile.displayName.trim().toLowerCase()) return true;
        if (profile.email && ref === profile.email.trim().toLowerCase()) return true;
      }
    }

    return false;
  };

  const assignedDossiersCount = dossiers.filter(d => isAssignedToCurrentUser(d)).length;

  // Répartition des dossiers entre les membres du jury (4 membres au total)
  const juryMembers = useMemo(() => UserDirectoryService.getJuryMembers(), []);
  const juryWorkload = useMemo(() => {
    const counts: Record<string, number> = {};
    let unassigned = 0;
    juryMembers.forEach(m => { counts[m.displayName] = 0; });

    dossiers.forEach(d => {
      const ref = d.juryDecision?.referentJury;
      if (ref && counts[ref] !== undefined) {
        counts[ref]++;
      } else if (ref) {
        // match case-insensitively if needed
        const found = juryMembers.find(m => m.displayName.toLowerCase() === ref.toLowerCase());
        if (found) counts[found.displayName]++;
        else unassigned++;
      } else {
        unassigned++;
      }
    });

    return { counts, unassigned, total: dossiers.length };
  }, [dossiers, juryMembers]);

  const filteredDossiers = dossiers.filter(d => {
    const matchesStatus = filterStatus === 'ALL' || d.status === filterStatus;
    if (!matchesStatus) return false;
    if (onlyAssigned) {
      return isAssignedToCurrentUser(d);
    }
    return true;
  });

  const selectedDossier = filteredDossiers.find(d => d.id === selectedDossierId) || 
    (filteredDossiers.length > 0 ? filteredDossiers[0] : null);
  const selectedCandidate = selectedDossier ? (
    candidates[selectedDossier.candidateId] ||
    (selectedDossier.idProfil && candidates[selectedDossier.idProfil]) ||
    {
      id: selectedDossier.candidateId,
      idProfil: selectedDossier.idProfil,
      displayName: selectedDossier.candidateName,
      email: selectedDossier.candidateEmail || '',
      roles: ['CANDIDATE'],
      currentGrade: selectedDossier.annualReport?.currentGrade,
      currentSalary: selectedDossier.annualReport?.currentSalary,
      currentTJSalaire: selectedDossier.annualReport?.currentTJSalaire,
      currentTJM: selectedDossier.annualReport?.currentTJM
    } as UserProfile
  ) : null;

  // Calculate average target TJM from consultant feedbacks
  const calculateAverageTargetTJM = (dossier: Dossier) => {
    const feedbacks = Object.values(dossier.consultantFeedbacks || {});
    if (feedbacks.length === 0) return null;
    const sum = feedbacks.reduce((acc, f) => acc + (f.targetTJMin + f.targetTJMax) / 2, 0);
    return Math.round(sum / feedbacks.length);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-accent/10 pb-8 mb-12">
        <div className="flex items-center gap-12">
          <div>
            <h2 className="text-secondary tracking-tight">Espace Jury</h2>
          </div>

          <div className="flex bg-accent/5 p-1 rounded-xl border border-accent/10">
            <button
              onClick={() => setActiveView('DELIBERATIONS')}
              className={cn(
                "flex items-center gap-3 px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                activeView === 'DELIBERATIONS' ? "bg-white text-secondary shadow-lg" : "text-accent/40 hover:text-accent/60"
              )}
            >
              <Users className="w-4 h-4" />
              Délibérations
            </button>
            <button
              onClick={() => setActiveView('SALARY_TABLE')}
              className={cn(
                "flex items-center gap-3 px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                activeView === 'SALARY_TABLE' ? "bg-white text-secondary shadow-lg" : "text-accent/40 hover:text-accent/60"
              )}
            >
              <Table className="w-4 h-4" />
              Tableau des salaires & délibérations
            </button>
          </div>
        </div>
        
        {activeView === 'DELIBERATIONS' && (
          <div className="flex flex-wrap items-center gap-4">
            {/* Barre de répartition des dossiers entre les membres du jury */}
            <div className="hidden xl:flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-accent/10 shadow-xs text-xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-accent/40">Répartition Jury :</span>
              <div className="flex items-center gap-2">
                {juryMembers.map(m => {
                  const count = juryWorkload.counts[m.displayName] || 0;
                  const isCurrent = profile.displayName === m.displayName;
                  return (
                    <div 
                      key={m.id}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors",
                        isCurrent ? "bg-secondary/10 text-secondary border border-secondary/20" : "bg-accent/5 text-accent/70"
                      )}
                      title={`${m.displayName} a ${count} dossier(s) assigné(s)`}
                    >
                      <span className="truncate max-w-[90px]">{m.displayName.split(' ')[0]}</span>
                      <span className={cn(
                        "px-1.5 py-0.2 rounded-full text-[10px] font-black",
                        isCurrent ? "bg-secondary text-white" : "bg-accent/20 text-accent"
                      )}>
                        {count}
                      </span>
                    </div>
                  );
                })}
                {juryWorkload.unassigned > 0 && (
                  <div 
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold"
                    title={`${juryWorkload.unassigned} dossier(s) sans référent`}
                  >
                    <span>Non assignés</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-200 text-amber-900">
                      {juryWorkload.unassigned}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOnlyAssigned(prev => !prev)}
              className={cn(
                "flex items-center gap-2.5 px-4 py-3 rounded-base text-[11px] font-black uppercase tracking-widest transition-all border cursor-pointer select-none",
                onlyAssigned
                  ? "bg-primary/10 border-primary text-primary hover:bg-primary/15"
                  : "bg-white border-accent/10 text-accent/60 hover:text-accent hover:border-accent/30"
              )}
            >
              {onlyAssigned ? (
                <CheckSquare className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-accent/30 shrink-0" />
              )}
              <span>Mes dossiers assignés uniquement</span>
              <span className={cn(
                "ml-1 px-2 py-0.5 rounded-full text-[10px] font-black",
                onlyAssigned ? "bg-primary text-white" : "bg-accent/10 text-accent/50"
              )}>
                {assignedDossiersCount}
              </span>
            </button>

            <FilterSelect 
              value={filterStatus} 
              onChange={v => setFilterStatus(v as any)} 
              options={[
                { label: 'Tous les statuts', value: 'ALL' },
                { label: 'À traiter', value: 'COMPLET' },
                { label: 'Validés', value: 'VALIDE' }
              ]}
            />
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {activeView === 'SALARY_TABLE' ? (
          <motion.div
            key="salary-table"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <SalaryTable 
              dossiers={dossiers} 
              candidates={candidates} 
              campaignYear={campaignYear}
              profile={profile} 
            />
          </motion.div>
        ) : (
          <motion.div
            key="deliberations"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Sidebar list */}
            <div className="lg:col-span-4">
              <JuryCandidateList
                dossiers={filteredDossiers}
                selectedDossierId={selectedDossierId}
                onSelectDossier={setSelectedDossierId}
              />
            </div>

            {/* Main detail / deliberating space */}
            <div className="lg:col-span-8">
              <AnimatePresence mode="wait">
                {selectedDossier ? (
                  <motion.div 
                    key={selectedDossier.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="space-y-6"
                  >
                    <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -mr-24 -mt-24 blur-2xl" />
                      
                      {/* Candidate Header & KPI Summary */}
                      <JuryCandidateHeader
                        dossier={selectedDossier}
                        candidate={selectedCandidate}
                        calculateAverageTargetTJM={calculateAverageTargetTJM}
                        referenceDate={selectedDossier?.annualReport?.wishedSalaryDate}
                      />

                      {/* Accordion Sections & Decision */}
                      <JuryDossierViewer
                        dossier={selectedDossier}
                        candidate={selectedCandidate}
                        profile={profile}
                        expandedTabs={expandedTabs}
                        toggleTab={toggleTab}
                        setZoomData={setZoomData}
                        onDoneDecision={() => setSelectedDossierId(null)}
                        isAssigned={isAssignedToCurrentUser(selectedDossier)}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full min-h-[500px] flex flex-col items-center justify-center bg-white border border-black/5 rounded-[40px] text-black/40"
                  >
                    <Gavel className="w-16 h-16 mb-6 opacity-10" />
                    <h3 className="text-2xl font-serif font-medium opacity-40">Délibération du Jury</h3>
                    <p className="opacity-40 italic mt-2">Sélectionnez un dossier pour statuer</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoom Modal */}
      <JuryZoomModal zoomData={zoomData} onClose={() => setZoomData(null)} />
    </div>
  );
}
