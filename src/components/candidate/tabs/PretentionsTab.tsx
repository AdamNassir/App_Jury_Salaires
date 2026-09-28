import React from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Target } from 'lucide-react';
import { Section, FormField } from '../CandidateUI';
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
  const midTermGoals: string[] = React.useMemo(() => {
    if (reportData.careerGoalsList && reportData.careerGoalsList.length > 0) {
      return reportData.careerGoalsList;
    }
    const legacy = [reportData.careerGoal1 || '', reportData.careerGoal2 || ''].filter(Boolean);
    if (legacy.length > 0) return legacy;
    if (reportData.careerGoals) {
      const split = reportData.careerGoals.split('\n').filter(Boolean);
      if (split.length > 0) return split;
    }
    return ['', ''];
  }, [reportData.careerGoalsList, reportData.careerGoal1, reportData.careerGoal2, reportData.careerGoals]);

  const updateMidTermGoal = (index: number, val: string) => {
    const updated = [...midTermGoals];
    updated[index] = val;
    setReportData(prev => ({
      ...prev,
      careerGoalsList: updated,
      careerGoal1: updated[0] || '',
      careerGoal2: updated[1] || '',
      careerGoals: updated.filter(Boolean).join('\n')
    }));
  };

  const addMidTermGoal = () => {
    const updated = [...midTermGoals, ''];
    setReportData(prev => ({
      ...prev,
      careerGoalsList: updated,
      careerGoal1: updated[0] || '',
      careerGoal2: updated[1] || '',
      careerGoals: updated.filter(Boolean).join('\n')
    }));
  };

  const removeMidTermGoal = (index: number) => {
    const updated = midTermGoals.filter((_, i) => i !== index);
    const finalGoals = updated.length > 0 ? updated : [''];
    setReportData(prev => ({
      ...prev,
      careerGoalsList: finalGoals,
      careerGoal1: finalGoals[0] || '',
      careerGoal2: finalGoals[1] || '',
      careerGoals: finalGoals.filter(Boolean).join('\n')
    }));
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
      <Section title="Objectifs">
        <div className="space-y-12">
          
          {/* Objectifs moyen-terme (Vision / Carrière) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-secondary tracking-tight">Objectifs moyen-terme (Vision / Carrière)</h3>
                <p className="text-sm font-black text-accent/40 uppercase tracking-widest mt-1">Objectifs</p>
              </div>
              <button
                type="button"
                onClick={addMidTermGoal}
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter un objectif</span>
              </button>
            </div>
            
            <div className="space-y-5">
              {midTermGoals.map((goal, index) => (
                <div key={index} className="p-6 bg-accent/5 rounded-xl border border-accent/10 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-black text-secondary uppercase tracking-wider">
                      <span className="w-6 h-6 rounded-full bg-secondary text-white flex items-center justify-center text-xs font-bold">{index + 1}</span>
                      <span>Objectif {index + 1}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeMidTermGoal(index)}
                      title="Supprimer cet objectif"
                      className="text-red-500 hover:text-red-700 p-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <FormField
                    label={`Objectif moyen-terme #${index + 1}`}
                    value={goal}
                    onChange={val => updateMidTermGoal(index, val)}
                    placeholder={`Décrivez votre objectif moyen-terme #${index + 1}...`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Objectifs court-terme (mise en oeuvre) */}
          <div className="pt-8 border-t border-accent/10">
            <div className="p-6 bg-accent/[0.02] border border-accent/10 rounded-xl space-y-4">
              <h4 className="text-base font-bold text-secondary">
                Objectifs court-terme (mise en oeuvre)
              </h4>
              <p className="text-xs text-accent/80 leading-relaxed font-medium">
                Un objectif définit un résultat à atteindre dans un contexte donné. Il est important de toujours vérifier si l’objectif est SMART :
              </p>
              <ul className="space-y-1.5 text-xs text-accent/80 font-medium pl-5 list-disc">
                <li><strong>Spécifique :</strong> décrit précisément la situation à atteindre et les résultats à atteindre.</li>
                <li><strong>Mesurable :</strong> par des indicateurs simples et suffisants.</li>
                <li><strong>Ambitieux :</strong> implique un effort, un engagement.</li>
                <li><strong>Réaliste :</strong> prend en compte les moyens, les compétences disponibles et le contexte.</li>
                <li><strong>Temporel :</strong> défini dans le temps avec une durée, une date d’échéance, des étapes...etc.</li>
              </ul>
              <p className="text-xs text-accent/80 leading-relaxed font-medium">
                Les objectifs ne doivent pas être trop nombreux. La fixation d’objectifs porte sur les priorités de travail du collaborateur, les sujets sur lesquels il devra faire porter son effort.
              </p>
              <p className="text-xs text-accent/80 leading-relaxed font-medium">
                Les objectifs court-terme doivent répondre aux objectifs moyen-terme en étant la mise en œuvre d’une étape intermédiaire permettant d’atteindre l’objectif moyen-terme.
              </p>
              <p className="text-xs text-accent/80 leading-relaxed font-medium">
                Les objectifs (court-terme ou moyen-terme) peuvent être liés à la vie Logiclever (participation à une Squad…) mais il est important de se donner des objectifs de carrière.
              </p>
              <p className="text-xs text-accent/80 leading-relaxed font-medium">
                N’hésitez pas à consulter les évaluations de vos collègues pour trouver des exemples d’objectif et à solliciter votre coach.
              </p>
            </div>
          </div>

          {/* Les objectifs pour l’année prochaine */}
          <div className="pt-8 border-t border-accent/10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-secondary tracking-tight">Les objectifs pour l’année prochaine</h3>
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

                  <div className="space-y-6">
                    <FormField
                      label="Objectif Spécifique (S de SMART)"
                      value={obj.objective}
                      onChange={v => updateObjective(idx, { objective: v })}
                      placeholder="Décrivez précisément la situation et les résultats à atteindre..."
                    />

                    <FormField
                      label="Bénéfice(s) (Afin de...)"
                      value={obj.benefit}
                      onChange={v => updateObjective(idx, { benefit: v })}
                      placeholder="Pourquoi cet objectif est utile pour vous et Logiclever..."
                    />

                    <FormField
                      label="Moyens à mettre en œuvre (Ambitieux et Réalistes - A et R de SMART)"
                      value={obj.means}
                      onChange={v => updateObjective(idx, { means: v })}
                      placeholder="Actions concrètes, formations, accompagnement..."
                    />

                    <FormField
                      label="Mesures & Échéance (Mesurable et Temporel - M et T de SMART)"
                      value={obj.measures}
                      onChange={v => updateObjective(idx, { measures: v })}
                      placeholder="Indicateurs de succès, dates clés..."
                    />
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
