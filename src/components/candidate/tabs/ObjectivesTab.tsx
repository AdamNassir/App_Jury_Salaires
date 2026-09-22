import React from 'react';
import { motion } from 'motion/react';
import { Trash2, Plus } from 'lucide-react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport } from '../../../types';
import { cn } from '../../../lib/utils';

interface ObjectivesTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
}

export function ObjectivesTab({ reportData, setReportData }: ObjectivesTabProps) {
  const addObjectivePast = () => {
    setReportData(prev => ({
      ...prev,
      previousObjectives: [...prev.previousObjectives, { objective: '', comments: '', reached: 'OUI' }]
    }));
  };

  return (
    <motion.div key="obj-p" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Section title="Objectifs de l'année précédente" subtitle="Faites le point sur les engagements pris l'an dernier.">
        <div className="space-y-6">
          {reportData.previousObjectives.map((obj, idx) => (
            <div key={idx} className="p-8 bg-accent/5 rounded-xl border border-accent/10 relative group">
              <button 
                type="button"
                onClick={() => setReportData(prev => ({
                  ...prev,
                  previousObjectives: prev.previousObjectives.filter((_, i) => i !== idx)
                }))}
                className="absolute top-4 right-4 text-accent/20 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField 
                  label="Objectif" 
                  value={obj.objective} 
                  onChange={v => {
                    setReportData(prev => {
                      const newObjs = [...prev.previousObjectives];
                      newObjs[idx] = { ...newObjs[idx], objective: v };
                      return { ...prev, previousObjectives: newObjs };
                    });
                  }}
                />
                <FormField 
                  label="Commentaires" 
                  value={obj.comments} 
                  onChange={v => {
                    setReportData(prev => {
                      const newObjs = [...prev.previousObjectives];
                      newObjs[idx] = { ...newObjs[idx], comments: v };
                      return { ...prev, previousObjectives: newObjs };
                    });
                  }}
                />
              </div>
              <div className="mt-6 flex items-center gap-4">
                <label className="text-[10px] font-black text-accent/30 uppercase tracking-widest">Atteint :</label>
                <div className="flex gap-2">
                  {(['OUI', 'NON', 'PARTIEL'] as const).map(status => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        setReportData(prev => {
                          const newObjs = [...prev.previousObjectives];
                          newObjs[idx] = { ...newObjs[idx], reached: status };
                          return { ...prev, previousObjectives: newObjs };
                        });
                      }}
                      className={cn(
                        "px-4 py-2 rounded-base text-[10px] font-black uppercase tracking-widest transition-all",
                        obj.reached === status ? "bg-primary text-white" : "bg-white text-accent/40 border border-accent/10"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <button 
            type="button"
            onClick={addObjectivePast} 
            className="w-full py-4 border-2 border-dashed border-accent/10 rounded-xl text-accent/40 font-bold hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-3"
          >
            <Plus className="w-5 h-5" /> Ajouter un objectif passé
          </button>
        </div>
      </Section>
    </motion.div>
  );
}
