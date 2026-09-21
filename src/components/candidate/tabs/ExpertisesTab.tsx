import React from 'react';
import { motion } from 'motion/react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport } from '../../../types';

interface ExpertisesTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
}

export function ExpertisesTab({ reportData, setReportData }: ExpertisesTabProps) {
  return (
    <motion.div key="exp" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Section title="Savoir-faire">
        <div className="space-y-8">
          <FormField 
            label="Sur quelles compétences métier / applicatifs ?" 
            value={reportData.progressionDetails} 
            onChange={v => setReportData(prev => ({ ...prev, progressionDetails: v }))} 
            placeholder="Détaillez vos compétences métier et applicatifs..."
          />
          <FormField 
            label="Sur quels logiciels / technologies ?" 
            value={reportData.techDetails} 
            onChange={v => setReportData(prev => ({ ...prev, techDetails: v }))} 
            placeholder="Détaillez les logiciels et technologies utilisés..."
          />
          <FormField 
            label="Avez-vous de nouvelles certifications ?" 
            value={reportData.certificationsDetail} 
            onChange={v => setReportData(prev => ({ ...prev, certificationsDetail: v }))} 
            placeholder="Indiquez vos nouvelles certifications obtenues ou en cours..."
          />
          <FormField 
            label="Préparation / Animation de réunion ?" 
            value={reportData.meetingPrep} 
            onChange={v => setReportData(prev => ({ ...prev, meetingPrep: v }))} 
            placeholder="Détaillez vos animations ou préparations de réunion..."
          />
          <FormField 
            label="Quels livrables avez-vous faits ?" 
            value={reportData.deliverables} 
            onChange={v => setReportData(prev => ({ ...prev, deliverables: v }))} 
            placeholder="Détaillez les livrables réalisés..."
          />
        </div>
      </Section>
    </motion.div>
  );
}
