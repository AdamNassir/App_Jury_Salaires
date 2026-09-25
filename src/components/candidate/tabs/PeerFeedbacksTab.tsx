import React from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Briefcase, Building2, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Dossier, ConsultantFeedback } from '../../../types';
import { cn } from '../../../lib/utils';

interface PeerFeedbacksTabProps {
  dossier?: Dossier;
}

export function PeerFeedbacksTab({ dossier }: PeerFeedbacksTabProps) {
  const feedbacksMap = dossier?.consultantFeedbacks || {};
  // Filtrer les brouillons initiaux vides créés automatiquement lors de l'import (qui n'ont pas encore été renseignés par l'évaluateur)
  const feedbacks: ConsultantFeedback[] = Object.values(feedbacksMap).filter(fb => {
    const hasContent = (fb.justification && fb.justification.trim().length > 0) || 
                       (fb.improvementAxes && fb.improvementAxes.trim().length > 0) || 
                       fb.validated || 
                       fb.status === 'VALIDE';
    return hasContent;
  });

  return (
    <motion.div 
      key="peer_feedbacks" 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -10 }} 
      className="space-y-6"
    >
      <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-sm font-sans">
        <div className="mb-8 border-b border-accent/10 pb-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-secondary flex items-center gap-3">
              <MessageSquare className="w-6 h-6 text-primary" />
              Évaluations et Retours par les Pairs
            </h2>
            <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-accent/5 text-accent/60 border border-accent/10">
              {feedbacks.length} avis reçu{feedbacks.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {feedbacks.length === 0 ? (
          <div className="p-16 border border-dashed border-accent/20 rounded-2xl text-center space-y-3 bg-accent/[0.01]">
            <div className="w-12 h-12 rounded-full bg-accent/5 flex items-center justify-center mx-auto text-accent/30">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-accent/40 font-light italic text-base">
              Aucun retour de pair n'a été enregistré pour ce dossier pour le moment.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8">
            {feedbacks.map((fb, idx) => {
              const displayRelation = fb.relationType || fb.type || 'Évaluation';
              const isValidated = fb.status === 'VALIDE' || fb.validated;

              return (
                <div 
                  key={fb.id || idx} 
                  className="bg-white rounded-2xl border border-accent/15 p-8 shadow-sm hover:shadow-md transition-all space-y-6 relative overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary" />

                  {/* En-tête : Évaluateur, Relation, Mission & Client */}
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-accent/10 pb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-lg border border-primary/20">
                        {fb.consultantName ? fb.consultantName.charAt(0).toUpperCase() : 'P'}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h4 className="text-lg font-bold text-accent">
                            {fb.consultantName || 'Pair / Associé'}
                          </h4>
                          <span className={cn(
                            "text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider border",
                            isValidated 
                              ? "bg-green-50 text-green-700 border-green-200" 
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          )}>
                            {isValidated ? 'Validé' : 'Brouillon'}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-accent/50 uppercase tracking-wider mt-1">
                          {String(displayRelation).replace('_', ' ')}
                        </div>
                      </div>
                    </div>

                    {/* Mission et Client */}
                    <div className="flex flex-wrap items-center gap-3">
                      {fb.client && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/5 border border-accent/10 text-xs font-bold text-accent/80">
                          <Building2 className="w-3.5 h-3.5 text-primary" />
                          <span>Client : <strong className="text-accent">{fb.client}</strong></span>
                        </div>
                      )}
                      {fb.project && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/5 border border-accent/10 text-xs font-bold text-accent/80">
                          <Briefcase className="w-3.5 h-3.5 text-secondary" />
                          <span>Mission : <strong className="text-accent">{fb.project}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Préconisation TJM & Confiance */}
                  {((fb.targetTJMin && fb.targetTJMin > 0) || (fb.targetTJMax && fb.targetTJMax > 0) || fb.confidenceIndex) && (
                    <div className="flex flex-wrap items-center gap-6 p-4 rounded-xl bg-accent/[0.03] border border-accent/10">
                      {((fb.targetTJMin && fb.targetTJMin > 0) || (fb.targetTJMax && fb.targetTJMax > 0)) && (
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-primary" />
                          <span className="text-xs text-accent/50 uppercase font-black tracking-wider">TJM Préconisé :</span>
                          <span className="text-sm font-black text-accent">
                            {fb.targetTJMin || 0}€ - {fb.targetTJMax || 0}€
                          </span>
                        </div>
                      )}
                      {fb.confidenceIndex !== undefined && (
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-secondary" />
                          <span className="text-xs text-accent/50 uppercase font-black tracking-wider">Indice de Confiance :</span>
                          <span className="text-sm font-black text-secondary">
                            {fb.confidenceIndex > 5 ? Math.round(fb.confidenceIndex / 2) : fb.confidenceIndex} / 5
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Contenu : Justification TJ Cible & Axes pour augmenter le TJ */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    <div className="p-6 rounded-xl bg-white border border-accent/10 shadow-xs space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-primary">
                        Justification TJ Cible
                      </div>
                      <div className="text-sm text-accent/80 leading-relaxed font-light whitespace-pre-wrap">
                        {fb.justification || (
                          <span className="italic text-accent/30">Aucune justification formulée</span>
                        )}
                      </div>
                    </div>

                    <div className="p-6 rounded-xl bg-white border border-accent/10 shadow-xs space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-secondary">
                        Axes pour augmenter le TJ
                      </div>
                      <div className="text-sm text-accent/80 leading-relaxed font-light whitespace-pre-wrap">
                        {fb.improvementAxes || (
                          <span className="italic text-accent/30">Aucun axe de progrès formulé</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
