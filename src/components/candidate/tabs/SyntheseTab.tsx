import React from 'react';
import { motion } from 'motion/react';
import { Section, FormField, SatisfactionPicker } from '../CandidateUI';
import { AnnualReport } from '../../../types';

interface SyntheseTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
}

export function SyntheseTab({ reportData, setReportData }: SyntheseTabProps) {
  return (
    <motion.div key="syn" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Section title="Introduction & Synthèse" subtitle="Bilan sur le travail accompli depuis un an.">
        <FormField 
          label="Synthèse de l'année (01/07 au 30/06)" 
          value={reportData.yearSummary} 
          onChange={v => setReportData(prev => ({ ...prev, yearSummary: v }))} 
          placeholder="Lien vers le fichier temps, mission en cours, points marquants..."
          tooltip="Indiquez les missions phares et les événements marquants de l'année écoulée."
          required
        />
        <FormField 
          label="Fiche de synthèse globale" 
          value={reportData.synthesis} 
          onChange={v => setReportData(prev => ({ ...prev, synthesis: v }))} 
          placeholder="Réflexion sur votre travail, prise de recul..."
          tooltip="Faites un bilan global de votre travail, vos réussites et ce que vous souhaitez apporter à Logiclever."
          required
        />
        
        <div className="pt-8 border-t border-accent/10">
          <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-8">Niveau de Satisfaction</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <SatisfactionPicker 
              label="Tâches / Responsabilités" 
              value={reportData.satisfaction.tasks} 
              onChange={v => setReportData(prev => ({ ...prev, satisfaction: { ...prev.satisfaction, tasks: v } }))} 
            />
            <SatisfactionPicker 
              label="Bien-être en mission" 
              value={reportData.satisfaction.wellBeingMission} 
              onChange={v => setReportData(prev => ({ ...prev, satisfaction: { ...prev.satisfaction, wellBeingMission: v } }))} 
            />
            <SatisfactionPicker 
              label="Bien-être chez le client" 
              value={reportData.satisfaction.wellBeingClient} 
              onChange={v => setReportData(prev => ({ ...prev, satisfaction: { ...prev.satisfaction, wellBeingClient: v } }))} 
            />
            <SatisfactionPicker 
              label="Bien-être chez Logiclever" 
              value={reportData.satisfaction.wellBeingLogiclever} 
              onChange={v => setReportData(prev => ({ ...prev, satisfaction: { ...prev.satisfaction, wellBeingLogiclever: v } }))} 
            />
          </div>
        </div>
      </Section>
    </motion.div>
  );
}
