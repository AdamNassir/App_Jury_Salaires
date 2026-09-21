import React from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Target } from 'lucide-react';
import { Section } from '../CandidateUI';
import { AnnualReport, NextObjective, UserProfile, Grade } from '../../../types';

interface PretentionsTabProps {
  profile?: UserProfile;
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  effectiveCurrentGrade?: Grade | 'Junior';
  availableWishedGrades?: Grade[];
  effectiveTargetTJM?: number;
  corridorMinSalary?: number;
  corridorMaxSalary?: number;
  corridorGrade?: Grade | 'Junior';
  addObjectiveFuture?: () => void;
}

export function PretentionsTab({
  reportData,
  setReportData
}: PretentionsTabProps) {
  // --- Objectifs moyen-terme (Vision / Carrière) ---
  const handleGoal1Change = (val: string) => {
    setReportData(prev => {
      const g1 = val;
      const g2 = prev.careerGoal2 || '';
      return {
        ...prev,
        careerGoal1: g1,
        careerGoals: [g1, g2].filter(Boolean).join('\n')
      };
    });
  };

  const handleGoal2Change = (val: string) => {
    setReportData(prev => {
      const g1 = prev.careerGoal1 || '';
      const g2 = val;
      return {
        ...prev,
        careerGoal2: g2,
        careerGoals: [g1, g2].filter(Boolean).join('\n')
      };
    });
  };

  // --- Les objectifs pour l’année prochaine ---
  const objectives: NextObjective[] =
    reportData.nextObjectives && reportData.nextObjectives.length > 0
      ? reportData.nextObjectives
      : [{ objective: '', benefit: '', means: '', measures: '' }];

  const updateObjective = (index: number, patch: Partial<NextObjective>) => {
    const updated = [...objectives];
    updated[index] = { ...updated[index], ...patch };
    setReportData(prev => ({ ...prev, nextObjectives: updated }));
  };

  const addObjective = () => {
    const updated = [...objectives, { objective: '', benefit: '', means: '', measures: '' }];
    setReportData(prev => ({ ...prev, nextObjectives: updated }));
  };

  const removeObjective = (index: number) => {
    if (objectives.length <= 1) {
      setReportData(prev => ({ ...prev, nextObjectives: [{ objective: '', benefit: '', means: '', measures: '' }] }));
      return;
    }
    const updated = objectives.filter((_, i) => i !== index);
    setReportData(prev => ({ ...prev, nextObjectives: updated }));
  };

  return (
    <motion.div key="pre" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Section title="Objectifs & Prétentions salariales">
        <div className="space-y-12">
          
          {/* Objectifs moyen-terme (Vision / Carrière) */}
          <div>
            <h3 className="text-xl font-bold text-secondary tracking-tight mb-2">Objectifs moyen-terme (Vision / Carrière)</h3>
            <p className="text-sm font-black text-accent/40 uppercase tracking-widest mb-6">Objectifs</p>
            
            <div className="space-y-5">
              <div className="p-6 bg-accent/5 rounded-xl border border-accent/10 space-y-2">
                <label className="flex items-center gap-2 text-xs font-black text-secondary uppercase tracking-wider">
                  <span className="w-6 h-6 rounded-full bg-secondary text-white flex items-center justify-center text-xs font-bold">1</span>
                  <span>Objectif 1</span>
                </label>
                <textarea
                  value={reportData.careerGoal1 || ''}
                  onChange={e => handleGoal1Change(e.target.value)}
                  placeholder="Premier objectif moyen terme (ex : prise de responsabilité, nouvelle filière, formation majeure)..."
                  rows={3}
                  className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                />
              </div>

              <div className="p-6 bg-accent/5 rounded-xl border border-accent/10 space-y-2">
                <label className="flex items-center gap-2 text-xs font-black text-secondary uppercase tracking-wider">
                  <span className="w-6 h-6 rounded-full bg-secondary text-white flex items-center justify-center text-xs font-bold">2</span>
                  <span>Objectif 2</span>
                </label>
                <textarea
                  value={reportData.careerGoal2 || ''}
                  onChange={e => handleGoal2Change(e.target.value)}
                  placeholder="Second objectif moyen terme (ex : rôle commercial, certification cible, encadrement)..."
                  rows={3}
                  className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                />
              </div>
            </div>
          </div>

          {/* Les objectifs pour l’année prochaine */}
          <div className="pt-8 border-t border-accent/10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-secondary tracking-tight">Les objectifs pour l’année prochaine</h3>
                <p className="text-xs text-accent/50 mt-1 font-medium">Définissez vos objectifs opérationnels pour l'année à venir selon la méthode SMART.</p>
              </div>
              <button
                type="button"
                onClick={addObjective}
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter un objectif</span>
              </button>
            </div>

            <div className="space-y-6">
              {objectives.map((obj, idx) => (
                <div key={idx} className="p-6 bg-accent/5 rounded-xl border border-accent/10 relative space-y-6">
                  <div className="flex items-center justify-between pb-3 border-b border-accent/10">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-secondary" />
                      <span className="text-[11px] font-black uppercase tracking-wider text-secondary">Objectif #{idx + 1}</span>
                    </div>
                    {objectives.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeObjective(idx)}
                        className="text-accent/30 hover:text-red-500 transition-colors p-1"
                        title="Supprimer cet objectif"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-5">
                    {/* Objectifs */}
                    <div>
                      <label className="block text-[11px] font-black text-secondary uppercase tracking-wider mb-1">
                        Objectifs
                      </label>
                      <p className="text-xs text-accent/50 italic mb-2">
                        Doivent être Spécifiques (S de SMART)
                      </p>
                      <textarea
                        value={obj.objective}
                        onChange={e => updateObjective(idx, { objective: e.target.value })}
                        placeholder="Précisez votre objectif de manière claire et spécifique..."
                        rows={2}
                        className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                      />
                    </div>

                    {/* Bénéfice(s) */}
                    <div>
                      <label className="block text-[11px] font-black text-secondary uppercase tracking-wider mb-1">
                        Bénéfice(s)
                      </label>
                      <p className="text-xs text-accent/50 italic mb-2">
                        Afin de
                      </p>
                      <textarea
                        value={obj.benefit}
                        onChange={e => updateObjective(idx, { benefit: e.target.value })}
                        placeholder="Afin de (quel est l'impact positif attendu pour vous, le client ou Logiclever)..."
                        rows={2}
                        className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                      />
                    </div>

                    {/* Moyens à mettre en oeuvre */}
                    <div>
                      <label className="block text-[11px] font-black text-secondary uppercase tracking-wider mb-1">
                        Moyens à mettre en oeuvre
                      </label>
                      <p className="text-xs text-accent/50 italic mb-2">
                        Doivent être Ambitieux et Réalistes (A et R de SMART)
                      </p>
                      <textarea
                        value={obj.means}
                        onChange={e => updateObjective(idx, { means: e.target.value })}
                        placeholder="Quels moyens concrets, formations, temps ou accompagnement nécessaires..."
                        rows={2}
                        className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                      />
                    </div>

                    {/* Mesures */}
                    <div>
                      <label className="block text-[11px] font-black text-secondary uppercase tracking-wider mb-1">
                        Mesures
                      </label>
                      <p className="text-xs text-accent/50 italic mb-2">
                        Doivent décrire le M et le T de SMART
                      </p>
                      <textarea
                        value={obj.measures}
                        onChange={e => updateObjective(idx, { measures: e.target.value })}
                        placeholder="Comment mesurer l'atteinte de l'objectif et à quelle échéance dans le temps..."
                        rows={2}
                        className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </Section>
    </motion.div>
  );
}
