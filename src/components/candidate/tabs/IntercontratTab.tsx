import React from 'react';
import { motion } from 'motion/react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport } from '../../../types';

interface IntercontratTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
}

export function IntercontratTab({ reportData, setReportData }: IntercontratTabProps) {
  return (
    <motion.div key="intercontrat" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Section title="Gestion de l'Intercontrat" subtitle="Renseignez vos périodes d'intercontrat et les réalisations ou contributions associées.">
        <div className="space-y-10">
          <div className="flex items-center gap-4 bg-accent/5 p-6 rounded-xl border border-accent/10">
            <input 
              id="hadIntercontrat"
              type="checkbox" 
              checked={reportData.hadIntercontrat || false}
              onChange={e => setReportData(prev => ({ ...prev, hadIntercontrat: e.target.checked }))}
              className="w-6 h-6 rounded border-accent/20 text-primary focus:ring-primary cursor-pointer"
            />
            <label htmlFor="hadIntercontrat" className="text-sm font-bold text-accent cursor-pointer select-none">
              J'ai été en intercontrat au cours de l'année passée
            </label>
          </div>

          {reportData.hadIntercontrat && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="space-y-10"
            >
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">Nombre de jours d'intercontrat</label>
                <input 
                  type="number"
                  min="0"
                  value={reportData.intercontratDays || 0} 
                  onChange={e => setReportData(prev => ({ ...prev, intercontratDays: parseInt(e.target.value) || 0 }))}
                  className="w-full max-w-[200px] bg-accent/5 px-6 py-4 rounded-xl border border-accent/10 font-bold focus:bg-white text-accent outline-none"
                  placeholder="0"
                />
              </div>

              <FormField 
                label="Description des réalisations et contributions pendant l'intercontrat" 
                value={reportData.intercontratAchievements || ''} 
                onChange={v => setReportData(prev => ({ ...prev, intercontratAchievements: v }))} 
                placeholder="Renseignez vos contributions (projets internes, certifications, formations, proposition commerciale...) durant vos périodes d'intercontrat." 
              />
            </motion.div>
          )}
        </div>
      </Section>
    </motion.div>
  );
}
