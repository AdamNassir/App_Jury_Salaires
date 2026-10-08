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
  MessageSquareQuote,
  ArrowLeft,
  BarChart3,
  Layers,
  SlidersHorizontal,
  Check
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

  // Mode d'affichage : 'recap' (synthèse & graphique par défaut) ou 'campaign' (dossier d'une année spécifique)
  const [viewMode, setViewMode] = useState<'recap' | 'campaign'>('recap');

  // Couches superposables du graphique d'évolution
  const [activeLayers, setActiveLayers] = useState({
    salairePropose: true,
    salaireActuel: true,
    pourcentMission: false,
    pourcentInvestissement: false
  });

  // Point sélectionné / survolé sur le graphique
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Données historiques triées par ordre chronologique croissant pour le graphique
  const historicalData = [...sortedDossiers].reverse().map(d => {
    const yr = d.campaignYear || (d.campaignId ? parseInt(d.campaignId.replace(/[^0-9]/g, '')) : 2025);
    const dec = d.juryDecision;
    const curSal = dec?.salaire3006 || d.annualReport?.currentSalary || currentUser.currentSalary || 0;
    const propSal = dec?.proposedSalary0107 || dec?.amount || (curSal > 0 ? curSal : 0);
    const evo = dec?.percentage !== undefined 
      ? dec.percentage 
      : (curSal > 0 && propSal > curSal ? Math.round(((propSal - curSal) / curSal) * 100) : 0);
    const tjV = dec?.tjVendu0107 || (d as any).tjVendu || undefined;
    const tjC = dec?.tjCibleDecision || undefined;

    let pMiss = dec?.missionPercentage !== undefined && dec.missionPercentage !== null ? Number(dec.missionPercentage) : undefined;
    if (pMiss !== undefined) {
      if (pMiss <= 1 && pMiss > 0) pMiss = Math.round(pMiss * 1000) / 10;
      else if (pMiss > 100) pMiss = undefined;
    }

    let pInv = dec?.investmentPercentage !== undefined && dec.investmentPercentage !== null ? Number(dec.investmentPercentage) : undefined;
    if (pInv !== undefined) {
      if (pInv <= 1 && pInv > 0) pInv = Math.round(pInv * 1000) / 10;
      else if (pInv > 100) pInv = undefined;
    }

    let rawGrade = dec?.gradeDecision || (d as any).grade || d.annualReport?.currentGrade || currentUser.currentGrade || '—';
    if (typeof rawGrade === 'string' && (rawGrade.toLowerCase() === 'non' || rawGrade.toLowerCase() === 'oui' || rawGrade.trim() === '0')) {
      rawGrade = d.annualReport?.currentGrade || currentUser.currentGrade || '—';
    }
    const gr = rawGrade;

    return {
      dossier: d,
      year: yr,
      label: `Campagne ${yr}`,
      grade: gr,
      currentSalary: curSal,
      proposedSalary: propSal,
      evolution: evo,
      tjVendu: tjV,
      tjCible: tjC,
      pourcentMission: pMiss,
      pourcentInvestissement: pInv,
      status: d.status
    };
  });

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

  // Statistiques pour la vue récapitulative
  const latestDossierData = historicalData.length > 0 ? historicalData[historicalData.length - 1] : null;
  const initialDossierData = historicalData.length > 0 ? historicalData[0] : null;

  const initialSalary = initialDossierData ? (initialDossierData.currentSalary || initialDossierData.proposedSalary) : 0;
  const latestSalary = latestDossierData ? (latestDossierData.proposedSalary || latestDossierData.currentSalary) : 0;
  const totalSalaryDiff = latestSalary > 0 && initialSalary > 0 ? latestSalary - initialSalary : 0;
  const totalSalaryPct = initialSalary > 0 && totalSalaryDiff !== 0 ? Math.round((totalSalaryDiff / initialSalary) * 100) : 0;

  const validTjs = historicalData.map(d => d.tjVendu).filter((t): t is number => !!t && t > 0);
  const avgTjVendu = validTjs.length > 0 ? Math.round(validTjs.reduce((a, b) => a + b, 0) / validTjs.length) : (latestDossierData?.tjVendu || null);

  // Géométrie SVG du graphique d'évolution
  const svgWidth = 860;
  const svgHeight = 360;
  const paddingLeft = 75;
  const paddingRight = 75;
  const paddingTop = 35;
  const paddingBottom = 50;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  // Échelle Salaires (€)
  const allSalaries = historicalData.flatMap(d => [
    activeLayers.salaireActuel && d.currentSalary > 0 ? d.currentSalary : null,
    activeLayers.salairePropose && d.proposedSalary > 0 ? d.proposedSalary : null
  ]).filter((v): v is number => v !== null && v > 0);

  const rawMinSalary = allSalaries.length > 0 ? Math.min(...allSalaries) : 40000;
  const rawMaxSalary = allSalaries.length > 0 ? Math.max(...allSalaries) : 80000;
  const salaryMargin = Math.max(4000, Math.round((rawMaxSalary - rawMinSalary) * 0.15));
  const minSalary = Math.max(0, Math.floor((rawMinSalary - salaryMargin) / 5000) * 5000);
  const maxSalary = Math.ceil((rawMaxSalary + salaryMargin) / 5000) * 5000;
  const salaryRange = Math.max(10000, maxSalary - minSalary);

  // Position X par indice chronologique
  const getX = (index: number) => {
    if (historicalData.length <= 1) return paddingLeft + plotWidth / 2;
    return paddingLeft + (index / (historicalData.length - 1)) * plotWidth;
  };

  // Position Y pour Salaires
  const getYSalary = (val: number) => {
    if (val <= 0) return paddingTop + plotHeight;
    const ratio = (val - minSalary) / salaryRange;
    return paddingTop + plotHeight - Math.max(0, Math.min(1, ratio)) * plotHeight;
  };

  // Position Y pour Pourcentages (0 à 100%)
  const getYPercent = (val: number) => {
    const ratio = Math.max(0, Math.min(100, val)) / 100;
    return paddingTop + plotHeight - ratio * plotHeight;
  };

  const salaryTicks = [
    minSalary,
    Math.round(minSalary + salaryRange * 0.33),
    Math.round(minSalary + salaryRange * 0.66),
    maxSalary
  ];

  const hasPercentLayer = activeLayers.pourcentMission || activeLayers.pourcentInvestissement;

  // Fonctions de tracé SVG lissé
  const createSmoothPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 2;
      const cp1y = p0.y;
      const cp2x = p0.x + (p1.x - p0.x) / 2;
      const cp2y = p1.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const createAreaPath = (points: Array<{ x: number; y: number }>, baselineY: number) => {
    if (points.length < 2) return '';
    const line = createSmoothPath(points);
    const first = points[0];
    const last = points[points.length - 1];
    return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
  };

  // Points des séries
  const pointsSalairePropose = historicalData
    .map((d, i) => d.proposedSalary > 0 ? { x: getX(i), y: getYSalary(d.proposedSalary), val: d.proposedSalary, index: i, data: d } : null)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const pointsSalaireActuel = historicalData
    .map((d, i) => d.currentSalary > 0 ? { x: getX(i), y: getYSalary(d.currentSalary), val: d.currentSalary, index: i, data: d } : null)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const pointsMission = historicalData
    .map((d, i) => d.pourcentMission !== undefined ? { x: getX(i), y: getYPercent(d.pourcentMission), val: d.pourcentMission, index: i, data: d } : null)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const pointsInvestissement = historicalData
    .map((d, i) => d.pourcentInvestissement !== undefined ? { x: getX(i), y: getYPercent(d.pourcentInvestissement), val: d.pourcentInvestissement, index: i, data: d } : null)
    .filter((p): p is NonNullable<typeof p> => p !== null);

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

      {/* 1. En-tête Profil Utilisateur avec Sélecteur de Campagne en Haut à Droite */}
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

        {/* Menu déroulant en haut à droite : Synthèse vs Années de Campagne */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-accent/5 p-2 sm:p-2.5 rounded-xl border border-accent/10 shrink-0">
          <div className="text-xs font-bold text-secondary flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[11px] uppercase tracking-wider text-accent/60 font-black">Vue :</span>
          </div>
          <select
            value={viewMode === 'recap' ? 'recap' : String(selectedYear)}
            onChange={(e) => {
              if (e.target.value === 'recap') {
                setViewMode('recap');
              } else {
                const yr = Number(e.target.value);
                setSelectedYear(yr);
                setViewMode('campaign');
              }
            }}
            className="bg-white border border-accent/20 hover:border-primary focus:border-primary text-secondary text-xs font-bold px-3 py-2 rounded-lg shadow-xs focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer"
          >
            <option value="recap">📊 Synthèse & Évolution pluriannuelle</option>
            {sortedDossiers.length > 0 && (
              <optgroup label="Campagnes disponibles">
                {sortedDossiers.map(d => {
                  const yr = d.campaignYear || (d.campaignId ? parseInt(d.campaignId.replace(/[^0-9]/g, '')) : 2025);
                  return (
                    <option key={d.id || yr} value={String(yr)}>
                      Campagne {yr} {d.status === 'VALIDE' ? '(Clôturée)' : ''}
                    </option>
                  );
                })}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {/* 2. CONTENU PRINCIPAL : Soit Synthèse & Graphique d'évolution ('recap'), soit Dossier d'une Campagne spécifique ('campaign') */}
      {viewMode === 'recap' ? (
        <div className="space-y-8">
          {/* A. Bannière Synthèse & Cartes KPI Clés */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-2xl border border-emerald-200/80 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-emerald-500" />
              <div className="text-[11px] font-black uppercase tracking-wider text-emerald-800 mb-1 flex items-center justify-between">
                <span>Dernier Salaire Délibéré</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-3xl font-black text-secondary">
                {latestDossierData ? formatCurrency(latestDossierData.proposedSalary) : '—'}
              </div>
              <div className="text-xs text-accent/60 mt-1">
                {latestDossierData ? `Campagne ${latestDossierData.year} (${latestDossierData.grade})` : 'Aucun dossier'}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-indigo-200/80 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-indigo-500" />
              <div className="text-[11px] font-black uppercase tracking-wider text-indigo-800 mb-1 flex items-center justify-between">
                <span>Progression Salariale Totale</span>
                <Award className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-3xl font-black text-secondary">
                {totalSalaryDiff > 0 ? `+${formatCurrency(totalSalaryDiff)}` : '—'}
              </div>
              <div className="text-xs font-bold text-indigo-600 mt-1">
                {totalSalaryPct > 0 ? `+${totalSalaryPct}% sur l'ensemble des campagnes` : 'Évolution stable'}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-purple-200/80 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-purple-500" />
              <div className="text-[11px] font-black uppercase tracking-wider text-purple-800 mb-1 flex items-center justify-between">
                <span>TJM Moyen / Récent</span>
                <Briefcase className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-3xl font-black text-secondary">
                {avgTjVendu ? `${avgTjVendu} €` : '—'}
              </div>
              <div className="text-xs text-accent/60 mt-1">
                {latestDossierData?.tjVendu ? `Dernier TJ Vendu : ${latestDossierData.tjVendu} €` : 'Taux journalier moyen'}
              </div>
            </div>
          </div>

          {/* B. Carte Principale : Graphique d'évolution pluriannuelle & Contrôle des Couches */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-accent/10 shadow-sm space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-accent/10">
              <div>
                <h3 className="text-xl font-bold text-secondary flex items-center gap-2">
                  <BarChart3 className="w-6 h-6 text-primary" />
                  Évolution Pluriannuelle des Rémunérations & Indicateurs
                </h3>
                <p className="text-xs text-accent/60 mt-0.5">
                  Visualisez l'historique de vos délibérations et superposez les métriques de performance.
                </p>
              </div>

              {/* Raccourcis de Préréglages */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-accent/60 uppercase tracking-wider">Vues rapides :</span>
                <button
                  type="button"
                  onClick={() => setActiveLayers({
                    salairePropose: true,
                    salaireActuel: true,
                    pourcentMission: false,
                    pourcentInvestissement: false
                  })}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent/5 hover:bg-accent/10 text-accent transition-all cursor-pointer"
                >
                  Salaires
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLayers({
                    salairePropose: true,
                    salaireActuel: false,
                    pourcentMission: true,
                    pourcentInvestissement: true
                  })}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent/5 hover:bg-accent/10 text-accent transition-all cursor-pointer"
                >
                  Implication (% Mission / Invest)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLayers({
                    salairePropose: true,
                    salaireActuel: true,
                    pourcentMission: true,
                    pourcentInvestissement: true
                  })}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all cursor-pointer"
                >
                  ✨ Tout afficher
                </button>
              </div>
            </div>

            {/* Barre de contrôle des calques (Superposition des couches) */}
            <div className="bg-accent/5 p-4 rounded-xl border border-accent/10 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-secondary">
                <Layers className="w-4 h-4 text-primary" />
                <span>Couches superposables (Cliquez pour activer/désactiver) :</span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Couche Salaire Proposé */}
                <button
                  type="button"
                  onClick={() => setActiveLayers(prev => ({ ...prev, salairePropose: !prev.salairePropose }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    activeLayers.salairePropose
                      ? "bg-emerald-500 text-white border-emerald-600 shadow-xs"
                      : "bg-white text-accent/60 border-accent/20 hover:border-emerald-500"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${activeLayers.salairePropose ? 'bg-white' : 'bg-emerald-500'}`} />
                  <span>Salaire Proposé (01/07)</span>
                  {activeLayers.salairePropose && <Check className="w-3.5 h-3.5" />}
                </button>

                {/* Couche Salaire Actuel */}
                <button
                  type="button"
                  onClick={() => setActiveLayers(prev => ({ ...prev, salaireActuel: !prev.salaireActuel }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    activeLayers.salaireActuel
                      ? "bg-indigo-500 text-white border-indigo-600 shadow-xs"
                      : "bg-white text-accent/60 border-accent/20 hover:border-indigo-500"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${activeLayers.salaireActuel ? 'bg-white' : 'bg-indigo-500'}`} />
                  <span>Salaire Actuel (30/06)</span>
                  {activeLayers.salaireActuel && <Check className="w-3.5 h-3.5" />}
                </button>

                {/* Couche % Mission */}
                <button
                  type="button"
                  onClick={() => setActiveLayers(prev => ({ ...prev, pourcentMission: !prev.pourcentMission }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    activeLayers.pourcentMission
                      ? "bg-cyan-600 text-white border-cyan-700 shadow-xs"
                      : "bg-white text-accent/60 border-accent/20 hover:border-cyan-600"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${activeLayers.pourcentMission ? 'bg-white' : 'bg-cyan-600'}`} />
                  <span>% Mission</span>
                  {activeLayers.pourcentMission && <Check className="w-3.5 h-3.5" />}
                </button>

                {/* Couche % Investissement */}
                <button
                  type="button"
                  onClick={() => setActiveLayers(prev => ({ ...prev, pourcentInvestissement: !prev.pourcentInvestissement }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    activeLayers.pourcentInvestissement
                      ? "bg-pink-500 text-white border-pink-600 shadow-xs"
                      : "bg-white text-accent/60 border-accent/20 hover:border-pink-500"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${activeLayers.pourcentInvestissement ? 'bg-white' : 'bg-pink-500'}`} />
                  <span>% Investissement</span>
                  {activeLayers.pourcentInvestissement && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Zone du Graphique */}
            {historicalData.length === 0 ? (
              <div className="p-16 text-center text-accent/40 bg-accent/5 rounded-2xl border border-dashed border-accent/20">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30 text-primary" />
                <p className="text-sm font-bold text-secondary">Aucune campagne enregistrée pour le moment.</p>
                <p className="text-xs text-accent/60 mt-1 max-w-md mx-auto">
                  Les dossiers de campagnes s'afficheront dès qu'ils seront initialisés ou synchronisés via le Rattrapage des Campagnes.
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* SVG Graphique */}
                <div className="w-full overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="w-full h-auto min-w-[650px] select-none"
                  >
                    <defs>
                      <linearGradient id="gradSalairePropose" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="gradSalaireActuel" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Grille horizontale de fond */}
                    {salaryTicks.map((tickVal, idx) => {
                      const yPos = getYSalary(tickVal);
                      return (
                        <g key={`grid_${idx}`}>
                          <line
                            x1={paddingLeft}
                            y1={yPos}
                            x2={svgWidth - paddingRight}
                            y2={yPos}
                            stroke="#e2e8f0"
                            strokeWidth="1"
                            strokeDasharray={idx === 0 ? "0" : "4 4"}
                          />
                          <text
                            x={paddingLeft - 10}
                            y={yPos + 4}
                            textAnchor="end"
                            fontSize="11"
                            fontWeight="600"
                            fill="#94a3b8"
                          >
                            {(tickVal / 1000).toFixed(0)}k €
                          </text>
                        </g>
                      );
                    })}

                    {/* Axe droit : Pourcentages (%) si calque actif */}
                    {hasPercentLayer && [0, 25, 50, 75, 100].map((pct, idx) => {
                      const yPos = getYPercent(pct);
                      return (
                        <text
                          key={`pct_axis_${idx}`}
                          x={svgWidth - paddingRight + 12}
                          y={yPos + 4}
                          textAnchor="start"
                          fontSize="11"
                          fontWeight="600"
                          fill="#06b6d4"
                        >
                          {pct}%
                        </text>
                      );
                    })}

                    {/* Axe X : Lignes verticales de repère et labels des campagnes */}
                    {historicalData.map((d, i) => {
                      const xPos = getX(i);
                      const isHovered = hoveredPointIndex === i;
                      return (
                        <g key={`x_axis_${d.year}`}>
                          {/* Ligne de repère vertical */}
                          <line
                            x1={xPos}
                            y1={paddingTop}
                            x2={xPos}
                            y2={paddingTop + plotHeight}
                            stroke={isHovered ? "#3b82f6" : "#f1f5f9"}
                            strokeWidth={isHovered ? "2" : "1"}
                            strokeDasharray={isHovered ? "0" : "3 3"}
                          />
                          {/* Label année */}
                          <text
                            x={xPos}
                            y={paddingTop + plotHeight + 25}
                            textAnchor="middle"
                            fontSize="13"
                            fontWeight={isHovered ? "800" : "700"}
                            fill={isHovered ? "#1e293b" : "#64748b"}
                          >
                            {d.year}
                          </text>
                          <text
                            x={xPos}
                            y={paddingTop + plotHeight + 40}
                            textAnchor="middle"
                            fontSize="10"
                            fontWeight="500"
                            fill="#94a3b8"
                          >
                            {d.grade}
                          </text>
                        </g>
                      );
                    })}

                    {/* Aires ombrées sous les courbes */}
                    {activeLayers.salairePropose && pointsSalairePropose.length >= 2 && (
                      <path
                        d={createAreaPath(pointsSalairePropose, paddingTop + plotHeight)}
                        fill="url(#gradSalairePropose)"
                      />
                    )}
                    {activeLayers.salaireActuel && pointsSalaireActuel.length >= 2 && (
                      <path
                        d={createAreaPath(pointsSalaireActuel, paddingTop + plotHeight)}
                        fill="url(#gradSalaireActuel)"
                      />
                    )}

                    {/* Courbes des différentes séries */}
                    {/* 1. Salaire Actuel (Ligne pointillée Indigo) */}
                    {activeLayers.salaireActuel && pointsSalaireActuel.length >= 2 && (
                      <path
                        d={createSmoothPath(pointsSalaireActuel)}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="2.5"
                        strokeDasharray="4 4"
                      />
                    )}

                    {/* 2. Salaire Proposé (Ligne continue Émeraude) */}
                    {activeLayers.salairePropose && pointsSalairePropose.length >= 2 && (
                      <path
                        d={createSmoothPath(pointsSalairePropose)}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="3.5"
                      />
                    )}

                    {/* 3. % Mission (Ligne Cyan) */}
                    {activeLayers.pourcentMission && pointsMission.length >= 2 && (
                      <path
                        d={createSmoothPath(pointsMission)}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="2.5"
                      />
                    )}

                    {/* 4. % Investissement (Ligne Rose) */}
                    {activeLayers.pourcentInvestissement && pointsInvestissement.length >= 2 && (
                      <path
                        d={createSmoothPath(pointsInvestissement)}
                        fill="none"
                        stroke="#ec4899"
                        strokeWidth="2.5"
                      />
                    )}

                    {/* Points Salaire Actuel */}
                    {activeLayers.salaireActuel && pointsSalaireActuel.map(p => (
                      <g key={`pt_sal_act_${p.index}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={hoveredPointIndex === p.index ? 7 : 5}
                          fill="#ffffff"
                          stroke="#6366f1"
                          strokeWidth="2.5"
                        />
                      </g>
                    ))}

                    {/* Points Salaire Proposé */}
                    {activeLayers.salairePropose && pointsSalairePropose.map(p => (
                      <g key={`pt_sal_prop_${p.index}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={hoveredPointIndex === p.index ? 8 : 6}
                          fill="#ffffff"
                          stroke="#10b981"
                          strokeWidth="3"
                          className="transition-all duration-150"
                        />
                        {/* Valeur affichée au-dessus du point */}
                        <text
                          x={p.x}
                          y={p.y - 12}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="800"
                          fill="#047857"
                        >
                          {formatCurrency(p.val)}
                        </text>
                      </g>
                    ))}

                    {/* Points % Mission */}
                    {activeLayers.pourcentMission && pointsMission.map(p => (
                      <g key={`pt_pmiss_${p.index}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={hoveredPointIndex === p.index ? 7 : 5}
                          fill="#06b6d4"
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      </g>
                    ))}

                    {/* Points % Investissement */}
                    {activeLayers.pourcentInvestissement && pointsInvestissement.map(p => (
                      <g key={`pt_pinv_${p.index}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={hoveredPointIndex === p.index ? 7 : 5}
                          fill="#ec4899"
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                      </g>
                    ))}

                    {/* Zones de survol transparentes pour chaque colonne de campagne */}
                    {historicalData.map((d, i) => {
                      const xPos = getX(i);
                      const width = plotWidth / Math.max(1, historicalData.length);
                      return (
                        <rect
                          key={`hover_zone_${d.year}`}
                          x={xPos - width / 2}
                          y={paddingTop}
                          width={width}
                          height={plotHeight + 40}
                          fill="transparent"
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredPointIndex(i)}
                          onClick={() => {
                            setSelectedYear(d.year);
                            setViewMode('campaign');
                          }}
                        />
                      );
                    })}
                  </svg>
                </div>

                {/* Info-Bulle dynamique (Tooltip détaillée au survol) */}
                {hoveredPointIndex !== null && historicalData[hoveredPointIndex] && (() => {
                  const item = historicalData[hoveredPointIndex];
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-4 bg-slate-900 text-white rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 border border-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-black text-sm">
                          {item.year}
                        </div>
                        <div>
                          <div className="text-sm font-black text-white flex items-center gap-2">
                            <span>Campagne {item.year}</span>
                            <span className="text-[11px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                              Grade : {item.grade}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            Statut : {item.status === 'VALIDE' ? 'Dossier Clôturé' : 'En cours'}
                          </div>
                        </div>
                      </div>

                      {/* Métriques actives */}
                      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                        {activeLayers.salairePropose && (
                          <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-xl">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            <span className="text-slate-300">Proposé :</span>
                            <span className="text-emerald-400 font-extrabold">{formatCurrency(item.proposedSalary)}</span>
                            {item.evolution ? (
                              <span className="text-[10px] text-emerald-300 font-black">+{item.evolution}%</span>
                            ) : null}
                          </div>
                        )}

                        {activeLayers.salaireActuel && (
                          <div className="flex items-center gap-1.5 bg-indigo-950/60 border border-indigo-800/60 px-3 py-1.5 rounded-xl">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                            <span className="text-slate-300">Actuel :</span>
                            <span className="text-indigo-400 font-bold">{formatCurrency(item.currentSalary)}</span>
                          </div>
                        )}

                        {item.tjVendu ? (
                          <div className="flex items-center gap-1.5 bg-purple-950/60 border border-purple-800/60 px-3 py-1.5 rounded-xl">
                            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                            <span className="text-slate-300">TJ Vendu :</span>
                            <span className="text-purple-400 font-bold">{item.tjVendu} €</span>
                          </div>
                        ) : null}

                        {item.tjCible ? (
                          <div className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-800/60 px-3 py-1.5 rounded-xl">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                            <span className="text-slate-300">TJ Cible :</span>
                            <span className="text-amber-400 font-bold">{item.tjCible} €</span>
                          </div>
                        ) : null}

                        {activeLayers.pourcentMission && (
                          <div className="flex items-center gap-1.5 bg-cyan-950/60 border border-cyan-800/60 px-3 py-1.5 rounded-xl">
                            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                            <span className="text-slate-300">% Mission :</span>
                            <span className="text-cyan-400 font-bold">{item.pourcentMission !== undefined ? `${item.pourcentMission}%` : '—'}</span>
                          </div>
                        )}

                        {activeLayers.pourcentInvestissement && (
                          <div className="flex items-center gap-1.5 bg-pink-950/60 border border-pink-800/60 px-3 py-1.5 rounded-xl">
                            <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                            <span className="text-slate-300">% Invest :</span>
                            <span className="text-pink-400 font-bold">{item.pourcentInvestissement !== undefined ? `${item.pourcentInvestissement}%` : '—'}</span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedYear(item.year);
                          setViewMode('campaign');
                        }}
                        className="px-3.5 py-1.5 bg-primary text-white text-xs font-bold rounded-xl hover:brightness-110 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <span>Ouvrir la délibération</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </motion.div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* C. Tableau Comparatif Synthétique Pluriannuel */}
          <div className="bg-white p-6 rounded-2xl border border-accent/10 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-accent/10 pb-3">
              <div>
                <h4 className="text-base font-bold text-secondary flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Tableau Récapitulatif des Campagnes
                </h4>
              </div>
              <span className="text-xs text-accent/60 font-medium">
                {historicalData.length} campagne(s) archivée(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-accent/5 border-b border-accent/10 text-accent/70 font-black uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Campagne</th>
                    <th className="py-3 px-4">Grade</th>
                    <th className="py-3 px-4">Salaire Actuel (30/06)</th>
                    <th className="py-3 px-4">Salaire Proposé (01/07)</th>
                    <th className="py-3 px-4">Évolution</th>
                    <th className="py-3 px-4">TJ Vendu</th>
                    <th className="py-3 px-4">TJ Cible</th>
                    <th className="py-3 px-4">% Mission</th>
                    <th className="py-3 px-4">% Investissement</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-accent/10">
                  {historicalData.map(d => (
                    <tr
                      key={d.year}
                      className="hover:bg-accent/5 transition-colors cursor-pointer group"
                      onClick={() => {
                        setSelectedYear(d.year);
                        setViewMode('campaign');
                      }}
                    >
                      <td className="py-3.5 px-4 font-extrabold text-secondary flex items-center gap-2">
                        <span>Campagne {d.year}</span>
                        {d.status === 'VALIDE' && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Clôturé" />
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-accent/70">{d.grade}</td>
                      <td className="py-3.5 px-4 font-bold text-secondary">
                        {d.currentSalary > 0 ? formatCurrency(d.currentSalary) : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-black text-emerald-600">
                        {d.proposedSalary > 0 ? formatCurrency(d.proposedSalary) : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {d.evolution ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px]">
                            +{d.evolution}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-purple-700">
                        {d.tjVendu ? `${d.tjVendu} €` : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-amber-700">
                        {d.tjCible ? `${d.tjCible} €` : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-cyan-700">
                        {d.pourcentMission !== undefined && d.pourcentMission > 0 ? `${d.pourcentMission}%` : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-pink-700">
                        {d.pourcentInvestissement !== undefined && d.pourcentInvestissement > 0 ? `${d.pourcentInvestissement}%` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedYear(d.year);
                            setViewMode('campaign');
                          }}
                          className="px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-lg font-bold text-xs transition-all shadow-xs inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Voir le dossier</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* D. Vue Détail d'une Campagne Spécifique (Mode 'campaign') */
        <div className="bg-white p-6 rounded-2xl border border-accent/10 shadow-sm space-y-6">
          {/* Barre de retour et sélecteur rapide */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-accent/10">
            <button
              type="button"
              onClick={() => setViewMode('recap')}
              className="flex items-center gap-2 text-xs font-bold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>← Retour à la Synthèse & Évolution pluriannuelle</span>
            </button>

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
    )}
    </div>
  );
}
