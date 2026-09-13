import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calculator } from 'lucide-react';
import { NumberInput } from '../CandidateUI';
import { UserProfile, Dossier, AnnualReport, Grade } from '../../../types';
import { formatCurrency } from '../../../lib/utils';
import { calculateYears, calculateSalaryFormule, getPrimeAnciennete } from '../../../lib/salaryUtils';

interface SalaryCalculatorTabProps {
  profile: UserProfile;
  dossier?: Dossier;
  reportData: AnnualReport;
}

export function SalaryCalculatorTab({ profile, reportData }: SalaryCalculatorTabProps) {
  const effectiveCurrent = (reportData.currentGrade || profile.currentGrade || 'Confirmé') as Grade | 'Junior';
  const effectiveWished = (reportData.wishedGrade || effectiveCurrent) as Grade | 'Junior';

  const [tjVendu, setTjVendu] = useState<number>(profile.currentTJM || 0);
  const [tjCible, setTjCible] = useState<number>(reportData.targetTJM || profile.currentTJM || 0);
  
  const [currentGrade, setCurrentGrade] = useState<Grade | 'Junior'>(effectiveCurrent);
  const [grade, setGrade] = useState<Grade | 'Junior'>(effectiveWished);
  const [currentSalary, setCurrentSalary] = useState<number>(profile.currentSalary || 0);
  
  const [investPerc, setInvestPerc] = useState<number>(60);
  const [missionPerc, setMissionPerc] = useState<number>(98);

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

  const currentGradeRank = gradeHierarchy[currentGrade] ?? 1;
  const availableTargetGrades = (['Junior', 'Confirmé', 'Senior', 'Expert'] as (Grade | 'Junior')[]).filter(
    g => (gradeHierarchy[g] ?? 0) >= currentGradeRank
  );

  const yearsLL = (profile.seniorityYears ?? Number.NaN);
  const targetYearsExpert = grade === 'Expert' ? (profile.expertYears ?? Number.NaN) : 0;
  const currentYearsExpert = currentGrade === 'Expert' ? (profile.expertYears ?? Number.NaN) : 0;
  const prime = getPrimeAnciennete(yearsLL);
  
  const salaireVendu = calculateSalaryFormule(tjVendu, currentGrade, currentYearsExpert, prime);
  const salaireVendu100 = calculateSalaryFormule(tjVendu + 30, currentGrade, currentYearsExpert, prime);
  
  const salaireCible = calculateSalaryFormule(tjCible, grade, targetYearsExpert, prime);
  const salaireCible100 = calculateSalaryFormule(tjCible + 30, grade, targetYearsExpert, prime);
  
  const calc1 = (missionPerc / 100) * (((investPerc * (salaireCible100 - salaireCible)) / 100) + salaireCible);
  const calc2 = (missionPerc / 100) * (((investPerc * (salaireVendu100 - salaireVendu)) / 100) + salaireVendu);
  
  let resFormule = currentSalary;
  if (currentSalary >= calc1 && currentSalary >= calc2) {
    resFormule = currentSalary;
  } else if (calc1 > currentSalary && calc1 <= calc2) {
    resFormule = calc1;
  } else if (calc2 > currentSalary && calc2 <= calc1) {
    resFormule = calc2;
  }

  if (![calc1, calc2].every(Number.isFinite) || profile.currentSalary === undefined || profile.currentTJM === undefined || !profile.currentGrade) {
    return <p className="rounded-xl border p-6">Calcul indisponible : compléter les données RH de la campagne (grade, salaire, TJ et ancienneté ; ancienneté expert si concerné). Aucune ancienneté n’est déduite de la date du jour.</p>;
  }
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <div className="bg-white p-8 rounded-xl border border-accent/10 shadow-lg">
        <div className="flex items-center gap-4 border-b border-accent/10 pb-6 mb-8">
          <div className="p-4 bg-primary/10 rounded-2xl">
            <Calculator className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-accent tracking-tighter">Calculette de Salaire</h2>
            <p className="text-accent/60 font-light text-sm">Simulatrice de rémunération globale (Formules Logiclever).</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <div className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4">Valeurs de base (Modifiables)</div>
            
            <NumberInput label="TJ Vendu (€)" value={tjVendu} onChange={setTjVendu} />
            <NumberInput label="TJ Cible (€)" value={tjCible} onChange={setTjCible} />
            <NumberInput label="Salaire Actuel (€)" value={currentSalary} onChange={setCurrentSalary} />
            
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
                onChange={e => setGrade(e.target.value as Grade | 'Junior')}
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
              onChange={setInvestPerc} 
              min={0} 
              max={100} 
              step={1} 
              tooltip="Taux entre 0% et 100%"
            />
            
            <NumberInput 
              label="% Mission (0-100)" 
              value={missionPerc} 
              onChange={setMissionPerc} 
              min={0} 
              max={100} 
              step={1} 
              tooltip="Taux entre 0% et 100%"
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
