import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Gavel, Clock, CheckCircle2, MessageSquareHeart, Save, Loader2, Sparkles, RotateCcw, Eye, FileText, X } from 'lucide-react';
import { Dossier, JuryMemberReview, UserProfile } from '../../../types';
import { cn, formatCurrency } from '../../../lib/utils';
import { LocalDatabaseService } from '../../../services/localDatabaseService';
import { FormField, CandidateReadOnlyContext } from '../CandidateUI';

interface JuryFeedbacksTabProps {
  dossier?: Dossier;
  candidate?: UserProfile | null;
  onUpdateConsultantFeeling?: (feeling: string) => void;
  onReviewDossier?: () => void;
}

export function JuryFeedbacksTab({ dossier, candidate, onUpdateConsultantFeeling, onReviewDossier }: JuryFeedbacksTabProps) {
  const reviewsMap = dossier?.juryMemberReviews || {};
  const juryReviews: JuryMemberReview[] = Array.from(
    new Map(
      Object.values(reviewsMap).map(review => [
        review.juryUid || review.juryEmail || review.juryName,
        review
      ])
    ).values()
  );
  const isFinalDecision = dossier?.status === 'VALIDE';
  const juryDecision = dossier?.juryDecision;

  const [consultantFeeling, setConsultantFeeling] = useState<string>(
    juryDecision?.consultantFeeling || ''
  );
  const [isSavingFeeling, setIsSavingFeeling] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Second Tour state
  const isSecondTourAlreadyRequested = Boolean(
    dossier?.secondTourRequested || dossier?.juryDecision?.secondTourRequested
  );
  const [isSecondTourFormOpen, setIsSecondTourFormOpen] = useState(false);
  const [secondTourReason, setSecondTourReason] = useState(
    dossier?.secondTourReason || dossier?.juryDecision?.secondTourReason || ''
  );
  const [isSubmittingSecondTour, setIsSubmittingSecondTour] = useState(false);

  useEffect(() => {
    if (juryDecision?.consultantFeeling !== undefined) {
      setConsultantFeeling(juryDecision.consultantFeeling || '');
    }
  }, [juryDecision?.consultantFeeling]);

  useEffect(() => {
    if (dossier?.secondTourReason) {
      setSecondTourReason(dossier.secondTourReason);
    }
  }, [dossier?.secondTourReason]);

  const handleSaveFeeling = async () => {
    if (!dossier?.id) return;
    setIsSavingFeeling(true);
    try {
      const updatedDecision = {
        ...(dossier.juryDecision || {}),
        consultantFeeling: consultantFeeling.trim(),
      };
      LocalDatabaseService.updateDossier(dossier.id, {
        juryDecision: updatedDecision as any,
        updatedAt: new Date().toISOString()
      });
      if (onUpdateConsultantFeeling) {
        onUpdateConsultantFeeling(consultantFeeling.trim());
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving consultant feeling:', err);
    } finally {
      setIsSavingFeeling(false);
    }
  };

  const handleRequestSecondTour = async () => {
    if (!dossier?.id || !secondTourReason.trim()) return;
    setIsSubmittingSecondTour(true);
    try {
      const now = new Date().toISOString();
      const updatedDecision = {
        ...(dossier.juryDecision || {}),
        secondTourRequested: true,
        secondTourRequestedAt: now,
        secondTourReason: secondTourReason.trim(),
        secondTourStatus: 'DEMANDE' as const
      };
      LocalDatabaseService.updateDossier(dossier.id, {
        secondTourRequested: true,
        secondTourRequestedAt: now,
        secondTourReason: secondTourReason.trim(),
        secondTourStatus: 'DEMANDE',
        juryDecision: updatedDecision as any,
        updatedAt: now
      });
      setIsSecondTourFormOpen(false);
    } catch (err) {
      console.error('Error requesting second tour:', err);
    } finally {
      setIsSubmittingSecondTour(false);
    }
  };

  return (
    <motion.div 
      key="jury_feedbacks" 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -10 }} 
      className="space-y-6"
    >
      {/* 1. Carte de décision finale si dossier validé ou montant délibéré */}
      {(isFinalDecision || (juryDecision?.amount && juryDecision.amount > 0)) && (
        <div className="bg-white rounded-2xl border border-green-200 shadow-md p-8 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-green-500 via-primary to-green-600" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-accent/10">
            <div className="bg-accent/[0.03] px-6 py-3.5 rounded-2xl border border-accent/10">
              <div className="text-[10px] font-black uppercase text-accent/40 tracking-widest mb-1">
                Salaire Proposé
              </div>
              <div className="text-3xl sm:text-4xl font-black text-primary tracking-tight tabular-nums">
                {formatCurrency(juryDecision?.amount || 0)}
              </div>
              {juryDecision?.percentage ? (
                <div className="text-[11px] font-bold text-accent/50 mt-0.5">
                  Évolution : +{juryDecision.percentage}%
                </div>
              ) : null}
            </div>

            {/* Bouton pour revoir son dossier complet */}
            {onReviewDossier && (
              <button
                type="button"
                onClick={onReviewDossier}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent/5 hover:bg-accent/10 border border-accent/15 text-accent font-bold text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer group active:scale-[0.98]"
                title="Consulter l'ensemble de vos rubriques et documents"
              >
                <Eye className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                <span>Revoir mon dossier</span>
              </button>
            )}
          </div>

          {/* Espace Ressenti Consultant (déverrouillé explicitement) */}
          <div className="mt-6 pt-2 space-y-3">
            <CandidateReadOnlyContext.Provider value={false}>
              <FormField
                label={
                  <span className="flex items-center gap-2">
                    <MessageSquareHeart className="w-4 h-4 text-primary" />
                    <span>Votre Ressenti Consultant</span>
                  </span>
                }
                value={consultantFeeling}
                onChange={val => setConsultantFeeling(val)}
                placeholder="Partagez vos impressions sur les retours du jury, vos questions ou clarifications..."
              />
            </CandidateReadOnlyContext.Provider>

            <div className="flex items-center justify-between pt-1">
              <div className="text-xs">
                {saveSuccess && (
                  <span className="inline-flex items-center gap-1.5 text-green-600 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Ressenti enregistré avec succès !
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleSaveFeeling}
                disabled={isSavingFeeling}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary hover:bg-secondary/90 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-secondary/20 cursor-pointer disabled:opacity-50"
              >
                {isSavingFeeling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Enregistrer mon ressenti
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Section Second Tour (Deuxième Avis) */}
      {(isFinalDecision || (juryDecision?.amount && juryDecision.amount > 0)) && (
        <div className="bg-white rounded-2xl border border-purple-200/80 shadow-sm p-8 sm:p-10 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-accent/10 pb-6 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-700 flex items-center justify-center font-bold shrink-0">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-accent">Demande de Second Tour (Deuxième avis)</h3>
                <p className="text-xs text-accent/60 mt-0.5">
                  Sollicitez un réexamen de votre dossier par la commission si vous souhaitez apporter des arguments complémentaires.
                </p>
              </div>
            </div>

            {isSecondTourAlreadyRequested ? (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
                {dossier?.secondTourStatus === 'TRAITE' ? 'Second Tour Traité' : 'Second Tour Demandé'}
              </span>
            ) : (
              !isSecondTourFormOpen && (
                <button
                  type="button"
                  onClick={() => setIsSecondTourFormOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Demander un 2nd Tour</span>
                </button>
              )
            )}
          </div>

          {isSecondTourAlreadyRequested ? (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-purple-50/50 border border-purple-200/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-purple-800">
                    Vos arguments pour le second tour
                  </span>
                  {dossier?.secondTourRequestedAt && (
                    <span className="text-[11px] text-purple-600/80 italic">
                      Demandé le {new Date(dossier.secondTourRequestedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-purple-950 font-normal leading-relaxed whitespace-pre-wrap">
                  {dossier?.secondTourReason || dossier?.juryDecision?.secondTourReason || 'Aucun détail fourni.'}
                </p>
              </div>

              {/* Retour du Jury pour le Second Tour si disponible */}
              {(dossier?.secondTourFeedback || dossier?.juryDecision?.secondTourFeedback) ? (
                <div className="p-6 rounded-xl bg-green-50 border border-green-200 space-y-2">
                  <div className="text-xs font-black uppercase tracking-widest text-green-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>Arbitrage du Jury (Second Tour)</span>
                  </div>
                  <p className="text-sm text-green-950 font-normal leading-relaxed whitespace-pre-wrap">
                    {dossier?.secondTourFeedback || dossier?.juryDecision?.secondTourFeedback}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-accent/[0.02] border border-dashed border-accent/15 text-xs text-accent/60">
                  <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Votre demande de second tour a bien été transmise à la commission. Elle sera examinée lors des prochaines délibérations.</span>
                </div>
              )}
            </div>
          ) : isSecondTourFormOpen ? (
            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-200/60 text-xs text-purple-900 leading-relaxed">
                <strong>Information :</strong> La demande d'un second tour permet à la commission du jury de réexaminer votre dossier avec d'éventuels retours d'évaluateurs complémentaires ou de nouvelles justifications. Veuillez préciser ci-dessous les arguments justifiant votre demande.
              </div>

              <CandidateReadOnlyContext.Provider value={false}>
                <FormField
                  label="Motifs et justifications de votre demande de 2nd tour *"
                  value={secondTourReason}
                  onChange={val => setSecondTourReason(val)}
                  placeholder="Exposez vos arguments : missions récentes, responsabilités accrues, clarifications sur le TJ cible ou le grade, suggestions de pairs complémentaires..."
                  required
                />
              </CandidateReadOnlyContext.Provider>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSecondTourFormOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-accent/20 text-accent/70 hover:bg-accent/5 text-xs font-bold transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleRequestSecondTour}
                  disabled={isSubmittingSecondTour || !secondTourReason.trim()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingSecondTour ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Envoi en cours...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Confirmer la demande de Second Tour</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* 3. Cartes des avis individuels du jury */}
      <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-sm font-sans">
        <div className="flex items-center justify-between gap-4 mb-8 border-b border-accent/10 pb-6">
          <h2 className="text-secondary flex items-center gap-3">
            <Gavel className="w-6 h-6 text-primary" />
            Délibération et Avis du Jury
          </h2>
          <span className={cn(
            "text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full border flex items-center gap-1.5",
            isFinalDecision 
              ? "bg-green-50 text-green-700 border-green-200" 
              : "bg-amber-50 text-amber-700 border-amber-200"
          )}>
            {isFinalDecision ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Décision Clôturée
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5" />
                Délibération en cours
              </>
            )}
          </span>
        </div>

        {/* Liste des avis individuels des membres du jury */}
        {juryReviews.length === 0 ? (
          <div className="p-16 border border-dashed border-accent/20 rounded-2xl text-center space-y-3 bg-accent/[0.01]">
            <div className="w-12 h-12 rounded-full bg-accent/5 flex items-center justify-center mx-auto text-accent/30">
              <Clock className="w-6 h-6" />
            </div>
            <p className="text-accent/40 font-light italic text-base">
              Les membres du jury n'ont pas encore consigné d'avis préliminaire sur ce dossier.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              {juryReviews.map((review, idx) => (
                <div 
                  key={review.juryUid || idx}
                  className="bg-white rounded-2xl border border-accent/15 p-6 shadow-sm hover:shadow-md transition-all space-y-4 relative overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary" />

                  <div className="flex items-center justify-between border-b border-accent/10 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary font-bold border border-secondary/20">
                        {review.juryName ? review.juryName.charAt(0).toUpperCase() : 'J'}
                      </div>
                      <div>
                        <div className="font-bold text-accent text-sm">
                          {review.juryName || 'Membre du Jury'}
                        </div>
                      </div>
                    </div>
                    {review.updatedAt && (
                      <div className="text-[10px] text-accent/40 italic">
                        Noté le {new Date(review.updatedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                    <div className="p-5 rounded-xl bg-accent/[0.02] border border-accent/10 space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-primary">
                        Justification TJ Cible
                      </div>
                      <div className="text-xs text-accent/80 font-light leading-relaxed whitespace-pre-wrap">
                        {review.whyThisSalary || (
                          <span className="italic text-accent/30">Non renseigné</span>
                        )}
                      </div>
                    </div>

                    <div className="p-5 rounded-xl bg-accent/[0.02] border border-accent/10 space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-secondary">
                        Axes pour augmenter le TJ
                      </div>
                      <div className="text-xs text-accent/80 font-light leading-relaxed whitespace-pre-wrap">
                        {review.whatToDoMore || (
                          <span className="italic text-accent/30">Non renseigné</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
