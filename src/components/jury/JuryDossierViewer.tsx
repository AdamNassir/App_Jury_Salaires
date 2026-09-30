import React, { useState, useEffect } from 'react';
import { Dossier, UserProfile } from '../../types';
import { CheckCircle2, Maximize2, Eye, X, FileText } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { JuryDecisionForm } from './JuryDecisionForm';
import { CandidateView } from '../CandidateView';

interface JuryDossierViewerProps {
  dossier: Dossier;
  candidate: UserProfile | null;
  profile: UserProfile;
  expandedTabs?: Record<string, boolean>;
  toggleTab?: (tab: string) => void;
  setZoomData: (data: { title: string; content: string }) => void;
  onDoneDecision?: () => void;
  isAssigned?: boolean;
  hideDecisionTab?: boolean;
  extraTab?: { id: string; label: string; content: React.ReactNode };
}

export function JuryDossierViewer({
  dossier,
  candidate,
  profile,
  setZoomData,
  onDoneDecision,
  isAssigned = true,
  hideDecisionTab = false,
  extraTab
}: JuryDossierViewerProps) {
  const [showDossierModal, setShowDossierModal] = useState(false);

  const campaignYear = dossier.campaignYear ||
    (dossier.campaignId ? parseInt(dossier.campaignId.replace(/[^0-9]/g, ''), 10) : undefined) ||
    new Date().getFullYear();

  const isReadOnly = !isAssigned;

  // Handle ESC key to close modal
  useEffect(() => {
    if (!showDossierModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDossierModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDossierModal]);

  const candidateProfile: UserProfile = candidate || {
    id: dossier.candidateId,
    displayName: dossier.candidateName || 'Candidat',
    email: dossier.candidateEmail || '',
    roles: ['CANDIDATE'],
    currentGrade: dossier.annualReport?.currentGrade || 'Junior',
    idProfil: dossier.idProfil,
    createdAt: dossier.createdAt || new Date().toISOString()
  };

  return (
    <div className="space-y-6">
      {/* Bouton d'accès au dossier complet du candidat en mode lecture */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-accent/5 border border-accent/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-accent/60">Dossier du Candidat</div>
            <div className="text-sm font-bold text-accent">
              Consultez l'ensemble des rubriques, justificatifs et synthèses
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowDossierModal(true)}
          className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg cursor-pointer group active:scale-[0.98]"
        >
          <Eye className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
          <span>Visualiser le dossier</span>
          {candidateProfile.displayName && (
            <span className="font-normal opacity-90">({candidateProfile.displayName})</span>
          )}
        </button>
      </div>

      {extraTab && (
        <div className="space-y-6">
          {extraTab.content}
        </div>
      )}

      {/* Contenu de délibération du Jury (directement accessible sous le bouton, sans titre d'onglet) */}
      {!hideDecisionTab && (
        <div className="space-y-6">
          {(dossier.status === 'COMPLET' && profile.roles.includes('JURY')) ? (
            <div key={dossier.id}>
              <JuryDecisionForm 
                dossier={dossier} 
                candidate={candidate} 
                onDone={onDoneDecision || (() => {})} 
                readOnly={isReadOnly}
                profile={profile}
              />
            </div>
          ) : dossier.status === 'VALIDE' ? (
            <div className="bg-green-50 p-12 rounded-[40px] border border-green-100 text-center space-y-8">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-2xl mx-auto py-8 border-y border-green-200/50">
                <div>
                  <div className="text-[10px] font-bold uppercase text-green-800/40 mb-2">Nouveau Salaire</div>
                  <div className="text-2xl font-bold text-green-800">{formatCurrency(dossier.juryDecision?.amount || 0)}</div>
                </div>
                {dossier.juryDecision?.maxSalaryIfTJIncreases && (
                  <div>
                    <div className="text-[10px] font-bold uppercase text-green-800/40 mb-2">Max si ↑ TJ</div>
                    <div className="text-2xl font-bold text-green-800">{formatCurrency(dossier.juryDecision.maxSalaryIfTJIncreases)}</div>
                  </div>
                )}
              </div>
              {dossier.juryDecision?.conclusion && (
                <div className="p-8 bg-white/50 rounded-2xl text-green-800/70 italic font-light leading-relaxed group/conclusion relative">
                  <div className="absolute top-3 right-3">
                    <button
                      type="button"
                      onClick={() => setZoomData({ title: "Conclusion Décision Jury", content: dossier.juryDecision?.conclusion || "" })}
                      className="opacity-0 group-hover/conclusion:opacity-100 focus:opacity-100 p-1 text-green-800/40 hover:text-green-800 hover:bg-green-100/50 rounded transition-all cursor-pointer"
                      title="Agrandir"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  "{dossier.juryDecision.conclusion}"
                </div>
              )}
            </div>
          ) : (
            <div className="p-20 text-center text-accent/30 italic">Décision en cours de délibération...</div>
          )}
        </div>
      )}

      {/* Modal Dossier Candidat en lecture seule pour le Jury */}
      {showDossierModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 animate-in fade-in duration-200"
          onClick={() => setShowDossierModal(false)}
        >
          <div 
            className="bg-white w-full max-w-7xl h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-black/10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-accent/10 bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                  {candidateProfile.displayName?.[0] || 'C'}
                </div>
                <div>
                  <h3 className="font-bold text-accent text-base sm:text-lg flex items-center gap-2">
                    Dossier de {candidateProfile.displayName}
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                      Mode Consultation Jury
                    </span>
                  </h3>
                  <p className="text-xs text-accent/60">
                    Campagne {campaignYear} • {candidateProfile.currentGrade || dossier.annualReport?.currentGrade || 'Grade non spécifié'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDossierModal(false)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/5 hover:bg-accent/10 text-accent font-semibold text-sm transition-colors cursor-pointer"
                title="Fermer (Échap)"
              >
                <X className="w-5 h-5" />
                <span className="hidden sm:inline">Fermer</span>
              </button>
            </div>

            {/* Modal Body: CandidateView en lecture seule */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-50/50">
              <CandidateView
                profile={candidateProfile}
                dossier={dossier}
                currentUser={profile}
                readOnly={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
