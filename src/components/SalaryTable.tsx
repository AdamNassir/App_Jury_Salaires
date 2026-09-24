import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Dossier, UserProfile, Grade, JuryDecision, ConsultantFeedback, JuryMemberReview } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { 
  TrendingUp, 
  Calculator, 
  UserCheck, 
  AlertCircle, 
  Save, 
  Search, 
  FileSpreadsheet, 
  Loader2, 
  CheckCircle2, 
  ExternalLink, 
  RefreshCw,
  ChevronDown,
  ChevronRight,
  User,
  Users,
  Building2,
  Briefcase,
  Award,
  Lock,
  Percent,
  Sliders,
  Dices,
  Trash2
} from 'lucide-react';
import { updateDoc, doc, serverTimestamp } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { UserDirectoryService } from '../services/userDirectoryService';
import { seed50DummyUsers, clearDummyUsers } from '../services/dummyUsersGenerator';
import { 
  exportDeliberationsToGoogleSheet, 
  PREDEFINED_EXPORT_SPREADSHEET_ID, 
  DEFAULT_SHEET_TAB_NAME, 
  SheetExportResult 
} from '../services/googleSheetsService';
import { 
  calculateYears, 
  getPrimeAnciennete, 
  calculateSalaryFormule, 
  calculateMargin,
  getTauxGrade,
  resolveTargetGrade
} from '../lib/salaryUtils';
import { OptimizerSuggestionsModal } from './salary/OptimizerSuggestionsModal';

const sanitizeForStorage = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj._methodName || (obj.constructor && obj.constructor.name !== 'Object' && obj.constructor.name !== 'Array')) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForStorage);
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = sanitizeForStorage(value);
    } else {
      result[key] = null;
    }
  }
  return result;
};

interface SalaryTableProps {
  dossiers: Dossier[];
  candidates: Record<string, UserProfile>;
  referenceDate?: string | Date | null;
  profile?: UserProfile;
}

