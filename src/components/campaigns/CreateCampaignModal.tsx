import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  FileUp, 
  FileText, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Users, 
  ArrowRight, 
  Database, 
  UserCheck, 
  Info,
  Loader2,
  Award
} from 'lucide-react';
import { CampaignFile } from '../../types';
import { 
  CampaignInitializationService, 
  CampaignInitPreview 
} from '../../services/campaignInitializationService';
import { v4 as uuidv4 } from 'uuid';

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingYears: number[];
  onShowToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function CreateCampaignModal({
  isOpen,
  onClose,
  existingYears,
  onShowToast
}: CreateCampaignModalProps) {
  const currentYear = new Date().getFullYear();
  const [newYear, setNewYear] = useState<number>(currentYear + 1);
  const [newTitle, setNewTitle] = useState<string>(`Campagne Annuelle ${currentYear + 1}`);
  const [newDescription, setNewDescription] = useState<string>('');

  // Fichiers d'entrée
  const [profilFile, setProfilFile] = useState<File | null>(null);
  const [boondFile, setBoondFile] = useState<File | null>(null);
  const [analyseJuryFile, setAnalyseJuryFile] = useState<File | null>(null);
  const [primesFile, setPrimesFile] = useState<File | null>(null);
  const [otherFiles, setOtherFiles] = useState<CampaignFile[]>([]);

  // Étape d'aperçu et d'analyse
  const [currentStep, setCurrentStep] = useState<'FILES' | 'PREVIEW'>('FILES');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [preview, setPreview] = useState<CampaignInitPreview | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [showEvaluatorsTable, setShowEvaluatorsTable] = useState(false);

  if (!isOpen) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSingleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (f: File | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setter(file);
      setPreview(null);
    }
    e.target.value = '';
  };

  const handleOtherFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const fileObj: CampaignFile = {
          id: uuidv4(),
          name: file.name,
          category: 'AUTRE',
          url: reader.result as string,
          size: file.size,
          uploadedAt: new Date().toISOString()
        };
        setOtherFiles(prev => [...prev, fileObj]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeOtherFile = (id: string) => {
    setOtherFiles(prev => prev.filter(f => f.id !== id));
  };

  // Passer à l'analyse et générer l'aperçu avant écriture
  const handleAnalyzeAndPreview = async () => {
    if (!newYear || !newTitle.trim()) {
      onShowToast('error', "L'année et le titre de la campagne sont obligatoires.");
      return;
    }

    if (existingYears.includes(Number(newYear))) {
      onShowToast('error', `Une campagne existe déjà pour l'année ${newYear}.`);
      return;
    }

    if (!analyseJuryFile) {
      onShowToast('error', "Le fichier 'Analyse_Jury_Salaires' (onglet Analyse_Jury) est obligatoire.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const previewResult = await CampaignInitializationService.prepareCampaignPreview(
        Number(newYear),
        {
          profilFile,
          boondFile,
          analyseJuryFile,
          rhFile: analyseJuryFile,
          primesFile
        }
      );

      setPreview(previewResult);
      setCurrentStep('PREVIEW');
      if (previewResult.blockingErrors.length > 0) {
        onShowToast('error', `${previewResult.blockingErrors.length} erreur(s) bloquante(s) détectée(s).`);
      } else {
        const pairingMsg = previewResult.activePrimesCount > 0 
          ? ` avec ${previewResult.activePrimesCount} prime(s) active(s) pour l'assignation des dossiers` 
          : '';
        onShowToast('info', `${previewResult.candidatesToProcess.length} collaborateur(s) prêt(s) pour la campagne${pairingMsg}.`);
      }
    } catch (err: any) {
      console.error("Analysis error:", err);
      onShowToast('error', `Erreur lors de l'analyse : ${err.message || String(err)}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Exécution finale et idempotente
  const handleConfirmAndInitialize = async () => {
    if (submitting.current) return;
    if (!preview || !preview.canProceed) {
      setLaunchError('Corrigez les erreurs de l’aperçu avant de lancer la campagne.');
      return;
    }

    submitting.current = true;
    setLaunchError(null);
    setIsSubmitting(true);
    try {
      // 1. Ne pas conserver les copies volumineuses des fichiers sources dans la campagne (état décoché par défaut)
      const rhCampaignFiles: CampaignFile[] = [];
      const pairsCampaignFiles: CampaignFile[] = [];
      const otherCampaignFiles: CampaignFile[] = [];

      // 2. Exécuter l'initialisation des données (personnes, participants RH, dossiers avec évaluateurs assignés)
      const res = await CampaignInitializationService.executeCampaignInitialization(
        preview,
        {
          title: newTitle.trim(),
          description: newDescription.trim() || `Campagne de jury des salaires pour l'année ${newYear}.`,
          rhDocuments: rhCampaignFiles,
          pairsDocuments: pairsCampaignFiles,
          otherDocuments: otherCampaignFiles,
          createdBy: 'Administrateur'
        },
        (current, total) => {
          setImportProgress({ current, total });
        }
      );

      onShowToast('success', `Campagne ${newYear} initialisée : ${res.created + res.updated} dossiers créés/mis à jour et ${res.evaluatorsInitialized} évaluateur(s) configuré(s).`);
      onClose();
    } catch (err: any) {
      console.error("Initialization error:", err);
      setLaunchError(`Échec de l’initialisation : ${err.message || String(err)}`);
      onShowToast('error', `Échec de l'initialisation : ${err.message || String(err)}`);
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
      setImportProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl border border-accent/10 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* En-tête */}
        <div className="p-6 border-b border-accent/10 flex items-center justify-between bg-accent/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-secondary">
                {currentStep === 'FILES' ? "Lancement d'une Nouvelle Campagne" : "Aperçu Strict & Validation"}
              </h2>
              <p className="text-xs text-accent/60 font-medium">
                {currentStep === 'FILES' 
                  ? "Importez vos données sources pour qualifier les participants et assigner les dossiers."
                  : `Vérification des correspondances et affectations avant enregistrement (${preview?.year})`}
              </p>
            </div>
          </div>
          <button
            disabled={isSubmitting}
            onClick={onClose}
            className="p-2 text-accent/40 hover:text-accent rounded-lg hover:bg-white/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps défilable */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <AnimatePresence mode="wait">
            {currentStep === 'FILES' ? (
              <motion.div
                key="step-files"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                {/* Paramètres de base */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-2">
                      Année de la campagne *
                    </label>
                    <input
                      type="number"
                      required
                      min={2020}
                      max={2040}
                      value={newYear}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setNewYear(val);
                        setNewTitle(`Campagne Annuelle ${val}`);
                      }}
                      className="w-full px-4 py-2.5 rounded-xl border border-accent/20 focus:border-primary focus:ring-1 focus:ring-primary outline-none font-medium text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-2">
                      Titre de la campagne *
                    </label>
                    <input
                      type="text"
                      required
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-accent/20 focus:border-primary focus:ring-1 focus:ring-primary outline-none font-medium text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-2">
                    Description ou consignes (Optionnel)
                  </label>
                  <textarea
                    rows={2}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Instructions pour les jurys ou spécificités de la session..."
                    className="w-full px-4 py-2.5 rounded-xl border border-accent/20 focus:border-primary focus:ring-1 focus:ring-primary outline-none font-medium text-sm resize-none"
                  />
                </div>

                <div className="border-t border-accent/10 pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-secondary">
                      Feuilles de Calcul de Référence & Participants
                    </h3>
                  </div>
                  <p className="text-xs text-accent/60 mb-4">
                    Les 4 classeurs sources pour l'identification pérenne, le grade, l'expérience cumulée et l'attribution des dossiers.
                  </p>
                </div>

                {/* Fichier 1: BDD Profils */}
                <div className="p-4 bg-accent/5 rounded-xl border border-accent/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-secondary">1. Référentiel Profils (BDD_LL_NEW_DRIVE)</span>
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase">Requis</span>
                    </div>
                    <span className="text-[10px] text-accent/50 font-medium">Onglet "Profil" (Col A: Id_Profil, Col B: Nom, Col C: Prénom)</span>
                  </div>
                  {profilFile ? (
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-accent/15 text-xs font-semibold shadow-sm">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate text-secondary font-bold">{profilFile.name}</span>
                        <span className="text-accent/40">({formatFileSize(profilFile.size)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProfilFile(null)}
                        className="p-1 text-accent/40 hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="block border-2 border-dashed border-accent/20 hover:border-primary bg-white p-4 rounded-xl text-center cursor-pointer transition-colors">
                      <FileUp className="w-6 h-6 text-primary mx-auto mb-1 opacity-70" />
                      <span className="text-xs font-bold text-primary">Sélectionner BDD_LL_NEW_DRIVE (onglet Profil)</span>
                      <span className="text-[10px] text-accent/50 block mt-0.5">Identifiant canonique Id_Profil pour chaque collaborateur</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => handleSingleFileUpload(e, setProfilFile)}
                      />
                    </label>
                  )}
                </div>

                {/* Fichier 2: BoondManager */}
                <div className="p-4 bg-accent/5 rounded-xl border border-accent/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-secondary">2. BoondManager (BDD_API_BOOND_NEW_DRIVE)</span>
                      <span className="text-[10px] bg-accent/10 text-accent/70 px-2 py-0.5 rounded font-bold uppercase">Optionnel</span>
                    </div>
                    <span className="text-[10px] text-accent/50 font-medium">Onglets "Boond_Ressources" & "Boond_Liste_Valeur"</span>
                  </div>
                  <p className="text-[11px] text-accent/60">
                    Grade actuel (Col H) et Années d'expérience à l'embauche (Col M croisée avec Liste_Valeur).
                  </p>
                  {boondFile ? (
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-accent/15 text-xs font-semibold shadow-sm">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate text-secondary font-bold">{boondFile.name}</span>
                        <span className="text-accent/40">({formatFileSize(boondFile.size)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBoondFile(null)}
                        className="p-1 text-accent/40 hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="block border-2 border-dashed border-accent/20 hover:border-primary bg-white p-4 rounded-xl text-center cursor-pointer transition-colors">
                      <FileUp className="w-6 h-6 text-primary mx-auto mb-1 opacity-60" />
                      <span className="text-xs font-bold text-primary">Déposer l'export BDD_API_BOOND_NEW_DRIVE</span>
                      <span className="text-[10px] text-accent/50 block mt-0.5">XLSX / CSV avec les onglets Ressources et Liste_Valeur</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => handleSingleFileUpload(e, setBoondFile)}
                      />
                    </label>
                  )}
                </div>

                {/* Fichier 3: Analyse_Jury_Salaires */}
                <div className="p-5 bg-primary/5 rounded-xl border border-primary/25 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-secondary font-bold text-sm">
                      <UserCheck className="w-5 h-5 text-primary" />
                      3. Analyse Jury des Salaires * (Analyse_Jury_Salaires)
                    </div>
                    <span className="text-xs bg-primary text-white px-2.5 py-0.5 rounded-full font-bold uppercase">Requis</span>
                  </div>
                  <p className="text-xs text-accent/70 leading-relaxed">
                    <strong>Onglet "Analyse_Jury" (en-têtes ligne 2, données ligne 3) :</strong> Matricule (A), Prénom (B), Nom (C), Date Entrée (E), Date Passage Expert (F), Ancienneté LL (G), TJ vendu (J), Salaire vendu (K).
                  </p>

                  {analyseJuryFile ? (
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-primary text-xs font-semibold shadow-sm">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate text-secondary font-bold">{analyseJuryFile.name}</span>
                        <span className="text-accent/40">({formatFileSize(analyseJuryFile.size)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAnalyseJuryFile(null)}
                        className="p-1 text-accent/40 hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="block border-2 border-dashed border-primary/30 hover:border-primary bg-white p-5 rounded-xl text-center cursor-pointer transition-colors">
                      <FileUp className="w-8 h-8 text-primary mx-auto mb-2" />
                      <span className="text-sm font-bold text-primary">Sélectionner le classeur Analyse_Jury_Salaires</span>
                      <span className="text-xs text-accent/50 block mt-1">XLSX (onglet Analyse_Jury) ou export CSV</span>
                      <input
                        type="file"
                        required
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => handleSingleFileUpload(e, setAnalyseJuryFile)}
                      />
                    </label>
                  )}
                </div>

                {/* Fichier 4: Fichier Primes & Affectations (Pairing) */}
                <div className="p-5 bg-purple-50/60 rounded-xl border border-purple-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-purple-900 font-bold text-sm">
                      <Award className="w-4 h-4 text-purple-600" />
                      4. Classeur Primes (Attribution des dossiers aux Évaluateurs)
                    </div>
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold uppercase">Optionnel</span>
                  </div>
                  <p className="text-xs text-purple-800/80 leading-relaxed">
                    Assigne les dossiers selon les primes actives au <strong>01/07/{newYear}</strong> : Matricule Évaluateur (Col A), Matricule Candidat (Col B), Type (Col C), Date Fin (Col E). Les primes contenant <em>Freelance</em> sans <em>Commerciale</em> en Col C ainsi que les primes échues avant le 01/07/{newYear} sont automatiquement ignorées.
                  </p>

                  {primesFile ? (
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-300 text-xs font-semibold shadow-sm">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                        <span className="truncate text-purple-900 font-bold">{primesFile.name}</span>
                        <span className="text-accent/40">({formatFileSize(primesFile.size)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPrimesFile(null)}
                        className="p-1 text-accent/40 hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="block border-2 border-dashed border-purple-300 hover:border-purple-500 bg-white p-4 rounded-xl text-center cursor-pointer transition-colors">
                      <FileUp className="w-6 h-6 text-purple-600 mx-auto mb-1 opacity-80" />
                      <span className="text-xs font-bold text-purple-700">Déposer le classeur Primes</span>
                      <span className="text-[10px] text-accent/40 block mt-0.5">XLSX / CSV</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => handleSingleFileUpload(e, setPrimesFile)}
                      />
                    </label>
                  )}
                </div>

                {/* Documents complémentaires */}
                <div className="p-4 bg-accent/5 rounded-xl border border-accent/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-secondary">Documents complémentaires (Optionnel)</span>
                    <label className="text-xs font-bold text-primary cursor-pointer hover:underline">
                      + Ajouter des fichiers
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleOtherFileUpload}
                      />
                    </label>
                  </div>
                  {otherFiles.length > 0 && (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {otherFiles.map((f) => (
                        <div key={f.id} className="flex items-center justify-between p-2 bg-white rounded border border-accent/10 text-xs">
                          <span className="truncate max-w-[80%]">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => removeOtherFile(f.id)}
                            className="text-accent/40 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bouton d'action */}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleAnalyzeAndPreview}
                    disabled={isAnalyzing || !analyseJuryFile}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-md hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyse des fichiers...
                      </>
                    ) : (
                      <>
                        Analyser et Prévisualiser
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step-preview"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                {/* Synthèse des chiffres clés */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                    <span className="text-xs font-black uppercase tracking-wider text-primary block mb-1">Dossiers Candidats</span>
                    <span className="text-2xl font-black text-secondary">{preview?.candidatesToProcess.length || 0}</span>
                    <span className="text-[10px] text-accent/60 block mt-0.5">dossiers créés pour {preview?.year}</span>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                    <span className="text-xs font-black uppercase tracking-wider text-purple-700 block mb-1">Membres du Jury</span>
                    <span className="text-2xl font-black text-purple-800">{preview?.evaluatorsCount || 0}</span>
                    <span className="text-[10px] text-purple-600 block mt-0.5">
                      {preview?.newEvaluatorsOnlyCount ? `dont ${preview.newEvaluatorsOnlyCount} purs jurys non-candidats` : 'issus des primes'}
                    </span>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-700 block mb-1">Affectations Primes</span>
                    <span className="text-2xl font-black text-emerald-800">{preview?.activePrimesCount || 0}</span>
                    <span className="text-[10px] text-emerald-600 block mt-0.5">
                      {preview?.expiredPrimesCount ? `${preview.expiredPrimesCount} expirée(s) ignorée(s)` : 'actives au 01/07'}
                    </span>
                  </div>
                  <div className="p-4 bg-sky-50 rounded-xl border border-sky-200">
                    <span className="text-xs font-black uppercase tracking-wider text-sky-700 block mb-1">Comptes Utilisateurs</span>
                    <span className="text-2xl font-black text-sky-800">{preview?.newUsersCount || 0}</span>
                    <span className="text-[10px] text-sky-600 block mt-0.5">à pré-provisionner</span>
                  </div>
                </div>

                {/* Erreurs bloquantes si existantes */}
                {preview && preview.blockingErrors.length > 0 && (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-rose-800">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      {preview.blockingErrors.length} Erreur(s) bloquante(s) (L'écriture est bloquée) :
                    </div>
                    <ul className="list-disc pl-5 space-y-1 text-rose-700">
                      {preview.blockingErrors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Avertissements */}
                {preview && preview.warnings.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2 max-h-36 overflow-y-auto">
                    <div className="flex items-center gap-2 font-bold text-amber-800">
                      <Info className="w-4 h-4 text-amber-600 shrink-0" />
                      {preview.warnings.length} Avertissement(s) non bloquant(s) :
                    </div>
                    <ul className="list-disc pl-5 space-y-1 text-amber-700">
                      {preview.warnings.map((warn, idx) => (
                        <li key={idx}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tableau d'aperçu des participants RH */}
                <div className="border border-accent/10 rounded-xl overflow-hidden">
                  <div className="p-3 bg-accent/5 border-b border-accent/10 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-secondary">
                      Aperçu des participants RH ({preview?.candidatesToProcess.length || 0})
                    </span>
                    <span className="text-xs text-accent/50">Rapprochement strict par Id_Profil & Matricule</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-accent/5 text-accent/70 sticky top-0 font-semibold border-b border-accent/10">
                        <tr>
                          <th className="p-2.5">Id_Profil</th>
                          <th className="p-2.5">Matricule</th>
                          <th className="p-2.5">Collaborateur</th>
                          <th className="p-2.5">Grade</th>
                          <th className="p-2.5">Expérience Totale</th>
                          <th className="p-2.5">Dates Clés</th>
                          <th className="p-2.5">Salaire</th>
                          <th className="p-2.5">TJM</th>
                          <th className="p-2.5">Évaluateurs Assignés</th>
                          <th className="p-2.5">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-accent/5">
                        {preview?.candidatesToProcess.map((c, i) => {
                          const assigned = preview.assignmentsByCandidate[c.idProfil] || [];
                          const expLL = c.ancienneteLL ? `${c.ancienneteLL} a` : '0 a';
                          const expEmb = c.experienceEmbauche ? `${c.experienceEmbauche} a` : '0 a';
                          return (
                            <tr key={i} className="hover:bg-accent/5 transition-colors">
                              <td className="p-2.5 font-mono text-[11px] font-bold text-primary">{c.idProfil}</td>
                              <td className="p-2.5 font-mono text-[11px] text-accent/60">{c.matricule || '—'}</td>
                              <td className="p-2.5 font-bold text-secondary">{c.displayName}</td>
                              <td className="p-2.5">
                                {c.grade ? (
                                  <span className="font-medium text-secondary">{c.grade}</span>
                                ) : (
                                  <span className="text-accent/30">—</span>
                                )}
                              </td>
                              <td className="p-2.5">
                                <div className="font-bold text-secondary">
                                  {c.experienceYears ? `${c.experienceYears} ans` : '—'}
                                </div>
                                {(c.ancienneteLL !== undefined || c.experienceEmbauche !== undefined) && (
                                  <div className="text-[10px] text-accent/50">
                                    {expLL} LL + {expEmb} embauche
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-[10px] space-y-0.5">
                                {c.entryDate ? (
                                  <div><span className="text-accent/50">Entrée :</span> {c.entryDate}</div>
                                ) : null}
                                {c.expertPassageDate ? (
                                  <div className="text-purple-700 font-medium"><span className="text-accent/50">Expert :</span> {c.expertPassageDate}</div>
                                ) : null}
                                {!c.entryDate && !c.expertPassageDate && (
                                  <span className="text-accent/30">—</span>
                                )}
                              </td>
                              <td className="p-2.5 font-semibold">{c.currentSalary ? `${c.currentSalary.toLocaleString('fr-FR')} €` : '—'}</td>
                              <td className="p-2.5">{c.currentTJM ? `${c.currentTJM} €` : '—'}</td>
                              <td className="p-2.5">
                                {assigned.length > 0 ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                                    {assigned.length} assigné(s)
                                  </span>
                                ) : (
                                  <span className="text-accent/30 text-[10px]">—</span>
                                )}
                              </td>
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                  c.action === 'CREATE' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
                                }`}>
                                  {c.action === 'CREATE' ? 'Création' : 'Mise à jour'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tableau dépliable des Membres du Jury et Évaluateurs */}
                {preview?.evaluatorsToProcess && preview.evaluatorsToProcess.length > 0 && (
                  <div className="border border-purple-200 rounded-xl overflow-hidden bg-purple-50/30">
                    <button
                      type="button"
                      onClick={() => setShowEvaluatorsTable(prev => !prev)}
                      className="w-full p-3 bg-purple-100/50 hover:bg-purple-100 transition-colors flex items-center justify-between text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-purple-700" />
                        <span className="text-xs font-bold uppercase tracking-wider text-purple-900">
                          Membres du Jury & Évaluateurs Primes ({preview.evaluatorsToProcess.length})
                        </span>
                        <span className="text-[10px] bg-purple-200/80 text-purple-800 px-2 py-0.5 rounded-full font-bold">
                          {preview.newEvaluatorsOnlyCount} purs jurys hors candidats
                        </span>
                      </div>
                      <span className="text-xs font-bold text-purple-700">
                        {showEvaluatorsTable ? 'Masquer la liste ▲' : 'Afficher la liste ▼'}
                      </span>
                    </button>

                    {showEvaluatorsTable && (
                      <div className="max-h-56 overflow-y-auto border-t border-purple-200 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-purple-50 text-purple-900 sticky top-0 font-semibold border-b border-purple-200">
                            <tr>
                              <th className="p-2.5">Id_Profil</th>
                              <th className="p-2.5">Matricule</th>
                              <th className="p-2.5">Évaluateur / Jury</th>
                              <th className="p-2.5">Grade</th>
                              <th className="p-2.5">Statut Campagne</th>
                              <th className="p-2.5">Candidats Assignés</th>
                              <th className="p-2.5">Rôle Système</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-purple-100">
                            {preview.evaluatorsToProcess.map((ev, i) => (
                              <tr key={i} className="hover:bg-purple-50/50 transition-colors">
                                <td className="p-2.5 font-mono text-[11px] font-bold text-purple-800">{ev.idProfil}</td>
                                <td className="p-2.5 font-mono text-[11px] text-accent/60">{ev.matricule || '—'}</td>
                                <td className="p-2.5">
                                  <div className="font-bold text-secondary">{ev.displayName}</div>
                                  <div className="text-[10px] text-accent/50">{ev.email}</div>
                                </td>
                                <td className="p-2.5 text-accent/70 font-medium">{ev.grade || 'Senior'}</td>
                                <td className="p-2.5">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    ev.isCandidate ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-purple-100 text-purple-800'
                                  }`}>
                                    {ev.isCandidate ? 'Candidat & Évaluateur' : 'Évaluateur Exclusif'}
                                  </span>
                                </td>
                                <td className="p-2.5">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900">
                                    {ev.assignedCandidateIds.length} candidat(s)
                                  </span>
                                </td>
                                <td className="p-2.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 uppercase">
                                    {ev.isCandidate ? 'CANDIDATE + JURY' : 'JURY'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Barre de progression pendant l'importation */}
                {importProgress && (
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-secondary">
                      <span>Enregistrement en cours...</span>
                      <span>{importProgress.current} / {importProgress.total}</span>
                    </div>
                    <div className="w-full bg-accent/10 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-primary h-full transition-all duration-300"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {launchError && (
                  <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 whitespace-pre-wrap break-words">
                    {launchError}
                  </div>
                )}

                {/* Actions de navigation */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setCurrentStep('FILES')}
                    className="px-4 py-2.5 rounded-xl border border-accent/20 text-accent/70 hover:text-secondary hover:bg-accent/5 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Retour aux fichiers
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting || !preview?.canProceed}
                    aria-busy={isSubmitting}
                    onClick={handleConfirmAndInitialize}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm shadow-md hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Initialisation de la campagne...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Confirmer et Lancer la Campagne ({preview?.candidatesToProcess.length} participants)
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
