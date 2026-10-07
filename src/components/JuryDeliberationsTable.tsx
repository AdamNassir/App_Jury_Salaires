import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dossier, UserProfile, ConsultantFeedback, JuryDecision, JuryMemberReview } from '../types';
import { LocalDatabaseService } from '../services/localDatabaseService';
import { cn } from '../lib/utils';
import { 
  ChevronRight, 
  ChevronDown, 
  Search, 
  User, 
  Users, 
  Edit3, 
  Save, 
  X,
  CheckCircle2, 
  AlertCircle,
  MessageSquare,
  Sparkles,
  Target,
  Info,
  Lock,
  CheckSquare,
  Square
} from 'lucide-react';

interface JuryDeliberationsTableProps {
  dossiers: Dossier[];
  candidates: Record<string, UserProfile>;
  profile: UserProfile;
}

export function JuryDeliberationsTable({ dossiers, candidates, profile }: JuryDeliberationsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyAssigned, setOnlyAssigned] = useState(true);
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});
  const [editingDossierId, setEditingDossierId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ whyThisSalary: string; whatToDoMore: string }>({
    whyThisSalary: '',
    whatToDoMore: ''
  });
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});

  const isAdmin = profile.roles?.includes('ADMIN') || 
    profile.email?.toLowerCase() === 'adam.nassir@logiclever.com' ||
    profile.email?.toLowerCase() === 'guillaume.best@logiclever.com' ||
    profile.email?.toLowerCase() === 'muriel.guiochet@logiclever.com' ||
    profile.email?.toLowerCase() === 'julien.bourlon@logiclever.com';

  // Identifier si un dossier est véritablement assigné au jury courant
  const isAssignedToCurrentUser = (dossier: Dossier): boolean => {
    // 1. Assigné explicitement dans assignedCandidateIds du profil
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

  const assignedCount = useMemo(() => {
    return dossiers.filter(d => isAssignedToCurrentUser(d)).length;
  }, [dossiers, profile]);

  // Filtrer les dossiers selon l'option onlyAssigned
  const visibleDossiers = useMemo(() => {
    if (onlyAssigned) {
      return dossiers.filter(d => isAssignedToCurrentUser(d));
    }
    return dossiers;
  }, [dossiers, onlyAssigned, profile]);

  // Filtrer par recherche
  const filteredData = useMemo(() => {
    return visibleDossiers.map(dossier => {
      const candidate = candidates[dossier.candidateId] ||
        (dossier.idProfil && candidates[dossier.idProfil]) || {
          id: dossier.candidateId,
          idProfil: dossier.idProfil,
          displayName: dossier.candidateName || 'Collaborateur',
          email: dossier.candidateEmail || '',
          matricule: candidateMatricule(dossier),
          roles: ['CANDIDATE']
        } as UserProfile;

      // 1. Ma propre délibération (enregistrée sous mon UID ou email ou idProfil)
      const myReviewKey = profile.id || profile.idProfil || profile.email || 'me';
      const myReview = dossier.juryMemberReviews?.[myReviewKey] ||
        (profile.email && dossier.juryMemberReviews?.[profile.email]) ||
        (profile.idProfil && dossier.juryMemberReviews?.[profile.idProfil]) ||
        (dossier.juryDecision?.referentJury?.toLowerCase().includes((profile.displayName || '').toLowerCase()) ? {
          juryUid: profile.id,
          juryName: profile.displayName,
          juryEmail: profile.email,
          whyThisSalary: dossier.juryDecision?.whyThisSalary || '',
          whatToDoMore: dossier.juryDecision?.whatToDoMore || '',
          updatedAt: ''
        } : null);

      // 2. Délibérations des AUTRES membres du jury
      const otherJuryReviews: JuryMemberReview[] = Object.entries(dossier.juryMemberReviews || {})
        .filter(([k, r]: [string, JuryMemberReview]) => {
          const isMe = k === profile.id || 
            k === profile.idProfil || 
            k === profile.email || 
            (profile.email && r.juryEmail?.toLowerCase() === profile.email.toLowerCase()) ||
            (profile.id && r.juryUid === profile.id);
          return !isMe;
        })
        .map(([_, r]) => r as JuryMemberReview);

      // Si dossier.juryDecision a du contenu et n'est pas ma propre revue ni dans otherJuryReviews, l'ajouter comme délibération de jury existante
      if (dossier.juryDecision?.whyThisSalary || dossier.juryDecision?.whatToDoMore) {
        const refName = dossier.juryDecision?.referentJury || 'Jury Délibération Principale';
        const alreadyInOthers = otherJuryReviews.some(r => r.juryName?.toLowerCase() === refName.toLowerCase() || (r.whyThisSalary === dossier.juryDecision?.whyThisSalary && r.whatToDoMore === dossier.juryDecision?.whatToDoMore));
        const isMine = myReview && (myReview.whyThisSalary === dossier.juryDecision?.whyThisSalary && myReview.whatToDoMore === dossier.juryDecision?.whatToDoMore);
        if (!alreadyInOthers && !isMine) {
          otherJuryReviews.unshift({
            juryUid: 'legacy_decision',
            juryName: refName,
            juryEmail: '',
            whyThisSalary: dossier.juryDecision?.whyThisSalary || '',
            whatToDoMore: dossier.juryDecision?.whatToDoMore || '',
            updatedAt: dossier.juryDecision?.date || ''
          });
        }
      }

      // 3. Retours des évaluateurs pairs
      const evaluatorFeedbacks = Object.values(dossier.consultantFeedbacks || {});

      const isAssigned = isAssignedToCurrentUser(dossier);

      return {
        dossier,
        candidate,
        myReview,
        otherJuryReviews,
        evaluatorFeedbacks,
        totalSublines: otherJuryReviews.length + evaluatorFeedbacks.length,
        isAssigned
      };
    }).filter(item => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const nameMatch = item.candidate.displayName?.toLowerCase().includes(term);
      const matriculeMatch = item.candidate.matricule?.toLowerCase().includes(term);
      const myWhyMatch = item.myReview?.whyThisSalary?.toLowerCase().includes(term);
      const myAxesMatch = item.myReview?.whatToDoMore?.toLowerCase().includes(term);
      const decWhyMatch = item.dossier.juryDecision?.whyThisSalary?.toLowerCase().includes(term);
      const decAxesMatch = item.dossier.juryDecision?.whatToDoMore?.toLowerCase().includes(term);
      return nameMatch || matriculeMatch || myWhyMatch || myAxesMatch || decWhyMatch || decAxesMatch;
    });
  }, [visibleDossiers, candidates, searchTerm, profile]);

  function candidateMatricule(dossier: Dossier): string {
    const c = candidates[dossier.candidateId] || (dossier.idProfil ? candidates[dossier.idProfil] : null);
    return c?.matricule || dossier.candidateId.substring(0, 8);
  }

  const toggleRow = (dossierId: string) => {
    setExpandedRowIds(prev => ({
      ...prev,
      [dossierId]: !prev[dossierId]
    }));
  };

  const startEditing = (dossier: Dossier) => {
    if (!isAssignedToCurrentUser(dossier) && !isAdmin) {
      return;
    }
    setEditingDossierId(dossier.id);
    const myReviewKey = profile.id || profile.idProfil || profile.email || 'me';
    const existingMyReview = dossier.juryMemberReviews?.[myReviewKey] ||
      (profile.email ? dossier.juryMemberReviews?.[profile.email] : null) ||
      (profile.idProfil ? dossier.juryMemberReviews?.[profile.idProfil] : null);

    setEditValues({
      whyThisSalary: existingMyReview?.whyThisSalary || dossier.juryDecision?.whyThisSalary || '',
      whatToDoMore: existingMyReview?.whatToDoMore || dossier.juryDecision?.whatToDoMore || ''
    });
  };

  const cancelEditing = () => {
    setEditingDossierId(null);
  };

  const saveEditing = async (dossier: Dossier) => {
    if (!isAssignedToCurrentUser(dossier) && !isAdmin) {
      setEditingDossierId(null);
      return;
    }
    setSaveStatus(prev => ({ ...prev, [dossier.id]: 'saving' }));
    try {
      const myReviewKey = profile.id || profile.idProfil || profile.email || 'me';
      const now = new Date().toISOString();

      const newReview: JuryMemberReview = {
        juryUid: profile.id,
        juryName: profile.displayName || profile.email || 'Membre Jury',
        juryEmail: profile.email || '',
        whyThisSalary: editValues.whyThisSalary,
        whatToDoMore: editValues.whatToDoMore,
        updatedAt: now
      };

      const updatedJuryReviews = {
        ...(dossier.juryMemberReviews || {}),
        [myReviewKey]: newReview
      };

      // Si l'utilisateur est admin ou rapporteur, on met aussi à jour juryDecision
      const existingDecision = dossier.juryDecision || {} as Partial<JuryDecision>;
      const updatedDecision: JuryDecision = {
        ...existingDecision,
        verdict: existingDecision.verdict || 'FAVORABLE',
        amount: existingDecision.amount || 0,
        percentage: existingDecision.percentage || 0,
        advice: existingDecision.advice || '',
        conclusion: existingDecision.conclusion || '',
        whyThisSalary: editValues.whyThisSalary,
        whatToDoMore: editValues.whatToDoMore,
        referentJury: existingDecision.referentJury || profile.displayName || '',
        date: now
      };

      await LocalDatabaseService.updateDossier(dossier.id, {
        juryMemberReviews: updatedJuryReviews,
        juryDecision: updatedDecision,
        updatedAt: now
      });

      setSaveStatus(prev => ({ ...prev, [dossier.id]: 'saved' }));
      setEditingDossierId(null);
      setTimeout(() => {
        setSaveStatus(prev => {
          const next = { ...prev };
          delete next[dossier.id];
          return next;
        });
      }, 2500);
    } catch (err) {
      console.error("Erreur d'enregistrement de la délibération:", err);
      setSaveStatus(prev => ({ ...prev, [dossier.id]: 'error' }));
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-accent/10 shadow-xl overflow-hidden flex flex-col">
      {/* En-tête avec contrôles */}
      <div className="p-6 border-b border-accent/10 flex flex-wrap items-center justify-between gap-4 bg-accent/[0.02]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-secondary tracking-tight">
              Tableau des Délibérations & Retours Évaluateurs
            </h3>
            <p className="text-xs text-accent/60 font-light mt-0.5">
              Dossiers qui vous sont assignés • Dépliez chaque ligne pour consulter les avis des pairs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOnlyAssigned(prev => !prev)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer select-none",
              onlyAssigned
                ? "bg-secondary/10 border-secondary/30 text-secondary hover:bg-secondary/15"
                : "bg-white border-accent/15 text-accent/60 hover:text-accent hover:border-accent/30"
            )}
          >
            {onlyAssigned ? (
              <CheckSquare className="w-4 h-4 text-secondary shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-accent/30 shrink-0" />
            )}
            <span>Mes dossiers assignés</span>
            <span className={cn(
              "ml-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold",
              onlyAssigned ? "bg-secondary text-white" : "bg-accent/10 text-accent/60"
            )}>
              {assignedCount}
            </span>
          </button>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-accent/40" />
            <input
              type="text"
              placeholder="Rechercher collaborateur, matricule..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-accent/10 rounded-xl text-xs focus:ring-2 focus:ring-secondary/20 outline-none w-60 text-accent placeholder:text-accent/30 shadow-inner"
            />
          </div>
          <div className="px-3 py-2 bg-accent/5 rounded-xl border border-accent/10 text-xs font-bold text-accent/60 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span>{filteredData.length} {filteredData.length > 1 ? 'dossiers' : 'dossier'}</span>
          </div>
        </div>
      </div>

      {/* Note d'information de délibération préparatoire */}
      <div className="px-6 py-3 bg-secondary/[0.03] border-b border-accent/10 flex items-center gap-3 text-xs text-accent/70">
        <Info className="w-4 h-4 text-secondary shrink-0" />
        <p className="font-light">
          <strong className="font-semibold text-secondary">Phase Délibérations : </strong>
          Les données et justifications saisies sur les dossiers complets constituent des appréciations préparatoires pour la commission. Elles ne sont pas figées et enrichissent l'analyse jusqu'à la validation définitive (« Dossier Validé »).
        </p>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-accent/10 bg-accent/5 text-[10px] font-black uppercase tracking-wider text-accent/60">
              <th className="p-4 w-12 text-center">#</th>
              <th className="p-4 w-32">Matricule</th>
              <th className="p-4 w-56">Collaborateur</th>
              <th className="p-4 min-w-[280px]">Justification TJ Cible</th>
              <th className="p-4 min-w-[280px]">Axes pour augmenter le TJ</th>
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-accent/5">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-accent/40 italic">
                  Aucun dossier trouvé pour ces critères de recherche.
                </td>
              </tr>
            ) : (
              filteredData.map(({ dossier, candidate, myReview, otherJuryReviews, evaluatorFeedbacks, totalSublines, isAssigned }) => {
                const canEdit = isAssigned || isAdmin;
                const isExpanded = !!expandedRowIds[dossier.id];
                const isEditing = editingDossierId === dossier.id;
                const status = saveStatus[dossier.id];

                return (
                  <React.Fragment key={dossier.id}>
                    {/* Ligne principale (Mon avis / ma délibération sur le candidat) */}
                    <tr 
                      className={cn(
                        "transition-colors group",
                        isExpanded ? "bg-accent/[0.03]" : "hover:bg-accent/[0.02]",
                        isEditing && "bg-secondary/[0.04]",
                        !canEdit && "bg-black/[0.01]"
                      )}
                    >
                      {/* Bouton pour déplier */}
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => toggleRow(dossier.id)}
                          className="p-1.5 rounded-lg hover:bg-accent/10 text-accent/50 hover:text-secondary transition-all cursor-pointer inline-flex items-center justify-center"
                          title={isExpanded ? "Replier les avis" : "Déplier les avis des autres membres du jury et évaluateurs"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-secondary font-bold" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Matricule */}
                      <td className="p-4 font-mono font-bold text-accent/50">
                        {candidate.matricule || candidateMatricule(dossier)}
                      </td>

                      {/* Collaborateur */}
                      <td className="p-4">
                        <div 
                          className="font-bold text-accent hover:text-secondary cursor-pointer flex items-center gap-2 flex-wrap"
                          onClick={() => toggleRow(dossier.id)}
                        >
                          <span>{candidate.displayName}</span>
                          {(dossier.secondTourRequested || dossier.juryDecision?.secondTourRequested) && (
                            <span 
                              className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200"
                              title={dossier.secondTourReason ? `Motif : ${dossier.secondTourReason}` : "Second tour demandé"}
                            >
                              2nd Tour
                            </span>
                          )}
                          {!canEdit && (
                            <span 
                              className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                              title="Dossier non assigné - Lecture seule"
                            >
                              <Lock className="w-2.5 h-2.5" /> Non assigné
                            </span>
                          )}
                          {totalSublines > 0 && (
                            <span 
                              className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/10 text-secondary font-bold" 
                              title={`${totalSublines} avis disponible(s) (autres jurys et évaluateurs)`}
                            >
                              {totalSublines}
                            </span>
                          )}
                        </div>
                        {candidate.currentGrade && (
                          <div className="text-[10px] text-accent/40 uppercase tracking-wider font-semibold mt-0.5">
                            Grade actuel : {candidate.currentGrade}
                          </div>
                        )}
                      </td>

                      {/* Justification TJ Cible (Cliquer directement sur la cellule pour modifier si assigné) */}
                      <td 
                        className={cn(
                          "p-4 transition-all align-top relative group/justif",
                          canEdit && !isEditing && "hover:bg-secondary/[0.04] cursor-pointer",
                          !canEdit && "cursor-default text-accent/60"
                        )}
                        onClick={() => {
                          if (canEdit && !isEditing) startEditing(dossier);
                        }}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editValues.whyThisSalary}
                              onChange={e => setEditValues({ ...editValues, whyThisSalary: e.target.value })}
                              rows={3}
                              autoFocus
                              className="w-full p-2.5 bg-white border border-secondary/40 rounded-xl text-xs focus:ring-2 focus:ring-secondary/20 outline-none resize-y text-accent shadow-inner"
                            />
                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveEditing(dossier);
                                  }}
                                  disabled={status === 'saving'}
                                  className="px-2.5 py-1 rounded-lg bg-secondary text-white text-[10px] font-bold hover:bg-secondary-dark flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                                >
                                  <Save className="w-3 h-3" />
                                  Sauvegarder
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEditing();
                                  }}
                                  className="p-1 rounded-lg border border-accent/20 text-accent/60 text-[10px] hover:bg-accent/5 transition-all cursor-pointer"
                                  title="Annuler"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              {status === 'saving' && (
                                <span className="text-[10px] text-accent/40 italic">Enregistrement...</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="relative pr-6">
                            <div className="text-accent/80 text-xs whitespace-pre-wrap leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">
                              {myReview?.whyThisSalary ? (
                                <span>{myReview.whyThisSalary}</span>
                              ) : dossier.juryDecision?.whyThisSalary && !otherJuryReviews.some(r => r.whyThisSalary === dossier.juryDecision?.whyThisSalary) ? (
                                <span>{dossier.juryDecision.whyThisSalary}</span>
                              ) : canEdit ? (
                                <span className="italic text-accent/30 font-light">Cliquer pour saisir votre justification...</span>
                              ) : (
                                <span className="italic text-accent/30 font-light">—</span>
                              )}
                            </div>
                            {canEdit && (
                              <div className="absolute right-0 top-0 opacity-0 group-hover/justif:opacity-100 transition-opacity text-secondary p-1">
                                <Edit3 className="w-3.5 h-3.5" />
                              </div>
                            )}
                            {status === 'saved' && (
                              <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 mt-1">
                                <CheckCircle2 className="w-3 h-3" /> Enregistré
                              </span>
                            )}
                            {status === 'error' && (
                              <span className="text-[10px] text-red-600 font-bold flex items-center gap-1 mt-1">
                                <AlertCircle className="w-3 h-3" /> Erreur
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Axes pour augmenter le TJ (Cliquer directement sur la cellule pour modifier si assigné) */}
                      <td 
                        className={cn(
                          "p-4 transition-all align-top relative group/axes",
                          canEdit && !isEditing && "hover:bg-secondary/[0.04] cursor-pointer",
                          !canEdit && "cursor-default text-accent/60"
                        )}
                        onClick={() => {
                          if (canEdit && !isEditing) startEditing(dossier);
                        }}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editValues.whatToDoMore}
                              onChange={e => setEditValues({ ...editValues, whatToDoMore: e.target.value })}
                              rows={3}
                              className="w-full p-2.5 bg-white border border-secondary/40 rounded-xl text-xs focus:ring-2 focus:ring-secondary/20 outline-none resize-y text-accent shadow-inner"
                            />
                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveEditing(dossier);
                                  }}
                                  disabled={status === 'saving'}
                                  className="px-2.5 py-1 rounded-lg bg-secondary text-white text-[10px] font-bold hover:bg-secondary-dark flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                                >
                                  <Save className="w-3 h-3" />
                                  Sauvegarder
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEditing();
                                  }}
                                  className="p-1 rounded-lg border border-accent/20 text-accent/60 text-[10px] hover:bg-accent/5 transition-all cursor-pointer"
                                  title="Annuler"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              {status === 'saving' && (
                                <span className="text-[10px] text-accent/40 italic">Enregistrement...</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="relative pr-6">
                            <div className="text-accent/80 text-xs whitespace-pre-wrap leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">
                              {myReview?.whatToDoMore ? (
                                <span>{myReview.whatToDoMore}</span>
                              ) : dossier.juryDecision?.whatToDoMore && !otherJuryReviews.some(r => r.whatToDoMore === dossier.juryDecision?.whatToDoMore) ? (
                                <span>{dossier.juryDecision.whatToDoMore}</span>
                              ) : canEdit ? (
                                <span className="italic text-accent/30 font-light">Cliquer pour saisir vos axes de progrès...</span>
                              ) : (
                                <span className="italic text-accent/30 font-light">—</span>
                              )}
                            </div>
                            {canEdit && (
                              <div className="absolute right-0 top-0 opacity-0 group-hover/axes:opacity-100 transition-opacity text-secondary p-1">
                                <Edit3 className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Sous-lignes étendues pour les autres membres du jury et les évaluateurs (Option A: vraie indentation physique) */}
                    <AnimatePresence>
                      {isExpanded && (
                        <tr className="bg-accent/[0.02] border-b border-accent/10">
                          <td colSpan={5} className="py-3 pr-6 pl-4 md:pl-10">
                            {totalSublines === 0 ? (
                              <div className="ml-8 my-2 py-4 px-6 rounded-xl bg-white/60 border border-dashed border-accent/20 text-xs italic text-accent/40">
                                Aucun autre avis de membre du jury ou d'évaluateur n'est disponible pour ce candidat pour le moment.
                              </div>
                            ) : (
                              <div className="ml-6 md:ml-10 pl-4 border-l-2 border-dashed border-accent/25 space-y-2.5 my-1.5">
                                <div className="text-[10px] font-black uppercase tracking-wider text-accent/40 pl-1 mb-1">
                                  Avis et évaluations complémentaires ({totalSublines})
                                </div>

                                {/* 1. Cartes pour les AUTRES membres du jury */}
                                {otherJuryReviews.map((juryRev, idx) => (
                                  <div 
                                    key={`jury-rev-${idx}-${juryRev.juryUid || juryRev.juryName}`}
                                    className="p-3.5 rounded-xl bg-primary/[0.04] border border-primary/20 text-accent/80 hover:bg-primary/[0.07] transition-colors border-l-4 border-l-primary shadow-xs"
                                  >
                                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                                      {/* Profil Jury */}
                                      <div className="flex items-center gap-2.5 min-w-[200px] lg:w-48 shrink-0">
                                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-xs ring-2 ring-primary/20">
                                          {juryRev.juryName ? juryRev.juryName.charAt(0) : 'J'}
                                        </div>
                                        <div>
                                          <div className="font-bold text-accent text-xs">
                                            {juryRev.juryName || 'Membre Jury'}
                                          </div>
                                          <div className="text-[9px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-black uppercase tracking-wider inline-block mt-0.5">
                                            Membre du Jury
                                          </div>
                                        </div>
                                      </div>

                                      {/* Justification TJ */}
                                      <div className="flex-1 min-w-[220px]">
                                        <div className="text-[10px] font-bold text-primary/70 uppercase tracking-wider mb-1">
                                          Justification TJ Cible
                                        </div>
                                        <div className="bg-white/90 p-2.5 rounded-lg border border-primary/15 text-xs leading-relaxed text-accent/90 whitespace-pre-wrap">
                                          {juryRev.whyThisSalary ? (
                                            <span>{juryRev.whyThisSalary}</span>
                                          ) : (
                                            <span className="italic text-accent/30 font-light">Aucune justification renseignée</span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Axes de progrès */}
                                      <div className="flex-1 min-w-[220px]">
                                        <div className="text-[10px] font-bold text-primary/70 uppercase tracking-wider mb-1">
                                          Axes pour augmenter le TJ
                                        </div>
                                        <div className="bg-white/90 p-2.5 rounded-lg border border-primary/15 text-xs leading-relaxed text-accent/90 whitespace-pre-wrap">
                                          {juryRev.whatToDoMore ? (
                                            <span>{juryRev.whatToDoMore}</span>
                                          ) : (
                                            <span className="italic text-accent/30 font-light">Aucun axe renseigné</span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Tag statut */}
                                      <div className="shrink-0 self-start lg:self-center text-right">
                                        <span className="text-[9px] font-black text-primary bg-primary/10 px-2 py-1 rounded-full uppercase tracking-wider border border-primary/20">
                                          Avis Jury
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                {/* 2. Cartes pour les ÉVALUATEURS pairs */}
                                {evaluatorFeedbacks.map((fb, idx) => {
                                  const relationLabel = fb.relationType || fb.type || 'Évaluateur';
                                  return (
                                    <div 
                                      key={fb.id || `${dossier.id}-fb-${idx}`}
                                      className="p-3.5 rounded-xl bg-white border border-accent/15 text-accent/75 hover:border-secondary/30 transition-colors border-l-4 border-l-secondary/60 shadow-xs"
                                    >
                                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                                        {/* Profil Évaluateur */}
                                        <div className="flex items-center gap-2.5 min-w-[200px] lg:w-48 shrink-0">
                                          <div className="w-8 h-8 rounded-full bg-secondary/15 flex items-center justify-center text-secondary font-bold text-xs ring-2 ring-secondary/20">
                                            {fb.consultantName ? fb.consultantName.charAt(0) : 'E'}
                                          </div>
                                          <div>
                                            <div className="font-bold text-accent text-xs">
                                              {fb.consultantName || 'Évaluateur'}
                                            </div>
                                            <div className="text-[10px] text-accent/60 uppercase tracking-widest font-semibold">
                                              {String(relationLabel).replace('_', ' ')}
                                            </div>
                                            {(fb.client || fb.project) && (
                                              <div className="text-[10px] text-accent/50 font-medium mt-0.5 flex flex-wrap gap-x-1.5 items-center">
                                                {fb.client && <span className="font-bold text-accent/70">{fb.client}</span>}
                                                {fb.client && fb.project && <span>•</span>}
                                                {fb.project && <span className="italic">{fb.project}</span>}
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* Justification */}
                                        <div className="flex-1 min-w-[220px]">
                                          <div className="text-[10px] font-bold text-secondary/80 uppercase tracking-wider mb-1">
                                            Justification TJ Cible
                                          </div>
                                          <div className="bg-accent/[0.02] p-2.5 rounded-lg border border-accent/10 text-xs leading-relaxed text-accent/80 whitespace-pre-wrap">
                                            {fb.justification ? (
                                              <span>{fb.justification}</span>
                                            ) : (
                                              <span className="italic text-accent/30 font-light">Aucune justification formulée</span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Axes */}
                                        <div className="flex-1 min-w-[220px]">
                                          <div className="text-[10px] font-bold text-secondary/80 uppercase tracking-wider mb-1">
                                            Axes pour augmenter le TJ
                                          </div>
                                          <div className="bg-accent/[0.02] p-2.5 rounded-lg border border-accent/10 text-xs leading-relaxed text-accent/80 whitespace-pre-wrap">
                                            {fb.improvementAxes ? (
                                              <span>{fb.improvementAxes}</span>
                                            ) : (
                                              <span className="italic text-accent/30 font-light">Aucun axe formulé</span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Tag statut */}
                                        <div className="shrink-0 self-start lg:self-center text-right">
                                          <span className="text-[10px] font-bold text-accent/40 bg-accent/5 px-2 py-1 rounded-full uppercase tracking-wider border border-accent/10">
                                            Évaluateur
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
