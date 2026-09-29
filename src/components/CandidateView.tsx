import { defaultReportData } from '../data/defaultAnnualReport';
import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, collection, getDocs, query, where, getDoc } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { UserProfile, Dossier, AnnualReport, ClientFeedback, Grade, PreviousObjective, NextObjective, Satisfaction, DossierStatus, DossierDocument } from '../types';
import { LocalDatabaseService } from '../services/localDatabaseService';
import { FileUp, Save, Send, CheckCircle2, AlertCircle, Loader2, Plus, Trash2, ChevronRight, ChevronDown, Eye, Calculator, LogIn, TrendingUp, Maximize2, X, Download, Undo2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { calculateYears, calculateSalaryFormule, getPrimeAnciennete, resolveTargetGrade } from '../lib/salaryUtils';
import { generateDossierPDF } from '../utils/pdfGenerator';
import { requestGoogleDriveAccess, setGoogleDriveAccessToken } from '../lib/firebase';
import { DriveObjectivesService } from '../services/driveObjectivesService';
import { TabButton } from './candidate/CandidateUI';
import { BilanIntroTab } from './candidate/tabs/BilanIntroTab';
import { DocumentsTab } from './candidate/tabs/DocumentsTab';
import { SyntheseTab } from './candidate/tabs/SyntheseTab';
import { ObjectivesTab } from './candidate/tabs/ObjectivesTab';
import { SatisfactionTab } from './candidate/tabs/SatisfactionTab';
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
  initialTab?: string | null;
  targetLinkId?: string | null;
  onTabChange?: (tab: string) => void;
}


