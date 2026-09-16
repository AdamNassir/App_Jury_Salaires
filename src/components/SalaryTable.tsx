import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Dossier, UserProfile, Grade, JuryDecision } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { TrendingUp, Calculator, UserCheck, AlertCircle, Save, Search, FileSpreadsheet, Loader2, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import { updateDoc, doc, serverTimestamp } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
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
  getTauxGrade
} from '../lib/salaryUtils';

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
}

export function SalaryTable({ dossiers, candidates, referenceDate }: SalaryTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<SheetExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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
      const candidate = candidates[dossier.candidateId];
      if (!candidate) return null;

      const yearsLL = calculateYears(candidate.entryDate, referenceDate);
      const yearsExpert = candidate.currentGrade === 'Expert' ? calculateYears(candidate.expertGradeDate, referenceDate) : 0;
      const prime = getPrimeAnciennete(yearsLL);

      // Calculations
      const tjVendu = candidate.currentTJM || 0;
      const tjCible = dossier.annualReport?.targetTJM || 0;

      const salaireVendu = calculateSalaryFormule(tjVendu, candidate.currentGrade || 'Junior', yearsExpert, prime);
      const salaireVendu100 = calculateSalaryFormule(tjVendu + 30, candidate.currentGrade || 'Junior', yearsExpert, prime);
      
      const targetGrade = dossier.annualReport?.wishedGrade || candidate.currentGrade || 'Junior';
      const targetYearsExpert = targetGrade === 'Expert' ? calculateYears(candidate.expertGradeDate, referenceDate) : 0;

      const salaireCible = calculateSalaryFormule(tjCible, targetGrade, targetYearsExpert, prime);
      const salaireCible100 = calculateSalaryFormule(tjCible + 30, targetGrade, targetYearsExpert, prime);

      const realMargin = calculateMargin(tjVendu, candidate.currentSalary || 0, prime);

      // Jury Decision Data
      const decision = (dossier.juryDecision || {}) as JuryDecision;
      const proposedSalary = decision.amount || 0;
      
      const marginPostJury = calculateMargin(tjVendu, proposedSalary, prime);

      // Logic for Salaire Formule Result
      const currentSalary = candidate.currentSalary || 0;
      const invest = decision.investmentPercentage || 60;
      const mission = decision.missionPercentage || 98;
      
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

      return {
        dossier,
        candidate,
        yearsLL,
        yearsExpert,
        prime,
        tjVendu,
        salaireVendu,
        salaireVendu100,
        tjCible,
        salaireCible,
        salaireCible100,
        currentSalary,
        realMargin,
        resFormule,
        marginPostJury,
        decision
      };
    }).filter(item => {
      if (!item) return false;
      const search = searchTerm.toLowerCase();
      return (
        item.candidate.displayName.toLowerCase().includes(search) ||
        item.candidate.matricule?.toLowerCase().includes(search)
      );
    });
  }, [dossiers, candidates, searchTerm]);

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
        case 'maxSalaryIfTJIncreases':
          aVal = a.decision.maxSalaryIfTJIncreases || 0;
          bVal = b.decision.maxSalaryIfTJIncreases || 0;
          break;
        case 'verdict':
          aVal = a.decision.verdict || '';
          bVal = b.decision.verdict || '';
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
      investmentPercentage: decision.investmentPercentage || 60,
      missionPercentage: decision.missionPercentage || 98,
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
        finalValues.percentage = current ? parseFloat((((finalValues.amount - current) / current) * 100).toFixed(1)) : 0;
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
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={handleExportToGoogleSheets}
            disabled={isExporting}
            title={`Destination prédéterminée dans le code : Onglet "${DEFAULT_SHEET_TAB_NAME}" du Google Sheet`}
            className="flex items-center justify-center gap-2.5 px-5 py-3 bg-[#0F9D58] hover:bg-[#0B8043] text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Exportation vers Google Sheet...</span>
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
              <strong>{exportResult.rowsExported} délibérations</strong> exportées avec succès dans l'onglet <em>"{DEFAULT_SHEET_TAB_NAME}"</em> du Google Sheet à {exportResult.timestamp}.
            </span>
          </div>
          <a 
            href={exportResult.sheetUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-bold text-emerald-700 hover:text-emerald-900 underline ml-4 shrink-0"
          >
            <span>Consulter le Google Sheet</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
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
              <th colSpan={8} className="py-2 border-r border-white/10">Données de référence</th>
              <th colSpan={6} className="py-2 border-r border-white/10">RG Logiclever (Formule)</th>
              <th colSpan={2} className="py-2 border-r border-white/10">Réel au 30/06</th>
              <th colSpan={3} className="py-2 border-r border-white/10">Souhait Consultant</th>
              <th colSpan={2} className="py-2 border-r border-white/10">Délibération Métriques</th>
              <th colSpan={11} className="py-2">Décision Jury</th>
            </tr>
            <tr className="bg-accent/5 text-[9px] font-black text-accent/50 border-b border-accent/10 uppercase tracking-tighter">
              {/* Reference */}
              <th onClick={() => requestSort('matricule')} className="p-4 sticky left-0 bg-white z-20 min-w-[80px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi dans l'administration (Profil Utilisateur)">Matricule {renderSortIndicator('matricule')}</th>
              <th onClick={() => requestSort('displayName')} className="p-4 sticky left-[80px] bg-white z-20 min-w-[150px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi dans l'administration (Profil Utilisateur)">Collaborateur {renderSortIndicator('displayName')}</th>
              <th onClick={() => requestSort('experienceYears')} className="p-4 min-w-[60px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Expérience initiale (Saisie dans l'administration)">Exp. {renderSortIndicator('experienceYears')}</th>
              <th onClick={() => requestSort('entryDate')} className="p-4 min-w-[100px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisie dans l'administration">Entrée LL {renderSortIndicator('entryDate')}</th>
              <th onClick={() => requestSort('expertGradeDate')} className="p-4 min-w-[100px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisie dans l'administration">Expert Grade {renderSortIndicator('expertGradeDate')}</th>
              <th onClick={() => requestSort('yearsLL')} className="p-4 min-w-[80px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : Date de référence (01/07/2025) - Date d'entrée">Ancien. LL {renderSortIndicator('yearsLL')}</th>
              <th onClick={() => requestSort('yearsExpert')} className="p-4 min-w-[80px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Calcul Automatique : Si grade Expert (Date de référence (01/07/2025) - Date d'obtention du grade)">Années Exp. {renderSortIndicator('yearsExpert')}</th>
              <th onClick={() => requestSort('currentGrade')} className="p-4 min-w-[100px] border-r border-accent/10 cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi dans l'administration">Grade {renderSortIndicator('currentGrade')}</th>
              
              {/* RG Logiclever */}
              <th onClick={() => requestSort('tjVendu')} className="p-4 min-w-[80px] text-center cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi dans l'administration">TJ Vendu {renderSortIndicator('tjVendu')}</th>
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
              <th onClick={() => requestSort('maxSalaryIfTJIncreases')} className="p-4 min-w-[150px] text-right cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le Jury (Onglet Décision) ou via ce tableau">Salaire max proposé si augmentation TJ {renderSortIndicator('maxSalaryIfTJIncreases')}</th>
              <th onClick={() => requestSort('verdict')} className="p-4 min-w-[120px] cursor-pointer hover:bg-accent/10 transition-colors" title="Saisi par le Jury : Favorable, Réservé, Défavorable">Verdict {renderSortIndicator('verdict')}</th>
              <th className="p-4 min-w-[200px]" title="Saisi par le Jury (Explication de la décision)">Pourquoi ce salaire ?</th>
              <th className="p-4 min-w-[200px]" title="Saisi par le Jury (Axes d'amélioration)">Actions Progrès</th>
              <th className="p-4 min-w-[120px]" title="Saisi par le Jury">Référent Jury</th>
              <th className="p-4 min-w-[150px]" title="Saisi par le Jury ou le Manager lors du point collaborateur">Ressenti</th>
            </tr>
          </thead>
          <tbody className="text-[11px] font-medium text-accent/80 divide-y divide-accent/5">
            {sortedTableData.map((item: any) => (
              <tr 
                key={item.dossier.id} 
                className={cn(
                  "hover:bg-accent/5 transition-colors group",
                  editingId === item.dossier.id ? "bg-secondary/5 ring-1 ring-inset ring-secondary" : ""
                )}
                onDoubleClick={() => startEditing(item)}
              >
                {/* Reference */}
                <td className="p-4 sticky left-0 bg-white z-20 font-black text-accent/40 group-hover:bg-accent/5">{item.candidate.matricule || 'N/A'}</td>
                <td className="p-4 sticky left-[80px] bg-white z-20 font-bold text-accent group-hover:bg-accent/5 whitespace-nowrap">{item.candidate.displayName}</td>
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
                      className="w-16 p-1 text-center bg-white border border-secondary rounded outline-none"
                      value={editValues.investmentPercentage}
                      onChange={e => setEditValues({...editValues, investmentPercentage: parseFloat(e.target.value)})}
                    />
                  ) : (
                    <span className={cn(item.decision.investmentPercentage < 60 ? "text-orange-500" : "text-accent")}>
                      {item.decision.investmentPercentage || 60}%
                    </span>
                  )}
                </td>
                <td className="p-4 text-center border-r border-accent/10">
                  {editingId === item.dossier.id ? (
                    <input 
                      type="number"
                      className="w-16 p-1 text-center bg-white border border-secondary rounded outline-none"
                      value={editValues.missionPercentage}
                      onChange={e => setEditValues({...editValues, missionPercentage: parseFloat(e.target.value)})}
                    />
                  ) : (
                    <span className={cn(item.decision.missionPercentage < 98 ? "text-orange-500" : "text-accent")}>
                      {item.decision.missionPercentage || 98}%
                    </span>
                  )}
                </td>

                {/* Jury Decision */}
                <td className="p-4 text-right bg-secondary/5 font-black text-secondary tabular-nums">
                  {editingId === item.dossier.id ? (
                    <input 
                      type="number"
                      className="w-24 p-1 text-right bg-white border border-secondary rounded outline-none"
                      value={editValues.amount}
                      onChange={e => setEditValues({...editValues, amount: parseFloat(e.target.value)})}
                    />
                  ) : formatCurrency(item.decision.amount || item.currentSalary)}
                </td>
                <td className="p-4 text-center opacity-40">{item.prime}€</td>
                <td className="p-4 text-center font-bold text-secondary">{item.prime}€</td>
                <td className="p-4 text-center font-bold">
                  {item.decision.amount ? (((item.decision.amount - item.currentSalary) / item.currentSalary) * 100).toFixed(1) + '%' : '0%'}
                </td>
                <td className={cn(
                  "p-4 text-center font-black tabular-nums",
                  item.marginPostJury < 19.5 ? "text-red-500" : item.marginPostJury > 29 ? "text-green-600" : "text-secondary"
                )}>
                  {item.marginPostJury.toFixed(1)}%
                </td>
                <td className="p-4 text-right tabular-nums text-primary font-black bg-primary/5">{formatCurrency(item.resFormule)}</td>
                <td className="p-4 text-right tabular-nums font-bold">
                  {editingId === item.dossier.id ? (
                    <input 
                      type="number"
                      className="w-24 p-1 text-right bg-white border border-secondary rounded outline-none"
                      value={editValues.maxSalaryIfTJIncreases || ''}
                      onChange={e => {
                        const parsed = parseFloat(e.target.value);
                        setEditValues({...editValues, maxSalaryIfTJIncreases: isNaN(parsed) ? undefined : parsed});
                      }}
                    />
                  ) : item.decision.maxSalaryIfTJIncreases ? formatCurrency(item.decision.maxSalaryIfTJIncreases) : '-'}
                </td>
                <td className="p-4">
                  {editingId === item.dossier.id ? (
                    <select 
                      className="w-full p-1 bg-white border border-secondary rounded outline-none"
                      value={editValues.verdict}
                      onChange={e => setEditValues({...editValues, verdict: e.target.value})}
                    >
                      <option value="Favorable">Favorable</option>
                      <option value="Réserve">Réserve</option>
                      <option value="Défavorable">Défavorable</option>
                    </select>
                  ) : (
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
                      item.decision.verdict === 'Favorable' ? "bg-green-100 text-green-700" :
                      item.decision.verdict === 'Réserve' ? "bg-orange-100 text-orange-700" :
                      item.decision.verdict === 'Défavorable' ? "bg-red-100 text-red-700" : "bg-accent/10 text-accent/40"
                    )}>
                      {item.decision.verdict || 'N/A'}
                    </span>
                  )}
                </td>
                <td className="p-4">
                  {editingId === item.dossier.id ? (
                    <textarea 
                      className="w-full p-2 text-[10px] bg-white border border-secondary rounded outline-none resize-none"
                      rows={2}
                      value={editValues.whyThisSalary}
                      onChange={e => setEditValues({...editValues, whyThisSalary: e.target.value})}
                    />
                  ) : (
                    <div className="max-w-[200px] truncate italic text-accent/60" title={item.decision.whyThisSalary}>{item.decision.whyThisSalary || '-'}</div>
                  )}
                </td>
                <td className="p-4">
                  {editingId === item.dossier.id ? (
                    <textarea 
                      className="w-full p-2 text-[10px] bg-white border border-secondary rounded outline-none resize-none"
                      rows={2}
                      value={editValues.whatToDoMore}
                      onChange={e => setEditValues({...editValues, whatToDoMore: e.target.value})}
                    />
                  ) : (
                    <div className="max-w-[200px] truncate italic text-accent/60" title={item.decision.whatToDoMore}>{item.decision.whatToDoMore || '-'}</div>
                  )}
                </td>
                <td className="p-4">
                  {editingId === item.dossier.id ? (
                    <input 
                      type="text"
                      className="w-full p-1 bg-white border border-secondary rounded outline-none"
                      value={editValues.referentJury}
                      onChange={e => setEditValues({...editValues, referentJury: e.target.value})}
                    />
                  ) : (
                    <span className="font-bold text-accent/60">{item.decision.referentJury || '-'}</span>
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
            ))}
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
    </div>
  );
}
