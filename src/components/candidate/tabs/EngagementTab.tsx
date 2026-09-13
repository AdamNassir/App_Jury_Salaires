import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport, Grade } from '../../../types';
import { cn } from '../../../lib/utils';

interface EngagementTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  effectiveCurrentGrade: Grade | 'Junior';
  gradeOrder: Record<string, number>;
}

export function EngagementTab({
  reportData,
  setReportData,
  effectiveCurrentGrade,
  gradeOrder
}: EngagementTabProps) {
  return (
    <motion.div key="eng" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Section title="Engagement & Autonomie" subtitle="Contribution à Logiclever et posture en mission.">
        <div className="space-y-12">
          {/* Grade Actuel */}
          <div className="p-8 bg-accent/5 rounded-xl border border-accent/10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest">Mon Grade Actuel</h4>
                <p className="text-xs text-accent/50 font-medium mt-1">Sélectionnez le grade qui correspond à votre situation actuelle au sein de Logiclever</p>
              </div>
              <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg uppercase tracking-wider">
                {effectiveCurrentGrade}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(['Junior', 'Confirmé', 'Senior', 'Expert'] as Grade[]).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    const newRank = gradeOrder[g] ?? 1;
                    const wishedRank = gradeOrder[reportData.wishedGrade] ?? 1;
                    const updatedWishedGrade = wishedRank < newRank ? g : reportData.wishedGrade;
                    setReportData(prev => ({
                      ...prev,
                      currentGrade: g,
                      wishedGrade: updatedWishedGrade
                    }));
                  }}
                  className={cn(
                    "py-3 rounded-base text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border",
                    effectiveCurrentGrade === g 
                      ? "bg-primary text-white border-primary shadow-md" 
                      : "bg-white text-accent/50 border-accent/10 hover:border-primary/40 shadow-sm"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="p-8 bg-accent/5 rounded-xl border border-accent/10">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-6">Autonomie en Mission</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {(['Junior', 'Confirmé', 'Senior', 'Expert'] as const).map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setReportData(prev => ({ ...prev, autonomyLevel: lvl }))}
                  className={cn(
                    "py-3 rounded-base text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer",
                    reportData.autonomyLevel === lvl ? "bg-secondary text-white" : "bg-white text-accent/40 border border-accent/10 shadow-sm"
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <FormField 
              label="Justification Autonomie" 
              value={reportData.autonomyJustification} 
              onChange={v => setReportData(prev => ({ ...prev, autonomyJustification: v }))} 
              placeholder="Comment avez-vous agi ? Junior (faible supervision), Expert (indépendance totale) ?"
              tooltip="Referrez-vous au référentiel pour justifier votre niveau d'autonomie."
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <FormField 
              label="Force de proposition client" 
              value={reportData.commercialProposition} 
              onChange={v => setReportData(prev => ({ ...prev, commercialProposition: v }))} 
              placeholder="Exemples de valeur ajoutée..." 
            />
            <FormField 
              label="Conseils donnés aux clients" 
              value={reportData.commercialAdvice} 
              onChange={v => setReportData(prev => ({ ...prev, commercialAdvice: v }))} 
              placeholder="Mise en place d'outils, organisation..." 
            />
          </div>

          <div className="pt-8 border-t border-accent/10">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10">Vie Logiclever</h4>
            
            {/* Estimation de mon investissement interne */}
            <div className="mb-10 p-6 bg-accent/5 rounded-xl border border-accent/10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">Estimation de mon investissement interne</label>
                  <p className="text-xs text-accent/50 font-medium mt-1">Évaluez de 0 à 100 votre implication globale dans la vie d'entreprise Logiclever</p>
                </div>
                <span className="text-2xl font-black text-secondary font-mono">{reportData.internalInvestment ?? 0}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={reportData.internalInvestment ?? 0}
                onChange={e => setReportData(prev => ({ ...prev, internalInvestment: parseInt(e.target.value) || 0 }))}
                className="w-full h-2 bg-accent/10 rounded-lg appearance-none cursor-pointer accent-secondary"
              />
              <div className="flex justify-between text-[9px] font-black uppercase tracking-wider text-accent/20 mt-2">
                <span>0% (Aucun)</span>
                <span>50% (Modéré)</span>
                <span>100% (Maximum)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <FormField label="Capitalisation (Drive)" value={reportData.lifeKnowledgeSharing} onChange={v => setReportData(prev => ({ ...prev, lifeKnowledgeSharing: v }))} placeholder="Partage de doc, Rex..." />
              <FormField label="Slack / Communication" value={reportData.lifeSlack} onChange={v => setReportData(prev => ({ ...prev, lifeSlack: v }))} placeholder="Participation aux canaux, notifications..." />
              <FormField label="Esprit d'équipe" value={reportData.lifeTeamSpirit} onChange={v => setReportData(prev => ({ ...prev, lifeTeamSpirit: v }))} placeholder="Séminaires, déjeuners, foot..." />
              <FormField label="Maîtrise Business Model" value={reportData.lifeBusinessModel} onChange={v => setReportData(prev => ({ ...prev, lifeBusinessModel: v }))} placeholder="Compréhension marge, facturation..." />
            </div>
          </div>

          <div className="pt-8 border-t border-accent/10">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10">Recrutement & Promotion</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <FormField label="Promouvoir Logiclever" value={reportData.recruitmentPromotion} onChange={v => setReportData(prev => ({ ...prev, recruitmentPromotion: v }))} placeholder="Avec qui ?, Comment ?..." tooltip="Points sur votre implication dans la promotion de l'image de marque." />
              <FormField label="Entretiens candidats" value={reportData.recruitmentInterviews} onChange={v => setReportData(prev => ({ ...prev, recruitmentInterviews: v }))} placeholder="Avez-vous interviewé des candidats ?..." />
              <FormField label="Réseaux Sociaux" value={reportData.recruitmentSocial} onChange={v => setReportData(prev => ({ ...prev, recruitmentSocial: v }))} placeholder="LinkedIn, partages..." />
            </div>
          </div>

          <div className="pt-8 border-t border-accent/10">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10">Encadrement & Coaching</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <FormField label="Sollicitation Coach" value={reportData.encadrementCoach} onChange={v => setReportData(prev => ({ ...prev, encadrementCoach: v }))} placeholder="Avez-vous sollicité votre coach ?..." />
              <FormField label="Sollicitation Encadrant" value={reportData.encadrementManager} onChange={v => setReportData(prev => ({ ...prev, encadrementManager: v }))} placeholder="Avez-vous sollicité votre encadrant mission ?..." />
            </div>
          </div>

          <div className="pt-8 border-t border-accent/10">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-6">Expertise & Référents Logiclever</h4>
            <div 
              onClick={() => setReportData(prev => ({ ...prev, isReferentOrAspiring: !prev.isReferentOrAspiring }))}
              className={cn(
                "p-8 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between group",
                reportData.isReferentOrAspiring ? "bg-accent border-accent text-white shadow-xl shadow-accent/20" : "bg-white border-accent/10 hover:border-accent/40"
              )}
            >
              <div className="space-y-2">
                <div className="text-xl font-bold">Je suis Référent ou souhaite le devenir</div>
                <p className={cn("text-sm", reportData.isReferentOrAspiring ? "text-white/60" : "text-accent/40")}>
                  Cochez cette case si vous avez des missions d'encadrement, de coaching ou de développement de l'offre Logiclever.
                </p>
              </div>
              <div className={cn(
                "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all",
                reportData.isReferentOrAspiring ? "bg-white border-white text-accent" : "border-accent/10 text-transparent"
              )}>
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-accent/10">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10">SQUAD / Amélioration Continue</h4>
            <div className="p-8 bg-primary/5 rounded-xl border border-primary/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Nom de la Squad</label>
                  <input 
                    value={reportData.squadName} 
                    onChange={e => setReportData(prev => ({ ...prev, squadName: e.target.value }))}
                    placeholder="EPIC 55..."
                    className="w-full bg-white px-6 py-4 rounded-xl border border-primary/10 font-bold"
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Votre Rôle</label>
                  <input 
                    value={reportData.squadRole} 
                    onChange={e => setReportData(prev => ({ ...prev, squadRole: e.target.value }))}
                    placeholder="Responsable, contributeur..."
                    className="w-full bg-white px-6 py-4 rounded-xl border border-primary/10 font-bold"
                  />
                </div>
              </div>
              <FormField label="Principaux apports à la SQUAD" value={reportData.squadContributions} onChange={v => setReportData(prev => ({ ...prev, squadContributions: v }))} placeholder="Actions concrètes, résultats..." />
            </div>
          </div>
        </div>
      </Section>
    </motion.div>
  );
}