export function CandidateView({ profile, dossier, currentUser, initialTab, targetLinkId, onTabChange }: CandidateViewProps) {
  const [dossierStatus, setDossierStatus] = useState<DossierStatus>(() => dossier?.status || 'OUVERT');
  const campaignYear = dossier?.campaignYear ||
    (dossier?.campaignId ? parseInt(dossier.campaignId.replace(/[^0-9]/g, ''), 10) : undefined) ||
    new Date().getFullYear();

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
  const [isManualDepositingBilan, setIsManualDepositingBilan] = useState(false);
  const [pastImportSuccessMessage, setPastImportSuccessMessage] = useState<string | null>(null);
  const [pastImportErrorMessage, setPastImportErrorMessage] = useState<string | null>(null);
  const hasUploadedDocsInitial = (dossier?.documents && dossier.documents.length > 0);
  const isDeliberatedOrValide = dossier?.status === 'VALIDE' || Boolean(dossier?.juryDecision?.amount);

  type CandidateTabType = 'DOCUMENTS' | 'BILAN_INTRO' | 'SYNTHESE' | 'OBJECTIFS_PASSES' | 'SATISFACTION' | 'EXPERTISES' | EngagementSection | 'METEOS' | 'REFERENT' | 'PRETENTIONS' | 'CALCULATRICE' | 'RETOURS_PAIRS' | 'AVIS_JURY';

  const [activeTab, setActiveTab] = useState<CandidateTabType>(() => {
    if (initialTab) return initialTab as CandidateTabType;
    return isDeliberatedOrValide ? 'AVIS_JURY' : 'DOCUMENTS';
  });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as CandidateTabType);
      if (onTabChange) onTabChange(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (targetLinkId && targetLinkId.startsWith('link_ref_')) {
      setReportData(prev => ({ ...prev, isReferentOrAspiring: true }));
    }
  }, [targetLinkId]);

  useEffect(() => {
    if (!targetLinkId) return;

    let attempts = 0;
    const maxAttempts = 30; // Check every 25ms up to 750ms for layout stabilization

    const timer = setInterval(() => {
      attempts++;
      const el = document.getElementById(targetLinkId);
      if (el) {
        const rect = el.getBoundingClientRect();
        const navbarHeight = 180;
        const availableHeight = Math.max(200, window.innerHeight - navbarHeight);
        const targetScrollY = Math.max(0, window.scrollY + rect.top - navbarHeight - Math.max(0, (availableHeight - rect.height) / 2));

        // Use instant scroll initially to place viewport accurately without interruption, then smooth if needed
        window.scrollTo({ top: targetScrollY, behavior: attempts <= 3 ? 'instant' : 'smooth' });

        document.querySelectorAll('.target-link-highlight').forEach(n => {
          n.classList.remove('target-link-highlight');
        });
        el.classList.add('target-link-highlight');

        // Stop polling once the element has stabilized well within view after initial rendering
        if (attempts >= 8 && rect.top >= 140 && rect.bottom <= window.innerHeight + 50) {
          clearInterval(timer);
        }
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 25);

    return () => clearInterval(timer);
  }, [targetLinkId, activeTab]);

  const visibleTabs: CandidateTabType[] = [
    'DOCUMENTS',
    'BILAN_INTRO',
    'SYNTHESE',
    'OBJECTIFS_PASSES',
    'SATISFACTION',
    'EXPERTISES',
    ...engagementSections.map(s => s.id),
    'METEOS',
    ...((isDossierComplet || Boolean(dossier?.juryDecision?.amount) || Object.keys(dossier?.juryMemberReviews || {}).length > 0)
      ? (['RETOURS_PAIRS', 'AVIS_JURY'] as CandidateTabType[])
      : []),
    'PRETENTIONS',
    'CALCULATRICE'
  ];

  const handleTabChange = (tab: CandidateTabType) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentTabIndex = visibleTabs.indexOf(activeTab);
  const nextTab = currentTabIndex >= 0 && currentTabIndex < visibleTabs.length - 1 ? visibleTabs[currentTabIndex + 1] : null;
  const [meteoSubTab, setMeteoSubTab] = useState<'LIST' | 'CHART'>('LIST');
  const [selectedMeteoIndex, setSelectedMeteoIndex] = useState<number | null>(null);
  
  const [reportData, setReportData] = useState<AnnualReport>(() => {
    const defaultGrade = (profile.currentGrade || 'Junior') as Grade;
    const initialWished = resolveTargetGrade(defaultGrade, dossier?.annualReport?.wishedGrade);

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
    const initialWished = resolveTargetGrade(defaultGrade, dossier?.annualReport?.wishedGrade);

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
      let accessToken = await requestGoogleDriveAccess();
      if (!accessToken) {
        throw new Error("L'autorisation d'accès à Google Drive n'a pas pu être obtenue.");
      }

      // 2. Récupérer l'année de campagne et le matricule du candidat
      const targetDossierId = dossier?.id || `${profile.id}_${campaignYear}`;
      const matricule = profile.matricule || profile.idProfil || profile.id || profile.displayName;

      if (!matricule) {
        throw new Error("Aucun matricule ou identifiant collaborateur n'est renseigné sur votre profil.");
      }

      // 3. Rechercher le bilan N-1 et extraire les objectifs futurs définis l'an passé (avec retry si token expiré)
      let result;
      try {
        result = await DriveObjectivesService.importPastYearObjectives(accessToken, campaignYear, matricule);
      } catch (err: any) {
        const isAuthError = err?.message && (
          err.message.includes('authentication') ||
          err.message.includes('401') ||
          err.message.includes('OAuth 2') ||
          err.message.includes('credential')
        );
        if (isAuthError) {
          // Token expiré en session : forcer la demande d'un nouveau token frais
          setGoogleDriveAccessToken(null);
          accessToken = await requestGoogleDriveAccess(true);
          if (accessToken) {
            result = await DriveObjectivesService.importPastYearObjectives(accessToken, campaignYear, matricule);
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

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

  const handleManualDepositBilanN1 = async (file: File) => {
    if (isLockedForEditing) return;
    setIsManualDepositingBilan(true);
    setPastImportSuccessMessage(null);
    setPastImportErrorMessage(null);

    try {
      const priorYear = campaignYear - 1;
      const targetDossierId = dossier?.id || `${profile.id}_${campaignYear}`;

      const result = await DriveObjectivesService.extractObjectivesFromUploadedFile(file);
      if (!result.success || result.objectives.length === 0) {
        throw new Error(result.error || "Aucun objectif n'a pu être extrait du fichier déposé.");
      }

      // 1. Mettre à jour les objectifs dans le rapport annuel
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

      // 2. Enregistrer le document déposé dans dossier.documents
      const docType = file.name.endsWith('.pdf') ? 'PDF' : (file.name.endsWith('.docx') ? 'DOCX' : 'DOCUMENT');
      const depositedDocItem: DossierDocument = {
        type: docType,
        name: `Bilan Annuel N-1 (${priorYear}) - ${file.name}`,
        url: `local-file://${file.name}`,
        uploadedAt: new Date().toISOString(),
        fieldsPopulated: true
      };

      const existingDocs = dossier?.documents || [];
      const alreadyExists = existingDocs.some(d => d.name === depositedDocItem.name);
      if (!alreadyExists) {
        await setDoc(doc(db, 'dossiers', targetDossierId), {
          documents: [depositedDocItem, ...existingDocs]
        }, { merge: true });
      }

      const successMsg = `🎉 Succès ! ${result.objectives.length} objectif(s) de l'année passée ont été extraits depuis "${file.name}" et enregistrés dans vos Objectifs Année Passée.`;
      setPastImportSuccessMessage(successMsg);

      const toast = document.createElement("div");
      toast.innerText = successMsg;
      toast.className = "fixed bottom-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-xl z-50 max-w-md text-xs font-semibold leading-relaxed animate-bounce";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 6000);
    } catch (err: any) {
      console.error("Erreur extraction objectifs fichier déposé:", err);
      const errMsg = err.message || "Erreur lors de l'extraction des objectifs du fichier déposé.";
      setPastImportErrorMessage(errMsg);
    } finally {
      setIsManualDepositingBilan(false);
    }
  };

  const calculateCompleteness = () => {
    // heuristics for completeness
    const totalFields = 22; // Excludes the six removed Savoir-faire fields and synthesis fields
    let filledCount = 0;
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
      LocalDatabaseService.updateDossier(activeId, {
        status: 'OUVERT',
        updatedAt: new Date().toISOString()
      });
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
      {dossierStatus === 'VALIDE' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-green-700 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-black text-secondary uppercase tracking-wider">Dossier Validé par la Commission</div>
              <p className="text-xs text-accent/60 mt-0.5">Votre dossier a été délibéré. Vous pouvez consulter l'ensemble de vos rubriques et retrouver la décision complète dans l'onglet « Avis du Jury ».</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('AVIS_JURY')}
            className="shrink-0 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            Consulter l'Avis du Jury
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
      <div className="lg:col-span-1">
        <div className="bg-white p-6 rounded-xl border border-accent/10 sticky top-28 shadow-lg max-h-[calc(100vh-8rem)] flex flex-col">
          <div className="space-y-3 overflow-y-auto pr-2 flex-1">
            <TabButton 
              active={activeTab === 'DOCUMENTS'} 
              onClick={() => handleTabChange('DOCUMENTS')} 
              label="Pièces Jointes & Import" 
              count={dossier?.documents?.length || 0} 
              badge={!hasUploadedDocs ? "Recommandé" : undefined}
            />
            <TabButton 
              active={activeTab === 'BILAN_INTRO'} 
              onClick={() => handleTabChange('BILAN_INTRO')} 
              label="Objectifs Bilan Annuel" 
            />
            <TabButton 
              active={activeTab === 'SYNTHESE'} 
              onClick={() => handleTabChange('SYNTHESE')} 
              label="Synthèse" 
            />
            <TabButton active={activeTab === 'OBJECTIFS_PASSES'} onClick={() => handleTabChange('OBJECTIFS_PASSES')} label="Objectifs Année Passée" />
            <TabButton active={activeTab === 'SATISFACTION'} onClick={() => handleTabChange('SATISFACTION')} label="Satisfaction" />
            <TabButton active={activeTab === 'EXPERTISES'} onClick={() => handleTabChange('EXPERTISES')} label="Savoir-faire" />
            {engagementSections.map(section => (
              <div key={section.id}>
                <TabButton active={activeTab === section.id} onClick={() => handleTabChange(section.id)} label={section.label} />
              </div>
            ))}
            <TabButton active={activeTab === 'METEOS'} onClick={() => handleTabChange('METEOS')} label="Météos Client" count={meteoLinks.length + feedbacks.length} />
            {(isDossierComplet || Boolean(dossier?.juryDecision?.amount) || Object.keys(dossier?.juryMemberReviews || {}).length > 0) && (
              <>
                <TabButton 
                  active={activeTab === 'RETOURS_PAIRS'} 
                  onClick={() => handleTabChange('RETOURS_PAIRS')} 
                  label="Retours Pairs" 
                  count={Object.keys(dossier?.consultantFeedbacks || {}).length} 
                />
                <TabButton 
                  active={activeTab === 'AVIS_JURY'} 
                  onClick={() => handleTabChange('AVIS_JURY')} 
                  label="Avis du Jury" 
                  count={Object.keys(dossier?.juryMemberReviews || {}).length} 
                />
              </>
            )}
            <TabButton active={activeTab === 'PRETENTIONS'} onClick={() => handleTabChange('PRETENTIONS')} label="Objectifs" />
            <TabButton active={activeTab === 'CALCULATRICE'} onClick={() => handleTabChange('CALCULATRICE')} label="Prétentions de carrière et salariales" />
          </div>

          <div className="pt-6 space-y-4 px-2 border-t border-accent/10 mt-4 shrink-0">
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
            
            {dossierStatus === 'VALIDE' ? (
              <div className="w-full py-3.5 px-4 rounded-xl bg-green-50 border border-green-200 text-green-700 font-bold text-center text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Dossier Délibéré & Validé
              </div>
            ) : dossierStatus === 'COMPLET' ? (
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
              handleManualDepositBilanN1={handleManualDepositBilanN1}
              isManualDepositingBilan={isManualDepositingBilan}
              pastImportSuccessMessage={pastImportSuccessMessage}
              pastImportErrorMessage={pastImportErrorMessage}
            />
          )}

          {activeTab === 'BILAN_INTRO' && (
            <BilanIntroTab />
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
              handleManualDepositBilanN1={handleManualDepositBilanN1}
              isManualDepositingBilan={isManualDepositingBilan}
            />
          )}

          {activeTab === 'SATISFACTION' && (
            <SatisfactionTab
              reportData={reportData}
              setReportData={setReportData}
              isLockedForEditing={isLockedForEditing}
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
              profile={profile}
              dossier={dossier}
              campaignYear={campaignYear}
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

          {activeTab === 'RETOURS_PAIRS' && (
            <PeerFeedbacksTab dossier={dossier} />
          )}

          {activeTab === 'AVIS_JURY' && (
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
              setReportData={setReportData}
            />
          )}
        </AnimatePresence>

        {nextTab && (
          <div className="mt-12 pt-6 border-t border-accent/10 flex justify-end">
            <button
              type="button"
              onClick={() => handleTabChange(nextTab)}
              className="px-6 py-3.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>Suivant</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </fieldset>
    </div>
    </div>
  );
}

