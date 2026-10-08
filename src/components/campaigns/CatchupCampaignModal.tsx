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
import { AppLinksService } from '../../services/appLinksService';

interface CatchupCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCampaigns: Campaign[];
  currentUser?: UserProfile | null;
  onSuccess: (message: string) => void;
}

export function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export interface DetectedCatchupCampaign {
  year: number;
  spreadsheetId: string;
  delibTab: string;
  tjCibleTab: string;
  linkTitle: string;
  url: string;
}

export function getConnectedCatchupCampaigns(): DetectedCatchupCampaign[] {
  const links = AppLinksService.getLinks();
  // Année actuelle du système (ex. 2026)
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 1; // Commence à current year - 1 (ex. 2025)
  const results: DetectedCatchupCampaign[] = [];

  // Découverte descendante d'année en année jusqu'à ce qu'aucun lien ne soit trouvé
  for (let year = startYear; year >= 2015; year--) {
    const expectedId = `link_analyse_jury_${year}`;
    const link = links.find(l => 
      l.id === expectedId || 
      (l.libelle && l.libelle.toLowerCase().includes('analyse jury') && l.libelle.includes(String(year)))
    );

    if (link && link.url && link.url.trim().length > 0) {
      const sheetId = extractSpreadsheetId(link.url);
      if (sheetId) {
        results.push({
          year,
          spreadsheetId: sheetId,
          delibTab: year === 2024 ? 'Analyse Jury' : 'Analyse_Jury',
          tjCibleTab: 'TJ Cible',
          linkTitle: link.libelle || `Analyse Jury Salaire ${year}`,
          url: link.url
        });
        continue;
      }
    }
    // Si aucun lien n'est trouvé pour cette année, on interrompt la boucle descendante
    break;
  }

  return results;
}

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

  const detectedCampaigns = getConnectedCatchupCampaigns();

  if (!isOpen) return null;

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`]);
  };

  /**
   * Rattrapage 100% Automatique :
   * Parcourt dynamiquement les sources du Répertoire des Liens pour chaque année détectée
   * (en descendant de currentYear - 1 jusqu'à ce qu'aucun lien ne soit trouvé).
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
      const bddProfilsUrl = AppLinksService.getLinkUrl('link_bdd_ll_new_drive', 'https://docs.google.com/spreadsheets/d/1Ez9VFazCY3TcIoZcAp3Ec60vDfSutgfi4h1HLrH44z4/edit');
      const bddProfilsId = extractSpreadsheetId(bddProfilsUrl) || '1Ez9VFazCY3TcIoZcAp3Ec60vDfSutgfi4h1HLrH44z4';

      setCurrentAction("Lecture de BDD_LL_New_Drive (feuille Profil)...");
      addLog("Lecture des profils depuis BDD_LL_New_Drive...");
      
      let rawProfilesMatrix: any[][] = [];
      try {
        const profRes = await importDataFromGoogleSheet('A1:Z1000', bddProfilsId, 'Profil');
        rawProfilesMatrix = [profRes.headers, ...profRes.rows];
      } catch (err: any) {
        throw new Error(`Impossible d'accéder à BDD_LL_New_Drive : ${err.message}`);
      }

      const allProfiles = CampaignCatchupService.parseProfilesReferenceFromMatrix(rawProfilesMatrix);
      addLog(`✅ ${allProfiles.length} profil(s) scannés dans BDD_LL_New_Drive (Col A=Id_Profil, Col D=Email, Col H=Matricule).`);

      // 1.bis Charger Vues_LL_NEW_DRIVE (feuille Vue_Meteo)
      const vuesMeteosUrl = AppLinksService.getLinkUrl('link_vues_ll_new_drive', 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit');
      const vuesMeteosId = extractSpreadsheetId(vuesMeteosUrl) || '1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek';

      setCurrentAction("Lecture de Vues_LL_NEW_DRIVE (feuille Vue_Meteo)...");
      addLog("Lecture des météos clients depuis Vues_LL_NEW_DRIVE (feuille Vue_Meteo)...");
      let allMeteos: CatchupMeteoItem[] = [];
      try {
        const meteoRes = await importDataFromGoogleSheet('A1:Z5000', vuesMeteosId, 'Vue_Meteo');
        const meteoMatrix = [meteoRes.headers, ...meteoRes.rows];
        allMeteos = CampaignCatchupService.parseMeteosFromMatrix(meteoMatrix);
        addLog(`⛅ ${allMeteos.length} météo(s) client extraite(s) depuis Vues_LL_NEW_DRIVE (Col B=IdProfil, Col Z=Année, Col Q=Lien).`);
      } catch (meteoErr: any) {
        addLog(`⚠️ Notice Vue_Meteo : ${meteoErr.message || 'Feuille non chargée, poursuite du rattrapage'}`);
      }

      // 2. Découvrir dynamiquement toutes les campagnes attachées dans le Répertoire des Liens
      const campaignsToProcess = getConnectedCatchupCampaigns();
      if (campaignsToProcess.length === 0) {
        throw new Error("Aucun fichier Analyse_Jury_Salaires n'a été trouvé dans le Répertoire des Liens pour les années historiques.");
      }
      addLog(`🔍 ${campaignsToProcess.length} campagne(s) détectée(s) dans le Répertoire des Liens : ${campaignsToProcess.map(c => c.year).join(', ')}`);

      const executedSummaries: { campaignYear: number; dossiersCount: number; evaluationsCount: number }[] = [];

      for (const camp of campaignsToProcess) {
        setCurrentAction(`Extraction de la Campagne ${camp.year} (${camp.linkTitle})...`);
        addLog(`📂 Traitement automatique de la Campagne ${camp.year} (${camp.linkTitle})...`);

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

        const delibRows = CampaignCatchupService.parseDeliberationFromMatrix(delibMatrix, camp.year);
        addLog(`📊 ${delibRows.length} ligne(s) de délibération extraite(s) pour ${camp.year}.`);

        // 3. Extraire TJ Cible (Évaluations)
        let evalMatrix: any[][] = [];
        try {
          const evalRes = await importDataFromGoogleSheet('A1:AZ500', camp.spreadsheetId, camp.tjCibleTab);
          evalMatrix = [evalRes.headers, ...evalRes.rows];
        } catch (_) {
          addLog(`ℹ️ Onglet TJ Cible non trouvé séparément pour ${camp.year}, utilisation des données disponibles.`);
        }

        const evalRows = CampaignCatchupService.parseEvaluationsFromMatrix(evalMatrix, camp.year);
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

        addLog(`🎉 Campagne ${camp.year} scellée et validée : ${applyResult.dossiersUpdatedCount} dossier(s) synchronisés.`);
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
                  Aucune sélection manuelle n'est requise. L'algorithme détecte dynamiquement les fichiers Analyse_Jury_Salaires connectés dans le Répertoire des Liens (2022, 2023, 2024, 2025...), extrait les colonnes selon chaque structure, crée uniquement les comptes des participants et valide à 100% les dossiers scellés.
                </p>
              </div>

              {/* Liste des sources officielles connectées */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black uppercase tracking-wider text-accent/60">
                    Sources Connectées dans le Répertoire des Liens :
                  </div>
                  <span className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                    {detectedCampaigns.length} campagne(s) détectée(s)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 bg-accent/5 rounded-xl border border-accent/10 flex items-start gap-3">
                    <Database className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-accent">BDD_LL_New_Drive (Profils)</div>
                      <div className="text-accent/50 text-[11px] truncate">Id_Profil (A), Email (D), Matricule (H)</div>
                    </div>
                  </div>

                  {detectedCampaigns.map(camp => (
                    <div key={camp.year} className="p-3.5 bg-accent/5 rounded-xl border border-accent/10 flex items-start gap-3">
                      <FileSpreadsheet className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-accent">{camp.linkTitle} ({camp.year})</div>
                        <div className="text-accent/50 text-[11px] truncate">Délibérations & TJ Cible &bull; ID: {camp.spreadsheetId.substring(0, 10)}...</div>
                      </div>
                    </div>
                  ))}

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
