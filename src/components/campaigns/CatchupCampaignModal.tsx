import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  History, 
  ShieldCheck, 
  Sparkles, 
  Check, 
  Database,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen
} from 'lucide-react';
import { Campaign, UserProfile } from '../../types';
import { 
  CampaignCatchupService, 
  CatchupPreview, 
  CatchupApplyResult,
  CatchupMeteoItem
} from '../../services/campaignCatchupService';
import { importDataFromGoogleSheet } from '../../services/googleSheetsService';
import { requestGoogleSheetsAccess, requestGoogleDriveAccess } from '../../lib/firebase';

interface CatchupCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCampaigns: Campaign[];
  currentUser?: UserProfile | null;
  onSuccess: (message: string) => void;
}

// Identifiants canoniques des sources fournies
const SPREADSHEETS_CONFIG = {
  bddProfilsId: '1Ez9VFazCY3TcIoZcAp3Ec60vDfSutgfi4h1HLrH44z4',
  analyseJury2024Id: '1G1rBLNz1IAw0ct7Zc8qTnV-5BGP3tt_bX7m8EOf2rUU',
  analyseJury2025Id: '1DgkpCkCzj2_LGdH_BjnRScxatIidzVBj0ASwzJhD0zU',
  vuesMeteosId: '1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek',
  bilansFolderId: '1A2DLQku7fGLkV3XthSIi34pJ9TC-_2Bv'
};

