import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dossier, UserProfile, JuryDecision, JuryMemberReview } from '../../types';
import { LocalDatabaseService } from '../../services/localDatabaseService';
import { UserDirectoryService } from '../../services/userDirectoryService';
import { Gavel, CheckCircle2, Info, Clock, Lock, Users } from 'lucide-react';
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
  profile?: UserProfile | null;
  onDone: () => void;
  referenceDate?: string | Date | null;
  readOnly?: boolean;
}

export function JuryDecisionForm({ 
  dossier, 
  candidate, 
  profile = null,
  onDone,
  referenceDate,
  readOnly = false
}: JuryDecisionFormProps) {
  const [loading, setLoading] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Identifiant de l'utilisateur jury actuel
  const myReviewKey = profile?.id || profile?.idProfil || profile?.email || 'current_jury';
  const existingMyReview: JuryMemberReview | undefined = dossier.juryMemberReviews?.[myReviewKey] ||
    (profile?.email ? dossier.juryMemberReviews?.[profile.email] : undefined) ||
    (profile?.idProfil ? dossier.juryMemberReviews?.[profile.idProfil] : undefined);

  const [formData, setFormData] = useState<Partial<JuryDecision>>({
    verdict: existingMyReview?.verdict || dossier.juryDecision?.verdict || 'Favorable',
    amount: existingMyReview?.proposedSalary || dossier.juryDecision?.amount || candidate?.currentSalary || 0,
    investmentPercentage: dossier.juryDecision?.investmentPercentage || 60,
    missionPercentage: dossier.juryDecision?.missionPercentage || 98,
    whyThisSalary: existingMyReview?.whyThisSalary || dossier.juryDecision?.whyThisSalary || '',
    whatToDoMore: existingMyReview?.whatToDoMore || dossier.juryDecision?.whatToDoMore || '',
    referentJury: dossier.juryDecision?.referentJury || profile?.displayName || '',
    consultantFeeling: dossier.juryDecision?.consultantFeeling || '',
    percentage: existingMyReview?.percentage || dossier.juryDecision?.percentage || 0,
    advice: dossier.juryDecision?.advice || '',
    conclusion: dossier.juryDecision?.conclusion || '',
    maxSalaryIfTJIncreases: dossier.juryDecision?.maxSalaryIfTJIncreases
  });

  const isInitialMount = useRef(true);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  // Calcul des membres du jury assignés à ce dossier
  const assignedJuries = useMemo(() => {
    const allUsers = UserDirectoryService.getAllUsers();
    const candId = dossier.candidateId;
    const candIdProfil = dossier.idProfil;

    const juries = allUsers.filter(u => {
      if (!u.roles?.includes('JURY')) return false;
      // 1. Le jury a explicitement ce candidat dans ses assignedCandidateIds
      const hasCandidate = (u.assignedCandidateIds || []).some(id => 
        id === candId || (candIdProfil && id === candIdProfil)
      );
      if (hasCandidate) return true;

      // 2. Le jury est dans assignedConsultantIds du dossier
      const isInDossier = (dossier.assignedConsultantIds || []).some(id => 
        id === u.id || (u.idProfil && id === u.idProfil)
      );
      if (isInDossier) return true;

      return false;
    });

    // Si aucun jury n'a été assigné via les listes, on inclut le jury connecté ou ceux avec review existante
    if (juries.length === 0) {
      const fallbackList: UserProfile[] = [];
      if (profile && profile.roles?.includes('JURY')) {
        fallbackList.push(profile);
      }
      Object.values(dossier.juryMemberReviews || {}).forEach(r => {
        if (!fallbackList.some(u => u.email?.toLowerCase() === r.juryEmail?.toLowerCase() || u.id === r.juryUid)) {
          fallbackList.push({
            id: r.juryUid,
            displayName: r.juryName,
            email: r.juryEmail,
            roles: ['JURY']
          } as UserProfile);
        }
      });
      return fallbackList;
    }

    return juries;
  }, [dossier, profile]);

  // Suivi de la finalisation individuelle de chaque jury
  const juryFinalizationStatus = useMemo(() => {
    const reviews = dossier.juryMemberReviews || {};
    return assignedJuries.map(jury => {
      const juryKey = jury.id || jury.idProfil || jury.email;
      const rev = reviews[juryKey] || (jury.email ? reviews[jury.email] : undefined) || (jury.idProfil ? reviews[jury.idProfil] : undefined);
      const isFinalized = !!(rev?.isFinalized);
      return {
        jury,
        isFinalized,
        review: rev
      };
    });
  }, [assignedJuries, dossier.juryMemberReviews]);

  const finalizedCount = juryFinalizationStatus.filter(s => s.isFinalized).length;
  const totalJuriesCount = Math.max(assignedJuries.length, 1);
  const isMyDecisionFinalized = !!existingMyReview?.isFinalized;

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // Si readOnly, ne pas sauvegarder
    if (readOnly) return;

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
  }, [formData, dossier.id, readOnly]);

  useEffect(() => {
    return () => {
      // Si readOnly, ne pas sauvegarder au démontage
      if (readOnly) return;

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
  }, [dossier.id, readOnly]);

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

  // Finalisation individuelle de mon avis en tant que membre du jury
  const handleFinalizeMyReview = async () => {
    if (readOnly) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const myKey = profile?.id || profile?.idProfil || profile?.email || 'current_jury';
      
      const myUpdatedReview: JuryMemberReview = {
        juryUid: profile?.id || myKey,
        juryName: profile?.displayName || profile?.email || 'Membre du Jury',
        juryEmail: profile?.email || '',
        whyThisSalary: formData.whyThisSalary || '',
        whatToDoMore: formData.whatToDoMore || '',
        verdict: formData.verdict || 'Favorable',
        proposedSalary: formData.amount || 0,
        percentage: formData.percentage || 0,
        isFinalized: true,
        finalizedAt: now,
        updatedAt: now
      };

      const updatedJuryMemberReviews: Record<string, JuryMemberReview> = {
        ...(dossier.juryMemberReviews || {}),
        [myKey]: myUpdatedReview
      };

      // Si le profil a aussi un email ou id, synchroniser pour compatibilité d'accès
      if (profile?.email && profile.email !== myKey) {
        updatedJuryMemberReviews[profile.email] = myUpdatedReview;
      }
      if (profile?.id && profile.id !== myKey) {
        updatedJuryMemberReviews[profile.id] = myUpdatedReview;
      }

      // Vérifier si TOUS les membres du jury assignés ont maintenant finalisé leur décision
      let allFinalized = true;
      for (const jury of assignedJuries) {
        const jKey = jury.id || jury.idProfil || jury.email;
        const isCurrent = jKey === myKey || jury.id === profile?.id || jury.email === profile?.email;
        if (isCurrent) {
          continue; // Le jury courant vient d'être finalisé ci-dessus
        }
        const existing = updatedJuryMemberReviews[jKey] || 
          (jury.email ? updatedJuryMemberReviews[jury.email] : undefined) || 
          (jury.idProfil ? updatedJuryMemberReviews[jury.idProfil] : undefined);
        
        if (!existing || !existing.isFinalized) {
          allFinalized = false;
          break;
        }
      }

      const consolidatedDecision: JuryDecision = {
        ...formData as JuryDecision,
        date: now
      };

      // RÈGLE COLLÉGIALE STRICTE :
      // S'il reste des jurys assignés n'ayant pas encore finalisé, le dossier RESTE OBLIGATOIREMENT en statut 'COMPLET'.
      // Dès que le dernier membre du jury finalise sa décision, le dossier devient alors 'VALIDE'.
      const nextStatus = allFinalized ? 'VALIDE' : 'COMPLET';

      LocalDatabaseService.updateDossier(dossier.id, {
        juryMemberReviews: updatedJuryMemberReviews,
        juryDecision: consolidatedDecision,
        status: nextStatus,
        updatedAt: now
      });

      if (allFinalized) {
        setFeedbackSuccess("Tous les membres du jury ont finalisé leur décision ! Le dossier est désormais officiellement VALIDÉ.");
        setTimeout(() => {
          onDone();
        }, 1200);
      } else {
        const remaining = totalJuriesCount - (finalizedCount + (isMyDecisionFinalized ? 0 : 1));
        setFeedbackSuccess(`Votre avis a été finalisé avec succès ! Le dossier restera "Complet" jusqu'à la finalisation par les ${remaining} autre(s) membre(s) du jury.`);
        setTimeout(() => {
          setFeedbackSuccess(null);
        }, 4000);
      }
    } catch (error) {
      console.error(error);
      alert("Erreur lors de l'enregistrement de votre avis.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-accent/10 pt-12">
      {readOnly ? (
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-4 mb-8">
          <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900/80 leading-relaxed">
            <span className="font-bold text-amber-700">Mode Consultation Seule : </span>
            Ce dossier n'est pas sous votre assignation d'arbitrage. Vous pouvez consulter l'ensemble des données, formules et justifications sans pouvoir les modifier.
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-2xl bg-secondary/[0.05] border border-secondary/15 flex items-start gap-4 mb-8">
          <Info className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
          <div className="text-xs text-accent/75 leading-relaxed font-light">
            <span className="font-bold text-secondary">Note aux membres du jury : </span>
            Ce dossier est actuellement <strong>Dossier Complet</strong>. Les remarques, justifications et préconisations que vous saisissez sont des éléments d'analyse complémentaires consultatifs. Elles alimentent le dossier du candidat et les échanges collégiaux, et ne deviendront définitives qu'après l'arbitrage final et la validation collégiale (« Dossier Validé »).
          </div>
        </div>
      )}

      <h3 className="text-secondary mb-10 flex items-center gap-4">
        <div className="w-12 h-12 bg-primary rounded-base flex items-center justify-center shadow-lg">
          <Gavel className="w-7 h-7 text-white" />
        </div>
        Verdict Final 2025
        {readOnly && (
          <span className="ml-auto text-xs px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Lecture Seule
          </span>
        )}
      </h3>

      <div className={cn("space-y-12", readOnly && "opacity-90 pointer-events-none")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <label className="text-[10px] font-black uppercase text-accent/30 tracking-[0.2em] mb-4 block px-2">Verdict Global</label>
            <div className="flex gap-3">
              {['Favorable', 'Réserve', 'Défavorable'].map(v => (
                <button
                   key={v}
                   disabled={readOnly}
                   onClick={() => setFormData({...formData, verdict: v})}
                   className={cn(
                     "flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all shadow-sm",
                     formData.verdict === v ? "bg-accent border-accent text-white shadow-accent/20" : "bg-white border-accent/10 text-accent/50 hover:border-secondary/50",
                     readOnly && "cursor-not-allowed opacity-80"
                   )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end pb-2">
            <label className={cn(
              "flex items-center gap-4 select-none bg-accent/5 p-4 rounded-xl border border-accent/10 transition-colors group",
              readOnly ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:bg-white"
            )}>
              <div className={cn(
                "w-7 h-7 rounded-base flex items-center justify-center border-2 transition-all",
                formData.unanimous ? "bg-primary border-primary" : "border-accent/20 bg-white group-hover:border-primary/50"
              )}>
                {formData.unanimous && <CheckCircle2 className="w-5 h-5 text-white" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden"
                disabled={readOnly}
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
                disabled={readOnly}
                className="w-full bg-white border border-accent/10 rounded-lg p-3 text-lg font-bold focus:ring-2 focus:ring-primary/20 outline-none disabled:bg-gray-50 disabled:text-accent/70"
                value={formData.investmentPercentage || ''}
                onChange={e => setFormData({...formData, investmentPercentage: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">% Mission (base 98)</label>
              <input 
                type="number"
                disabled={readOnly}
                className="w-full bg-white border border-accent/10 rounded-lg p-3 text-lg font-bold focus:ring-2 focus:ring-primary/20 outline-none disabled:bg-gray-50 disabled:text-accent/70"
                value={formData.missionPercentage || ''}
                onChange={e => setFormData({...formData, missionPercentage: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">Référent Jury</label>
              <input 
                type="text"
                disabled={readOnly}
                className="w-full bg-white border border-accent/10 rounded-lg p-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none disabled:bg-gray-50 disabled:text-accent/70"
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
                disabled={readOnly}
                className="w-full bg-white border border-accent/10 rounded-lg p-4 text-sm font-light h-24 outline-none focus:ring-2 focus:ring-primary/20 resize-none shadow-sm disabled:bg-gray-50 disabled:text-accent/70"
                value={formData.whyThisSalary}
                onChange={e => setFormData({...formData, whyThisSalary: e.target.value})}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">Actions de progrès attendues</label>
              <textarea 
                disabled={readOnly}
                className="w-full bg-white border border-accent/10 rounded-lg p-4 text-sm font-light h-24 outline-none focus:ring-2 focus:ring-primary/20 resize-none shadow-sm disabled:bg-gray-50 disabled:text-accent/70"
                value={formData.whatToDoMore}
                onChange={e => setFormData({...formData, whatToDoMore: e.target.value})}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">Ressenti / Feeling Consultant</label>
              <input 
                 type="text"
                 disabled={readOnly}
                 className="w-full bg-white border border-accent/10 rounded-lg p-4 text-sm font-light outline-none focus:ring-2 focus:ring-primary/20 shadow-sm disabled:bg-gray-50 disabled:text-accent/70"
                 value={formData.consultantFeeling}
                 onChange={e => setFormData({...formData, consultantFeeling: e.target.value})}
                 placeholder="Commentaire sur l'état d'esprit..."
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-accent/30 tracking-widest mb-3 block px-1">Salaire max proposé si augmentation TJ</label>
              <input 
                 type="number"
                 disabled={readOnly}
                 className="w-full bg-white border border-accent/10 rounded-lg p-4 text-sm font-light outline-none focus:ring-2 focus:ring-primary/20 shadow-sm disabled:bg-gray-50 disabled:text-accent/70"
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
              disabled={readOnly}
              className="w-full bg-accent/5 border border-accent/10 rounded-xl p-6 text-2xl font-bold tracking-tight focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none shadow-inner disabled:bg-gray-100 disabled:text-accent/70"
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
              disabled={readOnly}
              className="w-full bg-transparent text-3xl font-bold text-accent tabular-nums text-center outline-none focus:ring-2 focus:ring-primary/10 rounded disabled:text-accent/70"
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
            disabled={readOnly}
            className="w-full bg-accent/5 border border-accent/10 rounded-xl p-8 text-lg font-light min-h-[180px] outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 resize-none shadow-inner transition-all leading-relaxed disabled:bg-gray-100 disabled:text-accent/70"
            value={formData.conclusion}
            onChange={e => setFormData({...formData, conclusion: e.target.value})}
          />
        </div>

        {!readOnly && (
          <button 
            onClick={handleFinalizeMyReview}
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
        )}
      </div>
    </div>
  );
}
