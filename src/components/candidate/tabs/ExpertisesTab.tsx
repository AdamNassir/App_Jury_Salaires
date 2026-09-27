import React from 'react';
import { motion } from 'motion/react';
import { Section } from '../CandidateUI';
import { AnnualReport } from '../../../types';
import { SkillsDossierFields } from './SkillsDossierFields';
import { GradeCriteriaTable } from '../GradeCriteriaTable';

interface ExpertisesTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  isLockedForEditing: boolean;
}

export function ExpertisesTab({ reportData, setReportData, isLockedForEditing }: ExpertisesTabProps) {
  return (
    <motion.div key="exp" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <GradeCriteriaTable />
      <Section
        title="Savoir-faire"
        subtitle="Logiclever peut vous valoriser (et donc vous rétribuer) si vous avez des compétences / savoir-faire identifiables"
      >
        <SkillsDossierFields
          reportData={reportData}
          setReportData={setReportData}
          disabled={isLockedForEditing}
        />
      </Section>
    </motion.div>
  );
}
