import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Dossier } from '../types';
import { UserDirectoryService } from '../services/userDirectoryService';
import { Gavel, Table, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { SalaryTable } from './SalaryTable';
import { FilterSelect, JuryZoomModal } from './jury/JuryUI';
import { JuryCandidateList } from './jury/JuryCandidateList';
import { JuryCandidateHeader } from './jury/JuryCandidateHeader';
import { JuryDossierViewer } from './jury/JuryDossierViewer';

interface JuryViewProps {
  dossiers: Dossier[];
  profile: UserProfile;
}

export function JuryView({ dossiers, profile }: JuryViewProps) {
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'DELIBERATIONS' | 'SALARY_TABLE'>('DELIBERATIONS');
  const [expandedTabs, setExpandedTabs] = useState<Record<string, boolean>>({
    SYNTHESE: true
  });
  const toggleTab = (tab: string) => {
    setExpandedTabs(prev => {
      const isCurrentlyOpen = !!prev[tab];
      return {
        [tab]: !isCurrentlyOpen
      };
    });
  };
  const [zoomData, setZoomData] = useState<{ title: string; content: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<Dossier['status'] | 'ALL'>('ALL');
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

  const selectedDossier = dossiers.find(d => d.id === selectedDossierId) || null;
  const filteredDossiers = dossiers.filter(d => filterStatus === 'ALL' || d.status === filterStatus);
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
            <p className="text-[10px] text-accent/40 uppercase tracking-[0.3em] font-black mt-2">Arbitrage & Validation des Augmentations 2025</p>
          </div>

          <div className="flex bg-accent/5 p-1 rounded-xl border border-accent/10">
            <button
              onClick={() => setActiveView('DELIBERATIONS')}
              className={cn(
                "flex items-center gap-3 px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                activeView === 'DELIBERATIONS' ? "bg-white text-secondary shadow-lg" : "text-accent/40 hover:text-accent/60"
              )}
            >
              <Users className="w-4 h-4" />
              Délibérations
            </button>
            <button
              onClick={() => setActiveView('SALARY_TABLE')}
              className={cn(
                "flex items-center gap-3 px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                activeView === 'SALARY_TABLE' ? "bg-white text-secondary shadow-lg" : "text-accent/40 hover:text-accent/60"
              )}
            >
              <Table className="w-4 h-4" />
              Tableau des salaires
            </button>
          </div>
        </div>
        
        {activeView === 'DELIBERATIONS' && (
          <div className="flex gap-4">
            <FilterSelect 
              value={filterStatus} 
              onChange={v => setFilterStatus(v as any)} 
              options={[
                { label: 'Tous les dossiers', value: 'ALL' },
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
            <SalaryTable dossiers={dossiers} candidates={candidates} />
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
