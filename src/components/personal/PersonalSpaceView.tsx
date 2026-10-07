import React, { useState, useEffect } from 'react';
import { 
  User, 
  Calendar, 
  Award, 
  ExternalLink, 
  Clock, 
  TrendingUp, 
  FileText, 
  CloudSun, 
  Gift, 
  CheckCircle2, 
  AlertCircle,
  Briefcase,
  ChevronRight,
  ShieldCheck,
  Building,
  Loader2,
  RefreshCw,
  UserCheck,
  MessageSquareQuote
} from 'lucide-react';
import { Dossier, UserProfile, Campaign } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { DriveObjectivesService } from '../../services/driveObjectivesService';
import { getGoogleDriveAccessToken, requestGoogleDriveAccess } from '../../lib/firebase';
import { importDataFromGoogleSheet } from '../../services/googleSheetsService';

interface PersonalSpaceViewProps {
  currentUser: UserProfile;
  dossiers: Dossier[];
  campaigns: Campaign[];
  isAdmin?: boolean;
  allUsers?: UserProfile[];
  selectedUserId?: string;
  onSelectUser?: (userId: string) => void;
}

export function PersonalSpaceView({
  currentUser,
  dossiers,
  campaigns,
  isAdmin,
  allUsers,
  selectedUserId,
  onSelectUser
}: PersonalSpaceViewProps) {
  // Filtrer les dossiers appartenant à ce candidat
  const userDossiers = dossiers.filter(d => {
    const idMatch = d.candidateId === currentUser.id || d.idProfil === currentUser.idProfil || d.idProfil === currentUser.id;
    const matMatch = currentUser.matricule && (d.candidateId === currentUser.matricule || d.idProfil === currentUser.matricule);
    const emailMatch = currentUser.email && d.candidateEmail?.toLowerCase() === currentUser.email.toLowerCase();
    return idMatch || matMatch || emailMatch;
  });

  // Trier les dossiers par année décroissante
  const sortedDossiers = [...userDossiers].sort((a, b) => {
    const yrA = a.campaignYear || (a.campaignId ? parseInt(a.campaignId.replace(/[^0-9]/g, '')) : 0);
    const yrB = b.campaignYear || (b.campaignId ? parseInt(b.campaignId.replace(/[^0-9]/g, '')) : 0);
    return yrB - yrA;
  });

  // Année sélectionnée par défaut : la plus récente
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (sortedDossiers.length > 0) {
      const d = sortedDossiers[0];
      return d.campaignYear || (d.campaignId ? parseInt(d.campaignId.replace(/[^0-9]/g, '')) : 2025);
    }
    return 2025;
  });

  const activeDossier = sortedDossiers.find(d => {
    const yr = d.campaignYear || (d.campaignId ? parseInt(d.campaignId.replace(/[^0-9]/g, '')) : 0);
    return yr === selectedYear;
  }) || sortedDossiers[0];

  const matricule = currentUser.matricule || activeDossier?.candidateId || 'N/A';

  const [loadingDriveDoc, setLoadingDriveDoc] = useState(false);
  const [driveDoc, setDriveDoc] = useState<{ id: string; name: string; webViewLink?: string } | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  // Cache en mémoire pour les bilans annuels déjà trouvés : [matricule_annee] => Doc
  const [driveDocCache, setDriveDocCache] = useState<Record<string, { id: string; name: string; webViewLink?: string }>>({});
  // Cache en mémoire pour les météos live chargées depuis Vues_LL_NEW_DRIVE : [candidatId_annee] => meteos
  const [liveMeteosCache, setLiveMeteosCache] = useState<Record<string, Array<{ id: string; title: string; url: string; date?: string; client?: string; rating?: number }>>>({});

  // Chercher le document spécifique du candidat dans le sous-dossier de l'année
  const fetchCandidateDriveDoc = async (forceInteractive: boolean = false) => {
    const mat = (currentUser.matricule || activeDossier?.candidateId || '').trim();
    if (!mat) {
      setDriveError("Matricule non défini pour ce collaborateur.");
      return;
    }

    const cacheKey = `${mat}_${selectedYear}`;
    if (!forceInteractive && driveDocCache[cacheKey]) {
      setDriveDoc(driveDocCache[cacheKey]);
      return;
    }

    setLoadingDriveDoc(true);
    setDriveError(null);
    try {
      let token = getGoogleDriveAccessToken();
      if (!token && forceInteractive) {
        token = await requestGoogleDriveAccess(true);
      }
      if (!token) {
        if (forceInteractive) {
          setDriveError("Autorisation Google Drive requise pour accéder au document.");
        }
        setLoadingDriveDoc(false);
        return;
      }

      // 1. Trouver le sous-dossier de l'année (ex: 2024, 2025)
      const yearFolder = await DriveObjectivesService.findPriorYearFolder(token, selectedYear);
      // 2. Trouver le fichier du collaborateur par son matricule
      const file = await DriveObjectivesService.findCandidateFile(token, yearFolder.id, mat);
      setDriveDoc(file);
      if (file) {
        setDriveDocCache(prev => ({ ...prev, [cacheKey]: file }));
      }
    } catch (err: any) {
      console.warn("Drive document lookup notice:", err.message);
      setDriveError(err.message);
    } finally {
      setLoadingDriveDoc(false);
    }
  };

  useEffect(() => {
    const mat = (currentUser.matricule || activeDossier?.candidateId || '').trim();
    const cacheKey = `${mat}_${selectedYear}`;

    // Si déjà dans le cache, réutiliser immédiatement sans refaire d'appel réseau
    if (driveDocCache[cacheKey]) {
      setDriveDoc(driveDocCache[cacheKey]);
      setDriveError(null);
      return;
    }

    setDriveDoc(null);
    setDriveError(null);
    // Tentative automatique si token déjà en session
    if (getGoogleDriveAccessToken()) {
      fetchCandidateDriveDoc(false);
    }
  }, [selectedYear, currentUser.matricule, activeDossier?.id]);

  // Chargement direct et automatique des météos de l'année depuis Vues_LL_NEW_DRIVE (Vue_Meteo)
  useEffect(() => {
    const candidateId = (currentUser.idProfil || currentUser.id || currentUser.matricule || '').trim().toUpperCase();
    const candidateMatricule = (currentUser.matricule || '').trim().toUpperCase();
    const cacheKey = `${candidateId}_${selectedYear}`;

    if (liveMeteosCache[cacheKey]) return;

    const fetchLiveMeteos = async () => {
      try {
        const res = await importDataFromGoogleSheet('A1:Z5000', '1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek', 'Vue_Meteo');
        const rows = res.rows || [];
        const targetYearStr = String(selectedYear).trim();
        const targetYearShort = targetYearStr.slice(-2);

        const fetchedItems: Array<{ id: string; title: string; url: string; date?: string; client?: string; rating?: number }> = [];

        rows.forEach((r, idx) => {
          // Col B (index 1) : IdProfil du candidat évalué (STRICTEMENT Colonne B)
          const cellId = String(r[1] || '').trim().toUpperCase();
          const matchesCand = cellId && (cellId === candidateId || (candidateMatricule && cellId === candidateMatricule));
          if (!matchesCand) return;

          // Col Z (index 25) : Année de la campagne
          const cellYear = String(r[25] || '').trim();
          const matchesYear = cellYear && (cellYear === targetYearStr || cellYear.includes(targetYearStr) || cellYear === targetYearShort);
          if (!matchesYear) return;

          // Col Q (index 16) : Liens_Meteo
          const link = String(r[16] || '').trim();
          if (!link || !link.startsWith('http')) return;

          // Col F (index 5) : Date
          const date = String(r[5] || '').trim();
          // Col S (index 18) : Client
          const client = String(r[18] || '').trim();

          fetchedItems.push({
            id: `live_meteo_${idx}`,
            title: client ? `Météo – ${client}` : (date ? `Météo du ${date}` : `Météo #${fetchedItems.length + 1}`),
            url: link,
            date: date || undefined,
            client: client || undefined
          });
        });

        setLiveMeteosCache(prev => ({ ...prev, [cacheKey]: fetchedItems }));
      } catch (err) {
        console.warn("Notice live meteos load:", err);
      }
    };

    fetchLiveMeteos();
  }, [selectedYear, currentUser.idProfil, currentUser.id, currentUser.matricule]);

  // Rassembler toutes les météos de l'année pour le candidat
  const meteoItems: Array<{
    id: string;
    title: string;
    url: string;
    date?: string;
    client?: string;
    rating?: number;
  }> = [];

  // 1. Depuis activeDossier.meteoDetails
  if (activeDossier?.meteoDetails && activeDossier.meteoDetails.length > 0) {
    activeDossier.meteoDetails.forEach((md, idx) => {
      if (md.link) {
        meteoItems.push({
          id: `detail_${idx}`,
          title: md.date ? `Météo du ${md.date}` : `Météo #${idx + 1}`,
          url: md.link,
          date: md.date
        });
      }
    });
  }

  // 2. Depuis activeDossier.meteoLinks (si non déjà dans meteoDetails)
  if (activeDossier?.meteoLinks && activeDossier.meteoLinks.length > 0) {
    activeDossier.meteoLinks.forEach((link, idx) => {
      const already = meteoItems.some(m => m.url === link);
      if (!already) {
        meteoItems.push({
          id: `link_${idx}`,
          title: `Météo #${meteoItems.length + 1}`,
          url: link
        });
      }
    });
  }

  // 3. Depuis activeDossier.referentData?.meteos
  if (activeDossier?.referentData?.meteos && activeDossier.referentData.meteos.length > 0) {
    activeDossier.referentData.meteos.forEach((rm: any, idx: number) => {
      const link = rm.lienMeteo || rm.id;
      if (link && typeof link === 'string' && link.startsWith('http')) {
        const already = meteoItems.some(m => m.url === link);
        if (!already) {
          meteoItems.push({
            id: `ref_${idx}`,
            title: rm.dateMeteo ? `Météo du ${rm.dateMeteo}` : `Météo #${meteoItems.length + 1}`,
            url: link,
            date: rm.dateMeteo
          });
        }
      }
    });
  }

  // 4. Depuis activeDossier.clientFeedbacks
  if (activeDossier?.clientFeedbacks && activeDossier.clientFeedbacks.length > 0) {
    activeDossier.clientFeedbacks.forEach((fb, idx) => {
      const link = fb.liensMeteo || fb.fileUrl;
      if (link) {
        const already = meteoItems.some(m => m.url === link);
        if (!already) {
          meteoItems.push({
            id: `fb_${idx}`,
            title: fb.client ? `Météo – ${fb.client}` : (fb.realizationDate ? `Météo du ${fb.realizationDate}` : `Météo #${meteoItems.length + 1}`),
            url: link,
            date: fb.realizationDate,
            client: fb.client,
            rating: fb.clientRating
          });
        }
      }
    });
  }

  // 5. Depuis liveMeteosCache (chargé directement de Vues_LL_NEW_DRIVE)
  const candidateCacheKey = `${(currentUser.idProfil || currentUser.id || currentUser.matricule || '').trim().toUpperCase()}_${selectedYear}`;
  if (liveMeteosCache[candidateCacheKey] && liveMeteosCache[candidateCacheKey].length > 0) {
    liveMeteosCache[candidateCacheKey].forEach(lm => {
      const already = meteoItems.some(m => m.url === lm.url);
      if (!already) {
        meteoItems.push(lm);
      }
    });
  }

  const decision = activeDossier?.juryDecision;
  const currentSalary = activeDossier?.annualReport?.currentSalary || currentUser.currentSalary || 0;
  const proposedSalary = decision?.proposedSalary0107 || decision?.amount || currentSalary;
  const percentAugmentation = decision?.percentage || (currentSalary > 0 && proposedSalary > currentSalary ? Math.round(((proposedSalary - currentSalary) / currentSalary) * 100) : 0);

  return (
    <div className="space-y-8 font-sans pb-16">
      {/* Barre de changement d'utilisateur pour Administrateur (Impersonation) */}
      {isAdmin && allUsers && onSelectUser && (
        <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-800 flex items-center justify-center shrink-0 font-bold">
              <ShieldCheck className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-amber-900">
                Mode Administrateur — Consultation Espace Personnel
              </div>
              <div className="text-xs text-amber-700 font-light">
                Visualisez l'espace personnel d'un collaborateur spécifique
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-900">Collaborateur :</span>
            <select
              value={selectedUserId || currentUser.id}
              onChange={(e) => onSelectUser(e.target.value)}
              className="bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs font-bold text-accent shadow-xs focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
            >
              {allUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.email} {u.matricule ? `(${u.matricule})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 1. En-tête Profil Utilisateur */}
      <div className="bg-white p-8 lg:p-10 rounded-2xl border border-accent/10 shadow-sm flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-2xl font-black shadow-inner">
            {currentUser.displayName ? currentUser.displayName.slice(0, 2).toUpperCase() : 'LL'}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black uppercase tracking-widest text-primary">Compte Collaborateur</span>
              <span className="text-[10px] bg-accent/10 text-accent font-bold px-2 py-0.5 rounded-full">
                Matricule : {matricule}
              </span>
            </div>
            <h2 className="text-secondary text-3xl font-extrabold tracking-tight">
              {currentUser.displayName || currentUser.email}
            </h2>
            <div className="text-xs text-accent/60 mt-1 flex flex-wrap items-center gap-4">
              <span><strong>Email :</strong> {currentUser.email}</span>
              {currentUser.idProfil && <span><strong>Id_Profil :</strong> {currentUser.idProfil}</span>}
              {currentUser.entryDate && <span><strong>Entrée LL :</strong> {currentUser.entryDate}</span>}
              {currentUser.ancienneteLL !== undefined && <span><strong>Ancienneté :</strong> {currentUser.ancienneteLL} an(s)</span>}
              {currentUser.currentGrade && <span><strong>Grade actuel :</strong> {currentUser.currentGrade}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Navigation Historique des Dossiers (Onglets par Année) */}
      <div className="bg-white p-6 rounded-2xl border border-accent/10 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-accent/10 pb-4">
          <div>
            <h3 className="text-lg font-bold text-secondary flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Historique de vos Dossiers de Campagne
            </h3>
          </div>

          {/* Sélecteur des années */}
          <div className="flex items-center gap-2 bg-accent/5 p-1.5 rounded-xl border border-accent/10">
            {sortedDossiers.length === 0 ? (
              <span className="text-xs text-accent/50 italic px-3 py-1">Aucun dossier historisé</span>
            ) : (
              sortedDossiers.map(d => {
                const yr = d.campaignYear || (d.campaignId ? parseInt(d.campaignId.replace(/[^0-9]/g, '')) : 2025);
                const isSelected = yr === selectedYear;
                return (
                  <button
                    key={d.id || yr}
                    onClick={() => setSelectedYear(yr)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                      isSelected
                        ? "bg-primary text-white shadow-sm"
                        : "text-accent/60 hover:text-accent hover:bg-white"
                    }`}
                  >
                    <span>Campagne {yr}</span>
                    {d.status === 'VALIDE' && (
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-green-500'}`} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Détails du Dossier sélectionné */}
        {!activeDossier ? (
          <div className="p-12 text-center text-accent/40 bg-accent/5 rounded-xl border border-dashed border-accent/20">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-40 text-primary" />
            <p className="text-sm font-semibold text-accent">Aucun dossier de campagne disponible pour le moment.</p>
            <p className="text-xs text-accent/50 mt-1">
              Les dossiers des campagnes passées apparaîtront automatiquement une fois le Rattrapage effectué.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Bilan Annuel & Météo Client spécifiques à cette Campagne */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Carte Bilan Annuel ({selectedYear}) */}
              <div className="bg-white p-6 rounded-2xl border border-accent/15 shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-accent/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-secondary">
                        Bilan Annuel ({selectedYear})
                      </div>
                      <div className="text-xs text-accent/60">
                        Sous-dossier {selectedYear} &bull; Matricule : {matricule}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => fetchCandidateDriveDoc(true)}
                    disabled={loadingDriveDoc}
                    className="px-3 py-1.5 bg-accent/5 hover:bg-accent/10 text-accent border border-accent/15 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Rechercher / actualiser le document dans Google Drive"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingDriveDoc ? 'animate-spin text-primary' : ''}`} />
                    <span>Actualiser</span>
                  </button>
                </div>

                {/* Résultat / État du document */}
                {activeDossier.documents?.find(d => d.type === 'BILAN_ANNUEL') ? (
                  <div className="flex items-center justify-between p-3.5 bg-accent/5 rounded-xl border border-accent/10">
                    <div className="flex items-center gap-3 truncate mr-3">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-xs font-bold text-accent truncate">
                        {activeDossier.documents.find(d => d.type === 'BILAN_ANNUEL')?.name || `Bilan_${selectedYear}_${matricule}`}
                      </span>
                    </div>
                    <a
                      href={activeDossier.documents.find(d => d.type === 'BILAN_ANNUEL')?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:brightness-110 flex items-center gap-1.5 shrink-0 shadow-xs"
                    >
                      <span>Ouvrir</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : driveDoc ? (
                  <div className="flex items-center justify-between p-3.5 bg-primary/5 rounded-xl border border-primary/20">
                    <div className="flex items-center gap-3 truncate mr-3">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-secondary truncate">
                          {driveDoc.name}
                        </div>
                        <div className="text-[11px] text-accent/60">
                          Document trouvé dans le sous-dossier {selectedYear}
                        </div>
                      </div>
                    </div>
                    <a
                      href={driveDoc.webViewLink || `https://docs.google.com/document/d/${driveDoc.id}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:brightness-110 flex items-center gap-1.5 shrink-0 shadow-xs"
                    >
                      <span>Ouvrir dans Google Docs</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : loadingDriveDoc ? (
                  <div className="p-4 bg-accent/5 rounded-xl border border-accent/10 flex items-center gap-3 text-xs text-accent/70">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span>Recherche du document dans le sous-dossier {selectedYear} pour le matricule {matricule}...</span>
                  </div>
                ) : driveError ? (
                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-2">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Document non localisé</span>
                    </div>
                    <p className="text-[11px] text-amber-700 font-light">{driveError}</p>
                    <button
                      onClick={() => fetchCandidateDriveDoc(true)}
                      className="px-3 py-1 bg-amber-200/60 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold cursor-pointer"
                    >
                      Réessayer avec autorisation Google Drive
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-accent/5 rounded-xl border border-accent/10 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-accent">Document Google Drive ({selectedYear})</div>
                      <div className="text-[11px] text-accent/60 mt-0.5">
                        Localiser le fichier du collaborateur par son matricule ({matricule}).
                      </div>
                    </div>
                    <button
                      onClick={() => fetchCandidateDriveDoc(true)}
                      className="px-3.5 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:brightness-110 flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Localiser le document</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Carte Météos Client ({selectedYear}) — Liste complète */}
              <div className="bg-white p-6 rounded-2xl border border-accent/15 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-accent/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                      <CloudSun className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-secondary">
                        Météos Client ({selectedYear})
                      </div>
                      <div className="text-xs text-accent/60">
                        {meteoItems.length > 0 ? `${meteoItems.length} météo(s) pour cette campagne` : 'Évaluations clients de la campagne'}
                      </div>
                    </div>
                  </div>
                </div>

                {meteoItems.length === 0 ? (
                  <div className="p-5 bg-accent/5 rounded-xl border border-dashed border-accent/15 text-center text-xs text-accent/50 italic">
                    Aucune météo client enregistrée pour la campagne {selectedYear}.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {meteoItems.map((m, idx) => (
                      <div key={m.id || idx} className="p-3 bg-accent/5 hover:bg-accent/10 transition-colors rounded-xl border border-accent/10 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 truncate mr-2">
                          <CloudSun className="w-4 h-4 text-amber-500 shrink-0" />
                          <div className="truncate">
                            <div className="text-xs font-bold text-secondary truncate">
                              {m.title}
                            </div>
                            <div className="text-[10px] text-accent/60 flex items-center gap-3 mt-0.5">
                              {m.client && <span><strong>Client :</strong> {m.client}</span>}
                              {m.date && <span><strong>Date :</strong> {m.date}</span>}
                              {m.rating !== undefined && (
                                <span className="font-bold text-amber-600">Note : {m.rating}/10</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-white border border-accent/20 hover:border-accent/40 text-accent rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                        >
                          <span>Ouvrir</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cartes KPI Décision Jury — 6 blocs individuels distincts */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-accent/5 p-5 rounded-xl border border-accent/10">
                <div className="text-[11px] font-black uppercase tracking-wider text-accent/50 mb-1">
                  Salaire au 30/06 ({selectedYear})
                </div>
                <div className="text-2xl font-black text-secondary">
                  {formatCurrency(decision?.salaire3006 || currentSalary)}
                </div>
              </div>

              <div className="bg-primary/5 p-5 rounded-xl border border-primary/20">
                <div className="text-[11px] font-black uppercase tracking-wider text-primary mb-1">
                  Salaire Proposé au 01/07
                </div>
                <div className="text-2xl font-black text-primary">
                  {formatCurrency(proposedSalary)}
                </div>
                <div className="text-[10px] text-primary/70 font-bold mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> +{percentAugmentation}% d'augmentation
                </div>
              </div>

              <div className="bg-accent/5 p-5 rounded-xl border border-accent/10">
                <div className="text-[11px] font-black uppercase tracking-wider text-accent/50 mb-1">
                  TJ Cible
                </div>
                <div className="text-2xl font-black text-secondary">
                  {decision?.tjCibleDecision ? `${decision.tjCibleDecision} €` : '—'}
                </div>
              </div>

              <div className="bg-accent/5 p-5 rounded-xl border border-accent/10">
                <div className="text-[11px] font-black uppercase tracking-wider text-accent/50 mb-1">
                  TJ Vendu
                </div>
                <div className="text-2xl font-black text-secondary">
                  {decision?.tjVendu0107 ? `${decision.tjVendu0107} €` : '—'}
                </div>
              </div>

              <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-200">
                <div className="text-[11px] font-black uppercase tracking-wider text-emerald-800 mb-1">
                  % Investissement
                </div>
                <div className="text-2xl font-black text-emerald-700">
                  {decision?.investmentPercentage !== undefined && decision.investmentPercentage !== null ? `${decision.investmentPercentage}%` : '—'}
                </div>
              </div>

              <div className="bg-blue-50 p-5 rounded-xl border border-blue-200">
                <div className="text-[11px] font-black uppercase tracking-wider text-blue-800 mb-1">
                  % Mission
                </div>
                <div className="text-2xl font-black text-blue-700">
                  {decision?.missionPercentage !== undefined && decision.missionPercentage !== null ? `${decision.missionPercentage}%` : '—'}
                </div>
              </div>
            </div>

            {/* Décision, Motivations & Axes de progression */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white p-6 rounded-xl border border-accent/15 shadow-xs space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" /> Pourquoi ce salaire proposé
                </div>
                <p className="text-sm text-accent/80 font-light leading-relaxed bg-accent/5 p-4 rounded-xl border border-accent/10 min-h-[90px]">
                  {decision?.whyThisSalary || "—"}
                </p>
              </div>

              <div className="bg-white p-6 rounded-xl border border-accent/15 shadow-xs space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" /> Ce qu'il faut faire pour avoir plus
                </div>
                <p className="text-sm text-accent/80 font-light leading-relaxed bg-accent/5 p-4 rounded-xl border border-accent/10 min-h-[90px]">
                  {decision?.whatToDoMore || "—"}
                </p>
              </div>
            </div>

            {/* Blocs dédiés : Référent Jury & Ressenti consultant */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white p-6 rounded-xl border border-accent/15 shadow-xs space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" /> Référent Jury
                </div>
                <div className="text-sm font-semibold text-secondary bg-accent/5 p-4 rounded-xl border border-accent/10 min-h-[50px] flex items-center">
                  {decision?.referentJury || "—"}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-accent/15 shadow-xs space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center gap-2">
                  <MessageSquareQuote className="w-4 h-4 text-amber-600" /> Ressenti consultant
                </div>
                <p className="text-sm text-accent/80 font-light leading-relaxed bg-accent/5 p-4 rounded-xl border border-accent/10 min-h-[50px] flex items-center">
                  {decision?.consultantFeeling || "—"}
                </p>
              </div>
            </div>

            {/* Retours des Évaluateurs / Pairs (TJ Cible) */}
            {activeDossier.consultantFeedbacks && Object.keys(activeDossier.consultantFeedbacks).length > 0 && (
              <div className="bg-white p-6 rounded-xl border border-accent/15 shadow-xs space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-secondary flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-primary" /> Évaluations des Collègues & Pairs ({Object.keys(activeDossier.consultantFeedbacks).length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.values(activeDossier.consultantFeedbacks).map((fb: any, idx) => (
                    <div key={fb.id || idx} className="p-4 bg-accent/5 rounded-xl border border-accent/10 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-accent">
                        <span>{fb.consultantName || 'Évaluateur'}</span>
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase">
                          {fb.type || fb.relationType || 'Collègue'}
                        </span>
                      </div>
                      <div className="text-xs text-accent/60">
                        <strong>Mission :</strong> {(() => {
                          const c = (fb.client || '').trim();
                          const p = (fb.project || '').trim();
                          const isGenericClient = !c || c === 'Client Historique' || c === 'Client';
                          const isGenericProject = !p || p === 'Mission Historique' || p === 'Projet';
                          if (isGenericClient && isGenericProject) return '—';
                          if (!isGenericClient && !isGenericProject) return `${c} – ${p}`;
                          return !isGenericClient ? c : p;
                        })()}
                      </div>
                      {(() => {
                        const hasMin = fb.targetTJMin !== undefined && fb.targetTJMin !== null && Number(fb.targetTJMin) > 0;
                        const hasMax = fb.targetTJMax !== undefined && fb.targetTJMax !== null && Number(fb.targetTJMax) > 0;
                        const hasTJ = hasMin || hasMax;
                        
                        // Indice de confiance normalisé sur 5
                        const rawConf = fb.confidenceIndex !== undefined && fb.confidenceIndex !== null ? Number(fb.confidenceIndex) : undefined;
                        let confText = '—';
                        if (rawConf !== undefined && rawConf > 0) {
                          const normalizedConf = rawConf > 5 ? Math.round(rawConf / 2) : rawConf;
                          confText = `${normalizedConf}/5`;
                        }

                        // Si évaluation non renseignée (ni TJ ni Indice)
                        if (!hasTJ && confText === '—') {
                          return (
                            <div className="text-xs font-semibold text-accent/50 italic">
                              TJ Cible suggéré : — (Indice : —)
                            </div>
                          );
                        }

                        return (
                          <div className="text-xs font-bold text-primary">
                            TJ Cible suggéré : {hasTJ ? `${fb.targetTJMin || '—'} € - ${fb.targetTJMax || '—'} €` : '—'} (Indice : {confText})
                          </div>
                        );
                      })()}

                      {/* Justification TJ Cible */}
                      <div className="space-y-1 pt-1.5 border-t border-accent/10">
                        <div className="text-[10px] font-black uppercase tracking-wider text-accent/60">
                          Justification TJ Cible :
                        </div>
                        <div className="text-xs text-accent/80 italic bg-white p-2.5 rounded-lg border border-accent/10 leading-relaxed">
                          {fb.justification ? `« ${fb.justification} »` : '—'}
                        </div>
                      </div>

                      {/* Axes d'amélioration */}
                      <div className="space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-wider text-accent/60">
                          Axes d'amélioration :
                        </div>
                        <div className="text-xs text-accent/80 bg-white p-2.5 rounded-lg border border-accent/10 leading-relaxed">
                          {fb.improvementAxes || '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
