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
      <Section title="Missions & Expertises" subtitle="Détaillez vos compétences et réalisations techniques.">
        <FormField 
          label="Savoir-faire identifier" 
          value={reportData.knowHow} 
          onChange={v => setReportData(prev => ({ ...prev, knowHow: v }))} 
          placeholder="Quelles sont vos compétences identifiables ?"
          tooltip="Logiclever peut vous valoriser (et donc vous rétribuer) si vous avez des compétences / savoir-faire identifiables."
          required
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-8">
          <FormField 
            label="Activités Commerciales" 
            value={reportData.commercialActivities} 
            onChange={v => setReportData(prev => ({ ...prev, commercialActivities: v }))} 
            placeholder="Appel d'offres, POC, présentation client..."
            tooltip="Indiquez vos contributions au développement commercial (leads, réponses à AO, POC)."
            required
          />
          <FormField 
            label="Formations" 
            value={reportData.training} 
            onChange={v => setReportData(prev => ({ ...prev, training: v }))} 
            placeholder="Formations reçues ou dispensées..."
            tooltip="Certifications obtenues ou formations internes/externes suivies."
            required
          />
        </div>

        <div className="pt-8 border-t border-accent/10">
          <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10">Détails Savoir-Faire</h4>
          <div className="grid grid-cols-1 gap-10">
            <FormField 
              label="Progression métier / applicative" 
              value={reportData.progressionDetails} 
              onChange={v => setReportData(prev => ({ ...prev, progressionDetails: v }))} 
              placeholder="Sur quelles compétences avez-vous progressé ?"
              tooltip="Ex: Gestion de projet, expertise sectorielle (Finance, Energy)..."
              required
            />
            <FormField 
              label="Logiciels & Technologies" 
              value={reportData.techDetails} 
              onChange={v => setReportData(prev => ({ ...prev, techDetails: v }))} 
              placeholder="Quels logiciels/stacks maîtrisez-vous ?"
              tooltip="Grafana, Power BI, Terraform, Kubernetes..."
              required
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <FormField 
                label="Certifications & Nouvelles Compétences" 
                value={reportData.certificationsDetail} 
                onChange={v => setReportData(prev => ({ ...prev, certificationsDetail: v }))} 
                placeholder="Nouveaux badges ou certifs..."
              />
              <FormField 
                label="Animation / Préparation de réunion" 
                value={reportData.meetingPrep} 
                onChange={v => setReportData(prev => ({ ...prev, meetingPrep: v }))} 
                placeholder="Note de cadrage, présentation COMOP..."
              />
            </div>
            <FormField 
              label="Livrables marquants" 
              value={reportData.deliverables} 
              onChange={v => setReportData(prev => ({ ...prev, deliverables: v }))} 
              placeholder="Quels documents/outils avez-vous produits ?"
              tooltip="Manuels utilisateurs, scripts d'automatisation, rapports business..."
              required
            />
          </div>
        </div>
      </Section>
    </motion.div>
  );
}
