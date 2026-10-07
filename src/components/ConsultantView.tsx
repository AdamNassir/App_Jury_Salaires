import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { UserProfile, Dossier, ConsultantFeedback, ConsultationType, EvaluationRelationType, Campaign } from '../types';
import { UserDirectoryService } from '../services/userDirectoryService';
import { LocalDatabaseService } from '../services/localDatabaseService';
import { User, MessageSquare, CheckCircle2, Search, AlertCircle, Building2, Briefcase, Plus, ShieldCheck, History, Clock, FileEdit, Check, AlertTriangle, Trash2, Loader2, Eye, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { JuryZoomModal } from './jury/JuryUI';
import { CandidateView } from './CandidateView';

interface ConsultantViewProps {
  dossiers: Dossier[];
  profile: UserProfile;
}

const RELATION_TYPES: EvaluationRelationType[] = [
  'Commerciale',
  'Encadrement',
  'Meteo_Client',
  'Coach Logiclever',
  'Collègue_Mission'
];

export function ConsultantView({ dossiers, profile }: ConsultantViewProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('ALL');
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ASSIGNED'>(
    (profile.roles?.includes('EVALUATOR') || (profile.assignedCandidateIds && profile.assignedCandidateIds.length > 0)) ? 'ASSIGNED' : 'ALL'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [candidates, setCandidates] = useState<Record<string, UserProfile>>({});
  const [zoomData, setZoomData] = useState<{ title: string; content: string } | null>(null);
  const [showDossierModal, setShowDossierModal] = useState(false);

  // Load campaigns from LocalStorage
  useEffect(() => {
    const q = query(collection(db, 'campaigns'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Campaign));
      docs.sort((a, b) => (b.year || 0) - (a.year || 0));
      setCampaigns(docs);

      // Default to the first active/open campaign if not set
      if (docs.length > 0 && selectedCampaignId === 'ALL') {
        const active = docs.find(c => c.status === 'OUVERTE') || docs[0];
        setSelectedCampaignId(active.id);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load candidate profiles
  useEffect(() => {
    const syncCandidates = () => {
      const all = UserDirectoryService.getCandidates();
      const users: Record<string, UserProfile> = {};
      all.forEach(u => {
        users[u.id] = u;
        if (u.idProfil) users[u.idProfil] = u;
      });
      setCandidates(users);
    };
    syncCandidates();
    return UserDirectoryService.subscribe(syncCandidates);
  }, []);

  const activeCampaign = campaigns.find(c => c.id === selectedCampaignId) || null;
  const isCampaignClosed = activeCampaign?.status === 'CLÔTURÉE';

  // Filter dossiers based on selected campaign and role rules
  const campaignDossiers = dossiers.filter(d => {
    if (selectedCampaignId !== 'ALL' && d.campaignId && d.campaignId !== selectedCampaignId) {
      return false;
    }
    return true;
  });

  // Détection robuste si un dossier est assigné à l'évaluateur connecté
  const checkIsAssigned = (d: Dossier) => {
    // 1. Directement dans la liste des consultants assignés au dossier
    const inAssignedList = (d.assignedConsultantIds || []).some(id => 
      id === profile.id || 
      (profile.idProfil && id === profile.idProfil) ||
      (profile.matricule && id === profile.matricule) ||
      (profile.email && id.toLowerCase() === profile.email.toLowerCase())
    );
    if (inAssignedList) return true;

    // 2. Directement dans les candidats assignés au profil évaluateur
    const inProfileCandidates = (profile.assignedCandidateIds || []).some(cid =>
      cid === d.candidateId || 
      (d.idProfil && cid === d.idProfil) ||
      (candidates[d.candidateId]?.matricule && cid === candidates[d.candidateId]?.matricule)
    );
    if (inProfileCandidates) return true;

    // 3. Détection historique / rétroactive : s'il a déjà un avis rattaché dans le dossier
    const hasExistingFeedback = Object.values(d.consultantFeedbacks || {}).some(f => {
      const matchId = f.evaluatorUid === profile.id || f.consultantId === profile.id;
      const matchIdProfil = profile.idProfil && (f.evaluatorIdProfil === profile.idProfil || f.consultantId === profile.idProfil || f.evaluatorUid === profile.idProfil);
      const matchMatricule = profile.matricule && (f.evaluatorIdProfil === profile.matricule || f.consultantId === profile.matricule);
      const matchName = profile.displayName && f.consultantName && f.consultantName.trim().toLowerCase() === profile.displayName.trim().toLowerCase();
      return matchId || matchIdProfil || matchMatricule || matchName;
    });

    return hasExistingFeedback;
  };

  const getMyFeedbacks = (d: Dossier) => {
    return Object.entries(d.consultantFeedbacks || {}).filter(([_, f]) => {
      const matchId = f.evaluatorUid === profile.id || f.consultantId === profile.id;
      const matchIdProfil = profile.idProfil && (f.evaluatorIdProfil === profile.idProfil || f.consultantId === profile.idProfil || f.evaluatorUid === profile.idProfil);
      const matchMatricule = profile.matricule && (f.evaluatorIdProfil === profile.matricule || f.consultantId === profile.matricule);
      const matchName = profile.displayName && f.consultantName && f.consultantName.trim().toLowerCase() === profile.displayName.trim().toLowerCase();
      return matchId || matchIdProfil || matchMatricule || matchName;
    });
  };

  // Filter based on "ASSIGNED" vs "ALL" and searchQuery
  const filteredDossiers = campaignDossiers.filter(d => {
    const isAssigned = checkIsAssigned(d);

    if (filterStatus === 'ASSIGNED' && !isAssigned) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const candName = (d.candidateName || '').toLowerCase();
      const candEmail = (d.candidateEmail || '').toLowerCase();
      const idProfil = (d.idProfil || d.candidateId || '').toLowerCase();
      if (!candName.includes(q) && !candEmail.includes(q) && !idProfil.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedDossier = dossiers.find(d => d.id === selectedDossierId) || null;
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

  // Campagne ciblée et dossiers rattachés à supprimer
  const targetCampaign = campaigns.find(c => c.id === selectedCampaignId);
  const campaignYear = targetCampaign?.year;
  const campaignDossiersToDelete = dossiers.filter(d => {
    if (d.campaignId === selectedCampaignId) return true;
    if (campaignYear && (d.campaignYear === campaignYear || d.campaignId === `campaign_${campaignYear}`)) return true;
    return false;
  });

  const handleDeleteCampaignDossiers = async () => {
    if (!profile.roles?.includes('ADMIN') || selectedCampaignId === 'ALL') return;
    setIsDeleting(true);
    try {
      // 1. Suppression via LocalDatabaseService
      LocalDatabaseService.deleteDossiersByCampaign(selectedCampaignId, campaignYear);

      // 2. Suppression explicite de chaque document et des profils de test associés
      for (const d of campaignDossiersToDelete) {
        if (d.id) {
          await deleteDoc(doc(db, 'dossiers', d.id));
        }
        const candId = d.candidateId || d.idProfil;
        if (candId && candId.startsWith('DUMMY_USR_')) {
          await deleteDoc(doc(db, 'users', candId));
        }
      }

      setSelectedDossierId(null);
      setShowDeleteModal(false);
    } catch (err) {
      console.error("Erreur lors de la suppression des dossiers de la campagne:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Auto-select first dossier if none selected
  useEffect(() => {
    if (!selectedDossierId && filteredDossiers.length > 0) {
      setSelectedDossierId(filteredDossiers[0].id);
    }
  }, [filteredDossiers, selectedDossierId]);

  return (
    <div className="space-y-6">
      {/* 1. Barreau de sélection de Campagne */}
      <div className="bg-white p-6 rounded-xl border border-accent/10 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase text-accent/40 tracking-widest">Campagne de Référence</div>
            <div className="text-lg font-bold text-accent">Sélectionnez la campagne d'évaluation</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedCampaignId}
            onChange={(e) => {
              setSelectedCampaignId(e.target.value);
            }}
            className="px-4 py-2.5 bg-accent/5 border border-accent/15 rounded-xl text-sm font-bold text-accent outline-none focus:border-primary transition-all cursor-pointer"
          >
            <option value="ALL">Toutes les campagnes</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.year}) {c.status === 'CLÔTURÉE' ? '— Clôturée' : '— Ouverte'}
              </option>
            ))}
          </select>

          {/* Bouton visible UNIQUEMENT pour les administrateurs pour une campagne spécifique */}
          {profile.roles?.includes('ADMIN') && selectedCampaignId !== 'ALL' && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              title="Effacer tous les dossiers de cette campagne"
            >
              <Trash2 className="w-4 h-4 text-red-600 shrink-0" />
              <span>Effacer les dossiers ({campaignDossiersToDelete.length})</span>
            </button>
          )}

          {isCampaignClosed && (
            <span className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-lg flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Campagne Clôturée (Lecture seule)
            </span>
          )}
        </div>
      </div>

      {/* 2. Colonne de gauche (Sélection Candidat) + Colonne de droite (Formulaire Évaluation) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-secondary font-bold text-xl tracking-tight">Candidats de la Campagne</h2>
              <div className="text-xs text-accent/50 font-light">
                {filteredDossiers.length} dossier{filteredDossiers.length > 1 ? 's' : ''} éligible{filteredDossiers.length > 1 ? 's' : ''}
              </div>
            </div>
            <div className="flex bg-accent/5 rounded-base p-1 border border-accent/10">
              <button 
                onClick={() => setFilterStatus('ASSIGNED')}
                className={cn(
                  "px-2.5 py-1.5 rounded-base text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer",
                  filterStatus === 'ASSIGNED' ? "bg-purple-600 text-white shadow-sm" : "text-accent/40 hover:bg-accent/10"
                )}
              >
                Feedback Obligatoire
              </button>
              <button 
                onClick={() => setFilterStatus('ALL')}
                className={cn(
                  "px-2.5 py-1.5 rounded-base text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer",
                  filterStatus === 'ALL' ? "bg-primary text-white shadow-sm" : "text-accent/40 hover:bg-accent/10"
                )}
              >
                Tous
              </button>
            </div>
          </div>

          {/* Barre de recherche de dossier par nom */}
          <div className="relative">
            <Search className="w-4 h-4 text-accent/30 absolute left-3.5 top-3 pointer-events-none" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un dossier par nom..."
              className="w-full pl-10 pr-9 py-2.5 bg-accent/5 border border-accent/10 rounded-xl text-xs font-semibold text-accent placeholder:text-accent/30 outline-none focus:border-primary focus:bg-white transition-all shadow-inner"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-accent/30 hover:text-accent text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-accent/10 transition-colors"
                title="Effacer la recherche"
              >
                ✕
              </button>
            )}
          </div>

          <div className="space-y-3 max-h-[750px] overflow-y-auto pr-1">
            {filteredDossiers.length === 0 ? (
              <div className="p-8 text-center bg-white border border-dashed border-accent/10 rounded-xl text-accent/40">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs font-medium">
                  {searchQuery ? `Aucun dossier trouvé pour « ${searchQuery} »` : "Aucun dossier dans cette catégorie."}
                </p>
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-[10px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    Effacer la recherche
                  </button>
                )}
              </div>
            ) : (
              filteredDossiers.map(d => {
              const isAssigned = checkIsAssigned(d);
              const myFeedbacks = getMyFeedbacks(d);
              const isOwnDossier = d.candidateId === profile.id || (profile.idProfil && d.idProfil === profile.idProfil);
              const isSelected = selectedDossierId === d.id;

              return (
                <button
                  key={d.id}
                  onClick={() => {
                    setSelectedDossierId(d.id);
                  }}
                  className={cn(
                    "w-full p-5 rounded-xl border transition-all text-left group shadow-sm cursor-pointer",
                    isSelected 
                      ? "bg-accent border-accent text-white ring-2 ring-primary ring-offset-2" 
                      : "bg-white border-accent/10 hover:border-secondary text-accent"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-lg flex items-center justify-center shrink-0 shadow-inner transition-colors",
                      isSelected ? "bg-white/10" : "bg-accent/5"
                    )}>
                      <User className="w-6 h-6" />
                    </div>
                    <div className="overflow-hidden flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-base truncate">{d.candidateName}</span>
                        {isOwnDossier && (
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded",
                            isSelected ? "bg-primary text-white" : "bg-primary/10 text-primary"
                          )}>
                            Vous
                          </span>
                        )}
                      </div>
                      <div className={cn(
                        "text-[10px] font-black uppercase tracking-wider flex items-center justify-between gap-2",
                        isSelected ? "text-white/60" : "text-accent/40"
                      )}>
                        <span>
                          {d.annualReport?.currentGrade || candidates[d.candidateId]?.currentGrade || 'Collaborateur'}
                        </span>
                        {myFeedbacks.length > 0 && (
                          <span className={cn(
                            "flex items-center gap-1 font-bold",
                            isSelected ? "text-green-300" : "text-green-600"
                          )}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {myFeedbacks.length} avis
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            }))}
          </div>
        </div>

        {/* Colonne droite : Formulaire d'évaluation */}
        <div className="lg:col-span-8">
          {selectedDossier ? (
            <div className="space-y-6">
              {/* Entête du candidat sélectionné */}
              <div className="bg-white p-8 rounded-xl border border-accent/10 shadow-sm relative overflow-hidden">
                <div className="flex items-start justify-between pb-6 border-b border-accent/10">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                      Dossier Candidat {selectedDossier.campaignYear || ''}
                    </div>
                    <h2 className="text-2xl font-bold text-accent">{selectedDossier.candidateName}</h2>
                    <p className="text-accent/50 text-sm font-light mt-0.5">
                      {selectedDossier.candidateEmail || 'Email non renseigné'} • Grade : {candidates[selectedDossier.candidateId]?.currentGrade || selectedDossier.annualReport?.currentGrade || 'Non spécifié'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDossierModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all font-bold text-xs uppercase tracking-wider shadow-sm hover:shadow-md cursor-pointer group active:scale-[0.98]"
                      title="Consulter l'ensemble du dossier candidat"
                    >
                      <Eye className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
                      <span>Visualiser le dossier</span>
                    </button>
                    <StatusBadge status={selectedDossier.status} />
                  </div>
                </div>

                {/* Formulaire d'évaluation directe */}
                <div className="pt-6">
                  <ConsultantFeedbackForm 
                    dossier={selectedDossier} 
                    consultant={profile}
                    selectedCampaign={activeCampaign}
                    isCampaignClosed={isCampaignClosed}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-white border border-dashed border-accent/10 rounded-xl text-accent/20 p-8 text-center">
              <Search className="w-16 h-16 mb-4 opacity-10" />
              <p className="text-xl font-light italic text-accent/30">Sélectionnez un candidat dans la liste de gauche pour rédiger ou consulter une évaluation.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modale de confirmation de suppression (Admin uniquement) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl border border-red-200 p-6 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-accent">Supprimer les dossiers de la campagne</h3>
                <p className="text-xs text-accent/60">
                  {targetCampaign ? `${targetCampaign.title} (${targetCampaign.year})` : 'Campagne sélectionnée'}
                </p>
              </div>
            </div>

            <div className="bg-red-50/70 border border-red-200/80 rounded-xl p-4 text-xs text-red-800 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                Action irréversible
              </div>
              <p>
                Vous êtes sur le point de supprimer définitivement les <span className="font-extrabold underline">{campaignDossiersToDelete.length} dossier(s)</span> associés à cette campagne.
              </p>
              <p className="text-[11px] text-red-700/80">
                Toutes les délibérations et évaluations de cette campagne pour ces dossiers seront effacées.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2.5 rounded-xl border border-accent/20 text-xs font-bold text-accent hover:bg-accent/5 transition-all cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isDeleting || campaignDossiersToDelete.length === 0}
                onClick={handleDeleteCampaignDossiers}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Suppression...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmer la suppression</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Modal */}
      <JuryZoomModal zoomData={zoomData} onClose={() => setZoomData(null)} />

      {/* Modal Dossier Candidat en lecture seule pour l'évaluateur */}
      {showDossierModal && selectedDossier && (
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
                  {selectedDossier.candidateName?.[0] || 'C'}
                </div>
                <div>
                  <h3 className="font-bold text-accent text-base sm:text-lg flex items-center gap-2">
                    Dossier de {selectedDossier.candidateName}
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                      Mode Consultation Évaluateur
                    </span>
                  </h3>
                  <p className="text-xs text-accent/60">
                    Campagne {selectedDossier.campaignYear} • {candidates[selectedDossier.candidateId]?.currentGrade || selectedDossier.annualReport?.currentGrade || 'Grade non spécifié'}
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
                profile={candidates[selectedDossier.candidateId] || {
                  id: selectedDossier.candidateId,
                  displayName: selectedDossier.candidateName,
                  email: selectedDossier.candidateEmail,
                  roles: ['CANDIDATE']
                }}
                dossier={selectedDossier}
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

function StatusBadge({ status }: { status: Dossier['status'] }) {
  const styles = {
    OUVERT: "border-secondary/20 text-secondary bg-secondary/5",
    COMPLET: "border-primary/20 text-primary bg-primary/5",
    VALIDE: "border-green-200 text-green-600 bg-green-50"
  };
  return (
    <span className={cn("px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm", styles[status])}>
      {status === 'OUVERT' ? 'En cours' : status === 'COMPLET' ? 'Dossier Prêt' : 'Dossier Validé'}
    </span>
  );
}

interface ConsultantFeedbackFormProps {
  dossier: Dossier;
  consultant: UserProfile;
  selectedCampaign: Campaign | null;
  isCampaignClosed: boolean;
}

function ConsultantFeedbackForm({
  dossier,
  consultant,
  selectedCampaign,
  isCampaignClosed
}: ConsultantFeedbackFormProps) {
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isOwnDossier = dossier.candidateId === consultant.id || (consultant.idProfil && dossier.idProfil === consultant.idProfil);

  // Filter feedback items belonging to this consultant
  // Feedbacks are stored in dossier.consultantFeedbacks as a dictionary.
  const allFeedbacksDict = dossier.consultantFeedbacks || {};
  const myFeedbackEntries = Object.entries(allFeedbacksDict).filter(([key, f]) => {
    const matchId = f.evaluatorUid === consultant.id || f.consultantId === consultant.id;
    const matchIdProfil = consultant.idProfil && (f.evaluatorIdProfil === consultant.idProfil || f.consultantId === consultant.idProfil || f.evaluatorUid === consultant.idProfil);
    const matchMatricule = consultant.matricule && (f.evaluatorIdProfil === consultant.matricule || f.consultantId === consultant.matricule);
    const matchName = consultant.displayName && f.consultantName && f.consultantName.trim().toLowerCase() === consultant.displayName.trim().toLowerCase();
    return matchId || matchIdProfil || matchMatricule || matchName;
  });

  // Effective key selected: strictly a singular avis per evaluator on this dossier
  const activeKey = myFeedbackEntries.length > 0 ? myFeedbackEntries[0][0] : null;
  const activeFeedback = activeKey ? allFeedbacksDict[activeKey] : null;

  // Détails de la prime (Projet / Client / Type_Prime) assignée à cet évaluateur pour ce candidat
  const assignedPrimeDetails = dossier.assignmentsDetails?.[consultant.idProfil || ''] ||
    dossier.assignmentsDetails?.[consultant.id] ||
    (consultant.matricule ? dossier.assignmentsDetails?.[consultant.matricule] : undefined);

  // Détection automatique depuis la colonne C (Type_Prime) : Encadrement et Commerciale
  const initialAssignedTypes: EvaluationRelationType[] = [];
  if (assignedPrimeDetails?.relationTypes && assignedPrimeDetails.relationTypes.length > 0) {
    initialAssignedTypes.push(...(assignedPrimeDetails.relationTypes as EvaluationRelationType[]));
  } else if (assignedPrimeDetails?.typePrime) {
    if (/encadrement/i.test(assignedPrimeDetails.typePrime)) initialAssignedTypes.push('Encadrement');
    if (/commercial/i.test(assignedPrimeDetails.typePrime)) initialAssignedTypes.push('Commerciale');
  }

  const defaultRelationTypes: EvaluationRelationType[] = initialAssignedTypes.length > 0 
    ? initialAssignedTypes 
    : ['Collègue_Mission'];
  const [selectedRelationTypes, setSelectedRelationTypes] = useState<EvaluationRelationType[]>(defaultRelationTypes);

  const [formData, setFormData] = useState<Partial<ConsultantFeedback>>({
    relationType: defaultRelationTypes.join(', '),
    relationTypes: defaultRelationTypes,
    type: defaultRelationTypes[0],
    client: '',
    project: '',
    targetTJMin: 0,
    targetTJMax: 0,
    missionPercentage: 98,
    investmentPercentage: 60,
    justification: '',
    improvementAxes: '',
    confidenceIndex: 4,
    status: 'BROUILLON',
    validated: false
  });

  // Synchronize formData when dossier changes or active evaluation is loaded
  useEffect(() => {
    if (!activeFeedback) {
      const initClient = assignedPrimeDetails?.client || '';
      const initProject = assignedPrimeDetails?.project || '';
      setSelectedRelationTypes(defaultRelationTypes);
      setFormData({
        relationType: defaultRelationTypes.join(', '),
        relationTypes: defaultRelationTypes,
        type: defaultRelationTypes[0],
        client: initClient,
        project: initProject,
        targetTJMin: 0,
        targetTJMax: 0,
        missionPercentage: 98,
        investmentPercentage: 60,
        justification: '',
        improvementAxes: '',
        confidenceIndex: 4,
        status: 'BROUILLON',
        validated: false
      });
    } else {
      // Determine if legacy type
      const legacyTypes = ['Coach', 'Collègue en mission', 'Météo Client', 'Logiclever', 'COP & Epic'];
      const rawType = activeFeedback.relationType || activeFeedback.type;
      const isLegacy = legacyTypes.includes(rawType as string) && !RELATION_TYPES.includes(rawType as EvaluationRelationType);

      // Résolution multi-valeurs des types de relation
      let resolvedTypes: EvaluationRelationType[] = [];
      if (Array.isArray(activeFeedback.relationTypes) && activeFeedback.relationTypes.length > 0) {
        resolvedTypes = activeFeedback.relationTypes.filter(r => RELATION_TYPES.includes(r as EvaluationRelationType)) as EvaluationRelationType[];
      } else if (activeFeedback.relationType) {
        const parts = String(activeFeedback.relationType).split(',').map(s => s.trim().replace(/ /g, '_'));
        resolvedTypes = parts.filter(p => RELATION_TYPES.includes(p as EvaluationRelationType)) as EvaluationRelationType[];
      }
      if (resolvedTypes.length === 0 || (resolvedTypes.length === 1 && resolvedTypes[0] === 'Collègue_Mission' && initialAssignedTypes.length > 0)) {
        resolvedTypes = initialAssignedTypes.length > 0 ? initialAssignedTypes : defaultRelationTypes;
      }

      setSelectedRelationTypes(resolvedTypes);

      // Harmonize confidenceIndex to 1-5 range if it was on a 1-10 scale
      let normalizedConfidence = activeFeedback.confidenceIndex ?? 4;
      if (normalizedConfidence > 5) {
        normalizedConfidence = Math.min(5, Math.round(normalizedConfidence / 2));
      }

      const clientVal = activeFeedback.client || assignedPrimeDetails?.client || '';
      const projectVal = activeFeedback.project || assignedPrimeDetails?.project || '';

      setFormData({
        ...activeFeedback,
        relationType: resolvedTypes.map(r => r.replace(/_/g, ' ')).join(', '),
        relationTypes: resolvedTypes,
        client: clientVal,
        project: projectVal,
        missionPercentage: activeFeedback.missionPercentage !== undefined ? activeFeedback.missionPercentage : 98,
        investmentPercentage: activeFeedback.investmentPercentage !== undefined ? activeFeedback.investmentPercentage : 60,
        confidenceIndex: normalizedConfidence,
        isLegacyType: isLegacy,
        status: activeFeedback.status || (activeFeedback.validated ? 'VALIDE' : 'BROUILLON')
      });
    }
  }, [activeKey, dossier.id]);

  const isReadOnly = isCampaignClosed;

  // Gestion de la sélection multiple des types de relations
  const toggleRelationType = (rel: EvaluationRelationType) => {
    if (isReadOnly) return;

    let updated: EvaluationRelationType[];
    if (selectedRelationTypes.includes(rel)) {
      if (selectedRelationTypes.length > 1) {
        updated = selectedRelationTypes.filter(r => r !== rel);
      } else {
        // Conserver au moins un type sélectionné
        return;
      }
    } else {
      updated = [...selectedRelationTypes, rel];
    }
    setSelectedRelationTypes(updated);
    setFormData(prev => ({
      ...prev,
      relationTypes: updated,
      relationType: updated.map(r => r.replace(/_/g, ' ')).join(', '),
      type: updated[0] as ConsultationType
    }));
  };

  // Save as Draft or Validate
  const handleSave = async (targetStatus: 'BROUILLON' | 'VALIDE') => {
    if (isReadOnly) {
      setToastMessage("La campagne est clôturée : aucune modification possible.");
      return;
    }

    if (!formData.client?.trim()) {
      setToastMessage("Veuillez renseigner le nom du Client.");
      return;
    }
    if (!formData.project?.trim()) {
      setToastMessage("Veuillez renseigner le nom du Projet / Mission.");
      return;
    }
    if (targetStatus === 'VALIDE' && (!formData.justification || formData.justification.trim().length < 10)) {
      setToastMessage("Pour valider, veuillez saisir un argumentaire technique détaillé (minimum 10 caractères).");
      return;
    }

    const finalRelationTypes = selectedRelationTypes.length > 0 ? selectedRelationTypes : defaultRelationTypes;

    setLoading(true);
    try {
      // Determine evaluation unique ID: strictly a singular avis per evaluator on this dossier
      const evalId = activeKey || `eval_${consultant.idProfil || consultant.id}`;

      const feedbackToSave: ConsultantFeedback = {
        id: evalId,
        // Authenticated evaluator fields (strictly derived from session, never manually entered)
        consultantId: consultant.id,
        consultantName: consultant.displayName || 'Évaluateur Logiclever',
        evaluatorUid: consultant.id,
        evaluatorIdProfil: consultant.idProfil || undefined,
        // Campaign reference
        campaignId: selectedCampaign?.id || dossier.campaignId || undefined,
        // Evaluation metadata
        client: (formData.client || '').trim(),
        project: (formData.project || '').trim(),
        relationTypes: finalRelationTypes,
        relationType: finalRelationTypes.map(r => r.replace(/_/g, ' ')).join(', '),
        type: finalRelationTypes[0] as ConsultationType,
        // Financial & technical recommendations
        targetTJMin: Math.max(0, Number(formData.targetTJMin) || 0),
        targetTJMax: Math.max(0, Number(formData.targetTJMax) || 0),
        missionPercentage: formData.missionPercentage !== undefined ? Math.min(100, Math.max(0, Number(formData.missionPercentage))) : 98,
        investmentPercentage: formData.investmentPercentage !== undefined ? Math.min(100, Math.max(0, Number(formData.investmentPercentage))) : 60,
        confidenceIndex: Math.min(5, Math.max(1, Number(formData.confidenceIndex) || 4)),
        justification: formData.justification?.trim() || '',
        improvementAxes: formData.improvementAxes?.trim() || '',
        // Status & timestamps
        status: targetStatus,
        validated: targetStatus === 'VALIDE',
        isLegacyType: false, // Updated to new standard
        updatedAt: new Date().toISOString()
      };

      const updatedFeedbacks = {
        ...(dossier.consultantFeedbacks || {}),
        [evalId]: feedbackToSave
      };

      // 1. Sauvegarde locale instantanée
      LocalDatabaseService.updateDossier(dossier.id, {
        consultantFeedbacks: updatedFeedbacks,
        updatedAt: new Date().toISOString()
      });

      setToastMessage(targetStatus === 'VALIDE' ? "Évaluation validée avec succès !" : "Brouillon enregistré.");
      setTimeout(() => setToastMessage(null), 4000);
    } catch (error: any) {
      console.error("Save evaluation error:", error);
      setToastMessage(`Erreur lors de l'enregistrement : ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-accent p-8 rounded-xl text-white shadow-2xl relative overflow-hidden group border border-accent/20 space-y-8">
      <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 rounded-full -mr-40 -mt-40 blur-3xl pointer-events-none" />

      {/* Barre supérieure : Titre et état de l'avis unique */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/10 relative">
        <div>
          <h3 className="text-white text-xl font-bold flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-primary" />
            Feedback
          </h3>
        </div>

        {activeFeedback && (
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs px-3 py-1.5 rounded-full font-black uppercase tracking-wider border",
              (activeFeedback.status === 'VALIDE' || activeFeedback.validated)
                ? "bg-green-500/20 text-green-300 border-green-500/30"
                : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
            )}>
              {(activeFeedback.status === 'VALIDE' || activeFeedback.validated) ? 'Avis Validé' : 'Brouillon'}
            </span>
          </div>
        )}
      </div>

      {/* Alerte si ancien type à rapprocher */}
      {formData.isLegacyType && (
        <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center gap-3 text-amber-200 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
          <div>
            <span className="font-bold">Ancien type détecté :</span> Cette évaluation utilise un type historique ({String(formData.type)}). Veuillez sélectionner l'un des 6 nouveaux types métier ci-dessous pour rapprocher la donnée lors de l'enregistrement.
          </div>
        </div>
      )}

      {/* Formulaire */}
      <div className="space-y-6">
        {/* 1. Type de relation (sélection multiple) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
              Type de Relation Métier * (choix multiple possible)
            </label>
            <span className="text-[10px] text-primary font-bold">
              {selectedRelationTypes.length} sélectionné(s)
            </span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {RELATION_TYPES.map(rel => {
              const isSelected = selectedRelationTypes.includes(rel);
              const disabled = isReadOnly;

              return (
                <button
                  key={rel}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleRelationType(rel)}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-2",
                    isSelected 
                      ? "bg-primary border-primary text-white shadow-lg ring-2 ring-primary/40" 
                      : "bg-white/5 border-white/10 hover:bg-white/10 text-white/70",
                    disabled && "opacity-30 cursor-not-allowed hover:bg-white/5"
                  )}
                >
                  <span className={cn(
                    "w-4 h-4 rounded-md flex items-center justify-center text-[10px] border transition-colors",
                    isSelected ? "bg-white text-primary border-white" : "border-white/20 bg-white/5"
                  )}>
                    {isSelected ? "✓" : ""}
                  </span>
                  <span>{rel.replace(/_/g, ' ')}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Client et Projet (Lecture seule / Grisés car pré-remplis automatiquement) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">
              Client concerné
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-white/30 absolute left-4 top-3.5" />
              <input
                type="text"
                disabled={true}
                readOnly={true}
                value={formData.client || ''}
                placeholder="Renseigné via Primes..."
                className="w-full pl-11 pr-4 py-3 bg-white/5 opacity-60 cursor-not-allowed border border-white/10 rounded-xl text-white/70 text-sm outline-none shadow-inner"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">
              Projet / Mission
            </label>
            <div className="relative">
              <Briefcase className="w-4 h-4 text-white/30 absolute left-4 top-3.5" />
              <input
                type="text"
                disabled={true}
                readOnly={true}
                value={formData.project || ''}
                placeholder="Renseigné via Primes..."
                className="w-full pl-11 pr-4 py-3 bg-white/5 opacity-60 cursor-not-allowed border border-white/10 rounded-xl text-white/70 text-sm outline-none shadow-inner"
              />
            </div>
          </div>
        </div>

        {/* 3. Recommandation TJ Cible, Pourcentages & Confiance */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">
              TJ Cible Min Préconisé (€)
            </label>
            <input
              type="number"
              min="0"
              disabled={isReadOnly}
              value={formData.targetTJMin || ''}
              onChange={(e) => setFormData({ ...formData, targetTJMin: Math.max(0, Number(e.target.value)) })}
              placeholder="Ex: 600"
              className="w-full p-3 bg-white/5 border border-white/15 rounded-xl text-white font-bold text-base outline-none focus:border-primary transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">
              TJ Cible Max Préconisé (€)
            </label>
            <input
              type="number"
              min="0"
              disabled={isReadOnly}
              value={formData.targetTJMax || ''}
              onChange={(e) => setFormData({ ...formData, targetTJMax: Math.max(0, Number(e.target.value)) })}
              placeholder="Ex: 680"
              className="w-full p-3 bg-white/5 border border-white/15 rounded-xl text-white font-bold text-base outline-none focus:border-primary transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
                Indice de Confiance
              </label>
              <span className="text-primary font-bold text-xs">{formData.confidenceIndex || 4} / 5</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="5" 
              step="1"
              value={formData.confidenceIndex || 4} 
              disabled={isReadOnly}
              onChange={e => setFormData({ ...formData, confidenceIndex: parseInt(e.target.value) })}
              className="w-full accent-primary h-2 bg-white/10 rounded-full appearance-none cursor-pointer disabled:opacity-50 mt-3" 
            />
            <div className="flex justify-between text-[9px] text-white/30 font-bold px-1 mt-1">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
            </div>
          </div>
        </div>

        {/* 4. Argumentaires */}
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">
              Justification TJ Cible *
            </label>
            <textarea
              disabled={isReadOnly}
              value={formData.justification || ''}
              onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
              className="w-full p-4 bg-white/5 border border-white/15 rounded-xl text-white text-sm font-light resize-none h-28 outline-none focus:border-primary transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">
              Axes pour augmenter le TJ
            </label>
            <textarea
              disabled={isReadOnly}
              value={formData.improvementAxes || ''}
              onChange={(e) => setFormData({ ...formData, improvementAxes: e.target.value })}
              className="w-full p-4 bg-white/5 border border-white/15 rounded-xl text-white text-sm font-light resize-none h-24 outline-none focus:border-primary transition-all disabled:opacity-50"
            />
          </div>
        </div>

        {/* Toast / Message d'information */}
        {toastMessage && (
          <div className="p-4 rounded-xl bg-white/10 border border-white/20 text-white text-sm flex items-center justify-between animate-fadeIn">
            <span>{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="text-white/50 hover:text-white text-xs font-bold">
              Fermer
            </button>
          </div>
        )}

        {/* 5. Actions : Enregistrer brouillon & Valider l'évaluation */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/10">
          <div className="text-xs text-white/40">
            Auteur authentifié : <span className="text-white font-bold">{consultant.displayName}</span> {consultant.idProfil ? `(Id_Profil: ${consultant.idProfil})` : ''}
          </div>

          {!isReadOnly ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSave('BROUILLON')}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/10 hover:bg-white/15 text-white transition-all border border-white/15 cursor-pointer flex items-center gap-2"
              >
                <FileEdit className="w-4 h-4" />
                Enregistrer Brouillon
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => handleSave('VALIDE')}
                className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-primary hover:bg-primary-hover text-white transition-all shadow-lg cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Valider l'Évaluation
              </button>
            </div>
          ) : (
            <span className="text-xs text-red-400 font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Campagne clôturée : les évaluations sont figées.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
