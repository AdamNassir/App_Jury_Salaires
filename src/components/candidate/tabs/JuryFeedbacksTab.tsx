import React from 'react';
import { motion } from 'motion/react';
import { Gavel, Clock, CheckCircle2 } from 'lucide-react';
import { Dossier, JuryMemberReview } from '../../../types';
import { cn } from '../../../lib/utils';

interface JuryFeedbacksTabProps {
  dossier?: Dossier;
}

export function JuryFeedbacksTab({ dossier }: JuryFeedbacksTabProps) {
  const reviewsMap = dossier?.juryMemberReviews || {};
  const juryReviews: JuryMemberReview[] = Array.from(
    new Map(
      Object.values(reviewsMap).map(review => [
        review.juryUid || review.juryEmail || review.juryName,
        review
      ])
    ).values()
  );
  const juryDecision = dossier?.juryDecision;
  const isFinalDecision = dossier?.status === 'VALIDE';

  // S'il y a une décision globale sans review individuelle correspondante
  const hasGlobalNotes = juryDecision && (juryDecision.whyThisSalary || juryDecision.whatToDoMore || juryDecision.verdict);

  return (
    <motion.div 
      key="jury_feedbacks" 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -10 }} 
      className="space-y-6"
    >
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

        {/* Si une décision globale ou pré-verdict existe déjà */}
        {hasGlobalNotes && (
          <div className="mb-8 p-6 rounded-2xl bg-accent/[0.02] border border-accent/10 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {juryDecision.whyThisSalary && (
                <div className="p-5 rounded-xl bg-white border border-accent/10 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-primary">
                    Positionnement & Justification TJ
                  </div>
                  <div className="text-sm text-accent/80 font-light leading-relaxed whitespace-pre-wrap">
                    {juryDecision.whyThisSalary}
                  </div>
                </div>
              )}
              {juryDecision.whatToDoMore && (
                <div className="p-5 rounded-xl bg-white border border-accent/10 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-secondary">
                    Axes prioritaires pour augmenter le TJ
                  </div>
                  <div className="text-sm text-accent/80 font-light leading-relaxed whitespace-pre-wrap">
                    {juryDecision.whatToDoMore}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Liste des avis individuels des membres du jury */}
        {juryReviews.length === 0 && !hasGlobalNotes ? (
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
