import React from 'react';
import { motion } from 'motion/react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport } from '../../../types';

interface ReferentTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
}

export function ReferentTab({ reportData, setReportData }: ReferentTabProps) {
  return (
    <motion.div key="ref" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Section title="Points Spécifiques Référents" subtitle="Réservé aux référents Logiclever ou ceux souhaitant le devenir.">
        <div className="space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-4">
              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-widest">Consultants coachés (max 4)</label>
              <input 
                type="number"
                value={reportData.coachedConsultantsCount} 
                onChange={e => setReportData(prev => ({ ...prev, coachedConsultantsCount: parseInt(e.target.value) || 0 }))}
                className="w-full bg-accent/5 px-6 py-4 rounded-xl border border-accent/10 font-bold"
              />
            </div>
            <div className="space-y-4">
              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-widest">Entretiens recrutement (min 4)</label>
              <input 
                type="number"
                value={reportData.recruitmentInterviewsCount} 
                onChange={e => setReportData(prev => ({ ...prev, recruitmentInterviewsCount: parseInt(e.target.value) || 0 }))}
                className="w-full bg-accent/5 px-6 py-4 rounded-xl border border-accent/10 font-bold"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <FormField label="Météos menées (Suivre les missions)" value={reportData.clientFollowUpMeteos} onChange={v => setReportData(prev => ({ ...prev, clientFollowUpMeteos: v }))} />
            <FormField label="Points de coordination" value={reportData.coordinationPoints} onChange={v => setReportData(prev => ({ ...prev, coordinationPoints: v }))} />
          </div>
          
          <FormField label="Expert référent SQUAD" value={reportData.referentSquadRole} onChange={v => setReportData(prev => ({ ...prev, referentSquadRole: v }))} />
          
          <div className="pt-8 border-t border-accent/10">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10">Encadrement & Réseau</h4>
            <div className="space-y-10">
              <FormField label="Disposer d’un réseau de donneur d’ordre" value={reportData.donorNetworkActions} onChange={v => setReportData(prev => ({ ...prev, donorNetworkActions: v }))} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <FormField label="Encadrement En mission" value={reportData.encadrementMissionDetails} onChange={v => setReportData(prev => ({ ...prev, encadrementMissionDetails: v }))} />
                <FormField label="Encadrement Coaching" value={reportData.encadrementCoachingDetails} onChange={v => setReportData(prev => ({ ...prev, encadrementCoachingDetails: v }))} />
              </div>
            </div>
          </div>
        </div>
      </Section>
    </motion.div>
  );
}