export function CatchupCampaignModal({
  isOpen,
  onClose,
  existingCampaigns,
  currentUser,
  onSuccess
}: CatchupCampaignModalProps) {
  const [step, setStep] = useState<'CONFIG' | 'RUNNING' | 'RESULT'>('CONFIG');
  const [logs, setLogs] = useState<string[]>([]);
  const [currentAction, setCurrentAction] = useState<string>('');
  const [summaryResults, setSummaryResults] = useState<{
    campaignYear: number;
    dossiersCount: number;
    evaluationsCount: number;
  }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`]);
  };

  /**
   * Rattrapage 100% Automatique :
   * Parcourt les sources connues (BDD_LL_New_Drive, Analyse_Jury 2024 & 2025, TJ Cible),
   * détecte les années, synchronise les profils des participants (candidats/évaluateurs) et scelle les dossiers.
   */
  const handleRunAutomaticCatchup = async () => {
    setStep('RUNNING');
    setErrorMsg(null);
    setLogs([]);
    setSummaryResults([]);

    try {
      addLog("🚀 Démarrage du rattrapage automatique des campagnes historiques...");

      // 0. Renouvellement et vérification explicite des tokens Google OAuth (Sheets & Drive)
      setCurrentAction("Vérification et rafraîchissement des autorisations Google...");
      addLog("🔐 Renouvellement du jeton d'accès Google Sheets / Drive...");
      try {
        const sheetsToken = await requestGoogleSheetsAccess();
        if (!sheetsToken) {
          throw new Error("Autorisation Google Sheets annulée ou non accordée.");
        }
        await requestGoogleDriveAccess(true); // forceFresh pour le Drive également
        addLog("✅ Jetons Google authentifiés avec succès.");
      } catch (authErr: any) {
        addLog(`⚠️ Notice auth : ${authErr.message || 'Validation en session'}`);
      }

      // 1. Charger le Référentiel des Profils (BDD_LL_New_Drive -> Profil)
      setCurrentAction("Lecture de BDD_LL_New_Drive (feuille Profil)...");
      addLog("Lecture des profils depuis BDD_LL_New_Drive...");
      
      let rawProfilesMatrix: any[][] = [];
      try {
        const profRes = await importDataFromGoogleSheet('A1:Z1000', SPREADSHEETS_CONFIG.bddProfilsId, 'Profil');
        rawProfilesMatrix = [profRes.headers, ...profRes.rows];
      } catch (err: any) {
        throw new Error(`Impossible d'accéder à BDD_LL_New_Drive : ${err.message}`);
      }

      const allProfiles = CampaignCatchupService.parseProfilesReferenceFromMatrix(rawProfilesMatrix);
      addLog(`✅ ${allProfiles.length} profil(s) scannés dans BDD_LL_New_Drive (Col A=Id_Profil, Col D=Email, Col H=Matricule).`);

      // 1.bis Charger Vues_LL_NEW_DRIVE (feuille Vue_Meteo)
      setCurrentAction("Lecture de Vues_LL_NEW_DRIVE (feuille Vue_Meteo)...");
      addLog("Lecture des météos clients depuis Vues_LL_NEW_DRIVE (feuille Vue_Meteo)...");
      let allMeteos: CatchupMeteoItem[] = [];
      try {
        const meteoRes = await importDataFromGoogleSheet('A1:Z5000', SPREADSHEETS_CONFIG.vuesMeteosId, 'Vue_Meteo');
        const meteoMatrix = [meteoRes.headers, ...meteoRes.rows];
        allMeteos = CampaignCatchupService.parseMeteosFromMatrix(meteoMatrix);
        addLog(`⛅ ${allMeteos.length} météo(s) client extraite(s) depuis Vues_LL_NEW_DRIVE (Col B=IdProfil, Col Z=Année, Col Q=Lien).`);
      } catch (meteoErr: any) {
        addLog(`⚠️ Notice Vue_Meteo : ${meteoErr.message || 'Feuille non chargée, poursuite du rattrapage'}`);
      }

      const campaignsToProcess = [
        {
          year: 2024,
          spreadsheetId: SPREADSHEETS_CONFIG.analyseJury2024Id,
          delibTab: 'Analyse Jury',
          tjCibleTab: 'TJ Cible'
        },
        {
          year: 2025,
          spreadsheetId: SPREADSHEETS_CONFIG.analyseJury2025Id,
          delibTab: 'Analyse_Jury',
          tjCibleTab: 'TJ Cible'
        }
      ];

      const executedSummaries: { campaignYear: number; dossiersCount: number; evaluationsCount: number }[] = [];

      for (const camp of campaignsToProcess) {
        setCurrentAction(`Extraction de la Campagne ${camp.year}...`);
        addLog(`📂 Traitement automatique de la Campagne ${camp.year}...`);

        // 2. Extraire Délibérations
        let delibMatrix: any[][] = [];
        try {
          const res = await importDataFromGoogleSheet('A1:AZ500', camp.spreadsheetId, camp.delibTab);
          delibMatrix = [res.headers, ...res.rows];
        } catch (err: any) {
          // Essai sans nom d'onglet si divergence
          try {
            const fallbackRes = await importDataFromGoogleSheet('A1:AZ500', camp.spreadsheetId);
            delibMatrix = [fallbackRes.headers, ...fallbackRes.rows];
          } catch (_) {
            addLog(`⚠️ Erreur d'accès à la feuille Délibération pour ${camp.year} : ${err.message}`);
            continue;
          }
        }

        const delibRows = CampaignCatchupService.parseDeliberationFromMatrix(delibMatrix);
        addLog(`📊 ${delibRows.length} ligne(s) de délibération extraite(s) pour ${camp.year}.`);

        // 3. Extraire TJ Cible (Évaluations)
        let evalMatrix: any[][] = [];
        try {
          const evalRes = await importDataFromGoogleSheet('A1:AZ500', camp.spreadsheetId, camp.tjCibleTab);
          evalMatrix = [evalRes.headers, ...evalRes.rows];
        } catch (_) {
          addLog(`ℹ️ Onglet TJ Cible non trouvé séparément pour ${camp.year}, utilisation des données disponibles.`);
        }

        const evalRows = CampaignCatchupService.parseEvaluationsFromMatrix(evalMatrix);
        addLog(`👥 ${evalRows.length} évaluation(s) / relations de pairs extraite(s) pour ${camp.year}.`);

        // 4. Prévisualisation / Réconciliation
        const preview = await CampaignCatchupService.previewCatchup(
          camp.year,
          allProfiles,
          delibRows,
          evalRows
        );

        addLog(`🔍 Réconciliation ${camp.year} : ${preview.conflicts.length} dossier(s) rapprochés.`);

        // 5. Application directe & Scellement
        const applyResult = await CampaignCatchupService.applyCatchup(
          preview,
          allProfiles,
          delibRows,
          evalRows,
          currentUser || { id: 'admin', email: 'admin@logiclever.com', displayName: 'Administrateur', roles: ['ADMIN', 'JURY'], createdAt: new Date() },
          allMeteos
        );

        executedSummaries.push({
          campaignYear: camp.year,
          dossiersCount: applyResult.dossiersUpdatedCount,
          evaluationsCount: applyResult.evaluationsCreatedCount + applyResult.evaluationsUpdatedCount
        });

        addLog(`🎉 Campagne ${camp.year} mise à jour : ${applyResult.dossiersUpdatedCount} dossier(s) synchronisés et scellés.`);
      }

      setSummaryResults(executedSummaries);
      setStep('RESULT');
      onSuccess(`Rattrapage automatique terminé avec succès pour ${executedSummaries.length} campagne(s).`);
    } catch (err: any) {
      console.error("Catchup error:", err);
      setErrorMsg(`Erreur lors du rattrapage automatique : ${err.message}`);
      addLog(`❌ Erreur : ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-accent/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-accent/15 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 border-b border-accent/10 flex items-center justify-between bg-accent/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-accent">Rattrapage Automatique des Campagnes</h2>
              <p className="text-xs text-accent/50 font-light mt-0.5">
                Rapprochement direct basé sur les classeurs officiels (2024, 2025, Profils & Drive).
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-accent/10 flex items-center justify-center text-accent/40 hover:text-accent transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-8 overflow-y-auto flex-1 space-y-6">
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: CONFIGURATION & FICHIERS RECONNUS */}
          {step === 'CONFIG' && (
            <div className="space-y-6">
              <div className="bg-primary/5 p-5 rounded-xl border border-primary/20 space-y-2">
                <div className="text-xs font-black uppercase tracking-wider text-primary flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Mode 100% Automatique Détecté
                </div>
                <p className="text-xs text-accent/70 leading-relaxed font-light">
                  Aucune sélection manuelle n'est requise. L'algorithme lit les Google Sheets connectés, extrait les colonnes selon le millésime exact (2024 sans colonne ancienneté, 2025 avec ancienneté en Col G), crée uniquement les comptes des candidats et évaluateurs participants, et rattache les dossiers à l'<strong>Espace Personnel</strong> de chaque collaborateur.
                </p>
              </div>

              {/* Liste des sources officielles connectées */}
              <div className="space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-accent/60">
                  Sources Connectées dans le Répertoire des Liens :
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 bg-accent/5 rounded-xl border border-accent/10 flex items-start gap-3">
                    <Database className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-accent">BDD_LL_New_Drive (Profils)</div>
                      <div className="text-accent/50 text-[11px] truncate">Id_Profil (A), Email (D), Matricule (H)</div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-accent/5 rounded-xl border border-accent/10 flex items-start gap-3">
                    <FileSpreadsheet className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-accent">Analyse Jury Salaire 2024</div>
                      <div className="text-accent/50 text-[11px] truncate">Délibérations & TJ Cible 2024</div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-accent/5 rounded-xl border border-accent/10 flex items-start gap-3">
                    <FileSpreadsheet className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-accent">Analyse Jury Salaire 2025</div>
                      <div className="text-accent/50 text-[11px] truncate">Délibérations & TJ Cible 2025 (Ancienneté Col G)</div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-accent/5 rounded-xl border border-accent/10 flex items-start gap-3">
                    <FolderOpen className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-accent">Drive – Bilans Annuels</div>
                      <div className="text-accent/50 text-[11px] truncate">Dossiers Drive par année, tri par Matricule</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: EN COURS D'EXÉCUTION */}
          {step === 'RUNNING' && (
            <div className="space-y-5">
              <div className="p-6 bg-accent/5 rounded-2xl border border-accent/10 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
                <div className="text-sm font-bold text-secondary">{currentAction}</div>
                <div className="text-xs text-accent/50">Veuillez patienter pendant la réconciliation globale...</div>
              </div>

              {/* Console de logs */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono max-h-56 overflow-y-auto space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="leading-relaxed opacity-90">{log}</div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: RÉSULTAT */}
          {step === 'RESULT' && (
            <div className="space-y-6">
              <div className="p-6 bg-green-50 border border-green-200 rounded-2xl text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
                <h3 className="text-lg font-bold text-green-900">Rattrapage Terminé avec Succès !</h3>
                <p className="text-xs text-green-700">
                  Tous les dossiers passés ont été archivés et rattachés aux espaces personnels des collaborateurs.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {summaryResults.map(r => (
                  <div key={r.campaignYear} className="p-4 bg-accent/5 rounded-xl border border-accent/10">
                    <div className="text-xs font-black uppercase tracking-wider text-primary mb-1">
                      Campagne {r.campaignYear}
                    </div>
                    <div className="text-xl font-extrabold text-secondary">
                      {r.dossiersCount} dossier(s) synchronisé(s)
                    </div>
                    <div className="text-xs text-accent/60 mt-1">
                      {r.evaluationsCount} avis et feedbacks collègues enregistrés.
                    </div>
                  </div>
                ))}
              </div>

              {/* Logs résumé */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono max-h-40 overflow-y-auto space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="leading-relaxed opacity-80">{log}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-8 py-5 border-t border-accent/10 bg-accent/5 flex items-center justify-between">
          {step === 'CONFIG' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-accent/60 hover:text-accent hover:bg-white transition-all cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleRunAutomaticCatchup}
                className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-primary hover:bg-primary-hover text-white transition-all shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                Lancer le Rattrapage Automatique
              </button>
            </>
          )}

          {step === 'RUNNING' && (
            <div className="ml-auto text-xs text-accent/50 italic flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Traitement en cours...
            </div>
          )}

          {step === 'RESULT' && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-primary text-white hover:bg-primary-hover transition-all shadow-md cursor-pointer"
            >
              Terminer & Recharger
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
