import { defaultReportData } from '../data/defaultAnnualReport';
import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, updateDoc, serverTimestamp, collection, getDocs, query, where, getDoc } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { UserProfile, Dossier, AnnualReport, ClientFeedback, Grade, PreviousObjective, NextObjective, Satisfaction, DossierStatus, DossierDocument } from '../types';
import { LocalDatabaseService } from '../services/localDatabaseService';
import { FileUp, Save, Send, CheckCircle2, AlertCircle, Loader2, Plus, Trash2, ChevronRight, ChevronDown, Eye, Calculator, LogIn, TrendingUp, Maximize2, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { calculateYears, calculateSalaryFormule, getPrimeAnciennete } from '../lib/salaryUtils';
import { generateDossierPDF } from '../utils/pdfGenerator';
import { TabButton, DataBox } from './candidate/CandidateUI';
import { DocumentsTab } from './candidate/tabs/DocumentsTab';
import { SyntheseTab } from './candidate/tabs/SyntheseTab';
import { ObjectivesTab } from './candidate/tabs/ObjectivesTab';
import { ExpertisesTab } from './candidate/tabs/ExpertisesTab';
import { EngagementTab } from './candidate/tabs/EngagementTab';
import { MeteosTab } from './candidate/tabs/MeteosTab';
import { IntercontratTab } from './candidate/tabs/IntercontratTab';
import { ReferentTab } from './candidate/tabs/ReferentTab';
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


export function CandidateView({ profile, dossier, currentUser }: CandidateViewProps) {
  const isJuryUser = currentUser?.roles?.includes('JURY') || profile.roles?.includes('JURY');
  const isLockedForEditing = dossier?.status === 'VALIDE' || (!isJuryUser && dossier?.status === 'COMPLET');
  const isDossierComplet = dossier?.status === 'COMPLET' || dossier?.status === 'VALIDE';

  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isObjectParsing, setIsObjectParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasUploadedDocsInitial = (dossier?.documents && dossier.documents.length > 0);
  const [activeTab, setActiveTab] = useState<'SYNTHESE' | 'OBJECTIFS_PASSES' | 'EXPERTISES' | 'ENGAGEMENT' | 'METEOS' | 'REFERENT' | 'PRETENTIONS' | 'DOCUMENTS' | 'CALCULATRICE' | 'INTERCONTRAT' | 'RETOURS_PAIRS' | 'AVIS_JURY'>(
    hasUploadedDocsInitial ? 'SYNTHESE' : 'DOCUMENTS'
  );
  const [meteoSubTab, setMeteoSubTab] = useState<'LIST' | 'CHART'>('LIST');
  const [selectedMeteoIndex, setSelectedMeteoIndex] = useState<number | null>(null);
  
  const [reportData, setReportData] = useState<AnnualReport>({
    ...defaultReportData,
    wishedGrade: profile.currentGrade || 'Confirmé',
    currentSalary: profile.currentSalary || 0,
    currentGrade: profile.currentGrade,
    currentTJM: profile.currentTJM || 0,
    ...(dossier?.annualReport || {})
  });

  const [feedbacks, setFeedbacks] = useState<ClientFeedback[]>(dossier?.clientFeedbacks || []);

  const [showSubmitTooltip, setShowSubmitTooltip] = useState(false);
  const isFirstRenderForAutosave = useRef(true);

  // Re-initialize reportData and feedbacks whenever selected candidate or dossier changes
  useEffect(() => {
    isFirstRenderForAutosave.current = true;
    if (dossier?.annualReport) {
      setReportData({
        ...defaultReportData,
        wishedGrade: profile.currentGrade || 'Confirmé',
        currentSalary: profile.currentSalary || 0,
        currentGrade: profile.currentGrade,
        currentTJM: profile.currentTJM || 0,
        ...dossier.annualReport
      });
    } else {
      setReportData({
        ...defaultReportData,
        wishedGrade: profile.currentGrade || 'Confirmé',
        currentSalary: profile.currentSalary || 0,
        currentGrade: profile.currentGrade,
        currentTJM: profile.currentTJM || 0,
      });
    }

    if (dossier?.clientFeedbacks) {
      setFeedbacks(dossier.clientFeedbacks);
    } else {
      setFeedbacks([]);
    }
  }, [profile.id, dossier?.id]);

  // Autosave when reportData or feedbacks change
  useEffect(() => {
    if (isFirstRenderForAutosave.current) {
      isFirstRenderForAutosave.current = false;
      return;
    }
    if (isLockedForEditing) return;

    const timer = setTimeout(() => {
      handleSave(false, true); // Silent save
    }, 2000);

    return () => clearTimeout(timer);
  }, [reportData, feedbacks, isLockedForEditing]);

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

  const processFile = async (file: File) => {
    const targetDossierId = dossier?.id || `${profile.id}_2025`;

    if (file.size > 15 * 1024 * 1024) {
      console.error("Le document est trop volumineux. La taille maximale est de 15 Mo.");
      return;
    }

    setIsObjectParsing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const result = event.target?.result as string;
          if (!result) throw new Error("Erreur de lecture locale du fichier.");
          
          const base64Content = result.split(',')[1];
          const fileExt = file.name.split('.').pop()?.toLowerCase();
          const mimeType = file.type || (fileExt === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

          console.log("Transmission du fichier au serveur pour analyse...", file.name, mimeType);

          const backendRes = await fetch("/api/parse-document", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              name: file.name,
              mimeType: mimeType,
              base64: base64Content
            })
          });

          if (!backendRes.ok) {
            const errData = await backendRes.json();
            throw new Error(errData.error || "Une erreur est survenue lors de l'extraction.");
          }

          const resData = await backendRes.json();
          if (resData.success && resData.data) {
            const extracted = resData.data;
            
            setReportData(prev => {
              const updated = {
                ...prev,
                yearSummary: extracted.yearSummary || prev.yearSummary,
                synthesis: extracted.synthesis || prev.synthesis,
                knowHow: extracted.knowHow || prev.knowHow,
                commercialActivities: extracted.commercialActivities || prev.commercialActivities,
                training: extracted.training || prev.training,
                progressionDetails: extracted.progressionDetails || prev.progressionDetails,
                techDetails: extracted.techDetails || prev.techDetails,
                deliverables: extracted.deliverables || prev.deliverables,
                autonomyJustification: extracted.autonomyJustification || prev.autonomyJustification,
                careerGoals: extracted.careerGoals || prev.careerGoals,
              };

              setDoc(doc(db, 'dossiers', targetDossierId), {
                annualReport: sanitizeForStorage(updated)
              }, { merge: true }).catch(err => console.error("Auto-saved annualReport err:", err));

              return updated;
            });

            const newDocMockUrl = `local-file://${encodeURIComponent(file.name)}`;
            const newDocs = [
              ...(dossier?.documents || []),
              {
                type: fileExt?.toUpperCase() === 'PDF' ? 'PDF' : 'DOCX',
                name: file.name,
                url: newDocMockUrl,
                uploadedAt: new Date().toISOString(),
                fieldsPopulated: true
              }
            ];

            await setDoc(doc(db, 'dossiers', targetDossierId), {
              documents: newDocs
            }, { merge: true });

            console.log(`🎉 Succès ! Les champs de votre dossier de candidature ont été alimentés depuis le document de bilan "${file.name}".`);
            // Petit hack pour un feedback visuel simple sans bloquer:
            setIsObjectParsing(false);
            const p = document.createElement("div");
            p.innerText = "🎉 Succès ! Le document a été analysé et les champs ont été remplis.";
            p.className = "fixed bottom-4 right-4 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-xl z-50 animate-bounce";
            document.body.appendChild(p);
            setTimeout(() => p.remove(), 4000);

            return;
          } else {
            throw new Error("Aucune donnée n'a été retournée par le serveur d'intelligence artificielle de Logiclever.");
          }
        } catch (innerError: any) {
          console.error("Inner load file err:", innerError);
          console.error(`Erreur d'extraction : ${innerError.message || innerError}`);
        } finally {
          setIsObjectParsing(false);
        }
      };

      reader.onerror = () => {
        console.error("Erreur de chargement local du fichier.");
        setIsObjectParsing(false);
      };

      reader.readAsDataURL(file);

    } catch (outerError: any) {
      console.error("Outer parse error:", outerError);
      console.error(`Erreur d'extraction : ${outerError.message || outerError}`);
      setIsObjectParsing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const calculateCompleteness = () => {
    // heuristics for completeness
    const totalFields = 30; // Increased count
    let filledCount = 0;
    if (reportData.synthesis) filledCount++;
    if (reportData.yearSummary) filledCount++;
    if (reportData.previousObjectives.length > 0) filledCount++;
    if (reportData.knowHow) filledCount++;
    if (reportData.missionAutonomy) filledCount++;
    if (reportData.careerGoals) filledCount++;
    if (reportData.nextObjectives.length > 0) filledCount++;
    if (reportData.wishedSalary > 0) filledCount++;
    if (reportData.targetTJM > 0) filledCount++;
    if (reportData.commercialActivities) filledCount++;
    if (reportData.training) filledCount++;
    if (reportData.progressionDetails) filledCount++;
    if (reportData.techDetails) filledCount++;
    if (reportData.deliverables) filledCount++;
    if (reportData.lifeKnowledgeSharing) filledCount++;
    if (reportData.lifeTeamSpirit) filledCount++;
    if (reportData.squadContributions) filledCount++;
    if (reportData.recruitmentPromotion) filledCount++;
    if (reportData.encadrementCoach) filledCount++;
    if (feedbacks.length > 0) filledCount += 5; 
    
    return Math.min(100, Math.round((filledCount / totalFields) * 100));
  };

  const isComplete = 
    !!reportData.yearSummary && 
    !!reportData.synthesis && 
    !!reportData.knowHow && 
    !!reportData.commercialActivities &&
    !!reportData.training &&
    !!reportData.progressionDetails &&
    !!reportData.techDetails &&
    !!reportData.deliverables &&
    !!reportData.autonomyJustification &&
    !!reportData.careerGoals &&
    reportData.wishedSalary > 0 &&
    reportData.targetTJM > 0 &&
    reportData.nextObjectives.length > 0 &&
    feedbacks.length > 0;

  const handleSave = async (submit: boolean = false, isSilent: boolean = false) => {
    if (isLockedForEditing && !isSilent) {
      alert('Ce dossier est validé et ne peut plus être modifié.');
      return;
    }
    if (isLockedForEditing && isSilent) return;

    if (isSilent) setSaveStatus('saving');
    else setLoading(true);

    if (submit) {
      if (reportData.wishedSalary > 0 && reportData.wishedSalary < (profile.currentSalary || 0)) {
        alert(`La rémunération souhaitée (${formatCurrency(reportData.wishedSalary)}) ne peut pas être inférieure à votre salaire actuel (${formatCurrency(profile.currentSalary || 0)}).`);
        setLoading(false);
        return;
      }
      if (profile.currentTJM && reportData.targetTJM > 0 && reportData.targetTJM < profile.currentTJM) {
        alert(`Le TJM cible (${reportData.targetTJM}€) ne peut pas être inférieur à votre TJM vendu actuel (${profile.currentTJM}€).`);
        setLoading(false);
        return;
      }
    }

    try {
      let updatedDocs = dossier?.documents || [];

      if (submit) {
        // Generate PDF report automatically on submission
        const pdfDataUri = generateDossierPDF(profile, dossier, reportData, feedbacks);
        const pdfFileName = `Bilan_Annuel_2025_${(profile.displayName || profile.email || 'Candidat').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
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

      const status: DossierStatus = submit ? 'COMPLET' : (dossier?.status || 'OUVERT');
      const targetDossierId = dossier?.id || `${profile.id}_2025`;

      if (!dossier) {
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

        const newDossier: Dossier = {
          id: targetDossierId,
          candidateId: profile.id,
          idProfil: profile.idProfil || (profile.matricule ? `LL_${profile.matricule.trim()}` : `PERS_${profile.id}`),
          campaignId: '2025',
          candidateName: profile.displayName || 'Anonyme',
          candidateEmail: profile.email,
          campaignYear: 2025,
          status: status,
          annualReport: reportData,
          clientFeedbacks: feedbacks,
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
          status: status,
          annualReport: reportData,
          clientFeedbacks: feedbacks,
          documents: updatedDocs,
          updatedAt: new Date().toISOString()
        };

        // 1. Sauvegarde locale instantanée
        LocalDatabaseService.updateDossier(dossier.id, dossierUpdates);

      }

      if (!isSilent) {
        if (submit) {
          alert('Dossier soumis avec succès ! Un récapitulatif PDF de votre dossier a été généré et est disponible dans "Pièces jointes".');
        } else {
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

  const handleSubmit = async () => {
    if (!isComplete) {
      alert('Votre dossier doit être quasi-complet pour être soumis.');
      return;
    }
    if (!dossier) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'dossiers', dossier.id), {
        status: 'COMPLET',
        updatedAt: serverTimestamp()
      });
      alert('Dossier soumis avec succès !');
    } catch (error) {
      console.error("Submit error:", error);
      alert('Erreur lors de la soumission.');
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

  if (dossier?.status === 'VALIDE') {
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
            <DataBox label="TJM Actuel" value={`${profile.currentTJM}€`} />
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
          <p className="text-xl text-accent/60 mb-12 font-light leading-relaxed max-w-2xl">
            Félicitations. Les délibérations du Jury sont terminées. <br/>
            Vous trouverez ci-dessous le récapitulatif de votre évolution pour cette année.
          </p>
          
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

  const effectiveCurrentGrade: Grade | 'Junior' = (reportData.currentGrade || profile.currentGrade || 'Confirmé') as Grade | 'Junior';

  // Grade hierarchy: Junior (0) < Confirmé (1) < Senior (2) < Expert (3)
  const gradeOrder: Record<string, number> = {
    'Junior': 0,
    'Confirmé': 1,
    'Senior': 2,
    'Expert': 3
  };

  const currentGradeRank = gradeOrder[effectiveCurrentGrade] ?? 1;
  const availableWishedGrades = (['Confirmé', 'Senior', 'Expert'] as Grade[]).filter(
    g => (gradeOrder[g] ?? 1) >= currentGradeRank
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
          <TabButton active={activeTab === 'SYNTHESE'} onClick={() => setActiveTab('SYNTHESE')} label="Introduction & Synthèse" required />
          <TabButton active={activeTab === 'OBJECTIFS_PASSES'} onClick={() => setActiveTab('OBJECTIFS_PASSES')} label="Objectifs Année Passée" />
          <TabButton active={activeTab === 'EXPERTISES'} onClick={() => setActiveTab('EXPERTISES')} label="Missions & Expertises" required />
          <TabButton active={activeTab === 'ENGAGEMENT'} onClick={() => setActiveTab('ENGAGEMENT')} label="Engagement & Autonomie" required />
          <TabButton active={activeTab === 'METEOS'} onClick={() => setActiveTab('METEOS')} label="Météos Client" count={feedbacks.length} required />
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
          <TabButton active={activeTab === 'INTERCONTRAT'} onClick={() => setActiveTab('INTERCONTRAT')} label="Intercontrat" />
          {profile.currentGrade === 'Senior' || profile.currentGrade === 'Expert' || reportData.isReferentOrAspiring ? (
            <TabButton active={activeTab === 'REFERENT'} onClick={() => setActiveTab('REFERENT')} label="Référents / Experts" />
          ) : null}
          <TabButton active={activeTab === 'PRETENTIONS'} onClick={() => setActiveTab('PRETENTIONS')} label="Futur & Prétentions" required />
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
                onClick={() => handleSave(false, false)}
                disabled={loading}
                className="w-full py-4 rounded-xl text-base font-bold bg-accent/5 hover:bg-accent/10 text-accent border border-accent/10 transition-all flex items-center justify-center gap-3 shadow-md mb-3 cursor-pointer"
              >
                <Save className="w-5 h-5" /> Enregistrer le brouillon
              </button>
            )}
            
            <div className="relative w-full">
              <div 
                className="w-full"
                onMouseEnter={() => {
                  if (!isComplete && !isLockedForEditing) {
                    setShowSubmitTooltip(true);
                  }
                }}
                onMouseLeave={() => setShowSubmitTooltip(false)}
              >
                <button 
                  onClick={() => {
                    if ((isComplete || isJuryUser) && !loading && !isLockedForEditing) {
                      handleSave(true);
                    }
                  }}
                  disabled={loading || isLockedForEditing || (!isComplete && !isJuryUser)}
                  className={cn(
                    "w-full py-4 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-3 shadow-xl",
                    (isComplete || isJuryUser) && !isLockedForEditing 
                      ? "bg-primary text-white shadow-primary/20 cursor-pointer" 
                      : "bg-accent/5 text-accent/20 cursor-not-allowed"
                  )}
                >
                  <Send className="w-5 h-5" /> {isJuryUser && dossier?.status === 'COMPLET' ? 'Mettre à jour & Générer PDF' : 'Soumettre le dossier'}
                </button>
              </div>
              <AnimatePresence>
                {showSubmitTooltip && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-accent text-white text-xs rounded-base shadow-xl z-50 text-center leading-relaxed pointer-events-none"
                  >
                    Pour soumettre le dossier merci de renseigner tous les champs obligatoires
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-accent" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 pb-24">
        <AnimatePresence mode="wait">
          {activeTab === 'DOCUMENTS' && (
            <DocumentsTab
              profile={profile}
              dossier={dossier}
              isDragging={isDragging}
              isObjectParsing={isObjectParsing}
              isLockedForEditing={isLockedForEditing}
              handleFileSelect={handleFileSelect}
              handleDragOver={handleDragOver}
              handleDragEnter={handleDragEnter}
              handleDragLeave={handleDragLeave}
              handleDrop={handleDrop}
              handleViewDocument={handleViewDocument}
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
            />
          )}

          {activeTab === 'EXPERTISES' && (
            <ExpertisesTab
              reportData={reportData}
              setReportData={setReportData}
            />
          )}

          {activeTab === 'ENGAGEMENT' && (
            <EngagementTab
              reportData={reportData}
              setReportData={setReportData}
              effectiveCurrentGrade={effectiveCurrentGrade}
              gradeOrder={gradeOrder}
            />
          )}

          {activeTab === 'METEOS' && (
            <MeteosTab
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

          {activeTab === 'INTERCONTRAT' && (
            <IntercontratTab
              reportData={reportData}
              setReportData={setReportData}
            />
          )}

          {activeTab === 'REFERENT' && (
            <ReferentTab
              reportData={reportData}
              setReportData={setReportData}
            />
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
      </div>
    </div>
    </div>
  );
}

