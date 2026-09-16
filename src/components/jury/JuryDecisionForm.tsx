import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dossier, UserProfile, JuryDecision } from '../../types';
import { LocalDatabaseService } from '../../services/localDatabaseService';
import { Gavel, CheckCircle2 } from 'lucide-react';
import { cn, formatCurrency } from '../../lib/utils';
import { 
  calculateYears, 
  getPrimeAnciennete, 
  calculateSalaryFormule, 
  calculateMargin 
} from '../../lib/salaryUtils';


interface JuryDecisionFormProps {
  dossier: Dossier;
  candidate: UserProfile | null;
  onDone: () => void;
  referenceDate?: string | Date | null;
}

export function JuryDecisionForm({ 
  dossier, 
  candidate, 
  onDone,
  referenceDate
}: JuryDecisionFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<JuryDecision>>({
    verdict: dossier.juryDecision?.verdict || 'Favorable',
    amount: dossier.juryDecision?.amount || candidate?.currentSalary || 0,
    investmentPercentage: dossier.juryDecision?.investmentPercentage || 60,
    missionPercentage: dossier.juryDecision?.missionPercentage || 98,
    whyThisSalary: dossier.juryDecision?.whyThisSalary || '',
    whatToDoMore: dossier.juryDecision?.whatToDoMore || '',
    referentJury: dossier.juryDecision?.referentJury || '',
    consultantFeeling: dossier.juryDecision?.consultantFeeling || '',
    percentage: dossier.juryDecision?.percentage || 0,
    advice: dossier.juryDecision?.advice || '',
    conclusion: dossier.juryDecision?.conclusion || '',
    unanimous: dossier.juryDecision?.unanimous ?? true,
    maxSalaryIfTJIncreases: dossier.juryDecision?.maxSalaryIfTJIncreases
  });

  const isInitialMount = useRef(true);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timeoutId = setTimeout(() => {
      const decision: JuryDecision = {
        ...formData as JuryDecision,
        date: new Date().toISOString()
      };
      // 1. Mise à jour locale immédiate
      LocalDatabaseService.updateDossier(dossier.id, {
        juryDecision: decision,
        updatedAt: new Date().toISOString()
      });

    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [formData, dossier.id]);

  useEffect(() => {
    return () => {
      const decision: JuryDecision = {
        ...formDataRef.current as JuryDecision,
        date: new Date().toISOString()
      };
      // 1. Mise à jour locale immédiate
      LocalDatabaseService.updateDossier(dossier.id, {
        juryDecision: decision,
        updatedAt: new Date().toISOString()
      });

    };
  }, [dossier.id]);

  // Calculate values for display
  const refDate = referenceDate || dossier.annualReport?.wishedSalaryDate;
  const yearsLL = candidate?.entryDate ? calculateYears(candidate.entryDate, refDate) : null;
  const prime = getPrimeAnciennete(yearsLL);
  const tjVendu = candidate?.currentTJM || 0;
  const tjCible = dossier.annualReport?.targetTJM || 0;

  const resFormule = useMemo(() => {
    const currentSalary = candidate?.currentSalary || 0;
    const invest = formData.investmentPercentage || 60;
    const mission = formData.missionPercentage || 98;
    
    // For Vendu
    const yearsExpertVal = candidate?.currentGrade === 'Expert' ? (calculateYears(candidate.expertGradeDate, refDate) || 0) : 0;
    const salaireVendu = calculateSalaryFormule(tjVendu, candidate?.currentGrade || 'Junior', yearsExpertVal, prime);
    const salaireVendu100 = calculateSalaryFormule(tjVendu + 30, candidate?.currentGrade || 'Junior', yearsExpertVal, prime);

    // For Cible
    const targetGrade = dossier.annualReport?.wishedGrade || candidate?.currentGrade || 'Junior';
    const targetYearsExpert = targetGrade === 'Expert' ? (calculateYears(candidate?.expertGradeDate, refDate) || 0) : 0;
    const salaireCibleFinal = calculateSalaryFormule(tjCible, targetGrade, targetYearsExpert, prime);
    const salaireCible100 = calculateSalaryFormule(tjCible + 30, targetGrade, targetYearsExpert, prime);

    const calc1 = (mission / 100) * (((invest * (salaireCible100 - salaireCibleFinal)) / 100) + salaireCibleFinal);
    const calc2 = (mission / 100) * (((invest * (salaireVendu100 - salaireVendu)) / 100) + salaireVendu);
    
    if (currentSalary >= calc1 && currentSalary >= calc2) {
      return currentSalary;
    } else if (calc1 > currentSalary && calc1 <= calc2) {
      return Math.round(calc1);
    } else if (calc2 > currentSalary && calc2 <= calc1) {
      return Math.round(calc2);
    }
    return currentSalary;
  }, [candidate, formData.investmentPercentage, formData.missionPercentage, tjVendu, tjCible, prime, dossier.annualReport?.wishedGrade]);

  const marginPostJury = useMemo(() => {
    return calculateMargin(tjVendu, formData.amount || 0, prime);
  }, [tjVendu, formData.amount, prime]);

  const handleSubmit = async () => {
    if (!formData.unanimous) {
      alert('La décision doit être collective (unanime) pour être validée.');
      return;
    }
    setLoading(true);
    try {
      const decision: JuryDecision = {
        ...formData as JuryDecision,
        date: new Date().toISOString()
      };

      // 1. Sauvegarde locale immédiate
      LocalDatabaseService.updateDossier(dossier.id, {
        juryDecision: decision,
        status: 'VALIDE',
        updatedAt: new Date().toISOString()
      });


      alert('Décision entérinée ! Dossier clôturé.');
      onDone();
    } catch (error) {
      console.error(error);
      alert('Erreur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-accent/10 pt-12">
      <h3 className="text-secondary mb-10 flex items-center gap-4">
        <div className="w-12 h-12 bg-primary rounded-base flex items-center justify-center shadow-lg">
          <Gavel className="w-7 h-7 text-white" />
        </div>
        Verdict Final 2025
      </h3>

      <div className="space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <label className="text-[10px] font-black uppercase text-accent/30 tracking-[0.2em] mb-4 block px-2">Verdict Global</label>
            <div className="flex gap-3">
              {['Favorable', 'Réserve', 'Défavorable'].map(v => (
                <button
                   key={v}
                   onClick={() => setFormData({...formData, verdict: v})}
                   className={cn(
                     "flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all shadow-sm",
                     formData.verdict === v ? "bg-accent border-accent text-white shadow-accent/20" : "bg-white border-accent/10 text-accent/50 hover:border-secondary/50"
                   )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-4 cursor-pointer select-none bg-accent/5 p-4 rounded-xl border border-accent/10 hover:bg-white transition-colors group">
              <div className={cn(
                "w-7 h-7 rounded-base flex items-center justify-center border-2 transition-all",
                formData.unanimous ? "bg-primary border-primary" : "border-accent/20 bg-white group-hover:border-primary/50"
              )}>
                {formData.unanimous && <CheckCircle2 className="w-5 h-5 text-white" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden"
                checked={formData.unanimous}
                onChange={e => setFormData({...formData, unanimous: e.target.checked})}
              />
              <span className="text-xs font-black uppercase text-accent/60 tracking-[0.1em]">Décision Unanime de la Commission</span>
            </label>
          </div>
        </div>

        {/* Analytical Section */}
        <div className="bg-accent/5 p-8 rounded-2xl border border-accent/10 space-y-8">
          <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4">Analyse & Métriques Décisionnelles</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">% Investissement (base 60)</label>
              <input 
                type="number"
                className="w-full bg-white border border-accent/10 rounded-lg p-3 text-lg font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                value={formData.investmentPercentage || ''}
                onChange={e => setFormData({...formData, investmentPercentage: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">% Mission (base 98)</label>
              <input 
                type="number"
                className="w-full bg-white border border-accent/10 rounded-lg p-3 text-lg font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                value={formData.missionPercentage || ''}
                onChange={e => setFormData({...formData, missionPercentage: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">Référent Jury</label>
              <input 
                type="text"
                className="w-full bg-white border border-accent/10 rounded-lg p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                value={formData.referentJury || ''}
                onChange={e => setFormData({...formData, referentJury: e.target.value})}
                placeholder="Initiales..."
              />
            </div>
            <div className="bg-primary/10 p-4 rounded-xl border border-primary/10 flex flex-col justify-center" title="Calcul Automatique : Max(Salaire Actuel, Formule1, Formule2) où FormuleX = (Pourcentage mission / 100) * ((Pourcentage investissement * (SalaireX 100% - SalaireX)) / 100 + SalaireX)">
              <label className="text-[8px] font-black uppercase text-primary/60 tracking-widest mb-1">Salaire Formule RG</label>
              <div className="text-xl font-bold text-primary">{formatCurrency(resFormule)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">Pourquoi ce salaire ?</label>
              <textarea 
                className="w-full bg-white border border-accent/10 rounded-lg p-4 text-sm font-light h-24 outline-none focus:ring-2 focus:ring-primary/20 resize-none shadow-sm"
                value={formData.whyThisSalary}
                onChange={e => setFormData({...formData, whyThisSalary: e.target.value})}
                placeholder="Justification technique ou RH..."
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">Actions de progrès attendues</label>
              <textarea 
                className="w-full bg-white border border-accent/10 rounded-lg p-4 text-sm font-light h-24 outline-none focus:ring-2 focus:ring-primary/20 resize-none shadow-sm"
                value={formData.whatToDoMore}
                onChange={e => setFormData({...formData, whatToDoMore: e.target.value})}
                placeholder="Ce que le collaborateur doit faire de plus..."
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">Ressenti / Feeling Consultant</label>
              <input 
                 type="text"
                 className="w-full bg-white border border-accent/10 rounded-lg p-4 text-sm font-light outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
                 value={formData.consultantFeeling}
                 onChange={e => setFormData({...formData, consultantFeeling: e.target.value})}
                 placeholder="Commentaire sur l'état d'esprit..."
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">Salaire max proposé si augmentation TJ</label>
              <input 
                 type="number"
                 className="w-full bg-white border border-accent/10 rounded-lg p-4 text-sm font-light outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
                 value={formData.maxSalaryIfTJIncreases || ''}
                 onChange={e => {
                   const parsed = parseFloat(e.target.value);
                   setFormData({...formData, maxSalaryIfTJIncreases: isNaN(parsed) ? undefined : parsed});
                 }}
                 placeholder="Montant..."
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="md:col-span-1">
            <label className="text-[10px] font-black uppercase text-accent/30 tracking-[0.2em] mb-4 block px-2">Salaire Proposé (€)</label>
            <input 
              type="number"
              className="w-full bg-accent/5 border border-accent/10 rounded-xl p-6 text-2xl font-bold tracking-tight focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none shadow-inner"
              value={formData.amount || ''}
              onChange={e => {
                const amt = parseFloat(e.target.value) || 0;
                const current = candidate?.currentSalary || 0;
                const perc = current ? ((amt - current) / current) * 100 : 0;
                setFormData({...formData, amount: amt, percentage: parseFloat(perc.toFixed(1))});
              }}
            />
            <div className="mt-2 px-2 text-[10px] text-accent/40 italic">
              Actuel: {formatCurrency(candidate?.currentSalary || 0)}
            </div>
          </div>
          <div className="bg-secondary/5 p-6 rounded-xl border border-secondary/10 flex flex-col justify-center text-center">
            <div className="text-[9px] font-black text-secondary/60 uppercase tracking-widest mb-1">Marge Post-Jury</div>
            <div className={cn(
              "text-3xl font-bold tabular-nums",
              marginPostJury < 19.5 ? "text-red-500" : marginPostJury > 29 ? "text-green-600" : "text-secondary"
            )}>
              {marginPostJury.toFixed(1)}%
            </div>
          </div>
          <div className="bg-accent/5 p-6 rounded-xl border border-accent/10 flex flex-col justify-center text-center relative">
            <div className="text-[9px] font-black text-accent/30 uppercase tracking-widest mb-1">% Augmentation</div>
            <input 
              type="number"
              step="0.1"
              className="w-full bg-transparent text-3xl font-bold text-accent tabular-nums text-center outline-none focus:ring-2 focus:ring-primary/10 rounded"
              value={formData.percentage || 0}
              onChange={e => {
                const perc = parseFloat(e.target.value) || 0;
                const current = candidate?.currentSalary || 0;
                const amt = Math.round(current * (1 + perc / 100));
                setFormData({...formData, percentage: perc, amount: amt});
              }}
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase text-accent/30 tracking-[0.2em] mb-4 block px-2">Conseils d'Orientation & Conclusion (Lettre d'augmentation)</label>
          <textarea 
            className="w-full bg-accent/5 border border-accent/10 rounded-xl p-8 text-lg font-light min-h-[180px] outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 resize-none shadow-inner transition-all leading-relaxed"
            placeholder="Éléments de feedback consolidés..."
            value={formData.conclusion}
            onChange={e => setFormData({...formData, conclusion: e.target.value})}
          />
        </div>

        <button 
          onClick={handleSubmit}
          disabled={loading || !formData.unanimous}
          className="w-full bg-primary text-white py-6 rounded-xl font-black uppercase tracking-[0.3em] text-lg flex items-center justify-center gap-4 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed group shadow-2xl shadow-primary/30"
        >
          {loading ? "TRAITEMENT EN COURS..." : (
            <>
              SCELLER LA DÉCISION
              <CheckCircle2 className="w-6 h-6 group-hover:rotate-12 transition-transform" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
