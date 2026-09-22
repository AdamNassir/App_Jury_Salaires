import React from 'react';
import { motion } from 'motion/react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport } from '../../../types';

interface SyntheseTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
}

export function SyntheseTab({ reportData, setReportData }: SyntheseTabProps) {
  return (
    <motion.div key="syn" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Section title="Synthèse">
        <FormField 
          label="Synthèse de l’année (01/07 au 30/06)" 
          value={reportData.yearSummary} 
          onChange={v => setReportData(prev => ({ ...prev, yearSummary: v }))} 
          maxLength={5000}
        />
      </Section>
    </motion.div>
  );
}
