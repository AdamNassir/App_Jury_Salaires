import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dossier, UserProfile } from '../../types';
import { 
  optimize, 
  OptimizerUser, 
  Recommendation, 
  TARGET_M, 
  TARGET_I, 
  MIN_M, 
  MAX_M, 
  MIN_I, 
  MAX_I, 
  clamp,
  snapMission,
  snapInvestment
} from '../../lib/percentageOptimizer';
import { calculateSalaryFormule, getPrimeAnciennete, calculateYears } from '../../lib/salaryUtils';
import { formatCurrency, cn } from '../../lib/utils';
import { updateDoc, doc, serverTimestamp, db, writeBatch } from '../../lib/localDatabase';
import { seed50DummyUsers, clearDummyUsers } from '../../services/dummyUsersGenerator';
import { 
  Sliders, 
  X, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Sparkles,
  Loader2,
  Dices,
  Trash2,
  ChevronDown,
  ChevronUp,
  Activity
} from 'lucide-react';

interface OptimizerSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossiers: Dossier[];
  candidates: Record<string, UserProfile>;
}

export function OptimizerSuggestionsModal({
  isOpen,
  onClose,
  dossiers,
  candidates
}: OptimizerSuggestionsModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [dummyNotice, setDummyNotice] = useState<string | null>(null);
  const [showMatrixAnalysis, setShowMatrixAnalysis] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const hasDummyUsers = useMemo(() => {
    return dossiers.some(d => d.id.startsWith('DUMMY_DOS_'));
  }, [dossiers]);

  const handleGenerate50TestUsers = () => {
    const activeCampaignId = dossiers[0]?.campaignId || 'campaign_2025';
    const res = seed50DummyUsers(activeCampaignId);
    setDummyNotice(`50 utilisateurs de test générés aléatoirement (% Mission: 95-100%, % Investissement: 0-100%) !`);
    setTimeout(() => setDummyNotice(null), 4000);
  };

  const handleClearTestUsers = () => {
    const res = clearDummyUsers();
    setDummyNotice(`${res.removedDossiers} dossiers de test supprimés.`);
    setTimeout(() => setDummyNotice(null), 3500);
  };

  // 1. Build population from actual campaign dossiers & candidates with exact Salaire Formule constants
  const population: OptimizerUser[] = useMemo(() => {
    return dossiers
      .filter((dossier) => {
        // Exclude orphaned dossiers that don't correspond to any registered user
        const candidate = candidates[dossier.candidateId];
        return Boolean(candidate && (candidate.displayName || candidate.email));
      })
      .map((dossier) => {
        const candidate = candidates[dossier.candidateId]!;
        const name = candidate.displayName || candidate.email || 'Consultant';
        const matricule = candidate.matricule || '-';

      const currentM = snapMission(
        dossier.juryDecision?.missionPercentage ?? 98
      );
      const currentI = snapInvestment(
        dossier.juryDecision?.investmentPercentage ?? 60
      );

      // Compute exact Salaire Formule parameters a and b
      const effectiveGrade = candidate?.currentGrade || dossier.annualReport?.currentGrade || 'Junior';
      const entryDate = candidate?.entryDate;
      const expertGradeDate = candidate?.expertGradeDate;

      const yearsLL = candidate?.ancienneteLL !== undefined && candidate?.ancienneteLL !== null
        ? candidate.ancienneteLL
        : calculateYears(entryDate);

      const yearsExpert = candidate?.yearsExpert !== undefined && candidate?.yearsExpert !== null
        ? candidate.yearsExpert
        : (effectiveGrade === 'Expert' ? calculateYears(expertGradeDate) : 0);

      const prime = getPrimeAnciennete(yearsLL);

      const tjVendu = candidate?.currentTJM || dossier.annualReport?.currentTJM || 650;
      const tjCible = dossier.juryDecision?.tjCibleDecision || dossier.annualReport?.targetTJM || tjVendu;

      const targetGrade = dossier.annualReport?.wishedGrade || effectiveGrade;
      const targetYearsExpert = targetGrade === 'Expert' ? calculateYears(expertGradeDate) : 0;

      const salaireVendu = calculateSalaryFormule(tjVendu, effectiveGrade, yearsExpert, prime);
      const salaireVendu100 = calculateSalaryFormule(tjVendu + 30, effectiveGrade, yearsExpert, prime);

      const salaireCible = calculateSalaryFormule(tjCible, targetGrade, targetYearsExpert, prime);
      const salaireCible100 = calculateSalaryFormule(tjCible + 30, targetGrade, targetYearsExpert, prime);

      const b = Math.max(salaireCible, salaireVendu);
      const a = Math.max(salaireCible100, salaireVendu100);
      const currentSalary = candidate?.currentSalary || dossier.annualReport?.currentSalary || 0;

      return {
        id: candidate?.id || dossier.candidateId,
        name,
        mission: currentM,
        investment: currentI,
        m: currentM,
        i: currentI,
        dossierId: dossier.id,
        matricule,
        a,
        b,
        currentSalary,
      };
    });
  }, [dossiers, candidates]);

  // 2. Deterministic mathematical optimization
  const optimizationResult = useMemo(() => {
    return optimize(population);
  }, [population]);

  // Initialize selectedUserIds to include all recommendations by default whenever recommendations change
  useEffect(() => {
    if (optimizationResult.recommendations.length > 0) {
      setSelectedUserIds(new Set(optimizationResult.recommendations.map(r => r.id)));
    } else {
      setSelectedUserIds(new Set());
    }
  }, [optimizationResult.recommendations]);

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedUserIds.size === optimizationResult.recommendations.length) {
      // Deselect all
      setSelectedUserIds(new Set());
    } else {
      // Select all
      setSelectedUserIds(new Set(optimizationResult.recommendations.map(r => r.id)));
    }
  };

  // 3. Dynamic simulation based on checked / unchecked consultants
  const effectiveSimulation = useMemo(() => {
    const recs = optimizationResult.recommendations;
    if (recs.length === 0) {
      return {
        meanM: TARGET_M,
        meanI: TARGET_I,
        totalSalary: 0,
        oldTotalSalary: 0,
        selectedCount: 0,
        totalCount: 0,
      };
    }

    let sumM = 0;
    let sumI = 0;
    let sumSalary = 0;
    let sumOldSalary = 0;

    recs.forEach((rec) => {
      sumOldSalary += rec.originalSalary;
      const isSelected = selectedUserIds.has(rec.id);
      if (isSelected) {
        sumM += rec.newM;
        sumI += rec.newI;
        sumSalary += rec.newSalary;
      } else {
        // Keep original values if unchecked
        sumM += rec.oldM;
        sumI += rec.oldI;
        sumSalary += rec.originalSalary;
      }
    });

    return {
      meanM: sumM / recs.length,
      meanI: sumI / recs.length,
      totalSalary: sumSalary,
      oldTotalSalary: sumOldSalary,
      selectedCount: selectedUserIds.size,
      totalCount: recs.length,
    };
  }, [optimizationResult.recommendations, selectedUserIds]);

  // 4. Filtered recommendations
  const filteredRecommendations = useMemo(() => {
    if (!searchTerm.trim()) return optimizationResult.recommendations;
    const term = searchTerm.toLowerCase();
    return optimizationResult.recommendations.filter((rec) => {
      return (
        rec.name.toLowerCase().includes(term) ||
        (rec.matricule && rec.matricule.toLowerCase().includes(term))
      );
    });
  }, [optimizationResult.recommendations, searchTerm]);

  // Apply optimizations to selected dossiers only
  const handleApplyToDossiers = async () => {
    if (selectedUserIds.size === 0) return;
    setIsApplying(true);
    try {
      const batch = writeBatch(db);
      optimizationResult.recommendations.forEach((rec) => {
        if (!rec.dossierId || !selectedUserIds.has(rec.id)) return;
        const dossier = dossiers.find((d) => d.id === rec.dossierId);
        const existingDecision = dossier?.juryDecision || {};

        const dossierRef = doc(db, 'dossiers', rec.dossierId);
        batch.update(dossierRef, {
          juryDecision: {
            ...existingDecision,
            missionPercentage: Math.round(rec.newM),
            investmentPercentage: Math.round(rec.newI),
            updatedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      setApplySuccess(true);
      setTimeout(() => {
        setApplySuccess(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error("Erreur lors de l'application des ajustements:", err);
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="bg-white border border-accent/10 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-accent/10 flex items-center justify-between bg-accent/5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-secondary/10 rounded-xl text-secondary">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-accent">Ajustements Suggérés — % Mission & % Investissement</h2>
              <p className="text-xs text-accent/50 font-medium mt-0.5">
                Optimisation globale de la promotion vers les cibles moyennes ({TARGET_M}% Mission / {TARGET_I}% Investissement)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent/10 rounded-xl text-accent/40 hover:text-accent transition-all cursor-pointer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Averages & Salary Comparison Cards */}
        <div className="p-6 border-b border-accent/10 bg-white grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Mission Card */}
          <div className="p-4 rounded-xl border border-accent/10 bg-secondary/5 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black uppercase text-secondary tracking-widest mb-1">Moyenne Globale % Mission</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-accent tabular-nums">{Math.round(optimizationResult.oldMeanM)}%</span>
                <ArrowRight className="w-4 h-4 text-accent/40 inline" />
                <span className="text-2xl font-black text-secondary tabular-nums">
                  {effectiveSimulation.meanM.toFixed(1)}%
                </span>
              </div>
              <div className="text-[10px] text-accent/40 mt-1">
                {effectiveSimulation.selectedCount} / {effectiveSimulation.totalCount} consultant(s) inclus
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-accent/40">Cible</div>
              <div className="text-lg font-black text-accent/80 tabular-nums">{TARGET_M}%</div>
              <div className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block",
                Math.abs(effectiveSimulation.meanM - TARGET_M) < 0.05 
                  ? "bg-emerald-100 text-emerald-800" 
                  : "bg-amber-100 text-amber-800"
              )}>
                Δ {(effectiveSimulation.meanM - TARGET_M) > 0 ? '+' : ''}{(effectiveSimulation.meanM - TARGET_M).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Investment Card */}
          <div className="p-4 rounded-xl border border-accent/10 bg-primary/5 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Moyenne Globale % Investissement</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-accent tabular-nums">{Math.round(optimizationResult.oldMeanI)}%</span>
                <ArrowRight className="w-4 h-4 text-accent/40 inline" />
                <span className="text-2xl font-black text-primary tabular-nums">
                  {effectiveSimulation.meanI.toFixed(1)}%
                </span>
              </div>
              <div className="text-[10px] text-accent/40 mt-1">
                {effectiveSimulation.selectedCount} / {effectiveSimulation.totalCount} consultant(s) inclus
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-accent/40">Cible</div>
              <div className="text-lg font-black text-accent/80 tabular-nums">{TARGET_I}%</div>
              <div className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block",
                Math.abs(effectiveSimulation.meanI - TARGET_I) < 0.05 
                  ? "bg-emerald-100 text-emerald-800" 
                  : "bg-amber-100 text-amber-800"
              )}>
                Δ {(effectiveSimulation.meanI - TARGET_I) > 0 ? '+' : ''}{(effectiveSimulation.meanI - TARGET_I).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Salary Formula Total Card */}
          <div className="p-4 rounded-xl border border-accent/10 bg-accent/[0.03] flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black uppercase text-accent/50 tracking-widest mb-1">Masse Salaire Formule</div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-accent/70 tabular-nums">{formatCurrency(effectiveSimulation.oldTotalSalary)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-accent/40 inline" />
                <span className="text-xl font-black text-accent tabular-nums">{formatCurrency(effectiveSimulation.totalSalary)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-accent/40">Rétention Globale</div>
              <div className="text-lg font-black text-accent/80 tabular-nums">
                {effectiveSimulation.oldTotalSalary > 0
                  ? `${((effectiveSimulation.totalSalary / effectiveSimulation.oldTotalSalary) * 100).toFixed(1)}%`
                  : '100%'}
              </div>
              <div className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block",
                effectiveSimulation.totalSalary >= effectiveSimulation.oldTotalSalary
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-blue-100 text-blue-800"
              )}>
                {effectiveSimulation.totalSalary - effectiveSimulation.oldTotalSalary >= 0 ? '+' : ''}
                {formatCurrency(effectiveSimulation.totalSalary - effectiveSimulation.oldTotalSalary)}
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible Matrix Analysis */}
        <div className="border-b border-accent/10 bg-accent/[0.02]">
          <button
            type="button"
            onClick={() => setShowMatrixAnalysis(!showMatrixAnalysis)}
            className="w-full px-6 py-2.5 flex items-center justify-between text-xs font-bold text-accent/70 hover:text-accent hover:bg-accent/5 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span>Analyse Matricielle & PCA (Covariance, Valeurs & Vecteurs Propres)</span>
            </div>
            {showMatrixAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showMatrixAnalysis && (
            <div className="px-6 pb-4 pt-1 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-white rounded-xl border border-accent/10">
                <div className="text-[10px] font-black uppercase text-accent/40 mb-1">Matrice de Covariance Normalisée</div>
                <pre className="font-mono text-[11px] text-accent/80 bg-gray-50 p-2 rounded">
{`[
  ${optimizationResult.eigen.covariance[0][0].toFixed(6)}, ${optimizationResult.eigen.covariance[0][1].toFixed(6)}
  ${optimizationResult.eigen.covariance[1][0].toFixed(6)}, ${optimizationResult.eigen.covariance[1][1].toFixed(6)}
]`}
                </pre>
              </div>
              <div className="p-3 bg-white rounded-xl border border-accent/10">
                <div className="text-[10px] font-black uppercase text-accent/40 mb-1">Valeurs Propres (Eigenvalues)</div>
                <div className="font-mono text-[11px] text-accent/80 bg-gray-50 p-2 rounded space-y-1">
                  <div>λ1 = {optimizationResult.eigen.eigenvalues[0].toFixed(6)}</div>
                  <div>λ2 = {optimizationResult.eigen.eigenvalues[1].toFixed(6)}</div>
                </div>
              </div>
              <div className="p-3 bg-white rounded-xl border border-accent/10">
                <div className="text-[10px] font-black uppercase text-accent/40 mb-1">Vecteurs Propres (Eigenvectors)</div>
                <div className="font-mono text-[11px] text-accent/80 bg-gray-50 p-2 rounded space-y-1">
                  <div>q1 = [{optimizationResult.eigen.eigenvectors[0][0].toFixed(4)}, {optimizationResult.eigen.eigenvectors[0][1].toFixed(4)}]</div>
                  <div>q2 = [{optimizationResult.eigen.eigenvectors[1][0].toFixed(4)}, {optimizationResult.eigen.eigenvectors[1][1].toFixed(4)}]</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Search & Actions toolbar */}
        <div className="px-6 py-3 border-b border-accent/10 bg-gray-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent/30" />
            <input
              type="text"
              placeholder="Filtrer par nom ou matricule..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-accent/15 rounded-lg text-xs outline-none focus:border-secondary font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGenerate50TestUsers}
              title="Générer 50 utilisateurs de test avec valeurs complètement aléatoires (Mission 95-100%, Invest. 0-100%)"
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Dices className="w-3.5 h-3.5" />
              <span>{hasDummyUsers ? "Régénérer 50 aléatoires" : "Générer 50 utilisateurs de test"}</span>
            </button>

            {hasDummyUsers && (
              <button
                type="button"
                onClick={handleClearTestUsers}
                title="Supprimer les utilisateurs de test"
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Nettoyer tests</span>
              </button>
            )}

            <div className="h-4 w-px bg-accent/15 hidden sm:block" />

            <span className="text-xs text-accent/50 font-medium">
              {filteredRecommendations.length} consultant{filteredRecommendations.length > 1 ? 's' : ''} ({selectedUserIds.size} sélectionné{selectedUserIds.size > 1 ? 's' : ''})
            </span>

            <button
              type="button"
              onClick={handleApplyToDossiers}
              disabled={isApplying || applySuccess || selectedUserIds.size === 0}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer",
                applySuccess 
                  ? "bg-emerald-600 text-white" 
                  : "bg-secondary hover:bg-secondary/90 text-white disabled:opacity-50"
              )}
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Application...</span>
                </>
              ) : applySuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ajustements appliqués !</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Appliquer aux dossiers cochés ({selectedUserIds.size})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {dummyNotice && (
          <div className="px-6 py-2 bg-purple-100 border-b border-purple-200 text-purple-900 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-600" />
              <span>{dummyNotice}</span>
            </div>
            <button onClick={() => setDummyNotice(null)} className="text-purple-600 hover:text-purple-900 font-bold">×</button>
          </div>
        )}

        {/* Table of Suggested Users */}
        <div className="flex-1 overflow-y-auto p-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-accent/15 text-[10px] font-black uppercase text-accent/40 tracking-wider">
                <th className="pb-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      optimizationResult.recommendations.length > 0 &&
                      selectedUserIds.size === optimizationResult.recommendations.length
                    }
                    onChange={handleToggleAll}
                    title="Tout cocher / tout décocher"
                    className="w-4 h-4 rounded border-accent/20 text-secondary focus:ring-secondary/30 cursor-pointer"
                  />
                </th>
                <th className="pb-3 px-3">Rang</th>
                <th className="pb-3 px-3">Consultant</th>
                <th className="pb-3 px-3 text-center">% Mission Actuel</th>
                <th className="pb-3 px-3 text-center">% Mission Suggéré</th>
                <th className="pb-3 px-3 text-center border-r border-accent/10">Δ Mission</th>
                <th className="pb-3 px-3 text-center">% Invest. Actuel</th>
                <th className="pb-3 px-3 text-center">% Invest. Suggéré</th>
                <th className="pb-3 px-3 text-center border-r border-accent/10">Δ Invest.</th>
                <th className="pb-3 px-3 text-right">Salaire Formule (Avant → Nouveau)</th>
                <th className="pb-3 px-3 text-right">Rétention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/5 text-xs font-semibold text-accent">
              {filteredRecommendations.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-accent/50 text-sm">
                    Aucun consultant trouvé pour cette campagne.
                  </td>
                </tr>
              ) : (
                filteredRecommendations.map((rec, index) => {
                  const isChecked = selectedUserIds.has(rec.id);
                  const oldSalary = rec.originalSalary;
                  const newSalary = isChecked ? rec.newSalary : oldSalary;
                  const diffSalary = isChecked ? rec.salaryChange : 0;
                  const retentionPct = isChecked ? rec.salaryRetention * 100 : 100;

                return (
                  <tr 
                    key={rec.id} 
                    className={cn(
                      "transition-colors",
                      isChecked ? "hover:bg-accent/5" : "bg-accent/[0.02] opacity-50 hover:opacity-80"
                    )}
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleUser(rec.id)}
                        className="w-4 h-4 rounded border-accent/20 text-secondary focus:ring-secondary/30 cursor-pointer"
                      />
                    </td>

                    <td className="py-3 px-3 text-accent/30 font-bold tabular-nums">{index + 1}</td>
                    <td className="py-3 px-3 font-bold text-accent">
                      <div className="flex items-center gap-2">
                        <span>{rec.name}</span>
                        {!isChecked && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-accent/10 text-accent/60 font-normal">
                            Non ajusté
                          </span>
                        )}
                      </div>
                      {rec.matricule && rec.matricule !== '-' && (
                        <div className="text-[10px] text-accent/40 font-normal">{rec.matricule}</div>
                      )}
                    </td>

                    {/* M before */}
                    <td className="py-3 px-3 text-center tabular-nums text-accent/60">
                      {Math.round(rec.oldM)}%
                    </td>

                    {/* M after */}
                    <td className="py-3 px-3 text-center tabular-nums font-bold text-secondary">
                      {isChecked ? `${Math.round(rec.newM)}%` : `${Math.round(rec.oldM)}%`}
                    </td>

                    {/* M delta */}
                    <td className="py-3 px-3 text-center tabular-nums border-r border-accent/10">
                      {isChecked ? (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1",
                          rec.deltaM > 0 
                            ? "bg-emerald-50 text-emerald-700" 
                            : rec.deltaM < 0 
                              ? "bg-amber-50 text-amber-700" 
                              : "bg-gray-100 text-accent/50"
                        )}>
                          {rec.deltaM > 0 ? <TrendingUp className="w-3 h-3" /> : rec.deltaM < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {rec.deltaM > 0 ? `+${Math.round(rec.deltaM)}%` : `${Math.round(rec.deltaM)}%`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-accent/40 font-normal">0%</span>
                      )}
                    </td>

                    {/* I before */}
                    <td className="py-3 px-3 text-center tabular-nums text-accent/60">
                      {Math.round(rec.oldI)}%
                    </td>

                    {/* I after */}
                    <td className="py-3 px-3 text-center tabular-nums font-bold text-primary">
                      {isChecked ? `${Math.round(rec.newI)}%` : `${Math.round(rec.oldI)}%`}
                    </td>

                    {/* I delta */}
                    <td className="py-3 px-3 text-center tabular-nums border-r border-accent/10">
                      {isChecked ? (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1",
                          rec.deltaI > 0 
                            ? "bg-emerald-50 text-emerald-700" 
                            : rec.deltaI < 0 
                              ? "bg-amber-50 text-amber-700" 
                              : "bg-gray-100 text-accent/50"
                        )}>
                          {rec.deltaI > 0 ? <TrendingUp className="w-3 h-3" /> : rec.deltaI < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {rec.deltaI > 0 ? `+${Math.round(rec.deltaI)}%` : `${Math.round(rec.deltaI)}%`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-accent/40 font-normal">0%</span>
                      )}
                    </td>

                    {/* Salary Formula Recalculated */}
                    <td className="py-3 px-3 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1.5 font-bold">
                        {isChecked && Math.abs(diffSalary) > 1 && (
                          <span className="text-accent/50 text-[11px] line-through">{formatCurrency(oldSalary)}</span>
                        )}
                        {isChecked && Math.abs(diffSalary) > 1 && (
                          <ArrowRight className="w-3 h-3 text-accent/40" />
                        )}
                        <span className={isChecked ? "text-primary font-black" : "text-accent font-semibold"}>
                          {formatCurrency(newSalary)}
                        </span>
                      </div>
                      {isChecked && Math.abs(diffSalary) > 1 && (
                        <div className={cn(
                          "text-[10px] font-semibold mt-0.5",
                          diffSalary > 0 ? "text-emerald-600" : "text-amber-600"
                        )}>
                          {diffSalary > 0 ? `+${formatCurrency(diffSalary)}` : formatCurrency(diffSalary)}
                        </div>
                      )}
                    </td>

                    {/* Retention */}
                    <td className="py-3 px-3 text-right tabular-nums">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold inline-block",
                        !isChecked
                          ? "bg-gray-100 text-accent/50"
                          : retentionPct >= 99.9
                            ? "bg-emerald-50 text-emerald-700"
                            : retentionPct >= 95
                              ? "bg-blue-50 text-blue-700"
                              : retentionPct >= 90
                                ? "bg-amber-50 text-amber-700"
                                : "bg-rose-50 text-rose-700"
                      )}>
                        {retentionPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-accent/10 bg-accent/5 flex items-center justify-between text-xs text-accent/60">
          <div>
            Les ajustements minimisent la variance globale et appliquent une protection non linéaire sur les scores d'excellence.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-accent/15 rounded-xl font-bold hover:bg-gray-50 transition-all cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={handleApplyToDossiers}
              disabled={isApplying || applySuccess || selectedUserIds.size === 0}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer",
                applySuccess 
                  ? "bg-emerald-600 text-white" 
                  : "bg-secondary hover:bg-secondary/90 text-white disabled:opacity-50"
              )}
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Application...</span>
                </>
              ) : applySuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ajustements appliqués !</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Appliquer aux dossiers cochés ({selectedUserIds.size})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
