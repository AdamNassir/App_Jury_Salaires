import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calculator } from 'lucide-react';
import { NumberInput } from '../CandidateUI';
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
  const [tjCible, setTjCible] = useState<number>(reportData.targetTJM || profile.currentTJM || 0);
  
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
    setTjCible(reportData.targetTJM || profile.currentTJM || 0);
    setCurrentSalary(reportData.currentSalary || profile.currentSalary || 0);
  }, [profile.id, profile.currentGrade, profile.currentTJM, profile.currentSalary, reportData.currentGrade, reportData.wishedGrade, reportData.targetTJM]);

  useEffect(() => {
    setTjVendu(reportData.currentTJM || profile.currentTJM || 0);
    setTjCible(reportData.targetTJM || profile.currentTJM || 0);
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
        <div className="flex items-center gap-4 border-b border-accent/10 pb-6 mb-8">
          <div className="p-4 bg-primary/10 rounded-2xl">
            <Calculator className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-accent tracking-tighter">Calculette du salaire</h2>
          </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <div className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4">Valeurs de base (Modifiables)</div>
            
            <NumberInput label="TJ Vendu (€)" value={tjVendu} onChange={v => {
              const value = Math.max(0, v);
              setTjVendu(value);
              setReportData?.(prev => ({ ...prev, currentTJM: value }));
            }} min={0} />
            <NumberInput label="TJ Cible (€)" value={tjCible} onChange={v => {
              const value = Math.max(0, v);
              setTjCible(value);
              setReportData?.(prev => ({ ...prev, targetTJM: value }));
            }} min={0} />
            <NumberInput label="Salaire Actuel (€)" value={currentSalary} onChange={v => {
              const value = Math.max(0, v);
              setCurrentSalary(value);
              setReportData?.(prev => ({ ...prev, currentSalary: value }));
            }} min={0} />
            
            <div className="w-full" title="Le taux applicable pour les projections Vendu actuelles.">
              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4 px-2">Grade Actuel</label>
              <select
                value={currentGrade}
                onChange={e => {
                  const newCurrent = e.target.value as Grade | 'Junior';
                  setCurrentGrade(newCurrent);
                  if ((gradeHierarchy[grade] ?? 0) < (gradeHierarchy[newCurrent] ?? 0)) {
                    setGrade(newCurrent);
                  }
                  setReportData?.(prev => ({
                    ...prev,
                    currentGrade: newCurrent,
                    wishedGrade: (gradeHierarchy[prev.wishedGrade] ?? 0) < (gradeHierarchy[newCurrent] ?? 0)
                      ? newCurrent
                      : prev.wishedGrade
                  }));
                }}
                className="w-full p-6 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight"
              >
                <option value="Junior">Junior</option>
                <option value="Confirmé">Confirmé</option>
                <option value="Senior">Senior</option>
                <option value="Expert">Expert</option>
              </select>
            </div>

            <div className="w-full" title="Le taux applicable dans la formule dépend de ce grade cible pour la promotion.">
              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4 px-2">Grade Cible / Attendu</label>
              <select
                value={grade}
                onChange={e => {
                  const value = e.target.value as Grade | 'Junior';
                  setGrade(value);
                  setReportData?.(prev => ({ ...prev, wishedGrade: value }));
                }}
                className="w-full p-6 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight"
              >
                {availableTargetGrades.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            
            <NumberInput 
              label="% Investissement (0-100)" 
              value={investPerc} 
              onChange={v => setInvestPerc(Math.min(100, Math.max(0, v)))} 
              min={0} 
              max={100} 
              step={1} 
              tooltip="Taux entre 0% et 100%"
            />
            
            <NumberInput 
              label="% Mission (95-100)" 
              value={missionPerc} 
              onChange={v => setMissionPerc(Math.min(100, Math.max(95, v)))} 
              min={95} 
              max={100} 
              step={1} 
              tooltip="Taux de mission (recommandé entre 95% et 100%, cible 98%)"
            />
          </div>
          
          <div className="bg-accent/5 p-8 rounded-2xl border border-accent/10 h-fit space-y-8">
            <div className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4">Projections Salariales</div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-xl shadow-sm border border-accent/5" title="Calcul Automatique : ((Taux Grade Actuel × 193 × TJ Vendu) - 6000 - Prime Ancienneté - (216 × 5.5)) / 1.45 / 1.01">
                <div className="text-[10px] font-black text-accent/40 uppercase mb-1">Salaire Vendu</div>
                <div className="text-lg font-bold text-accent">{formatCurrency(salaireVendu)}</div>
              </div>
              <div className="p-4 bg-white rounded-xl shadow-sm border border-accent/5" title="Calcul Automatique : ((Taux Grade Actuel × 193 × (TJ Vendu + 30)) - 6000 - Prime Ancienneté - (216 × 5.5)) / 1.45 / 1.01">
                <div className="text-[10px] font-black text-accent/40 uppercase mb-1">Salaire Vendu (100%)</div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(salaireVendu100)}</div>
              </div>
              <div className="p-4 bg-white rounded-xl shadow-sm border border-accent/5" title="Calcul Automatique : ((Taux Grade Cible × 193 × TJ Cible) - 6000 - Prime Ancienneté - (216 × 5.5)) / 1.45 / 1.01">
                <div className="text-[10px] font-black text-accent/40 uppercase mb-1">Salaire TJ Cible</div>
                <div className="text-lg font-bold text-accent">{formatCurrency(salaireCible)}</div>
              </div>
              <div className="p-4 bg-white rounded-xl shadow-sm border border-accent/5" title="Calcul Automatique : ((Taux Grade Cible × 193 × (TJ Cible + 30)) - 6000 - Prime Ancienneté - (216 × 5.5)) / 1.45 / 1.01">
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
        </div>
      </div>
    </motion.div>
  );
}
