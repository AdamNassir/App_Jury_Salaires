import { defaultReportData } from '../data/defaultAnnualReport';
import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, collection, getDocs, query, where, getDoc } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { UserProfile, Dossier, AnnualReport, ClientFeedback, Grade, PreviousObjective, NextObjective, Satisfaction, DossierStatus, DossierDocument } from '../types';
import { LocalDatabaseService } from '../services/localDatabaseService';
import { FileUp, Save, Send, CheckCircle2, AlertCircle, Loader2, Plus, Trash2, ChevronRight, ChevronDown, Eye, Calculator, LogIn, TrendingUp, Maximize2, X, Download, Undo2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { calculateYears, calculateSalaryFormule, getPrimeAnciennete } from '../lib/salaryUtils';
import { generateDossierPDF } from '../utils/pdfGenerator';
import { requestGoogleDriveAccess } from '../lib/firebase';
import { DriveObjectivesService } from '../services/driveObjectivesService';
import { TabButton, DataBox } from './candidate/CandidateUI';
import { DocumentsTab } from './candidate/tabs/DocumentsTab';
import { SyntheseTab } from './candidate/tabs/SyntheseTab';
import { ObjectivesTab } from './candidate/tabs/ObjectivesTab';
import { ExpertisesTab } from './candidate/tabs/ExpertisesTab';
import { EngagementTab, engagementSections, EngagementSection, isEngagementSection } from './candidate/tabs/EngagementTab';
import { MeteosTab } from './candidate/tabs/MeteosTab';
import { PretentionsTab } from './candidate/tabs/PretentionsTab';
import { SalaryCalculatorTab } from './candidate/tabs/SalaryCalculatorTab';
import { PeerFeedbacksTab } from './candidate/tabs/PeerFeedbacksTab';
import { JuryFeedbacksTab } from './candidate/tabs/JuryFeedbacksTab';

const sanitizeForStorage = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  // Let Firebase FieldValue pass through unmodified
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

interface CandidateViewProps {
  profile: UserProfile;
  dossier?: Dossier;
  currentUser?: UserProfile;
}


export function CandidateView({ profile, dossier }: CandidateViewProps) {
  const [dossierStatus, setDossierStatus] = useState<DossierStatus>(() => dossier?.status || 'OUVERT');

  // Keep dossierStatus in sync if dossier prop changes from parent
  useEffect(() => {
    if (dossier?.status) {
      setDossierStatus(dossier.status);
      if (dossier.status !== 'COMPLET') setShowCancelConfirmation(false);
    }
  }, [dossier?.status]);

  const isLockedForEditing = dossierStatus !== 'OUVERT';
  const isDossierComplet = dossierStatus === 'COMPLET' || dossierStatus === 'VALIDE';

  const [loading, setLoading] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isImportingPastObjectives, setIsImportingPastObjectives] = useState(false);
  const [pastImportSuccessMessage, setPastImportSuccessMessage] = useState<string | null>(null);
  const [pastImportErrorMessage, setPastImportErrorMessage] = useState<string | null>(null);
  const hasUploadedDocsInitial = (dossier?.documents && dossier.documents.length > 0);
  const [activeTab, setActiveTab] = useState<'SYNTHESE' | 'OBJECTIFS_PASSES' | 'EXPERTISES' | EngagementSection | 'METEOS' | 'REFERENT' | 'PRETENTIONS' | 'DOCUMENTS' | 'CALCULATRICE' | 'RETOURS_PAIRS' | 'AVIS_JURY'>(
    hasUploadedDocsInitial ? 'SYNTHESE' : 'DOCUMENTS'
  );
  const [meteoSubTab, setMeteoSubTab] = useState<'LIST' | 'CHART'>('LIST');
  const [selectedMeteoIndex, setSelectedMeteoIndex] = useState<number | null>(null);
  
  const [reportData, setReportData] = useState<AnnualReport>(() => {
    const defaultGrade = (profile.currentGrade || 'Junior') as Grade;
    const initialWished = (
      defaultGrade === 'Junior' && (!dossier?.annualReport?.wishedGrade || dossier?.annualReport?.wishedGrade === 'Confirmé')
        ? 'Junior'
        : (dossier?.annualReport?.wishedGrade || defaultGrade)
    ) as Grade;

    return {
      ...defaultReportData,
      currentSalary: profile.currentSalary || 0,
      currentTJSalaire: profile.currentTJSalaire || 0,
      currentTJM: profile.currentTJM || 0,
      ...(dossier?.annualReport || {}),
      currentGrade: defaultGrade,
      wishedGrade: initialWished
    };
  });

  const [feedbacks, setFeedbacks] = useState<ClientFeedback[]>(dossier?.clientFeedbacks || []);
  const [meteoLinks, setMeteoLinks] = useState<string[]>(
    Array.isArray(dossier?.meteoLinks) ? dossier.meteoLinks : []
  );

  const isFirstRenderForAutosave = useRef(true);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveOperationVersionRef = useRef(0);
  const activeDossierIdRef = useRef<string | null>(dossier?.id || null);

  useEffect(() => {
    if (dossier?.id) activeDossierIdRef.current = dossier.id;
  }, [dossier?.id]);

  // Re-initialize reportData and feedbacks whenever selected candidate or dossier changes
  useEffect(() => {
    isFirstRenderForAutosave.current = true;
    const defaultGrade = (profile.currentGrade || 'Junior') as Grade;
    const initialWished = (
      defaultGrade === 'Junior' && (!dossier?.annualReport?.wishedGrade || dossier?.annualReport?.wishedGrade === 'Confirmé')
        ? 'Junior'
        : (dossier?.annualReport?.wishedGrade || defaultGrade)
    ) as Grade;

    if (dossier?.annualReport) {
      setReportData({
        ...defaultReportData,
        currentSalary: profile.currentSalary || 0,
        currentTJSalaire: profile.currentTJSalaire || 0,
        currentTJM: profile.currentTJM || 0,
        ...dossier.annualReport,
        currentGrade: defaultGrade,
        wishedGrade: initialWished
      });
    } else {
      setReportData({
        ...defaultReportData,
        wishedGrade: initialWished,
        currentSalary: profile.currentSalary || 0,
        currentGrade: defaultGrade,
        currentTJSalaire: profile.currentTJSalaire || 0,
        currentTJM: profile.currentTJM || 0,
      });
    }

    if (dossier?.clientFeedbacks) {
      setFeedbacks(dossier.clientFeedbacks);
    } else {
      setFeedbacks([]);
    }
    setMeteoLinks(Array.isArray(dossier?.meteoLinks) ? dossier.meteoLinks : []);
  }, [profile.id, dossier?.id]);

  // Autosave when dossier content changes
  useEffect(() => {
    if (isFirstRenderForAutosave.current) {
      isFirstRenderForAutosave.current = false;
      return;
    }
    if (isLockedForEditing) return;

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      handleSave(false, true); // Silent save
    }, 2000);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [reportData, feedbacks, meteoLinks, isLockedForEditing]);

  // Prevent default window drag-and-drop behavior to avoid standard browser navigation / file download
  useEffect(() => {
    if (activeTab === 'DOCUMENTS') {
      const preventDefault = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
      };
      window.addEventListener('dragover', preventDefault);
      window.addEventListener('drop', preventDefault);
      return () => {
        window.removeEventListener('dragover', preventDefault);
        window.removeEventListener('drop', preventDefault);
      };
    }
  }, [activeTab]);

  const handleViewDocument = (dDoc: DossierDocument) => {
    if (!dDoc.url) return;
    if (dDoc.url.startsWith('data:application/pdf')) {
      try {
        const arr = dDoc.url.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = dDoc.name || 'Bilan_Annuel.pdf';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        window.open(dDoc.url, '_blank');
      }
    } else {
      window.open(dDoc.url, '_blank');
    }
  };

  const handleImportPastYearObjectives = async () => {
    if (isLockedForEditing) return;
    setIsImportingPastObjectives(true);
    setPastImportSuccessMessage(null);
    setPastImportErrorMessage(null);

    try {
      // 1. Obtenir l'accès Google Drive avec les scopes de lecture
      const accessToken = await requestGoogleDriveAccess();
      if (!accessToken) {
        throw new Error("L'autorisation d'accès à Google Drive n'a pas pu être obtenue.");
      }

      // 2. Récupérer l'année de campagne et le matricule du candidat
      const campaignYear = dossier?.campaignYear || (dossier?.campaignId ? parseInt(dossier.campaignId.replace(/[^0-9]/g, '')) : 2026) || 2026;
      const targetDossierId = dossier?.id || `${profile.id}_${campaignYear}`;
      const matricule = profile.matricule || profile.idProfil || profile.id || profile.displayName;

      if (!matricule) {
        throw new Error("Aucun matricule ou identifiant collaborateur n'est renseigné sur votre profil.");
      }

      // 3. Rechercher le bilan N-1 et extraire les objectifs futurs définis l'an passé
      const result = await DriveObjectivesService.importPastYearObjectives(accessToken, campaignYear, matricule);

      if (!result.success || result.objectives.length === 0) {
        throw new Error(result.error || "Aucun objectif n'a pu être extrait du bilan de l'année passée.");
      }

      // 4. Mettre à jour les objectifs de l'année passée dans le rapport annuel
      setReportData(prev => {
        const updated = {
          ...prev,
          previousObjectives: result.objectives
        };

        setDoc(doc(db, 'dossiers', targetDossierId), {
          annualReport: sanitizeForStorage(updated)
        }, { merge: true }).catch(err => console.error("Auto-saved previousObjectives err:", err));

        return updated;
      });

      // 5. Enregistrer le document importé comme justificatif de référence dans le dossier
      if (result.file) {
        const driveDocItem: DossierDocument = {
          type: result.file.name.endsWith('.docx') ? 'DOCX' : 'GOOGLE_DOC',
          name: `Bilan Année Passée (${result.priorYear}) - ${result.file.name}`,
          url: result.file.webViewLink || `https://drive.google.com/file/d/${result.file.id}/view`,
          uploadedAt: new Date().toISOString(),
          fieldsPopulated: true
        };

        const existingDocs = dossier?.documents || [];
        const alreadyExists = existingDocs.some(d => d.name === driveDocItem.name);
        if (!alreadyExists) {
          await setDoc(doc(db, 'dossiers', targetDossierId), {
            documents: [driveDocItem, ...existingDocs]
          }, { merge: true });
        }
      }

      const successMsg = `🎉 Succès ! ${result.objectives.length} objectif(s) de l'année passée (${result.priorYear}) ont été importés depuis "${result.file?.name}".`;
      setPastImportSuccessMessage(successMsg);

      // Notification toast
      const toast = document.createElement("div");
      toast.innerText = successMsg;
      toast.className = "fixed bottom-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-xl z-50 max-w-md text-xs font-semibold leading-relaxed animate-bounce";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 6000);

    } catch (err: any) {
      console.error("Erreur importation objectifs passés Drive:", err);
      const errMsg = err.message || "Erreur lors de l'importation depuis Google Drive.";
      setPastImportErrorMessage(errMsg);
    } finally {
      setIsImportingPastObjectives(false);
    }
  };

  const calculateCompleteness = () => {
    // heuristics for completeness
    const totalFields = 24; // Excludes the six removed Savoir-faire fields
    let filledCount = 0;
    if (reportData.synthesis) filledCount++;
    if (reportData.yearSummary) filledCount++;
    if (reportData.previousObjectives.length > 0) filledCount++;
    if (reportData.missionClients?.some(row => row.client.trim() && row.actions.trim() && row.grade && row.comment.trim())) filledCount++;
    if (reportData.careerGoals) filledCount++;
    if (reportData.nextObjectives.length > 0) filledCount++;
    if (reportData.wishedSalary > 0) filledCount++;
    if (reportData.targetTJM > 0) filledCount++;
    if (reportData.lifeKnowledgeSharing) filledCount++;
    if (reportData.lifeTeamSpirit) filledCount++;
    if (reportData.squadEntries ? reportData.squadEntries.some(entry => entry.contributions.trim()) : reportData.squadContributions) filledCount++;
    if (reportData.recruitmentPromotion) filledCount++;
    if (reportData.encadrementCoach) filledCount++;
    if (feedbacks.length > 0) filledCount += 5; 
    
    return Math.min(100, Math.max(0, Math.round((filledCount / totalFields) * 100)));
  };

  const handleSave = async (submit: boolean = false, isSilent: boolean = false) => {
    if (!isSilent && autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const operationVersion = isSilent
      ? saveOperationVersionRef.current
      : ++saveOperationVersionRef.current;

    if (isLockedForEditing && !isSilent) {
      alert('Ce dossier est validé et ne peut plus être modifié.');
      return;
    }
    if (isLockedForEditing && isSilent) return;

    if (isSilent) setSaveStatus('saving');
    else setLoading(true);

    try {
      let updatedDocs = dossier?.documents || [];

      if (submit) {
        // Generate PDF report automatically on submission
        const activeYear = dossier?.campaignYear || (dossier?.campaignId ? parseInt(dossier.campaignId.replace(/[^0-9]/g, '')) || 2025 : 2025);
        const pdfDataUri = generateDossierPDF(
          profile,
          dossier ? { ...dossier, meteoLinks } : dossier,
          reportData,
          feedbacks
        );
        const pdfFileName = `Bilan_Annuel_${activeYear}_${(profile.displayName || profile.email || 'Candidat').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        const newPdfDoc: DossierDocument = {
          name: pdfFileName,
          type: 'PDF',
          url: pdfDataUri,
          uploadedAt: new Date().toISOString(),
          fieldsPopulated: true
        };
        const filteredDocs = updatedDocs.filter(d => d.name !== pdfFileName);
        updatedDocs = [...filteredDocs, newPdfDoc];
      }

      const activeYear = dossier?.campaignYear || new Date().getFullYear();
      const targetDossierId = dossier?.id || `${profile.idProfil || profile.id}_${activeYear}`;
      activeDossierIdRef.current = targetDossierId;
      const existingDossier = LocalDatabaseService.getDossierById(targetDossierId) || dossier;

      if (!existingDossier) {
        const q = query(
          collection(db, 'users'), 
          where('assignedCandidateIds', 'array-contains', profile.id)
        );
        const consultantDocs = await getDocs(q).catch(() => ({ docs: [] }));
        let assignedConsultantIds = consultantDocs.docs.map(d => d.id);

        const candidateDoc = await getDoc(doc(db, 'users', profile.id)).catch(() => null);
        if (candidateDoc && candidateDoc.exists() && candidateDoc.data().assignedConsultantIds) {
          const profileAssigned = candidateDoc.data().assignedConsultantIds || [];
          assignedConsultantIds = Array.from(new Set([...assignedConsultantIds, ...profileAssigned]));
        }

        if (operationVersion !== saveOperationVersionRef.current) return;

        const newDossier: Dossier = {
          id: targetDossierId,
          candidateId: profile.id,
          idProfil: profile.idProfil || (profile.matricule ? `LL_${profile.matricule.trim()}` : `PERS_${profile.id}`),
          campaignId: dossier?.campaignId || `campaign_${activeYear}`,
          candidateName: profile.displayName || 'Anonyme',
          candidateEmail: profile.email,
          campaignYear: activeYear,
          status: submit ? 'COMPLET' : 'OUVERT',
          annualReport: reportData,
          clientFeedbacks: feedbacks,
          meteoLinks,
          documents: updatedDocs,
          assignedConsultantIds: assignedConsultantIds,
          consultantFeedbacks: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // 1. Sauvegarde locale instantanée
        LocalDatabaseService.saveDossier(newDossier);

      } else {
        const dossierUpdates: Partial<Dossier> = {
          annualReport: reportData,
          clientFeedbacks: feedbacks,
          meteoLinks,
          documents: updatedDocs,
          updatedAt: new Date().toISOString()
        };
        if (submit) dossierUpdates.status = 'COMPLET';

        // 1. Sauvegarde locale instantanée
        LocalDatabaseService.updateDossier(existingDossier.id, dossierUpdates);

      }

      if (submit) {
        setDossierStatus('COMPLET');
      }

      if (!isSilent) {
        if (!submit) {
          alert('Dossier sauvegardé avec succès !');
        }
      } else {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (error) {
      console.error("Save error:", error);
      if (isSilent) setSaveStatus('error');
      else alert('Erreur lors de la sauvegarde.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const handleCancelSubmission = () => {
    if (loading || dossierStatus !== 'COMPLET') return;
    setShowCancelConfirmation(true);
  };

  const confirmCancelSubmission = async () => {
    if (loading || dossierStatus !== 'COMPLET') return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    ++saveOperationVersionRef.current;

    const activeYear = dossier?.campaignYear || new Date().getFullYear();
    const activeId = dossier?.id || activeDossierIdRef.current || `${profile.idProfil || profile.id}_${activeYear}`;

    setLoading(true);
    try {
      await setDoc(doc(db, 'dossiers', activeId), {
        status: 'OUVERT',
        updatedAt: new Date().toISOString()
      }, { merge: true });
      activeDossierIdRef.current = activeId;
      setDossierStatus('OUVERT');
      setShowCancelConfirmation(false);
    } catch (error) {
      console.error("Cancel submission error:", error);
      alert("Une erreur est survenue lors de l'annulation de la soumission.");
    } finally {
      setLoading(false);
    }
  };

  const addObjectivePast = () => {
    setReportData({
      ...reportData,
      previousObjectives: [...reportData.previousObjectives, { objective: '', comments: '', reached: 'OUI' }]
    });
  };

  const addObjectiveFuture = () => {
    setReportData({
      ...reportData,
      nextObjectives: [...reportData.nextObjectives, { objective: '', benefit: '', means: '', measures: '' }]
    });
  };

  if (dossierStatus === 'VALIDE') {
    return (
      <div className="space-y-8">
        <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-sm relative overflow-hidden mb-12">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -mr-24 -mt-24 blur-2xl pointer-events-none" />
          <div className="flex items-center gap-6 mb-8">
            <div className="w-14 h-14 bg-accent/5 rounded-2xl flex items-center justify-center text-accent/20 border border-accent/10">
              <Calculator className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-secondary font-bold text-2xl tracking-tighter">Mes Données de Référence</h3>
              <p className="text-[10px] text-accent/40 uppercase tracking-[0.2em] font-black mt-1">Vérification de votre situation avant délibération</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-8">
            <DataBox label="Matricule" value={profile.matricule} />
            <DataBox label="Date Entrée" value={profile.entryDate ? new Date(profile.entryDate).toLocaleDateString() : 'N/A'} />
            <DataBox label="Expérience" value={`${profile.experienceYears} ans`} />
            <DataBox label="TJ Vendu" value={`${profile.currentTJM}€`} />
            <DataBox label="Salaire Actuel" value={formatCurrency(profile.currentSalary || 0)} />
            <DataBox label="Grade Actuel" value={profile.currentGrade} />
          </div>
          
          <div className="h-px bg-accent/10 my-8" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-6 bg-accent/5 rounded-xl border border-accent/10">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="w-5 h-5 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-accent/40">Projection 100% Invest.</span>
              </div>
              <p className="text-sm text-accent/60 italic leading-relaxed">
                Basé sur votre TJM de <span className="font-bold text-accent">{profile.currentTJM}€</span>, votre positionnement actuel est calculé selon les règles du RG Logiclever.
              </p>
            </div>
            <div className="p-6 bg-primary/5 rounded-xl border border-primary/10">
              <div className="flex items-center gap-3 mb-4 text-primary">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Validation Admin</span>
              </div>
              <p className="text-sm text-accent/60 italic leading-relaxed">
                Ces données ont été importées depuis votre dossier RH. En cas d'erreur manifeste, veuillez contacter la Direction.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-16 rounded-xl border border-green-200 shadow-2xl flex flex-col items-center text-center max-w-4xl mx-auto relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-2 bg-green-500" />
          <div className="w-24 h-24 bg-green-50 rounded-base flex items-center justify-center mb-10 shadow-inner">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-green-600 mb-4 px-4 py-1 bg-green-50 rounded-base inline-block">Campagne 2025 Clôturée</h1>
          <h2 className="text-accent mb-8">Dossier Validé</h2>
          <div className="w-full bg-accent/5 p-12 rounded-xl border border-accent/10 space-y-10 group hover:bg-white transition-all shadow-inner hover:shadow-xl">
            <div className="flex flex-col items-center">
              <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-6">Synthèse Décisionnelle</h4>
              <div className="text-4xl font-bold text-secondary tracking-tight mb-2">
                {dossier.juryDecision?.verdict}
              </div>
              <div className="text-xs font-black uppercase text-accent/20 tracking-widest">Décision Finale du Jury</div>
            </div>
            
            <div className="h-px bg-accent/10 w-24 mx-auto" />

            <div className="flex flex-col items-center pb-4">
              <div className="text-8xl font-black text-primary tracking-tighter mb-4 tabular-nums group-hover:scale-105 transition-transform">
                +{dossier.juryDecision?.amount}€
              </div>
              <div className="text-lg font-black uppercase text-accent/40 tracking-[0.3em]">
                Augmentation Annuelle {dossier.juryDecision?.percentage ? `(${dossier.juryDecision.percentage}%)` : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Détails complémentaires des délibérations et des retours pairs pour le candidat après validation */}
        <div className="space-y-8 max-w-5xl mx-auto">
          <JuryFeedbacksTab dossier={dossier} />
          {Object.keys(dossier.consultantFeedbacks || {}).length > 0 && (
            <PeerFeedbacksTab dossier={dossier} />
          )}
        </div>
      </div>
    );
  }

  const refDate = reportData.wishedSalaryDate || dossier?.annualReport?.wishedSalaryDate;
  const yearsLL = calculateYears(profile.entryDate, refDate);
  const prime = getPrimeAnciennete(yearsLL);
  const yearsExpert = calculateYears(profile.expertGradeDate, refDate);

  const effectiveCurrentGrade: Grade | 'Junior' = (profile.currentGrade || reportData.currentGrade || 'Junior') as Grade | 'Junior';

  // Grade hierarchy: Junior (0) < Confirmé (1) < Senior (2) < Expert (3)
  const gradeOrder: Record<string, number> = {
    'Junior': 0,
    'Confirmé': 1,
    'Senior': 2,
    'Expert': 3
  };

  const currentGradeRank = gradeOrder[effectiveCurrentGrade] ?? 0;
  const availableWishedGrades = (['Junior', 'Confirmé', 'Senior', 'Expert'] as Grade[]).filter(
    g => (gradeOrder[g] ?? 0) >= currentGradeRank
  );

  // Calculate target salary corridor based on target TJM
  const effectiveTargetTJM = reportData.targetTJM || profile.currentTJM || 500;
  const corridorGrade = (reportData.wishedGrade || effectiveCurrentGrade) as Grade | 'Junior';
  const corridorMinSalary = calculateSalaryFormule(effectiveTargetTJM, corridorGrade, yearsExpert, prime);
  const corridorMaxSalary = calculateSalaryFormule(effectiveTargetTJM + 30, corridorGrade, yearsExpert, prime);

  const hasUploadedDocs = (dossier?.documents && dossier.documents.length > 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
      <div className="lg:col-span-1">
        <div className="bg-white p-8 rounded-xl border border-accent/10 sticky top-48 space-y-3 shadow-lg">
          <TabButton 
            active={activeTab === 'DOCUMENTS'} 
            onClick={() => setActiveTab('DOCUMENTS')} 
            label="Pièces Jointes & Import" 
            count={dossier?.documents?.length || 0} 
            badge={!hasUploadedDocs ? "Recommandé" : undefined}
          />
          <TabButton active={activeTab === 'SYNTHESE'} onClick={() => setActiveTab('SYNTHESE')} label="Introduction & Synthèse" />
          <TabButton active={activeTab === 'OBJECTIFS_PASSES'} onClick={() => setActiveTab('OBJECTIFS_PASSES')} label="Objectifs Année Passée" />
          <TabButton active={activeTab === 'EXPERTISES'} onClick={() => setActiveTab('EXPERTISES')} label="Savoir-faire" />
          {engagementSections.map(section => (
            <div key={section.id}>
              <TabButton active={activeTab === section.id} onClick={() => setActiveTab(section.id)} label={section.label} />
            </div>
          ))}
          <TabButton active={activeTab === 'METEOS'} onClick={() => setActiveTab('METEOS')} label="Météos Client" count={meteoLinks.length + feedbacks.length} />
          {isDossierComplet && (
            <>
              <TabButton 
                active={activeTab === 'RETOURS_PAIRS'} 
                onClick={() => setActiveTab('RETOURS_PAIRS')} 
                label="Retours Pairs" 
                count={Object.keys(dossier?.consultantFeedbacks || {}).length} 
              />
              <TabButton 
                active={activeTab === 'AVIS_JURY'} 
                onClick={() => setActiveTab('AVIS_JURY')} 
                label="Avis du Jury" 
                count={Object.keys(dossier?.juryMemberReviews || {}).length} 
              />
            </>
          )}
          <TabButton active={activeTab === 'PRETENTIONS'} onClick={() => setActiveTab('PRETENTIONS')} label="Objectifs" />
          <TabButton active={activeTab === 'CALCULATRICE'} onClick={() => setActiveTab('CALCULATRICE')} label="Calculette du salaire" />

          <div className="pt-8 mt-8 border-t border-accent/10">
            <div className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-6 px-4">Completion Dossier</div>
            <div className="px-4">
              <div className="flex justify-between items-end mb-3">
                <span className="text-3xl font-bold text-accent tracking-tighter">{calculateCompleteness()}%</span>
              </div>
              <div className="h-2 bg-accent/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${calculateCompleteness()}%` }}
                  className="h-full bg-primary shadow-[0_0_10px_rgba(255,93,37,0.3)]"
                />
              </div>
            </div>
          </div>

          <div className="pt-10 space-y-4 px-2">
            {!isLockedForEditing && (
              <div className="text-center py-3.5 px-4 bg-accent/5 rounded-xl border border-accent/10 text-[10px] font-black uppercase tracking-[0.15em] text-accent/50 flex items-center justify-center gap-2">
                {saveStatus === 'saving' && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-secondary shrink-0" />
                    <span>Enregistrement...</span>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <span className="text-green-600">Enregistré</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span className="text-red-600">Erreur</span>
                  </>
                )}
                {saveStatus === 'idle' && (
                  <span className="opacity-60">Sauvegarde automatique</span>
                )}
              </div>
            )}
            {!isLockedForEditing && (
              <button 
                type="button"
                onClick={() => handleSave(false, false)}
                disabled={loading}
                className="w-full py-4 rounded-xl text-base font-bold bg-accent/5 hover:bg-accent/10 text-accent border border-accent/10 transition-all flex items-center justify-center gap-3 shadow-md mb-3 cursor-pointer"
              >
                <Save className="w-5 h-5" /> Enregistrer le brouillon
              </button>
            )}
            
            {dossierStatus === 'COMPLET' ? (
              <div className="space-y-2">
                {showCancelConfirmation ? (
                  <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <p className="text-xs font-semibold leading-relaxed text-amber-950">
                      Confirmer l'annulation ? Le dossier redeviendra modifiable.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirmation(false)}
                        disabled={loading}
                        className="rounded-lg border border-accent/15 bg-white px-3 py-2 text-xs font-bold text-accent hover:bg-accent/5 disabled:opacity-50"
                      >
                        Retour
                      </button>
                      <button
                        type="button"
                        onClick={confirmCancelSubmission}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                        Confirmer
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelSubmission}
                      disabled={loading}
                      className="w-full py-4 rounded-xl text-base font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all flex items-center justify-center gap-3 shadow-xl shadow-amber-500/20 cursor-pointer active:scale-[0.98]"
                    >
                      <Undo2 className="w-5 h-5" /> Annuler Soumission
                    </button>
                    <p className="text-[11px] text-accent/50 text-center leading-tight px-1">
                      Permet de rouvrir votre dossier pour le corriger et le modifier à nouveau.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="relative w-full">
                <div className="w-full">
                  <button 
                    type="button"
                    onClick={() => {
                      if (!loading && !isLockedForEditing) {
                        handleSave(true);
                      }
                    }}
                    disabled={loading || isLockedForEditing}
                    className={cn(
                      "w-full py-4 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-3 shadow-xl",
                      !isLockedForEditing
                        ? "bg-primary text-white shadow-primary/20 cursor-pointer" 
                        : "bg-accent/5 text-accent/20 cursor-not-allowed"
                    )}
                  >
                    <Send className="w-5 h-5" /> Soumettre le dossier
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <fieldset
        disabled={isLockedForEditing && activeTab !== 'RETOURS_PAIRS' && activeTab !== 'AVIS_JURY'}
        className="lg:col-span-3 pb-24 min-w-0"
      >
        <AnimatePresence mode="wait">
          {activeTab === 'DOCUMENTS' && (
            <DocumentsTab
              profile={profile}
              dossier={dossier}
              isLockedForEditing={isLockedForEditing}
              handleViewDocument={handleViewDocument}
              handleImportPastYearObjectives={handleImportPastYearObjectives}
              isImportingPastObjectives={isImportingPastObjectives}
              pastImportSuccessMessage={pastImportSuccessMessage}
              pastImportErrorMessage={pastImportErrorMessage}
            />
          )}

          {activeTab === 'SYNTHESE' && (
            <SyntheseTab
              reportData={reportData}
              setReportData={setReportData}
            />
          )}

          {activeTab === 'OBJECTIFS_PASSES' && (
            <ObjectivesTab
              reportData={reportData}
              setReportData={setReportData}
              handleImportPastYearObjectives={handleImportPastYearObjectives}
              isImportingPastObjectives={isImportingPastObjectives}
            />
          )}

          {activeTab === 'EXPERTISES' && (
            <ExpertisesTab
              reportData={reportData}
              setReportData={setReportData}
              isLockedForEditing={isLockedForEditing}
            />
          )}

          {isEngagementSection(activeTab) && (
            <EngagementTab
              section={activeTab}
              reportData={reportData}
              setReportData={setReportData}
            />
          )}

          {activeTab === 'METEOS' && (
            <MeteosTab
              meteoLinks={meteoLinks}
              setMeteoLinks={setMeteoLinks}
              feedbacks={feedbacks}
              setFeedbacks={setFeedbacks}
              meteoSubTab={meteoSubTab}
              setMeteoSubTab={setMeteoSubTab}
              selectedMeteoIndex={selectedMeteoIndex}
              setSelectedMeteoIndex={setSelectedMeteoIndex}
            />
          )}

          {activeTab === 'RETOURS_PAIRS' && isDossierComplet && (
            <PeerFeedbacksTab dossier={dossier} />
          )}

          {activeTab === 'AVIS_JURY' && isDossierComplet && (
            <JuryFeedbacksTab dossier={dossier} />
          )}

          {activeTab === 'PRETENTIONS' && (
            <PretentionsTab
              profile={profile}
              reportData={reportData}
              setReportData={setReportData}
              effectiveCurrentGrade={effectiveCurrentGrade}
              availableWishedGrades={availableWishedGrades}
              effectiveTargetTJM={effectiveTargetTJM}
              corridorMinSalary={corridorMinSalary}
              corridorMaxSalary={corridorMaxSalary}
              corridorGrade={corridorGrade}
              addObjectiveFuture={addObjectiveFuture}
            />
          )}

          {activeTab === 'CALCULATRICE' && (
            <SalaryCalculatorTab
              profile={profile}
              dossier={dossier}
              reportData={reportData}
            />
          )}
        </AnimatePresence>
      </fieldset>
    </div>
    </div>
  );
}

