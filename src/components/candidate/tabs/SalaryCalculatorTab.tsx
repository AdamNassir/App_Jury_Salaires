import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calculator, ExternalLink, Info } from 'lucide-react';
import { UserProfile, Dossier, AnnualReport, Grade } from '../../../types';
import { formatCurrency } from '../../../lib/utils';
import { calculateYears, calculateSalaryFormule, calculateSalaryFormulaResult, getPrimeAnciennete, resolveTargetGrade } from '../../../lib/salaryUtils';

interface SalaryCalculatorTabProps {
  key?: React.Key;
  profile: UserProfile;
  dossier?: Dossier;
  reportData: AnnualReport;
  setReportData?: React.Dispatch<React.SetStateAction<AnnualReport>>;
}

export function SalaryCalculatorTab({ profile, dossier, reportData, setReportData }: SalaryCalculatorTabProps) {
  const effectiveCurrent = (reportData.currentGrade || profile.currentGrade || 'Junior') as Grade | 'Junior';
  const effectiveWished = resolveTargetGrade(effectiveCurrent, reportData.wishedGrade);

  const [tjVendu, setTjVendu] = useState<number>(reportData.currentTJM || profile.currentTJM || 0);
  const [tjCible, setTjCible] = useState<number>(reportData.targetTJM || 0);
  
  const [currentGrade, setCurrentGrade] = useState<Grade | 'Junior'>(effectiveCurrent);
  const [grade, setGrade] = useState<Grade | 'Junior'>(effectiveWished);
  const [currentSalary, setCurrentSalary] = useState<number>(reportData.currentSalary || profile.currentSalary || 0);
  
  const [investPerc, setInvestPerc] = useState<number>(dossier?.juryDecision?.investmentPercentage ?? 60);
  const [missionPerc, setMissionPerc] = useState<number>(dossier?.juryDecision?.missionPercentage ?? 98);

  // Sync if dossier, profile or decision updates
  useEffect(() => {
    setInvestPerc(dossier?.juryDecision?.investmentPercentage ?? 60);
    setMissionPerc(dossier?.juryDecision?.missionPercentage ?? 98);
  }, [dossier?.id, dossier?.juryDecision?.investmentPercentage, dossier?.juryDecision?.missionPercentage]);

  useEffect(() => {
    const cur = (reportData.currentGrade || profile.currentGrade || 'Junior') as Grade | 'Junior';
    const wish = resolveTargetGrade(cur, reportData.wishedGrade);
    setCurrentGrade(cur);
    setGrade(wish);
    setTjVendu(reportData.currentTJM || profile.currentTJM || 0);
    setTjCible(reportData.targetTJM || 0);
    setCurrentSalary(reportData.currentSalary || profile.currentSalary || 0);
  }, [profile.id, profile.currentGrade, profile.currentTJM, profile.currentSalary, reportData.currentGrade, reportData.wishedGrade, reportData.targetTJM]);

  useEffect(() => {
    setTjVendu(reportData.currentTJM || profile.currentTJM || 0);
    setTjCible(reportData.targetTJM || 0);
    setCurrentSalary(reportData.currentSalary || profile.currentSalary || 0);
  }, [profile.id, profile.currentTJM, profile.currentSalary, reportData.currentTJM, reportData.targetTJM]);

  // Sync if candidate updates current grade or wished grade in other tabs
  useEffect(() => {
    setCurrentGrade(effectiveCurrent);
  }, [effectiveCurrent]);

  useEffect(() => {
    setGrade(effectiveWished);
  }, [effectiveWished]);

  const gradeHierarchy: Record<string, number> = {
    'Junior': 0,
    'Confirmé': 1,
    'Senior': 2,
    'Expert': 3
  };

  const currentGradeRank = gradeHierarchy[currentGrade] ?? 0;
  const availableTargetGrades = (['Junior', 'Confirmé', 'Senior', 'Expert'] as (Grade | 'Junior')[]).filter(
    g => (gradeHierarchy[g] ?? 0) >= currentGradeRank
  );

  const refDate = reportData.wishedSalaryDate || dossier?.annualReport?.wishedSalaryDate;
  const yearsLL = profile.ancienneteLL !== undefined && profile.ancienneteLL !== null
    ? profile.ancienneteLL
    : calculateYears(profile.entryDate, refDate);
  const targetYearsExpert = grade === 'Expert' ? (calculateYears(profile.expertGradeDate, refDate) || 0) : 0;
  const currentYearsExpert = currentGrade === 'Expert' ? (calculateYears(profile.expertGradeDate, refDate) || 0) : 0;
  const prime = getPrimeAnciennete(yearsLL);
  
  const salaireVendu = calculateSalaryFormule(tjVendu, currentGrade, currentYearsExpert, prime);
  const salaireVendu100 = calculateSalaryFormule(tjVendu + 30, currentGrade, currentYearsExpert, prime);
  
  const salaireCible = calculateSalaryFormule(tjCible, grade, targetYearsExpert, prime);
  const salaireCible100 = calculateSalaryFormule(tjCible + 30, grade, targetYearsExpert, prime);
  
  const resFormule = calculateSalaryFormulaResult(
    currentSalary,
    salaireCible,
    salaireCible100,
    salaireVendu,
    salaireVendu100,
    investPerc,
    missionPerc
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <div className="bg-white p-8 rounded-xl border border-accent/10 shadow-lg">
        <div className="border-b border-accent/10 pb-6 mb-8">
          <h2 className="text-secondary">Prétentions de carrière et salariales</h2>
        </div>

        {/* Grille de référence */}
        <div className="border border-accent/10 rounded-2xl p-6 bg-accent/[0.02] space-y-4">
          <h3 className="text-sm font-bold text-accent">
            Attendu en fonction du grade / de l'expérience / du TJ / du salaire
          </h3>
          <div className="overflow-x-auto rounded-xl border border-accent/10 bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-accent/5 border-b border-accent/10 text-accent/70 font-semibold whitespace-nowrap">
                  <th className="p-3">Grade</th>
                  <th className="p-3">Expérience</th>
                  <th className="p-3">TJ</th>
                  <th className="p-3 text-center">Autonome en mission</th>
                  <th className="p-3 text-center">Vente / Commercial</th>
                  <th className="p-3 text-center">Vie Logiclever</th>
                  <th className="p-3 text-center">Recrutement</th>
                  <th className="p-3 text-center">Encadrement</th>
                  <th className="p-3 text-right">Brut annuel<br /><span className="text-[10px] font-normal text-accent/50">(k€)</span></th>
                  <th className="p-3 text-right">Prix revient Logiclever<br /><span className="text-[10px] font-normal text-accent/50">(k€)</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-accent/5 text-accent whitespace-nowrap">
                <tr className="hover:bg-accent/[0.02] transition-colors">
                  <td className="p-3 font-bold text-accent">Junior</td>
                  <td className="p-3 text-accent/80">0 - 2 ans</td>
                  <td className="p-3 text-accent/80">&lt;= 530</td>
                  <td className="p-3 text-center font-bold text-primary">+</td>
                  <td className="p-3 text-center font-bold text-primary">+</td>
                  <td className="p-3 text-center font-bold text-primary">++</td>
                  <td className="p-3 text-center font-bold text-primary">++</td>
                  <td className="p-3 text-center text-accent/20"></td>
                  <td className="p-3 text-right font-semibold text-accent">39 → 45</td>
                  <td className="p-3 text-right text-accent/70">64 → 73</td>
                </tr>
                <tr className="hover:bg-accent/[0.02] transition-colors">
                  <td className="p-3 font-bold text-accent">Confirmé</td>
                  <td className="p-3 text-accent/80">2 - 5 ans</td>
                  <td className="p-3 text-accent/80">535 - 565</td>
                  <td className="p-3 text-center font-bold text-primary">++</td>
                  <td className="p-3 text-center font-bold text-primary">++</td>
                  <td className="p-3 text-center font-bold text-primary">+++</td>
                  <td className="p-3 text-center font-bold text-primary">++</td>
                  <td className="p-3 text-center text-accent/20"></td>
                  <td className="p-3 text-right font-semibold text-accent">46 → 50</td>
                  <td className="p-3 text-right text-accent/70">75 → 79</td>
                </tr>
                <tr className="hover:bg-accent/[0.02] transition-colors">
                  <td className="p-3 font-bold text-accent">Sénior</td>
                  <td className="p-3 text-accent/80">5 - 8 ans</td>
                  <td className="p-3 text-accent/80">570 - 645</td>
                  <td className="p-3 text-center font-bold text-primary">+++</td>
                  <td className="p-3 text-center font-bold text-primary">+++</td>
                  <td className="p-3 text-center font-bold text-primary">++</td>
                  <td className="p-3 text-center font-bold text-primary">++</td>
                  <td className="p-3 text-center font-bold text-primary">+</td>
                  <td className="p-3 text-right font-semibold text-accent">51 → 59</td>
                  <td className="p-3 text-right text-accent/70">82 → 93</td>
                </tr>
                <tr className="hover:bg-accent/[0.02] transition-colors">
                  <td className="p-3 font-bold text-accent">Expert</td>
                  <td className="p-3 text-accent/80">&gt; 8 ans</td>
                  <td className="p-3 text-accent/80">&gt;= 650</td>
                  <td className="p-3 text-center font-bold text-primary">++++</td>
                  <td className="p-3 text-center font-bold text-primary">+++</td>
                  <td className="p-3 text-center font-bold text-primary">++</td>
                  <td className="p-3 text-center font-bold text-primary">+++</td>
                  <td className="p-3 text-center font-bold text-primary">+++</td>
                  <td className="p-3 text-right font-semibold text-accent">&gt;60</td>
                  <td className="p-3 text-right text-accent/70">&gt;96</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="w-full">
              <div className="flex items-center justify-between mb-4 px-2">
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">TJ vendu au 01/07</label>
              </div>
              <input
                type="number"
                value={tjVendu || ''}
                readOnly
                className="w-full p-6 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight"
              />
            </div>

            <div className="w-full">
              <div className="flex items-center justify-between mb-4 px-2">
                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">Rémunération au 30/06</label>
              </div>
              <input
                type="number"
                value={currentSalary || ''}
                readOnly
                className="w-full p-6 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight"
              />
            </div>

            <div className="w-full" title="Le taux applicable pour les projections Vendu actuelles.">
              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4 px-2">Grade au 30/06</label>
              <select
                value={currentGrade}
                disabled
                className="w-full p-6 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight"
              >
                <option value="Junior">Junior</option>
                <option value="Confirmé">Confirmé</option>
                <option value="Senior">Senior</option>
                <option value="Expert">Expert</option>
              </select>
            </div>
        </div>

        <div className="bg-accent/5 p-8 rounded-2xl border border-accent/10 space-y-6 mt-10">
            <div className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4">Projections Salariales</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 items-end">
              <div className="w-full flex flex-col justify-between h-full">
                <div className="min-h-[44px] flex items-end mb-3 px-2">
                  <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] leading-snug">
                    <span>Je pense que LL peut me facturer (</span>
                    <a
                      id="link_tj_cible_calc"
                      href="https://docs.google.com/spreadsheets/d/1LatJvU7ZI5m6-is2oyVihfBSDqzJsdbvxL3pCMQhpJQ/edit?gid=872847313#gid=872847313"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-bold underline inline-flex items-center gap-0.5 hover:text-primary-dark px-1 py-0.5 rounded transition-all"
                    >
                      TJ cible
                      <ExternalLink className="w-2.5 h-2.5 inline" />
                    </a>
                    <span>) :</span>
                  </label>
                </div>
                <input
                  type="number"
                  min={0}
                  value={tjCible || ''}
                  onChange={e => {
                    const val = e.target.value === '' ? 0 : Math.max(0, Math.floor(Number(e.target.value)));
                    setTjCible(val);
                    setReportData?.(prev => ({ ...prev, targetTJM: val }));
                  }}
                  className="w-full h-[76px] p-6 bg-white rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight"
                />
              </div>

              <div className="w-full flex flex-col justify-between h-full" title="Le taux applicable dans la formule dépend de ce grade cible pour la promotion.">
                <div className="min-h-[44px] flex items-end mb-3 px-2">
                  <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] leading-snug">
                    Évolution de poste souhaitée (Grade)
                  </label>
                </div>
                <select
                  value={grade}
                  onChange={e => {
                    const value = e.target.value as Grade | 'Junior';
                    setGrade(value);
                    setReportData?.(prev => ({ ...prev, wishedGrade: value }));
                  }}
                  className="w-full h-[76px] p-6 bg-white rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight"
                >
                  {availableTargetGrades.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div className="w-full flex flex-col justify-between h-full">
                <div className="min-h-[44px] flex items-end mb-3 px-2">
                  <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] leading-snug">
                    % Investissement (0-100)
                  </label>
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={investPerc ?? ''}
                  onChange={e => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setInvestPerc(0);
                      return;
                    }
                    const val = Number(raw);
                    if (!isNaN(val)) setInvestPerc(val);
                  }}
                  onBlur={() => {
                    setInvestPerc(prev => Math.min(100, Math.max(0, prev || 0)));
                  }}
                  className="w-full h-[76px] p-6 bg-white rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight"
                />
              </div>

              <div className="w-full flex flex-col justify-between h-full">
                <div className="min-h-[44px] flex items-end mb-3 px-2">
                  <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] leading-snug">
                    % Mission (95-100)
                  </label>
                </div>
                <input
                  type="number"
                  min={95}
                  max={100}
                  step={1}
                  value={missionPerc ?? ''}
                  onChange={e => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setMissionPerc(95);
                      return;
                    }
                    const val = Number(raw);
                    if (!isNaN(val)) setMissionPerc(val);
                  }}
                  onBlur={() => {
                    setMissionPerc(prev => Math.min(100, Math.max(95, prev || 95)));
                  }}
                  className="w-full h-[76px] p-6 bg-white rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-white rounded-xl shadow-sm border border-accent/5 flex flex-col justify-between min-h-[76px]" title="Calcul Automatique : ((Taux Grade Actuel × 193 × TJ Vendu) - 6000 - Prime Ancienneté - (216 × 5.5)) / 1.45 / 1.01">
                <div className="text-[10px] font-black text-accent/40 uppercase mb-1">Salaire Vendu</div>
                <div className="text-lg font-bold text-accent">{formatCurrency(salaireVendu)}</div>
              </div>
              <div className="p-4 bg-white rounded-xl shadow-sm border border-accent/5 flex flex-col justify-between min-h-[76px]" title="Calcul Automatique : ((Taux Grade Cible × 193 × TJ Cible) - 6000 - Prime Ancienneté - (216 × 5.5)) / 1.45 / 1.01">
                <div className="text-[10px] font-black text-accent/40 uppercase mb-1">Salaire TJ Cible</div>
                <div className="text-lg font-bold text-accent">{formatCurrency(salaireCible)}</div>
              </div>
              <div className="p-4 bg-white rounded-xl shadow-sm border border-accent/5 flex flex-col justify-between min-h-[76px]" title="Calcul Automatique : ((Taux Grade Cible × 193 × (TJ Cible + 30)) - 6000 - Prime Ancienneté - (216 × 5.5)) / 1.45 / 1.01">
                <div className="text-[10px] font-black text-accent/40 uppercase mb-1">Max TJ Cible (100%)</div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(salaireCible100)}</div>
              </div>
            </div>

            <div className="p-6 bg-primary/10 rounded-xl border border-primary/20 flex flex-col items-center justify-center text-center mt-6 shadow-inner" title="Calcul Automatique : Max(Salaire Actuel, Formule1, Formule2) où FormuleX = (Pourcentage mission / 100) * ((Pourcentage investissement * (SalaireX 100% - SalaireX)) / 100 + SalaireX)">
              <div className="text-xs font-black uppercase text-primary/60 tracking-widest mb-2">Résultat Calcul</div>
              <div className="text-4xl font-black text-primary tracking-tighter">
                {formatCurrency(resFormule)}
              </div>
            </div>
          </div>

        <div className="w-full mt-10">
          <div className="flex items-center justify-between mb-4 px-2">
            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">
              Rémunération souhaitée Fixe :
            </label>
          </div>
          <input
            type="number"
            min={0}
            step={1}
            value={reportData.wishedSalary || ''}
            onChange={e => {
              const val = e.target.value === '' ? 0 : Math.max(0, Math.floor(Number(e.target.value)));
              setReportData?.(prev => ({ ...prev, wishedSalary: val }));
            }}
            className="w-full p-6 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight"
          />
        </div>

        {/* Commentaire libre */}
        <div className="pt-8 border-t border-accent/10 mt-10 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-secondary">Commentaire libre</h3>
            <p className="text-xs text-accent/70 font-medium mt-1">
              Vous pouvez ajouter ici un commentaire à l’attention du Jury des Salaires, si vous le jugez nécessaire.
            </p>
          </div>
          <textarea
            value={reportData.salaryExpectations || ''}
            onChange={e => setReportData?.(prev => ({ ...prev, salaryExpectations: e.target.value }))}
            placeholder="Écrivez votre commentaire libre ici..."
            className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium min-h-[120px] resize-y"
          />
        </div>

        {/* Rappel des règles principales liées à l’augmentation de salaire */}
        <div className="pt-8 border-t border-accent/10 mt-10">
          <div className="p-6 bg-accent/[0.02] border border-accent/10 rounded-xl space-y-4">
            <h4 className="text-sm font-bold text-secondary uppercase tracking-wider flex items-center gap-2">
              <Info className="w-4 h-4 text-primary shrink-0" />
              <span>Rappel des règles principales liées à l’augmentation de salaire :</span>
            </h4>
            <ul className="space-y-2.5 text-xs text-accent/80 font-medium leading-relaxed pl-5 list-disc">
              <li>
                L’augmentation se base principalement sur le TJ cible, le TJ vendu, l’investissement pour Logiclever et la satisfaction client.
              </li>
              <li>
                Le fait d’être encadré ou non n’influe pas sur l’augmentation (le TJ attendu tient compte d’un éventuel encadrement, si cet encadrement n’a pas ou n’a plus lieu, le montant correspondant part en bénéfices et donc sur le PEE mais pas en salaire).
              </li>
              <li>
                L'investissement est évalué en fonction du nombre de jours LL imputés dans l’année. Il est attendu que quelqu’un qui est en intercontrat, s’investisse à hauteur du nombre de jours d’intercontrat.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