export function SalaryTable({ dossiers, candidates, referenceDate, profile }: SalaryTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});
  const [showOptimizerModal, setShowOptimizerModal] = useState(false);
  const [dummyNotice, setDummyNotice] = useState<string | null>(null);

  const hasDummyUsers = useMemo(() => {
    return dossiers.some(d => d.id.startsWith('DUMMY_DOS_'));
  }, [dossiers]);

  const toggleRow = (dossierId: string) => {
    setExpandedRowIds(prev => ({
      ...prev,
      [dossierId]: !prev[dossierId]
    }));
  };

  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<SheetExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Liste des membres du jury pour l'assignation rapide
  const juryMembers = useMemo(() => {
    return UserDirectoryService.getJuryMembers();
  }, []);

  // Fonction d'assignation directe d'un référent jury depuis le tableau
  const handleAssignReferent = async (dossierId: string, referentName: string) => {
    try {
      const dossierRef = doc(db, 'dossiers', dossierId);
      const dossier = dossiers.find(d => d.id === dossierId);
      const existingDecision = dossier?.juryDecision || {};

      await updateDoc(dossierRef, sanitizeForStorage({
        juryDecision: {
          ...existingDecision,
          referentJury: referentName,
          updatedAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      }));
    } catch (err) {
      console.error("Erreur lors de l'assignation du référent jury:", err);
    }
  };

  const handleExportToGoogleSheets = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportResult(null);
    try {
      const result = await exportDeliberationsToGoogleSheet(dossiers, candidates, undefined, DEFAULT_SHEET_TAB_NAME, referenceDate);
      setExportResult(result);
    } catch (err: any) {
      console.error("Erreur export Google Sheets:", err);
      setExportError(err.message || "Impossible d'exporter les données vers Google Sheets.");
    } finally {
      setIsExporting(false);
    }
  };

  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    } else if (sortConfig && sortConfig.key === key && sortConfig.direction === 'descending') {
      setSortConfig(null);
      return;
    }
    setSortConfig({ key, direction });
  };

  const renderSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <span className="ml-1 opacity-20 group-hover:opacity-100 transition-opacity">↕</span>;
    }
    return (
      <span className="ml-1 text-secondary font-black font-mono">
        {sortConfig.direction === 'ascending' ? '▲' : '▼'}
      </span>
    );
  };

  const tableData = useMemo(() => {
    // Deduplicate dossiers by candidateId to ensure one row per unique candidate
    const uniqueDossiers: Dossier[] = [];
    const dossiersByCandidate = new Map<string, Dossier[]>();
    
    dossiers.forEach(d => {
      if (!d.candidateId) return;
      if (!dossiersByCandidate.has(d.candidateId)) {
        dossiersByCandidate.set(d.candidateId, []);
      }
      dossiersByCandidate.get(d.candidateId)!.push(d);
    });

    for (const [candId, list] of dossiersByCandidate.entries()) {
      if (list.length === 1) {
        uniqueDossiers.push(list[0]);
      } else if (list.length > 1) {
        const sorted = [...list].sort((a, b) => {
          const aScore = (a.status === 'VALIDE' ? 3 : a.status === 'COMPLET' ? 2 : 1) + (a.juryDecision ? 2 : 0) + (a.id === `${candId}_2025` ? 1 : 0);
          const bScore = (b.status === 'VALIDE' ? 3 : b.status === 'COMPLET' ? 2 : 1) + (b.juryDecision ? 2 : 0) + (b.id === `${candId}_2025` ? 1 : 0);
          return bScore - aScore;
        });
        uniqueDossiers.push(sorted[0]);
      }
    }

    return uniqueDossiers.map(dossier => {
      const candidate = candidates[dossier.candidateId] ||
        (dossier.idProfil ? candidates[dossier.idProfil] : null) ||
        ({
          id: dossier.candidateId,
          idProfil: dossier.idProfil,
          displayName: dossier.candidateName,
          email: dossier.candidateEmail,
          currentGrade: dossier.annualReport?.currentGrade || 'Junior',
          currentSalary: dossier.annualReport?.currentSalary || 0,
          currentTJSalaire: dossier.annualReport?.currentTJSalaire || 0,
          currentTJM: dossier.annualReport?.currentTJM || 0,
          roles: ['CANDIDATE']
        } as UserProfile);

      const effectiveGrade = candidate.currentGrade || dossier.annualReport?.currentGrade || 'Junior';
      const entryDate = candidate.entryDate;
      const expertGradeDate = candidate.expertGradeDate;

      const yearsLL = candidate.ancienneteLL !== undefined && candidate.ancienneteLL !== null
        ? candidate.ancienneteLL
        : calculateYears(entryDate, referenceDate);

      const yearsExpert = candidate.yearsExpert !== undefined && candidate.yearsExpert !== null
        ? candidate.yearsExpert
        : (effectiveGrade === 'Expert' ? calculateYears(expertGradeDate, referenceDate) : 0);

      const prime = getPrimeAnciennete(yearsLL);

      // Calculations
      const tjSalaire = candidate.currentTJSalaire || dossier.annualReport?.currentTJSalaire || 0;
      const tjVendu = candidate.currentTJM || dossier.annualReport?.currentTJM || 0;
      const tjCible = dossier.annualReport?.targetTJM || 0;

      const salaireVendu = calculateSalaryFormule(tjVendu, effectiveGrade, yearsExpert, prime);
      const salaireVendu100 = calculateSalaryFormule(tjVendu + 30, effectiveGrade, yearsExpert, prime);
      
      const targetGrade = resolveTargetGrade(effectiveGrade, dossier.annualReport?.wishedGrade);
      const targetYearsExpert = targetGrade === 'Expert' ? calculateYears(expertGradeDate, referenceDate) : 0;

      const salaireCible = calculateSalaryFormule(tjCible, targetGrade, targetYearsExpert, prime);
      const salaireCible100 = calculateSalaryFormule(tjCible + 30, targetGrade, targetYearsExpert, prime);

      const currentSalary = candidate.currentSalary || dossier.annualReport?.currentSalary || 0;
      const realMargin = calculateMargin(tjVendu, currentSalary, prime);

      // Jury Decision Data
      const decision = (dossier.juryDecision || {}) as JuryDecision;
      const proposedSalary = decision.amount || 0;
      
      const marginPostJury = calculateMargin(tjVendu, proposedSalary, prime);

      // Logic for Salaire Formule Result
      const invest = decision.investmentPercentage ?? 60;
      const mission = decision.missionPercentage ?? 98;
      
      const calc1 = (mission / 100) * (((invest * (salaireCible100 - salaireCible)) / 100) + salaireCible);
      const calc2 = (mission / 100) * (((invest * (salaireVendu100 - salaireVendu)) / 100) + salaireVendu);
      
      let resFormule = currentSalary;
      if (currentSalary >= calc1 && currentSalary >= calc2) {
        resFormule = currentSalary;
      } else if (calc1 > currentSalary && calc1 <= calc2) {
        resFormule = calc1;
      } else if (calc2 > currentSalary && calc2 <= calc1) {
        resFormule = calc2;
      }

      // Feedbacks des évaluateurs pairs
      const rawFeedbacks = Object.values(dossier.consultantFeedbacks || {}) as ConsultantFeedback[];
      const evaluatorFeedbacks = rawFeedbacks.filter(f => {
        const hasTj = (f.targetTJMin && f.targetTJMin > 0) || (f.targetTJMax && f.targetTJMax > 0);
        const hasJustif = (f.justification && f.justification.trim().length > 0) || (f.improvementAxes && f.improvementAxes.trim().length > 0);
        return hasTj || hasJustif || f.status === 'VALIDE' || f.validated;
      });

      // Avis des autres membres du jury
      const otherJuryReviews: JuryMemberReview[] = Object.entries(dossier.juryMemberReviews || {})
        .filter(([key, rev]) => {
          const isCurrentUser = profile && (
            key === profile.id || 
            key === profile.idProfil || 
            (profile.email && key.toLowerCase() === profile.email.toLowerCase()) ||
            (rev.juryUid && rev.juryUid === profile.id) ||
            (rev.juryEmail && profile.email && rev.juryEmail.toLowerCase() === profile.email.toLowerCase())
          );
          return !isCurrentUser && (rev.whyThisSalary || rev.whatToDoMore);
        })
        .map(([_, rev]) => rev);

      const totalSublines = evaluatorFeedbacks.length + otherJuryReviews.length;

      // Écart entre ce qui a été proposé au candidat et la formule (calculette du salaire)
      const effectiveProposed = decision.amount || currentSalary;
      const diffFormule = effectiveProposed - resFormule;

      return {
        dossier,
        candidate,
        yearsLL,
        yearsExpert,
        prime,
        tjSalaire,
        tjVendu,
        salaireVendu,
        salaireVendu100,
        tjCible,
        salaireCible,
        salaireCible100,
        currentSalary,
        realMargin,
        resFormule,
        diffFormule,
        marginPostJury,
        decision,
        evaluatorFeedbacks,
        otherJuryReviews,
        totalSublines
      };
    }).filter(item => {
      if (!item) return false;
      const search = searchTerm.toLowerCase();
      return (
        item.candidate.displayName.toLowerCase().includes(search) ||
        item.candidate.matricule?.toLowerCase().includes(search) ||
        (item.decision.whyThisSalary && item.decision.whyThisSalary.toLowerCase().includes(search)) ||
        (item.decision.whatToDoMore && item.decision.whatToDoMore.toLowerCase().includes(search)) ||
        item.evaluatorFeedbacks.some(f => f.consultantName?.toLowerCase().includes(search) || f.justification?.toLowerCase().includes(search)) ||
        item.otherJuryReviews.some(r => r.juryName?.toLowerCase().includes(search) || r.whyThisSalary?.toLowerCase().includes(search))
      );
    });
  }, [dossiers, candidates, searchTerm, referenceDate, profile]);

  // Moyennes calculées directement à partir des dossiers affichés dans la table
  const globalMetrics = useMemo(() => {
    if (!dossiers || dossiers.length === 0) {
      return {
        avgMission: 98,
        avgInvestment: 60,
        totalCount: 0
      };
    }

    let sumMission = 0;
    let sumInvestment = 0;

    dossiers.forEach(d => {
      const m = d.juryDecision?.missionPercentage;
      const i = d.juryDecision?.investmentPercentage;
      sumMission += (m !== undefined && m !== null && Number.isFinite(Number(m))) ? Number(m) : 98;
      sumInvestment += (i !== undefined && i !== null && Number.isFinite(Number(i))) ? Number(i) : 60;
    });

    return {
      avgMission: parseFloat((sumMission / dossiers.length).toFixed(1)),
      avgInvestment: parseFloat((sumInvestment / dossiers.length).toFixed(1)),
      totalCount: dossiers.length
    };
  }, [dossiers]);

  const sortedTableData = useMemo(() => {
    if (!sortConfig) return tableData;

    return [...tableData].sort((a: any, b: any) => {
      let aVal: any = null;
      let bVal: any = null;

      switch (sortConfig.key) {
        case 'matricule':
          aVal = a.candidate.matricule || '';
          bVal = b.candidate.matricule || '';
          break;
        case 'displayName':
          aVal = a.candidate.displayName || '';
          bVal = b.candidate.displayName || '';
          break;
        case 'experienceYears':
          aVal = a.candidate.experienceYears || 0;
          bVal = b.candidate.experienceYears || 0;
          break;
        case 'entryDate':
          aVal = a.candidate.entryDate || '';
          bVal = b.candidate.entryDate || '';
          break;
        case 'expertGradeDate':
          aVal = a.candidate.expertGradeDate || '';
          bVal = b.candidate.expertGradeDate || '';
          break;
        case 'yearsLL':
          aVal = a.yearsLL || 0;
          bVal = b.yearsLL || 0;
          break;
        case 'yearsExpert':
          aVal = a.yearsExpert || 0;
          bVal = b.yearsExpert || 0;
          break;
        case 'currentGrade':
          aVal = a.candidate.currentGrade || 'Junior';
          bVal = b.candidate.currentGrade || 'Junior';
          break;
        case 'tjVendu':
          aVal = a.tjVendu || 0;
          bVal = b.tjVendu || 0;
          break;
        case 'salaireVendu':
          aVal = a.salaireVendu || 0;
          bVal = b.salaireVendu || 0;
          break;
        case 'salaireVendu100':
          aVal = a.salaireVendu100 || 0;
          bVal = b.salaireVendu100 || 0;
          break;
        case 'tjCible':
          aVal = a.tjCible || 0;
          bVal = b.tjCible || 0;
          break;
        case 'salaireCible':
          aVal = a.salaireCible || 0;
          bVal = b.salaireCible || 0;
          break;
        case 'salaireCible100':
          aVal = a.salaireCible100 || 0;
          bVal = b.salaireCible100 || 0;
          break;
        case 'currentSalary':
          aVal = a.currentSalary || 0;
          bVal = b.currentSalary || 0;
          break;
        case 'realMargin':
          aVal = a.realMargin || 0;
          bVal = b.realMargin || 0;
          break;
        case 'wishedSalary':
          aVal = a.dossier.annualReport?.wishedSalary || 0;
          bVal = b.dossier.annualReport?.wishedSalary || 0;
          break;
        case 'wishedGrade':
          aVal = a.dossier.annualReport?.wishedGrade || '';
          bVal = b.dossier.annualReport?.wishedGrade || '';
          break;
        case 'wishedMargin':
          aVal = calculateMargin(a.tjVendu, a.dossier.annualReport?.wishedSalary || 0, a.prime);
          bVal = calculateMargin(b.tjVendu, b.dossier.annualReport?.wishedSalary || 0, b.prime);
          break;
        case 'investmentPercentage':
          aVal = a.decision.investmentPercentage ?? 60;
          bVal = b.decision.investmentPercentage ?? 60;
          break;
        case 'missionPercentage':
          aVal = a.decision.missionPercentage ?? 98;
          bVal = b.decision.missionPercentage ?? 98;
          break;
        case 'proposedSalary':
          aVal = a.decision.amount || a.currentSalary;
          bVal = b.decision.amount || b.currentSalary;
          break;
        case 'prime':
          aVal = a.prime || 0;
          bVal = b.prime || 0;
          break;
        case 'percentage':
          aVal = a.decision.amount ? (((a.decision.amount - a.currentSalary) / a.currentSalary) * 100) : 0;
          bVal = b.decision.amount ? (((b.decision.amount - b.currentSalary) / b.currentSalary) * 100) : 0;
          break;
        case 'marginPostJury':
          aVal = a.marginPostJury || 0;
          bVal = b.marginPostJury || 0;
          break;
        case 'resFormule':
          aVal = a.resFormule || 0;
          bVal = b.resFormule || 0;
          break;
        case 'diffFormule':
          aVal = a.diffFormule || 0;
          bVal = b.diffFormule || 0;
          break;
        case 'maxSalaryIfTJIncreases':
          aVal = a.decision.maxSalaryIfTJIncreases || 0;
          bVal = b.decision.maxSalaryIfTJIncreases || 0;
          break;
        case 'referentJury':
          aVal = a.decision.referentJury || '';
          bVal = b.decision.referentJury || '';
          break;
        case 'whyThisSalary':
          aVal = a.decision.whyThisSalary || '';
          bVal = b.decision.whyThisSalary || '';
          break;
        case 'whatToDoMore':
          aVal = a.decision.whatToDoMore || '';
          bVal = b.decision.whatToDoMore || '';
          break;
        default:
          return 0;
      }

      if (aVal < bVal) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aVal > bVal) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  }, [tableData, sortConfig]);

  const startEditing = (item: any) => {
    const decision = item.decision as JuryDecision;
    setEditingId(item.dossier.id);
    setEditValues({
      amount: decision.amount || item.currentSalary,
      verdict: decision.verdict || 'Favorable',
      investmentPercentage: decision.investmentPercentage ?? 60,
      missionPercentage: decision.missionPercentage ?? 98,
      whyThisSalary: decision.whyThisSalary || '',
      whatToDoMore: decision.whatToDoMore || '',
      referentJury: decision.referentJury || '',
      consultantFeeling: decision.consultantFeeling || '',
      maxSalaryIfTJIncreases: decision.maxSalaryIfTJIncreases,
    });
  };

  const saveEdits = async () => {
    if (!editingId) return;
    try {
      const dossierRef = doc(db, 'dossiers', editingId);
      const dossier = dossiers.find(d => d.id === editingId);
      const candidate = candidates[dossier?.candidateId || ''];
      const existingDecision = dossier?.juryDecision || {};

      // Ensure percentage is saved correctly if amount changed
      let finalValues = { ...editValues };
      if (candidate && finalValues.amount !== undefined) {
        const current = candidate.currentSalary || 0;
        const rawPerc = current ? ((finalValues.amount - current) / current) * 100 : 0;
        finalValues.percentage = parseFloat(Math.min(100, Math.max(0, rawPerc)).toFixed(1));
      }
      if (finalValues.investmentPercentage !== undefined) {
        finalValues.investmentPercentage = Math.round(Math.min(100, Math.max(0, finalValues.investmentPercentage)));
      }
      if (finalValues.missionPercentage !== undefined) {
        finalValues.missionPercentage = Math.round(Math.min(100, Math.max(95, finalValues.missionPercentage)));
      }
      if (finalValues.amount !== undefined) {
        finalValues.amount = Math.max(0, finalValues.amount);
      }
      if (finalValues.maxSalaryIfTJIncreases !== undefined) {
        finalValues.maxSalaryIfTJIncreases = Math.max(0, finalValues.maxSalaryIfTJIncreases);
      }

      await updateDoc(dossierRef, sanitizeForStorage({
        juryDecision: {
          ...existingDecision,
          ...finalValues,
          updatedAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      }));
      setEditingId(null);
    } catch (error) {
      console.error(error);
      alert('Erreur lors de la sauvegarde');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-accent/30" />
          <input 
            type="text"
            placeholder="Rechercher un matricule ou nom..."
            className="w-full pl-12 pr-6 py-3 bg-white border border-accent/10 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 transition-all font-light"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Action Button: Destination is predetermined and handled by code */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Indicateurs Moyennes Globales Jury - cliquables pour afficher les ajustements suggérés */}
          <div 
            onClick={() => setShowOptimizerModal(true)}
            role="button"
            tabIndex={0}
            title="Cliquer pour afficher les ajustements suggérés par consultant"
            className="flex items-center gap-3 bg-white hover:bg-secondary/5 px-4 py-2 rounded-xl border border-accent/10 shadow-xs cursor-pointer transition-all group"
          >
            <Percent className="w-4 h-4 text-secondary shrink-0 group-hover:scale-110 transition-transform" />
            <div className="flex items-center gap-4 text-xs font-semibold">
              <div 
                className="flex items-center gap-1.5" 
                title="Moyenne globale du % Mission sur l'ensemble des dossiers (Cible par défaut : 98%)"
              >
                <span className="text-[10px] uppercase font-bold text-accent/50 tracking-wider">Moy. % Mission :</span>
                <span className={cn(
                  "px-2 py-0.5 rounded-full font-black text-xs tabular-nums",
                  Math.abs(globalMetrics.avgMission - 98) <= 0.3
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : Math.abs(globalMetrics.avgMission - 98) <= 1.0
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                )}>
                  {globalMetrics.avgMission}% <span className="text-[9px] font-normal opacity-60">/ 98%</span>
                </span>
              </div>

              <div className="h-4 w-px bg-accent/10" />

              <div 
                className="flex items-center gap-1.5"
                title="Moyenne globale du % Investissement sur l'ensemble des dossiers (Cible par défaut : 60%)"
              >
                <span className="text-[10px] uppercase font-bold text-accent/50 tracking-wider">Moy. % Invest. :</span>
                <span className={cn(
                  "px-2 py-0.5 rounded-full font-black text-xs tabular-nums",
                  Math.abs(globalMetrics.avgInvestment - 60) <= 3
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : Math.abs(globalMetrics.avgInvestment - 60) <= 6
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                )}>
                  {globalMetrics.avgInvestment}% <span className="text-[9px] font-normal opacity-60">/ 60%</span>
                </span>
              </div>
            </div>
            
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-black uppercase text-secondary bg-secondary/10 px-2 py-1 rounded-md ml-1 group-hover:bg-secondary group-hover:text-white transition-all">
              <Sliders className="w-3 h-3" />
              <span>Ajustements</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowOptimizerModal(true)}
            title="Afficher les ajustements suggérés par consultant"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-secondary text-white hover:bg-secondary/90 rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            <Sliders className="w-4 h-4" />
            <span>Ajustements suggérés</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const activeCampaignId = dossiers[0]?.campaignId || 'campaign_2025';
              const res = seed50DummyUsers(activeCampaignId);
              setDummyNotice(`50 utilisateurs de test générés avec succès (${res.dossierCount} dossiers) avec % Mission ∈ [95%, 100%]`);
              setTimeout(() => setDummyNotice(null), 4000);
            }}
            title="Générer 50 utilisateurs de test (Mission 95-100%, Invest. 0-100%)"
            className="flex items-center justify-center gap-2 px-3.5 py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl font-bold text-xs shadow-xs transition-all active:scale-[0.98] cursor-pointer"
          >
            <Dices className="w-4 h-4" />
            <span>{hasDummyUsers ? "Régénérer 50 aléatoires" : "Générer 50 tests"}</span>
          </button>

          {hasDummyUsers && (
            <button
              type="button"
              onClick={() => {
                const res = clearDummyUsers();
                setDummyNotice(`${res.removedDossiers} dossiers de test supprimés.`);
                setTimeout(() => setDummyNotice(null), 3500);
              }}
              title="Supprimer les 50 utilisateurs de test"
              className="flex items-center justify-center gap-1.5 px-3 py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold text-xs shadow-xs transition-all active:scale-[0.98] cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Nettoyer tests</span>
            </button>
          )}

          <button
            onClick={handleExportToGoogleSheets}
            disabled={isExporting}
            title="Exporter dans votre dossier Google Drive (Délibérations_Jury)"
            className="flex items-center justify-center gap-2.5 px-5 py-3 bg-[#0F9D58] hover:bg-[#0B8043] text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Exportation vers Google Drive...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Exporter vers Google Sheet</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Export notification status */}
      {exportResult && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>{exportResult.rowsExported} délibérations</strong> exportées avec succès dans votre dossier Google Drive à {exportResult.timestamp}.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a 
              href="https://drive.google.com/drive/folders/1BHFi8Z_0K1tTUalK6BKC-B4eXh6PLOx5"
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-bold text-emerald-800 hover:text-emerald-950 underline shrink-0"
            >
              <span>Ouvrir le dossier Drive</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a 
              href={exportResult.sheetUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-bold text-emerald-700 hover:text-emerald-900 underline ml-2 shrink-0"
            >
              <span>Ouvrir le classeur Sheet</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {dummyNotice && (
        <div className="p-4 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl flex items-center justify-between text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
            <span>{dummyNotice}</span>
          </div>
          <button 
            onClick={() => setDummyNotice(null)}
            className="text-purple-600 hover:text-purple-900 font-bold ml-4 cursor-pointer text-base"
          >
            ×
          </button>
        </div>
      )}

      {exportError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{exportError}</span>
          </div>
          <button 
            onClick={handleExportToGoogleSheets}
            className="flex items-center gap-1 font-bold text-red-700 hover:text-red-900 underline ml-4 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Réessayer</span>
          </button>
        </div>
      )}

      <div className="overflow-x-auto bg-white border border-accent/10 rounded-2xl shadow-2xl relative custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[3000px]">
          <thead>
            {/* Main Header Logic Zones */}
            <tr className="bg-accent text-white text-[10px] font-black uppercase tracking-widest text-center">
              <th className="py-2 px-2 border-r border-white/10 w-10"></th>
              <th colSpan={8} className="py-2 border-r border-white/10">Données de référence</th>
              <th colSpan={7} className="py-2 border-r border-white/10">RG Logiclever (Formule)</th>
              <th colSpan={2} className="py-2 border-r border-white/10">Réel au 30/06</th>
              <th colSpan={3} className="py-2 border-r border-white/10">Souhait Consultant</th>
              <th colSpan={2} className="py-2 border-r border-white/10">Délibération Métriques</th>
              <th colSpan={11} className="py-2">Décision Jury</th>
            </tr>
            <tr className="bg-accent/5 text-[9px] font-black text-accent/50 border-b border-accent/10 uppercase tracking-tighter">
              {/* Expand column */}
              <th className="p-3 sticky left-0 bg-white z-20 w-10 text-center"></th>

              {/* Reference */}
              <th onClick={() => requestSort('matricule')} className="p-4 sticky left-10 bg-white z-20 min-w-[80px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi dans l'administration (Profil Utilisateur)">Matricule {renderSortIndicator('matricule')}</th>
              <th onClick={() => requestSort('displayName')} className="p-4 sticky left-[120px] bg-white z-20 min-w-[170px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi dans l'administration (Profil Utilisateur)">Collaborateur {renderSortIndicator('displayName')}</th>
              <th onClick={() => requestSort('referentJury')} className="p-4 min-w-[140px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le Jury : Référent Jury assigné au dossier">Référent Jury {renderSortIndicator('referentJury')}</th>
              <th onClick={() => requestSort('experienceYears')} className="p-4 min-w-[60px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Expérience initiale (Saisie dans l'administration)">Exp. {renderSortIndicator('experienceYears')}</th>
              <th onClick={() => requestSort('entryDate')} className="p-4 min-w-[100px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisie dans l'administration">Entrée LL {renderSortIndicator('entryDate')}</th>
              <th onClick={() => requestSort('expertGradeDate')} className="p-4 min-w-[100px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisie dans l'administration">Expert Grade {renderSortIndicator('expertGradeDate')}</th>
              <th onClick={() => requestSort('yearsLL')} className="p-4 min-w-[80px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Issu du fichier Analyse_Jury (Col G : Ancienneté LL)">Ancien. LL {renderSortIndicator('yearsLL')}</th>
              <th onClick={() => requestSort('yearsExpert')} className="p-4 min-w-[80px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Issu du fichier Analyse_Jury (Col H : Années Exp. si Expert)">Années Exp. {renderSortIndicator('yearsExpert')}</th>
              <th onClick={() => requestSort('currentGrade')} className="p-4 min-w-[100px] border-r border-accent/10 cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi dans l'administration">Grade {renderSortIndicator('currentGrade')}</th>
              
              {/* RG Logiclever */}
              <th className="p-4 min-w-[80px] text-center" title="Issu du Rapport RH (Col AE)">TJ Salaire</th>
              <th onClick={() => requestSort('tjVendu')} className="p-4 min-w-[80px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Issu du Rapport RH (Col AF : TJ Vendu)">TJ Vendu {renderSortIndicator('tjVendu')}</th>
              <th onClick={() => requestSort('salaireVendu')} className="p-4 min-w-[100px] text-right cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : (((Taux Grade * 193 * TJ Vendu) - 6000 - Prime Ancienneté - (216 * 5.5)) / 1.45) / 1.01">Salaire Vendu {renderSortIndicator('salaireVendu')}</th>
              <th onClick={() => requestSort('salaireVendu100')} className="p-4 min-w-[120px] text-right cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : (((Taux Grade * 193 * (TJ Vendu + 30)) - 6000 - Prime Ancienneté - (216 * 5.5)) / 1.45) / 1.01">Salaire Vendu 100% {renderSortIndicator('salaireVendu100')}</th>
              <th onClick={() => requestSort('tjCible')} className="p-4 min-w-[80px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le candidat dans son dossier (Prétentions)">TJ Cible {renderSortIndicator('tjCible')}</th>
              <th onClick={() => requestSort('salaireCible')} className="p-4 min-w-[100px] text-right cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : (((Taux Grade Souhaité * 193 * TJ Cible) - 6000 - Prime Ancienneté - (216 * 5.5)) / 1.45) / 1.01">Salaire Cible {renderSortIndicator('salaireCible')}</th>
              <th onClick={() => requestSort('salaireCible100')} className="p-4 min-w-[120px] text-right border-r border-accent/10 cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : (((Taux Grade Souhaité * 193 * (TJ Cible + 30)) - 6000 - Prime Ancienneté - (216 * 5.5)) / 1.45) / 1.01">Salaire Cible 100% {renderSortIndicator('salaireCible100')}</th>

              {/* Real Situation */}
              <th onClick={() => requestSort('currentSalary')} className="p-4 min-w-[100px] text-right cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi dans l'administration">Salaire Actuel {renderSortIndicator('currentSalary')}</th>
              <th onClick={() => requestSort('realMargin')} className="p-4 min-w-[100px] text-center border-r border-accent/10 cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : ((TJ Vendu - Cout Journalier Actuel) / TJ Vendu) * 100. (Cout Journalier = ((Salaire Actuel * 1.45 * 1.01) + 6000 + Prime Ancienneté + (216 * 5.5)) / 193)">Marge Mission {renderSortIndicator('realMargin')}</th>

              {/* Wishes */}
              <th onClick={() => requestSort('wishedSalary')} className="p-4 min-w-[100px] text-right cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le candidat dans son dossier (Prétentions)">Salaire Souhaité {renderSortIndicator('wishedSalary')}</th>
              <th onClick={() => requestSort('wishedGrade')} className="p-4 min-w-[100px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Demandé par le candidat (s'il souhaite changer de grade)">Grade Chang. {renderSortIndicator('wishedGrade')}</th>
              <th onClick={() => requestSort('wishedMargin')} className="p-4 min-w-[80px] text-center border-r border-accent/10 cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : ((TJ Vendu - Cout Journalier Souhaité) / TJ Vendu) * 100. (Cout Journalier = ((Salaire Souhaité * 1.45 * 1.01) + 6000 + Prime Ancienneté + (216 * 5.5)) / 193)">Marge Souhait {renderSortIndicator('wishedMargin')}</th>

              {/* Metrics */}
              <th onClick={() => requestSort('investmentPercentage')} className="p-4 min-w-[100px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le Jury (Sert pour la formule de rémunération)">% Invest. (60) {renderSortIndicator('investmentPercentage')}</th>
              <th onClick={() => requestSort('missionPercentage')} className="p-4 min-w-[100px] text-center border-r border-accent/10 cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le Jury (Sert pour la formule de rémunération)">% Mission (98) {renderSortIndicator('missionPercentage')}</th>

              {/* Jury Decision */}
              <th onClick={() => requestSort('proposedSalary')} className="p-4 min-w-[120px] text-right bg-secondary/5 cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le Jury : Montant de l'augmentation finalisée">Salaire Proposé {renderSortIndicator('proposedSalary')}</th>
              <th className="p-4 min-w-[80px] text-center" title="Calcul Automatique : Prime d'ancienneté applicable au 01/07/2025. (+500€ si ≥3 ans, +1000€ si ≥6 ans)">Prime Av.</th>
              <th className="p-4 min-w-[80px] text-center" title="Calcul Automatique : Prime d'ancienneté applicable au 01/07/2025. (+500€ si ≥3 ans, +1000€ si ≥6 ans)">Prime Ap.</th>
              <th onClick={() => requestSort('percentage')} className="p-4 min-w-[80px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : ((Salaire Proposé - Salaire Actuel) / Salaire Actuel) * 100">% Augment. {renderSortIndicator('percentage')}</th>
              <th onClick={() => requestSort('marginPostJury')} className="p-4 min-w-[100px] text-center underline decoration-secondary/30 cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : ((TJ Vendu - Cout Journalier Proposé) / TJ Vendu) * 100. (Cout = ((Salaire Proposé * 1.45 * 1.01) + 6000 + Prime + Tickets) / 193)">Marge Post-Jury {renderSortIndicator('marginPostJury')}</th>
              <th onClick={() => requestSort('resFormule')} className="p-4 min-w-[120px] text-right text-primary font-bold italic cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : Max(Salaire Actuel, Formule1, Formule2) où FormuleX = (Pourcentage mission / 100) * ((Pourcentage investissement * (SalaireX 100% - SalaireX)) / 100 + SalaireX)">Salaire Formule {renderSortIndicator('resFormule')}</th>
              <th onClick={() => requestSort('diffFormule')} className="p-4 min-w-[120px] text-right font-bold cursor-pointer hover:bg-accent/10 transition-colors" title="Différence entre le Salaire Proposé et le Salaire calculé par la formule (Calculette du salaire)">Écart Formule {renderSortIndicator('diffFormule')}</th>
              <th onClick={() => requestSort('maxSalaryIfTJIncreases')} className="p-4 min-w-[150px] text-right cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le Jury (Onglet Décision) ou via ce tableau">Salaire max proposé si augmentation TJ {renderSortIndicator('maxSalaryIfTJIncreases')}</th>
              <th onClick={() => requestSort('whyThisSalary')} className="p-4 min-w-[220px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le Jury : Pourquoi ce salaire proposé">Pourquoi ce salaire proposé {renderSortIndicator('whyThisSalary')}</th>
              <th onClick={() => requestSort('whatToDoMore')} className="p-4 min-w-[220px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le Jury : Ce qu'il faut faire pour avoir plus">Ce qu'il faut faire pour avoir plus {renderSortIndicator('whatToDoMore')}</th>
              <th className="p-4 min-w-[150px]" title="Saisi par le Jury ou le Manager lors du point collaborateur">Ressenti</th>
            </tr>
          </thead>
          <tbody className="text-[11px] font-medium text-accent/80 divide-y divide-accent/5">
            {sortedTableData.map((item: any) => {
              const isExpanded = !!expandedRowIds[item.dossier.id];
              const totalSublines = item.totalSublines || 0;

              return (
                <React.Fragment key={item.dossier.id}>
                  <tr 
                    className={cn(
                      "hover:bg-accent/5 transition-colors group",
                      editingId === item.dossier.id ? "bg-secondary/5 ring-1 ring-inset ring-secondary" : "",
                      isExpanded ? "bg-accent/[0.02]" : ""
                    )}
                    onDoubleClick={() => startEditing(item)}
                  >
                    {/* Expand Chevron Column */}
                    <td className="p-3 sticky left-0 bg-white z-20 text-center group-hover:bg-accent/5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(item.dossier.id);
                        }}
                        className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                          isExpanded 
                            ? "bg-secondary text-white shadow-xs" 
                            : totalSublines > 0 
                              ? "bg-accent/5 hover:bg-secondary/15 text-accent hover:text-secondary" 
                              : "text-accent/20 hover:text-accent/40"
                        )}
                        title={totalSublines > 0 ? `${totalSublines} avis disponible(s) - Cliquer pour déplier` : "Aucun autre avis"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>

                    {/* Reference */}
                    <td className="p-4 sticky left-10 bg-white z-20 font-black text-accent/40 group-hover:bg-accent/5">
                      {item.candidate.matricule || 'N/A'}
                    </td>
                    <td className="p-4 sticky left-[120px] bg-white z-20 font-bold text-accent group-hover:bg-accent/5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span 
                          className="cursor-pointer hover:text-secondary transition-colors"
                          onClick={() => toggleRow(item.dossier.id)}
                        >
                          {item.candidate.displayName}
                        </span>
                        {totalSublines > 0 && (
                          <span 
                            onClick={() => toggleRow(item.dossier.id)}
                            className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-full font-black cursor-pointer transition-colors",
                              isExpanded ? "bg-secondary text-white" : "bg-secondary/10 text-secondary hover:bg-secondary/20"
                            )}
                            title={`${totalSublines} avis / sous-ligne(s) disponible(s)`}
                          >
                            {totalSublines}
                          </span>
                        )}
                      </div>
                    </td>
                <td className="p-4 min-w-[140px]">
                  {editingId === item.dossier.id ? (
                    <select
                      className="w-full p-1 bg-white border border-secondary rounded outline-none text-xs"
                      value={editValues.referentJury || ''}
                      onChange={e => setEditValues({...editValues, referentJury: e.target.value})}
                    >
                      <option value="">-- Non assigné --</option>
                      {juryMembers.map(m => (
                        <option key={m.id} value={m.displayName}>{m.displayName}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className={cn(
                        "text-xs px-2 py-1 rounded-lg border outline-none font-medium transition-all cursor-pointer",
                        item.decision.referentJury
                          ? "bg-secondary/5 border-secondary/20 text-secondary font-bold"
                          : "bg-white border-accent/20 text-accent/40 italic"
                      )}
                      value={item.decision.referentJury || ''}
                      onChange={e => handleAssignReferent(item.dossier.id, e.target.value)}
                      title="Assigner un membre du jury à ce dossier"
                    >
                      <option value="">Non assigné</option>
                      {juryMembers.map(m => (
                        <option key={m.id} value={m.displayName}>{m.displayName}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="p-4 text-center">{item.candidate.experienceYears !== undefined && item.candidate.experienceYears !== null ? item.candidate.experienceYears : '-'}</td>
                <td className="p-4 text-accent/60">{item.candidate.entryDate ? new Date(item.candidate.entryDate).toLocaleDateString() : '-'}</td>
                <td className="p-4 text-accent/60">{item.candidate.expertGradeDate ? new Date(item.candidate.expertGradeDate).toLocaleDateString() : '-'}</td>
                <td className="p-4 text-center font-bold text-primary">{item.yearsLL !== null ? item.yearsLL : '-'}</td>
                <td className="p-4 text-center">{item.yearsExpert !== null ? item.yearsExpert : '-'}</td>
                <td className="p-4 border-r border-accent/10">
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
                    item.candidate.currentGrade === 'Expert' ? "bg-primary text-white" : 
                    item.candidate.currentGrade === 'Senior' ? "bg-secondary text-white" : "bg-accent/10 text-accent/60"
                  )}>
                    {item.candidate.currentGrade || 'Junior'}
                  </span>
                </td>

                {/* RG Logiclever */}
                <td className="p-4 text-center font-black">{item.tjSalaire}€</td>
                <td className="p-4 text-center font-black">{item.tjVendu}€</td>
                <td className="p-4 text-right tabular-nums text-accent/50">{formatCurrency(item.salaireVendu)}</td>
                <td className="p-4 text-right tabular-nums text-green-600 font-bold">{formatCurrency(item.salaireVendu100)}</td>
                <td className="p-4 text-center font-black opacity-30">{item.tjCible}€</td>
                <td className="p-4 text-right tabular-nums opacity-30">{formatCurrency(item.salaireCible)}</td>
                <td className="p-4 text-right tabular-nums border-r border-accent/10 opacity-30">{formatCurrency(item.salaireCible100)}</td>

                {/* Real Situation */}
                <td className="p-4 text-right font-black tabular-nums">{formatCurrency(item.currentSalary)}</td>
                <td className={cn(
                  "p-4 text-center font-bold border-r border-accent/10 tabular-nums",
                  item.realMargin < 19.5 ? "text-red-500" : item.realMargin > 29 ? "text-green-600" : "text-primary"
                )}>
                  {item.realMargin.toFixed(1)}%
                </td>

                {/* Wishes */}
                <td className="p-4 text-right tabular-nums text-secondary font-bold">{formatCurrency(item.dossier.annualReport?.wishedSalary || 0)}</td>
                <td className="p-4 text-center">
                  {item.dossier.annualReport?.wishedGrade !== item.candidate.currentGrade ? (
                    <span className="text-secondary font-bold">Oui ({item.dossier.annualReport?.wishedGrade})</span>
                  ) : 'Non'}
                </td>
                <td className="p-4 text-center border-r border-accent/10 opacity-50">
                  {calculateMargin(item.tjVendu, item.dossier.annualReport?.wishedSalary || 0, item.prime).toFixed(1)}%
                </td>

                {/* Metrics */}
                <td className="p-4 text-center">
                  {editingId === item.dossier.id ? (
                    <input 
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="w-16 p-1 text-center bg-white border border-secondary rounded outline-none"
                      value={editValues.investmentPercentage}
                      onChange={e => {
                        const parsed = parseInt(e.target.value, 10);
                        setEditValues({...editValues, investmentPercentage: isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed))});
                      }}
                    />
                  ) : (
                    <span className={cn((item.decision.investmentPercentage ?? 60) < 60 ? "text-orange-500" : "text-accent")}>
                      {Math.round(item.decision.investmentPercentage ?? 60)}%
                    </span>
                  )}
                </td>
                <td className="p-4 text-center border-r border-accent/10">
                  {editingId === item.dossier.id ? (
                    <input 
                      type="number"
                      min="95"
                      max="100"
                      step="1"
                      className="w-16 p-1 text-center bg-white border border-secondary rounded outline-none"
                      value={editValues.missionPercentage}
                      onChange={e => {
                        const parsed = parseInt(e.target.value, 10);
                        setEditValues({...editValues, missionPercentage: isNaN(parsed) ? 98 : Math.min(100, Math.max(95, parsed))});
                      }}
                    />
                  ) : (
                    <span className={cn((item.decision.missionPercentage ?? 98) < 98 ? "text-orange-500" : "text-accent")}>
                      {Math.round(item.decision.missionPercentage ?? 98)}%
                    </span>
                  )}
                </td>

                {/* Jury Decision */}
                <td className="p-4 text-right bg-secondary/5 font-black text-secondary tabular-nums">
                  {editingId === item.dossier.id ? (
                    <input 
                      type="number"
                      min="0"
                      className="w-24 p-1 text-right bg-white border border-secondary rounded outline-none"
                      value={editValues.amount}
                      onChange={e => setEditValues({...editValues, amount: Math.max(0, parseFloat(e.target.value) || 0)})}
                    />
                  ) : formatCurrency(item.decision.amount || item.currentSalary)}
                </td>
                <td className="p-4 text-center opacity-40">{item.prime}€</td>
                <td className="p-4 text-center font-bold text-secondary">{item.prime}€</td>
                <td className="p-4 text-center font-bold">
                  {item.decision.amount ? Math.min(100, Math.max(0, ((item.decision.amount - item.currentSalary) / item.currentSalary) * 100)).toFixed(1) + '%' : '0%'}
                </td>
                <td className={cn(
                  "p-4 text-center font-black tabular-nums",
                  item.marginPostJury < 19.5 ? "text-red-500" : item.marginPostJury > 29 ? "text-green-600" : "text-secondary"
                )}>
                  {item.marginPostJury.toFixed(1)}%
                </td>
                <td className="p-4 text-right tabular-nums text-primary font-black bg-primary/5">{formatCurrency(item.resFormule)}</td>
                <td className={cn(
                  "p-4 text-right tabular-nums font-black",
                  item.diffFormule > 0 ? "text-emerald-600 bg-emerald-50/40" :
                  item.diffFormule < 0 ? "text-rose-600 bg-rose-50/40" :
                  "text-accent/60"
                )}>
                  {item.diffFormule > 0 ? `+${formatCurrency(item.diffFormule)}` : formatCurrency(item.diffFormule)}
                </td>
                <td className="p-4 text-right tabular-nums font-bold">
                  {editingId === item.dossier.id ? (
                    <input 
                      type="number"
                      min="0"
                      className="w-24 p-1 text-right bg-white border border-secondary rounded outline-none"
                      value={editValues.maxSalaryIfTJIncreases || ''}
                      onChange={e => {
                        const parsed = parseFloat(e.target.value);
                        setEditValues({...editValues, maxSalaryIfTJIncreases: isNaN(parsed) ? undefined : Math.max(0, parsed)});
                      }}
                    />
                  ) : item.decision.maxSalaryIfTJIncreases ? formatCurrency(item.decision.maxSalaryIfTJIncreases) : '-'}
                </td>
                <td className="p-4 min-w-[220px]">
                  {editingId === item.dossier.id ? (
                    <textarea 
                      className="w-full p-2 text-[11px] bg-white border border-secondary rounded-lg outline-none resize-y min-h-[48px]"
                      rows={2}
                      placeholder="Pourquoi ce salaire..."
                      value={editValues.whyThisSalary || ''}
                      onChange={e => setEditValues({...editValues, whyThisSalary: e.target.value})}
                    />
                  ) : (
                    <div 
                      className="text-xs text-accent/80 font-normal leading-snug line-clamp-2 hover:line-clamp-none transition-all cursor-default"
                      title={item.decision.whyThisSalary || 'Non renseigné'}
                    >
                      {item.decision.whyThisSalary ? (
                        <span>{item.decision.whyThisSalary}</span>
                      ) : (
                        <span className="text-accent/30 italic font-light">-</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="p-4 min-w-[220px]">
                  {editingId === item.dossier.id ? (
                    <textarea 
                      className="w-full p-2 text-[11px] bg-white border border-secondary rounded-lg outline-none resize-y min-h-[48px]"
                      rows={2}
                      placeholder="Ce qu'il faut faire pour avoir plus..."
                      value={editValues.whatToDoMore || ''}
                      onChange={e => setEditValues({...editValues, whatToDoMore: e.target.value})}
                    />
                  ) : (
                    <div 
                      className="text-xs text-accent/80 font-normal leading-snug line-clamp-2 hover:line-clamp-none transition-all cursor-default"
                      title={item.decision.whatToDoMore || 'Non renseigné'}
                    >
                      {item.decision.whatToDoMore ? (
                        <span>{item.decision.whatToDoMore}</span>
                      ) : (
                        <span className="text-accent/30 italic font-light">-</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="p-4 min-w-[200px]">
                  {editingId === item.dossier.id ? (
                    <div className="flex items-center gap-2">
                      <textarea 
                        className="flex-1 p-2 text-[10px] bg-white border border-secondary rounded outline-none resize-none"
                        rows={1}
                        value={editValues.consultantFeeling}
                        onChange={e => setEditValues({...editValues, consultantFeeling: e.target.value})}
                      />
                      <button 
                        onClick={saveEdits}
                        className="p-2 bg-primary text-white rounded-lg shadow-lg hover:scale-105 transition-transform"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-accent/60 truncate italic">{item.decision.consultantFeeling || '-'}</div>
                  )}
                </td>
              </tr>

              {/* Sous-lignes détaillées pour les évaluateurs et autres membres du jury */}
              {isExpanded && (
                <tr className="bg-accent/[0.02] border-b border-accent/10">
                  <td colSpan={33} className="py-3 px-6">
                    {totalSublines === 0 ? (
                      <div className="my-2 py-4 px-6 rounded-xl bg-white/70 border border-dashed border-accent/20 text-xs italic text-accent/40">
                        Aucun autre avis d'évaluateur ou de membre du jury pour ce candidat pour le moment.
                      </div>
                    ) : (
                      <div className="space-y-3 my-1.5 max-w-5xl">
                        <div className="text-[10px] font-black uppercase tracking-wider text-accent/50 flex items-center gap-2 pl-1">
                          <Users className="w-3.5 h-3.5 text-secondary" />
                          <span>Détail des avis des évaluateurs et jurys ({totalSublines})</span>
                        </div>

                        {/* 1. Cartes pour les ÉVALUATEURS */}
                        {item.evaluatorFeedbacks.map((fb: ConsultantFeedback, idx: number) => {
                          const tjMin = fb.targetTJMin || 0;
                          const tjMax = fb.targetTJMax || 0;
                          const tjMean = (tjMin > 0 && tjMax > 0) ? Math.round((tjMin + tjMax) / 2) : (tjMin || tjMax || null);

                          return (
                            <div 
                              key={fb.id || `${item.dossier.id}-fb-${idx}`}
                              className="p-3.5 rounded-xl bg-white border border-accent/15 text-accent/80 hover:border-secondary/30 transition-colors border-l-4 border-l-secondary shadow-xs"
                            >
                              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                                {/* Profil Évaluateur */}
                                <div className="flex items-center gap-3 min-w-[220px] lg:w-56 shrink-0">
                                  <div className="w-8 h-8 rounded-full bg-secondary/15 flex items-center justify-center text-secondary font-black text-xs ring-2 ring-secondary/20">
                                    {fb.consultantName ? fb.consultantName.charAt(0) : 'E'}
                                  </div>
                                  <div>
                                    <div className="font-bold text-accent text-xs">
                                      {fb.consultantName || 'Évaluateur'}
                                    </div>
                                    <div className="text-[9px] px-2 py-0.5 rounded-full bg-secondary/10 text-secondary font-bold uppercase tracking-wider inline-block mt-0.5">
                                      Évaluateur
                                    </div>
                                    {(fb.client || fb.project) && (
                                      <div className="text-[10px] text-accent/50 font-medium mt-1 flex flex-wrap gap-x-1.5 items-center">
                                        {fb.client && <span className="font-semibold text-accent/70">{fb.client}</span>}
                                        {fb.client && fb.project && <span>•</span>}
                                        {fb.project && <span className="italic">{fb.project}</span>}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Métriques : TJ Cible (Moyenne Min/Max), % Mission, % Investissement, Indice de confiance */}
                                <div className="flex flex-wrap items-center gap-3 bg-accent/[0.03] p-2 rounded-lg border border-accent/10 shrink-0">
                                  <div className="text-center px-2">
                                    <div className="text-[9px] font-bold text-accent/40 uppercase">TJ Cible (Moy.)</div>
                                    <div className="text-xs font-black text-secondary">
                                      {tjMean ? `${tjMean}€` : '-'}
                                    </div>
                                    {tjMin > 0 && tjMax > 0 && (
                                      <div className="text-[8px] text-accent/40">
                                        {tjMin}€ - {tjMax}€
                                      </div>
                                    )}
                                  </div>

                                  <div className="w-px h-6 bg-accent/10" />

                                  <div className="text-center px-2">
                                    <div className="text-[9px] font-bold text-accent/40 uppercase">% Mission</div>
                                    <div className="text-xs font-black text-accent">
                                      {fb.missionPercentage !== undefined && fb.missionPercentage !== null ? `${fb.missionPercentage}%` : '-'}
                                    </div>
                                  </div>

                                  <div className="w-px h-6 bg-accent/10" />

                                  <div className="text-center px-2">
                                    <div className="text-[9px] font-bold text-accent/40 uppercase">% Invest.</div>
                                    <div className="text-xs font-black text-accent">
                                      {fb.investmentPercentage !== undefined && fb.investmentPercentage !== null ? `${fb.investmentPercentage}%` : '-'}
                                    </div>
                                  </div>

                                  <div className="w-px h-6 bg-accent/10" />

                                  <div className="text-center px-2">
                                    <div className="text-[9px] font-bold text-accent/40 uppercase">Confiance</div>
                                    <div className="text-xs font-black text-amber-600">
                                      {fb.confidenceIndex !== undefined && fb.confidenceIndex !== null ? `${fb.confidenceIndex}/5` : '-'}
                                    </div>
                                  </div>
                                </div>

                                {/* Justification TJ Cible */}
                                <div className="flex-1 min-w-[200px]">
                                  <div className="text-[9px] font-bold text-secondary uppercase tracking-wider mb-1">
                                    Justification TJ Cible
                                  </div>
                                  <div className="bg-accent/[0.02] p-2.5 rounded-lg border border-accent/10 text-xs leading-relaxed text-accent/80 whitespace-pre-wrap">
                                    {fb.justification ? (
                                      <span>{fb.justification}</span>
                                    ) : (
                                      <span className="italic text-accent/30 font-light">Aucune justification</span>
                                    )}
                                  </div>
                                </div>

                                {/* Axes pour augmenter le TJ */}
                                <div className="flex-1 min-w-[200px]">
                                  <div className="text-[9px] font-bold text-secondary uppercase tracking-wider mb-1">
                                    Axes pour augmenter le TJ
                                  </div>
                                  <div className="bg-accent/[0.02] p-2.5 rounded-lg border border-accent/10 text-xs leading-relaxed text-accent/80 whitespace-pre-wrap">
                                    {fb.improvementAxes ? (
                                      <span>{fb.improvementAxes}</span>
                                    ) : (
                                      <span className="italic text-accent/30 font-light">Aucun axe renseigné</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* 2. Cartes pour les AUTRES membres du jury */}
                        {item.otherJuryReviews.map((juryRev: JuryMemberReview, idx: number) => (
                          <div 
                            key={`jury-rev-${idx}-${juryRev.juryUid || juryRev.juryName}`}
                            className="p-3.5 rounded-xl bg-primary/[0.04] border border-primary/20 text-accent/80 hover:bg-primary/[0.07] transition-colors border-l-4 border-l-primary shadow-xs"
                          >
                            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-[220px] lg:w-56 shrink-0">
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-xs ring-2 ring-primary/20">
                                  {juryRev.juryName ? juryRev.juryName.charAt(0) : 'J'}
                                </div>
                                <div>
                                  <div className="font-bold text-accent text-xs">
                                    {juryRev.juryName || 'Membre Jury'}
                                  </div>
                                  <div className="text-[9px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-black uppercase tracking-wider inline-block mt-0.5">
                                    Membre du Jury
                                  </div>
                                </div>
                              </div>

                              <div className="flex-1 min-w-[200px]">
                                <div className="text-[9px] font-bold text-primary/80 uppercase tracking-wider mb-1">
                                  Justification TJ Cible
                                </div>
                                <div className="bg-white/90 p-2.5 rounded-lg border border-primary/15 text-xs leading-relaxed text-accent/90 whitespace-pre-wrap">
                                  {juryRev.whyThisSalary ? (
                                    <span>{juryRev.whyThisSalary}</span>
                                  ) : (
                                    <span className="italic text-accent/30 font-light">Aucune justification renseignée</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex-1 min-w-[200px]">
                                <div className="text-[9px] font-bold text-primary/80 uppercase tracking-wider mb-1">
                                  Axes pour augmenter le TJ
                                </div>
                                <div className="bg-white/90 p-2.5 rounded-lg border border-primary/15 text-xs leading-relaxed text-accent/90 whitespace-pre-wrap">
                                  {juryRev.whatToDoMore ? (
                                    <span>{juryRev.whatToDoMore}</span>
                                  ) : (
                                    <span className="italic text-accent/30 font-light">Aucun axe renseigné</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
        </table>
      </div>

      <div className="flex gap-6 mt-6">
        <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-accent/10 shadow-sm">
          <div className="w-2 h-2 bg-red-500 rounded-full" />
          <span className="text-[10px] font-black uppercase text-accent/40">Marge critique (&lt;19.5%)</span>
        </div>
        <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-accent/10 shadow-sm">
          <div className="w-2 h-2 bg-green-600 rounded-full" />
          <span className="text-[10px] font-black uppercase text-accent/40">Marge optimale (&gt;29%)</span>
        </div>
        <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-accent/10 shadow-sm italic text-accent/40 text-[10px]">
          <AlertCircle className="w-4 h-4" />
          Double-cliquer sur une ligne pour l'éditer.
        </div>
      </div>

      <OptimizerSuggestionsModal 
        isOpen={showOptimizerModal}
        onClose={() => setShowOptimizerModal(false)}
        dossiers={dossiers}
        candidates={candidates}
      />
    </div>
  );
}
