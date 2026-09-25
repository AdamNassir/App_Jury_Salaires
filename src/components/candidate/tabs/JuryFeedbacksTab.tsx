import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Gavel, Clock, CheckCircle2, MessageSquareHeart, Save, Loader2, Sparkles } from 'lucide-react';
import { Dossier, JuryMemberReview } from '../../../types';
import { cn, formatCurrency } from '../../../lib/utils';
import { LocalDatabaseService } from '../../../services/localDatabaseService';

interface JuryFeedbacksTabProps {
  dossier?: Dossier;
  onUpdateConsultantFeeling?: (feeling: string) => void;
}

export function JuryFeedbacksTab({ dossier, onUpdateConsultantFeeling }: JuryFeedbacksTabProps) {
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

  useEffect(() => {
    if (juryDecision?.consultantFeeling !== undefined) {
      setConsultantFeeling(juryDecision.consultantFeeling || '');
    }
  }, [juryDecision?.consultantFeeling]);

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
          
          <div className="flex items-center justify-between pb-6 border-b border-accent/10">
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
          </div>

          {/* Espace Ressenti Consultant */}
          <div className="mt-6 pt-2 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="consultantFeelingInput" className="text-xs font-black uppercase tracking-wider text-secondary flex items-center gap-2">
                <MessageSquareHeart className="w-4 h-4 text-primary" />
                Votre Ressenti Consultant
              </label>
            </div>

            <div className="relative">
              <textarea
                id="consultantFeelingInput"
                value={consultantFeeling}
                onChange={(e) => setConsultantFeeling(e.target.value)}
                placeholder=""
                rows={3}
                className="w-full p-4 rounded-xl border border-accent/15 focus:border-secondary focus:ring-2 focus:ring-secondary/15 outline-none text-sm text-accent placeholder:text-accent/30 transition-all bg-accent/[0.01] resize-none"
              />
            </div>

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

      {/* 2. Cartes des avis individuels du jury */}
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
