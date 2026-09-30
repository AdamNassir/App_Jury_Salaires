import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { Trash2, Plus, CloudDownload, Loader2, Upload } from 'lucide-react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport } from '../../../types';
import { cn } from '../../../lib/utils';

interface ObjectivesTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  handleImportPastYearObjectives?: () => Promise<void>;
  isImportingPastObjectives?: boolean;
  handleManualDepositBilanN1?: (file: File) => Promise<void>;
  isManualDepositingBilan?: boolean;
  isLockedForEditing?: boolean;
}

export function ObjectivesTab({
  reportData,
  setReportData,
  handleImportPastYearObjectives,
  isImportingPastObjectives,
  handleManualDepositBilanN1,
  isManualDepositingBilan,
  isLockedForEditing = false
}: ObjectivesTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addObjectivePast = () => {
    if (isLockedForEditing) return;
    setReportData(prev => ({
      ...prev,
      previousObjectives: [...prev.previousObjectives, { objective: '', comments: '', reached: 'OUI' }]
    }));
  };

  return (
    <motion.div key="obj-p" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Section
        title="Objectifs Année Passée"
        action={!isLockedForEditing ? (
          <div className="flex items-center gap-2">
            {handleImportPastYearObjectives && (
              <button
                type="button"
                onClick={handleImportPastYearObjectives}
                disabled={isImportingPastObjectives || isManualDepositingBilan}
                className="flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                title="Importer automatiquement depuis Google Drive"
              >
                {isImportingPastObjectives ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudDownload className="w-4 h-4" />
                )}
                <span>{isImportingPastObjectives ? 'Recherche Drive...' : 'Importer Drive'}</span>
              </button>
            )}
            {handleManualDepositBilanN1 && (
              <label className="flex items-center gap-2 bg-primary text-white hover:brightness-110 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs">
                {isManualDepositingBilan ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span>{isManualDepositingBilan ? 'Extraction...' : 'Déposer Bilan N-1'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.doc,.pdf,.xlsx,.json,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleManualDepositBilanN1(file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        ) : undefined}
      >
        <div className="space-y-6">
          {reportData.previousObjectives.map((obj, idx) => (
            <div key={idx} className="p-8 bg-accent/5 rounded-xl border border-accent/10 relative group">
              {!isLockedForEditing && (
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
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField 
                  label="Objectif" 
                  value={obj.objective} 
                  disabled={isLockedForEditing}
                  onChange={v => {
                    if (isLockedForEditing) return;
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
                  disabled={isLockedForEditing}
                  onChange={v => {
                    if (isLockedForEditing) return;
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
                  {(['OUI', 'NON'] as const).map(status => (
                    <button
                      key={status}
                      type="button"
                      disabled={isLockedForEditing}
                      onClick={() => {
                        if (isLockedForEditing) return;
                        setReportData(prev => {
                          const newObjs = [...prev.previousObjectives];
                          newObjs[idx] = { ...newObjs[idx], reached: status };
                          return { ...prev, previousObjectives: newObjs };
                        });
                      }}
                      className={cn(
                        "px-4 py-2 rounded-base text-[10px] font-black uppercase tracking-widest transition-all",
                        obj.reached === status ? "bg-primary text-white" : "bg-white text-accent/40 border border-accent/10",
                        isLockedForEditing && "cursor-default"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {!isLockedForEditing && (
            <button 
              type="button"
              onClick={addObjectivePast} 
              className="w-full py-4 border-2 border-dashed border-accent/10 rounded-xl text-accent/40 font-bold hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-3"
            >
              <Plus className="w-5 h-5" /> Ajouter un objectif passé
            </button>
          )}
        </div>
      </Section>
    </motion.div>
  );
}
