import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Plus, Trash2, ExternalLink, AlertCircle, RefreshCw, Table as TableIcon, Loader2, Sparkles, Building, UserCheck } from 'lucide-react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport, UserProfile, Dossier } from '../../../types';
import { cn } from '../../../lib/utils';
import { GradeCriteriaTable } from '../GradeCriteriaTable';
import { AutonomieGuidelineTable } from '../AutonomieGuidelineTable';
import { ReferentDataService, ReferentDatasets } from '../../../services/referentDataService';
import { getGoogleAccessToken, requestGoogleSheetsAccess } from '../../../lib/firebase';

export const engagementSections = [
  { id: 'AUTONOMIE', label: 'Autonomie en mission' },
  { id: 'COMMERCIAL', label: 'Vente/commercial' },
  { id: 'VIE_LOGICLEVER', label: 'Vie LogicLever' },
  { id: 'RECRUTEMENT', label: 'Recrutement' },
  { id: 'ENCADREMENT', label: 'Accompagnement' },
  { id: 'AMELIORATION', label: 'Amélioration Continue' },
  { id: 'REFERENT_LOGICLEVER', label: 'Référent LogicLever' },
] as const;

export type EngagementSection = typeof engagementSections[number]['id'];

export function isEngagementSection(tab: string): tab is EngagementSection {
  return engagementSections.some(section => section.id === tab);
}

interface EngagementTabProps {
  section: EngagementSection;
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  profile?: UserProfile;
  dossier?: Dossier;
  campaignYear?: number;
}

export function EngagementTab({
  section,
  reportData,
  setReportData,
  profile,
  dossier,
  campaignYear = 2026
}: EngagementTabProps) {
  const candidatIdProfil = (
    dossier?.idProfil ||
    dossier?.candidateId ||
    profile?.idProfil ||
    profile?.id ||
    ''
  ).trim();

  const candidatName = (
    dossier?.candidateName ||
    profile?.displayName ||
    ''
  ).trim();

  const [showAuditPanel, setShowAuditPanel] = useState<boolean>(true);
  const [referentData, setReferentData] = useState<ReferentDatasets>(() => {
    const cached = ReferentDataService.getCachedData(candidatIdProfil, candidatName, campaignYear);
    return cached || {
      meteos: [],
      actions: [],
      missions: [],
      coaching: [],
      encadrement: [],
      parrain: [],
      clients: [],
      auditLog: [],
      loading: false,
      error: null
    };
  });

  const loadData = async (forceRefresh: boolean = false) => {
    if (!candidatIdProfil && !candidatName) return;

    try {
      setReferentData(prev => ({ ...prev, loading: true, error: null }));
      const result = await ReferentDataService.loadReferentData(
        candidatIdProfil,
        candidatName,
        campaignYear,
        forceRefresh
      );
      setReferentData(result);
    } catch (err: any) {
      console.warn('Erreur chargement données référent:', err);
      setReferentData(prev => ({
        ...prev,
        loading: false,
        error: err?.message || 'Erreur lors du chargement des données'
      }));
    }
  };

  useEffect(() => {
    // Ne charger automatiquement que la toute première fois si la case est cochée ET qu'aucun cache n'existe encore
    if (section === 'REFERENT_LOGICLEVER' && reportData.isReferentOrAspiring) {
      const existing = ReferentDataService.getCachedData(candidatIdProfil, candidatName, campaignYear);
      if (!existing) {
        loadData(false);
      } else {
        setReferentData(existing);
      }
    }
  }, [
    section,
    reportData.isReferentOrAspiring,
    candidatIdProfil,
    candidatName,
    campaignYear
  ]);

  const squadEntries = reportData.squadEntries ?? [{
    squad: reportData.squadName || '',
    contributions: [reportData.squadRole, reportData.squadContributions].filter(Boolean).join('\n\n'),
  }];
  const updateSquads = (update: (entries: typeof squadEntries) => typeof squadEntries) => {
    setReportData(prev => ({ ...prev, squadEntries: update(prev.squadEntries ?? [{
      squad: prev.squadName || '',
      contributions: [prev.squadRole, prev.squadContributions].filter(Boolean).join('\n\n'),
    }]) }));
  };

  const missionFollowUps = reportData.referentMissionFollowUps ?? [];
  const updateMissionFollowUps = (update: (entries: typeof missionFollowUps) => typeof missionFollowUps) => {
    setReportData(prev => ({
      ...prev,
      referentMissionFollowUps: update(prev.referentMissionFollowUps ?? [])
    }));
  };

  const networkEntries = reportData.referentNetworkEntries ?? [];
  const updateNetworkEntries = (update: (entries: typeof networkEntries) => typeof networkEntries) => {
    setReportData(prev => ({
      ...prev,
      referentNetworkEntries: update(prev.referentNetworkEntries ?? [])
    }));
  };

  const missionEncadrements = reportData.referentMissionEncadrements ?? [];
  const updateMissionEncadrements = (update: (entries: typeof missionEncadrements) => typeof missionEncadrements) => {
    setReportData(prev => ({
      ...prev,
      referentMissionEncadrements: update(prev.referentMissionEncadrements ?? [])
    }));
  };

  const coachingEntries = reportData.referentCoachingEntries ?? [];
  const updateCoachingEntries = (update: (entries: typeof coachingEntries) => typeof coachingEntries) => {
    setReportData(prev => ({
      ...prev,
      referentCoachingEntries: update(prev.referentCoachingEntries ?? [])
    }));
  };

  const accountEntries = reportData.referentAccountEntries ?? [];
  const updateAccountEntries = (update: (entries: typeof accountEntries) => typeof accountEntries) => {
    setReportData(prev => ({
      ...prev,
      referentAccountEntries: update(prev.referentAccountEntries ?? [])
    }));
  };

  const offersEntries = reportData.referentOffersEntries ?? [];
  const updateOffersEntries = (update: (entries: typeof offersEntries) => typeof offersEntries) => {
    setReportData(prev => ({
      ...prev,
      referentOffersEntries: update(prev.referentOffersEntries ?? [])
    }));
  };

  const getSectionSubtitle = () => {
    switch (section) {
      case 'COMMERCIAL':
        return "Logiclever se définit comme une société de conseil. Nous serons reconduits si nous comprenons où est la valeur pour le client et ce qu’il faut faire pour apporter davantage de valeur.";
      case 'VIE_LOGICLEVER':
        return "La vie Logiclever, c’est du fun mais aussi de l’amélioration continue dans nos processus internes. Toujours avoir en tête “Qu’est-ce que je fais qui mérite d’être partagé à tous ?”";
      case 'RECRUTEMENT':
        return "Recruter n’est pas une fin en soi. On souhaite uniquement convaincre des personnes compétentes avec un bon savoir-être.";
      case 'ENCADREMENT':
        return "Logiclever se développe uniquement par bouche à oreille. La qualité des prestations délivrées par les consultants (et donc la qualité de l’encadrement pour faire grandir les consultants) est nécessaire.";
      default:
        return undefined;
    }
  };

  const showGradeCriteriaTable = [
    'AUTONOMIE',
    'COMMERCIAL',
    'VIE_LOGICLEVER',
    'RECRUTEMENT',
    'ENCADREMENT'
  ].includes(section);

  return (
    <motion.div key={section} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      {showGradeCriteriaTable && <GradeCriteriaTable />}
      <Section 
        title={engagementSections.find(item => item.id === section)!.label}
        subtitle={getSectionSubtitle()}
      >
        <div className="space-y-12">
          {section === 'AUTONOMIE' && (
            <div className="space-y-6">
              <AutonomieGuidelineTable />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm border-collapse">
                  <thead>
                    <tr className="bg-accent/5 text-left">
                      <th scope="col" className="p-3">Client</th>
                      <th scope="col" className="p-3">Actions dans le cadre de la mission (en qq mots)</th>
                      <th scope="col" className="p-3">Grade</th>
                      <th scope="col" className="p-3">Commentaire</th>
                      <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportData.missionClients ?? [{ client: '', actions: '', grade: '', comment: '' }]).map((row, index) => {
                      const updateRow = (field: keyof typeof row, value: string) => {
                        setReportData(prev => {
                          const rows = prev.missionClients ?? [{ client: '', actions: '', grade: '' as const, comment: '' }];
                          return { ...prev, missionClients: rows.map((entry, i) => i === index ? { ...entry, [field]: value } : entry) };
                        });
                      };
                      return (
                        <tr key={index} className="border-b border-accent/10 align-top">
                          <td className="p-3">
                            <input aria-label={`Client ${index + 1}`} value={row.client} onChange={e => updateRow('client', e.target.value)} placeholder={`Client ${index + 1}`} className="w-full min-w-28 p-3 rounded-lg border border-accent/10" />
                          </td>
                          <td className="p-3">
                            <textarea
                              aria-label={`Actions du client ${index + 1}`}
                              value={row.actions}
                              onChange={e => updateRow('actions', e.target.value)}
                              placeholder={`Exemple : PO du GPS_SI pour le périmètre DT de la direction technique\nSuivi du Run`}
                              className="w-full min-w-56 min-h-32 p-3 rounded-lg border border-accent/10"
                            />
                          </td>
                          <td className="p-3">
                            <select aria-label={`Grade du client ${index + 1}`} value={row.grade} onChange={e => updateRow('grade', e.target.value)} className="w-full min-w-[150px] bg-white text-accent pl-3 pr-8 py-3 rounded-lg border border-accent/10">
                              <option value="">Sélectionnez</option>
                              {(['Junior', 'Confirmé', 'Senior', 'Expert'] as const).map(grade => <option key={grade} value={grade}>{grade}</option>)}
                            </select>
                          </td>
                          <td className="p-3">
                            <textarea aria-label={`Commentaire du client ${index + 1}`} value={row.comment} onChange={e => updateRow('comment', e.target.value)} className="w-full min-w-40 min-h-32 p-3 rounded-lg border border-accent/10" />
                          </td>
                          <td className="p-3">
                            <button
                              type="button"
                              aria-label={`Supprimer le client ${index + 1}`}
                              title="Supprimer"
                              onClick={() => setReportData(prev => ({ ...prev, missionClients: (prev.missionClients ?? []).filter((_, i) => i !== index) }))}
                              className="text-red-500 hover:text-red-700 p-2 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => setReportData(prev => ({ ...prev, missionClients: [...(prev.missionClients ?? [{ client: '', actions: '', grade: '' as const, comment: '' }]), { client: '', actions: '', grade: '', comment: '' }] }))} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold">Ajouter un client</button>
            </div>
          )}

          {section === 'COMMERCIAL' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <FormField label="Avez-vous pu présenter Logiclever (Qui on est ?, nos offres ?, Nos valeurs ?)" value={reportData.commercialPresentation} onChange={v => setReportData(prev => ({ ...prev, commercialPresentation: v }))} />
              <FormField label="Quels conseils avez-vous donnés à vos clients ?" value={reportData.commercialAdvice} onChange={v => setReportData(prev => ({ ...prev, commercialAdvice: v }))} />
              <FormField
                label="Avez-vous été force de proposition ? Exemple de valeur ajoutée que vous avez apporté à vos clients"
                value={reportData.commercialProposition}
                onChange={v => setReportData(prev => ({ ...prev, commercialProposition: v }))}
              />
              <FormField
                label="Quelles propositions commerciales avez-vous faites ?"
                value={reportData.commercialOffers}
                onChange={v => setReportData(prev => ({ ...prev, commercialOffers: v }))}
              />
            </div>
          )}

          {section === 'VIE_LOGICLEVER' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <FormField label="Capitalisation de connaissance et Amélioration continue (Drive)" value={reportData.lifeKnowledgeSharing} onChange={v => setReportData(prev => ({ ...prev, lifeKnowledgeSharing: v }))} />
                <FormField label="Partage d’information (SLACK)" value={reportData.lifeSlack} onChange={v => setReportData(prev => ({ ...prev, lifeSlack: v }))} />
                <FormField label="Créer du lien entre consultants / Esprit d’équipe (Pot, journée Logiclever, parrainage…)" value={reportData.lifeTeamSpirit} onChange={v => setReportData(prev => ({ ...prev, lifeTeamSpirit: v }))} />
                <FormField 
                  label="Est-ce que je maîtrise le business model de Logiclever (Taux de facturation, marge sur mission…)" 
                  labelHref="https://docs.google.com/presentation/d/1xSJVxDGK5nmIUUa37jsfGXfXSaYETjqgsHD7o7e2S84/edit?slide=id.p3#slide=id.p3"
                  value={reportData.lifeBusinessModel} 
                  onChange={v => setReportData(prev => ({ ...prev, lifeBusinessModel: v }))} 
                />
                <FormField label="Autres" value={reportData.lifeLogiclever} onChange={v => setReportData(prev => ({ ...prev, lifeLogiclever: v }))} />
              </div>
            </div>
          )}

          {section === 'RECRUTEMENT' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <FormField label="Promouvoir Logiclever : Avec qui ?, Comment ?" value={reportData.recruitmentPromotion} onChange={v => setReportData(prev => ({ ...prev, recruitmentPromotion: v }))} tooltip="Points sur votre implication dans la promotion de l'image de marque." />
                <FormField label="Recrutement : Avez vous interviewé des candidats ?" value={reportData.recruitmentInterviews} onChange={v => setReportData(prev => ({ ...prev, recruitmentInterviews: v }))} />
                <FormField label="Réseaux sociaux : Avez vous ajouté des collègues sur LinkedIn ?, etc" value={reportData.recruitmentSocial} onChange={v => setReportData(prev => ({ ...prev, recruitmentSocial: v }))} />
              </div>
            </div>
          )}

          {section === 'ENCADREMENT' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <FormField label="Ai-je sollicité mon coach pour m’aider à grandir et avoir des conseils pour aider au développement de Logiclever ?" value={reportData.encadrementCoach} onChange={v => setReportData(prev => ({ ...prev, encadrementCoach: v }))} />
                <FormField label="Ai-je sollicité mon encadrant en mission à chaque fois que nécessaire ? (ex : alerte sur la qualité de mes livrables, j’ai du temps et je pourrai être utile…)" value={reportData.encadrementManager} onChange={v => setReportData(prev => ({ ...prev, encadrementManager: v }))} />
              </div>
            </div>
          )}

          {section === 'REFERENT_LOGICLEVER' && (
            <div className="space-y-12">
              <div className="p-6 bg-accent/[0.02] border border-accent/10 rounded-xl space-y-4">
                <h3 className="text-base font-bold text-secondary">
                  Tâches réalisées par les référents Logiclever ou ceux voulant le devenir :
                </h3>

                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5 text-xs text-amber-950 font-medium">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong className="font-bold text-amber-700">ATTENTION :</strong> Pour passer référent Logiclever, il faut avoir fait des choses tangibles sur un ou plusieurs de ces points (
                    <a
                      href="https://docs.google.com/presentation/d/1RRSv-9qBXuKXCpMabm0wavZx9wHZ4rW9fn2oUnAdIqM/edit?slide=id.g8d0a82e1e4_0_94#slide=id.g8d0a82e1e4_0_94"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-bold underline inline-flex items-center gap-0.5 hover:text-primary-dark"
                    >
                      voir le guide de l’expert
                      <ExternalLink className="w-3 h-3 inline" />
                    </a>
                    )
                  </span>
                </div>

                <ul className="space-y-2 text-xs text-accent/80 font-medium">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Un maximum de 4 consultants à coacher par an (soit 8 entretiens formels sur la base de ce template)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Être actif pour le développement de Logiclever (offre commerciale, faire venir du monde…)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Participer au recrutement (4 entretiens minimum par an)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Faire le suivi client (météo)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Participer aux points de coordination</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Prendre un rôle d’expert référent sur une Squad d’amélioration continue</span>
                  </li>
                </ul>
              </div>

              <div>
                <div
                  onClick={() => setReportData(prev => ({ ...prev, isReferentOrAspiring: !prev.isReferentOrAspiring }))}
                  className={cn(
                    "p-8 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between group",
                    reportData.isReferentOrAspiring ? "bg-accent border-accent text-white shadow-xl shadow-accent/20" : "bg-white border-accent/10 hover:border-accent/40"
                  )}
                >
                  <div>
                    <div className="text-xl font-bold">Je suis Référent ou souhaite le devenir</div>
                  </div>
                  <div className={cn(
                    "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all",
                    reportData.isReferentOrAspiring ? "bg-white border-white text-accent" : "border-accent/10 text-transparent"
                  )}>
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {reportData.isReferentOrAspiring && (
                <div className="space-y-12">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-primary/5 p-4 rounded-xl border border-primary/20">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-accent">
                          Données synchronisées automatiquement depuis le Google Sheet Référents ({campaignYear})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!getGoogleAccessToken() && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await requestGoogleSheetsAccess();
                                await loadData();
                              } catch (e) {
                                console.warn('Erreur autorisation Google:', e);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-2xs cursor-pointer"
                          >
                            <span>Connexion Google Sheets</span>
                          </button>
                        )}
                        {referentData.auditLog && referentData.auditLog.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowAuditPanel(prev => !prev)}
                            className="text-[11px] font-semibold text-accent/70 hover:text-accent underline px-2 py-1 cursor-pointer"
                          >
                            {showAuditPanel ? 'Masquer détails des feuilles' : 'Afficher détails des feuilles'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => loadData(true)}
                          disabled={referentData.loading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-primary/20 hover:border-primary text-primary text-xs font-bold rounded-lg transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={cn("w-3.5 h-3.5", referentData.loading && "animate-spin")} />
                          <span>{referentData.loading ? 'Actualisation...' : 'Actualiser'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Panneau d'audit détaillé des feuilles interrogées */}
                    {showAuditPanel && referentData.auditLog && referentData.auditLog.length > 0 && (
                      <div className="bg-white rounded-xl border border-accent/15 p-4 shadow-xs space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-accent/10 pb-2">
                          <div className="flex items-center gap-2">
                            <TableIcon className="w-4 h-4 text-secondary" />
                            <h5 className="text-xs font-black text-secondary uppercase tracking-wider">
                              Contrôle de synchronisation Google Sheets (5 onglets vérifiés)
                            </h5>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-accent/70 bg-accent/5 px-2 py-0.5 rounded">
                            IdProfil actif : <span className="text-primary font-black">{dossier?.idProfil || dossier?.candidateId || profile?.idProfil || '(non défini)'}</span>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5">
                          {referentData.auditLog.map(item => (
                            <div
                              key={item.id}
                              className={cn(
                                "p-3 rounded-lg border text-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 transition-all",
                                item.status === 'SUCCESS' && "bg-emerald-50/60 border-emerald-200/80 text-emerald-950",
                                item.status === 'WARNING' && "bg-amber-50/60 border-amber-200/80 text-amber-950",
                                item.status === 'ERROR' && "bg-rose-50/60 border-rose-200/80 text-rose-950"
                              )}
                            >
                              <div className="space-y-1.5 flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-secondary">{item.tableName}</span>
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline bg-white px-2 py-0.5 rounded border border-primary/20 shadow-2xs"
                                  >
                                    <span>{item.sheetName}</span>
                                    <ExternalLink className="w-3 h-3 text-primary" />
                                  </a>
                                  <span className="text-[10px] font-mono bg-white/80 px-2 py-0.5 rounded border border-accent/10 text-accent/80">
                                    Cible : {item.columnTarget}
                                  </span>
                                </div>

                                <div className="text-[11px] text-accent/80 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span>
                                    Recherche sur <strong className="font-mono text-secondary">{item.columnTarget}</strong> = <strong className="font-mono text-primary bg-primary/10 px-1 py-0.2 rounded">"{item.idProfilUsed}"</strong>
                                  </span>
                                  <span>•</span>
                                  <span className="italic">{item.filterRule}</span>
                                </div>

                                {item.details && (
                                  <div className="text-[11px] font-medium text-accent/90 bg-white/60 px-2 py-1 rounded border border-accent/10">
                                    {item.details}
                                  </div>
                                )}

                                {/* Liste exhaustive de tous les noms de colonnes réels avec leur lettre */}
                                {item.columns && item.columns.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-accent/10 space-y-1">
                                    <div className="text-[10px] font-black uppercase text-secondary/80 flex items-center justify-between">
                                      <span>Colonnes lues sur la feuille ({item.columns.length}) :</span>
                                      <span className="text-[10px] font-normal text-accent/60">Ligne 1 d'en-tête Google Sheets</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
                                      {item.columns.map(col => {
                                        const isTarget = item.columnTarget.includes(`Colonne ${col.letter}`);
                                        return (
                                          <span
                                            key={col.letter}
                                            className={cn(
                                              "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-mono border",
                                              isTarget
                                                ? "bg-primary text-white font-bold border-primary shadow-2xs"
                                                : "bg-white text-secondary border-accent/15"
                                            )}
                                            title={`Colonne ${col.letter}: ${col.name}`}
                                          >
                                            <strong className={isTarget ? "text-white" : "text-primary"}>[{col.letter}]</strong>
                                            <span className="truncate max-w-[130px]">{col.name}</span>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                                  item.status === 'SUCCESS' && "bg-emerald-100 text-emerald-800",
                                  item.status === 'WARNING' && "bg-amber-100 text-amber-800",
                                  item.status === 'ERROR' && "bg-rose-100 text-rose-800"
                                )}>
                                  {item.rowsMatchedCandidate} ligne{item.rowsMatchedCandidate > 1 ? 's' : ''} retenue{item.rowsMatchedCandidate > 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {referentData.error && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                      <span>{referentData.error}</span>
                      <button
                        type="button"
                        onClick={loadData}
                        className="font-bold underline text-amber-900 ml-2"
                      >
                        Réessayer
                      </button>
                    </div>
                  )}

                  {/* 1. Suivre les missions (Vue_Meteo - Col E, F, Q, R, B, S, Z) */}
                  <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-accent/10 pb-4">
                      <div>
                        <h4 className="text-lg font-bold text-secondary">Suivre les missions</h4>
                        <p className="text-xs text-accent/60 mt-1">
                          Météos associées au référent pour la campagne {campaignYear} ({referentData.meteos.length} trouvée{referentData.meteos.length > 1 ? 's' : ''})
                        </p>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider bg-secondary/10 text-secondary px-2.5 py-1 rounded-md shrink-0">
                        Vue_Meteo (Année {campaignYear})
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-accent/10 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-accent/5 border-b border-accent/10 text-[10px] font-black text-accent/50 uppercase tracking-wider">
                          <tr>
                            <th className="p-3.5">Client</th>
                            <th className="p-3.5">Consultant évalué</th>
                            <th className="p-3.5">Date Météo</th>
                            <th className="p-3.5">Fiche Météo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-accent/5 font-light">
                          {referentData.loading ? (
                            <tr>
                              <td colSpan={4} className="p-6 text-center text-accent/40">
                                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-secondary" />
                                Chargement des fiches météos...
                              </td>
                            </tr>
                          ) : referentData.meteos.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="p-6 text-center text-accent/40 italic">
                                Aucune météo trouvée pour l'année de campagne {campaignYear} (Colonne Z).
                              </td>
                            </tr>
                          ) : (
                            referentData.meteos.map((item, idx) => (
                              <tr key={idx} className="hover:bg-accent/[0.02] transition-colors">
                                <td className="p-3.5 font-bold text-secondary">{item.client || '-'}</td>
                                <td className="p-3.5 font-medium">{item.consultantEvalue || item.idProfilEvalue || '-'}</td>
                                <td className="p-3.5 font-mono text-[11px]">{item.dateMeteo || '-'}</td>
                                <td className="p-3.5">
                                  {item.lienMeteo ? (
                                    <a
                                      href={item.lienMeteo}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary/10 hover:bg-secondary/20 text-secondary font-bold text-xs rounded-md transition-colors"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      <span>Ouvrir la fiche</span>
                                    </a>
                                  ) : (
                                    <span className="text-accent/40 italic">Aucun lien</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <FormField
                      label="Commentaire (Suivre les missions)"
                      value={reportData.referentMeteosComment || ''}
                      onChange={v => setReportData(prev => ({ ...prev, referentMeteosComment: v }))}
                      placeholder="Vos commentaires, faits marquants et retours d'expérience sur le suivi des missions..."
                    />
                  </div>

                  {/* 2. Disposer d’un réseau de donneurs d’ordre dont proposer des offres */}
                  <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-8">
                    <div className="border-b border-accent/10 pb-4">
                      <h4 className="text-lg font-bold text-secondary">
                        Disposer d’un réseau de donneurs d’ordre dont proposer des offres
                      </h4>
                      <p className="text-xs text-accent/60 mt-1">
                        Tableaux alimentés automatiquement depuis les onglets Vue_Action et Vue_Mission.
                      </p>
                    </div>

                    {/* Tableau Vue_Action */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-accent/70 flex items-center gap-1.5">
                          <TableIcon className="w-3.5 h-3.5 text-primary" />
                          Actions réalisées par le candidat ({referentData.actions.length})
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-accent/10 text-accent/60 px-2 py-0.5 rounded">
                          Vue_Action
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-accent/10 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-accent/5 border-b border-accent/10 text-[10px] font-black text-accent/50 uppercase tracking-wider">
                            <tr>
                              <th className="p-3.5">Client</th>
                              <th className="p-3.5">Description Action</th>
                              <th className="p-3.5">Date de réalisation</th>
                              <th className="p-3.5">Statut Action</th>
                              <th className="p-3.5">Compte Rendu</th>
                              <th className="p-3.5">Pièce Jointe</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-accent/5 font-light">
                            {referentData.loading ? (
                              <tr>
                                <td colSpan={6} className="p-6 text-center text-accent/40">
                                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-secondary" />
                                  Chargement des actions...
                                </td>
                              </tr>
                            ) : referentData.actions.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="p-6 text-center text-accent/40 italic">
                                  Aucune action enregistrée pour le candidat sur l'année de campagne.
                                </td>
                              </tr>
                            ) : (
                              referentData.actions.map((item, idx) => (
                                <tr key={idx} className="hover:bg-accent/[0.02] transition-colors">
                                  <td className="p-3.5 font-bold text-secondary">{item.client || '-'}</td>
                                  <td className="p-3.5 max-w-xs font-medium text-accent/90">{item.descriptionAction || '-'}</td>
                                  <td className="p-3.5 font-mono text-[11px]">{item.dateRealisation || '-'}</td>
                                  <td className="p-3.5">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                                      {item.statutAction || '-'}
                                    </span>
                                  </td>
                                  <td className="p-3.5 max-w-sm whitespace-pre-wrap text-accent/80">{item.compteRendu || '-'}</td>
                                  <td className="p-3.5">
                                    {item.lienPieceJointe ? (
                                      <a
                                        href={item.lienPieceJointe}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs rounded-md transition-colors"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span>Document ({item.idPieceJointe || 'Voir'})</span>
                                      </a>
                                    ) : item.idPieceJointe ? (
                                      <span className="font-mono text-xs text-accent/60">ID: {item.idPieceJointe}</span>
                                    ) : (
                                      <span className="text-accent/30 italic">Aucune</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <FormField
                        label="Commentaire (Actions réseau donneurs d'ordre)"
                        value={reportData.referentActionsComment || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentActionsComment: v }))}
                        placeholder="Vos observations sur les actions menées auprès des donneurs d'ordre..."
                      />
                    </div>

                    {/* Tableau Vue_Mission */}
                    <div className="space-y-4 pt-6 border-t border-accent/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-accent/70 flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-primary" />
                          Missions créées / réalisées par le candidat ({referentData.missions.length})
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-accent/10 text-accent/60 px-2 py-0.5 rounded">
                          Vue_Mission
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-accent/10 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-accent/5 border-b border-accent/10 text-[10px] font-black text-accent/50 uppercase tracking-wider">
                            <tr>
                              <th className="p-3.5">Client Final</th>
                              <th className="p-3.5">Libellé Mission</th>
                              <th className="p-3.5">Date Création</th>
                              <th className="p-3.5">Statut Mission</th>
                              <th className="p-3.5">Pièce Jointe</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-accent/5 font-light">
                            {referentData.loading ? (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-accent/40">
                                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-secondary" />
                                  Chargement des missions...
                                </td>
                              </tr>
                            ) : referentData.missions.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-accent/40 italic">
                                  Aucune mission créée pour le candidat sur l'année de campagne.
                                </td>
                              </tr>
                            ) : (
                              referentData.missions.map((item, idx) => (
                                <tr key={idx} className="hover:bg-accent/[0.02] transition-colors">
                                  <td className="p-3.5 font-bold text-secondary">{item.clientFinal || '-'}</td>
                                  <td className="p-3.5 font-medium">{item.libelleMission || '-'}</td>
                                  <td className="p-3.5 font-mono text-[11px] text-accent/70">{item.dateCreation || '-'}</td>
                                  <td className="p-3.5">
                                    {(() => {
                                      const s = (item.statut || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                      let badgeColor = 'bg-amber-100 text-amber-800 border border-amber-200';
                                      if (s.includes('perdu')) {
                                        badgeColor = 'bg-red-100 text-red-800 border border-red-200';
                                      } else if (s.includes('gagne')) {
                                        badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
                                      }
                                      return (
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeColor}`}>
                                          {item.statut || 'En cours'}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td className="p-3.5">
                                    {item.lienPieceJointe ? (
                                      <a
                                        href={item.lienPieceJointe}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs rounded-md transition-colors"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span>Document ({item.idPieceJointe || 'Voir'})</span>
                                      </a>
                                    ) : item.idPieceJointe ? (
                                      <span className="font-mono text-xs text-accent/60">ID: {item.idPieceJointe}</span>
                                    ) : (
                                      <span className="text-accent/30 italic">Aucune</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <FormField
                        label="Commentaire (Missions créées / proposées)"
                        value={reportData.referentMissionsComment || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentMissionsComment: v }))}
                        placeholder="Vos commentaires sur les missions développées ou proposées..."
                      />
                    </div>
                  </div>

                  {/* 3. Accompagnement (anciennement Encadrement) */}
                  <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-8">
                    <div className="border-b border-accent/10 pb-4">
                      <h4 className="text-lg font-bold text-secondary">Accompagnement</h4>
                      <p className="text-xs text-accent/60 mt-1">
                        Accompagnements réalisés (Coaching, Encadrement mission, Parrainage) issus de l'onglet Vue_Accompagnement.
                      </p>
                    </div>

                    {/* Coaching LL */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-accent/70 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-primary" />
                          Coaching ({referentData.coaching.length})
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-accent/10 text-accent/60 px-2 py-0.5 rounded">
                          1 - Coaching LL
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-accent/10 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-accent/5 border-b border-accent/10 text-[10px] font-black text-accent/50 uppercase tracking-wider">
                            <tr>
                              <th className="p-3.5">Nom Accompagné</th>
                              <th className="p-3.5">Date Début</th>
                              <th className="p-3.5">Date Fin</th>
                              <th className="p-3.5">Libellé Statut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-accent/5 font-light">
                            {referentData.loading ? (
                              <tr>
                                <td colSpan={4} className="p-6 text-center text-accent/40">
                                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-secondary" />
                                  Chargement des coachings...
                                </td>
                              </tr>
                            ) : referentData.coaching.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-6 text-center text-accent/40 italic">
                                  Aucun coaching enregistré pour la campagne.
                                </td>
                              </tr>
                            ) : (
                              referentData.coaching.map((item, idx) => (
                                <tr key={idx} className="hover:bg-accent/[0.02] transition-colors">
                                  <td className="p-3.5 font-bold text-secondary">{item.nomAccompagne || '-'}</td>
                                  <td className="p-3.5 text-accent/80">{item.dateDebut || '-'}</td>
                                  <td className="p-3.5 text-accent/80">{item.dateFin || '-'}</td>
                                  <td className="p-3.5">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                                      {item.libelleStatut || 'En cours'}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <FormField
                        label="Commentaire (Coaching)"
                        value={reportData.referentCoachingComment || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentCoachingComment: v }))}
                        placeholder="Vos observations sur vos coachings..."
                      />
                    </div>

                    {/* Encadrement mission */}
                    <div className="space-y-4 pt-6 border-t border-accent/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-accent/70 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-primary" />
                          Encadrement en mission ({referentData.encadrement.length})
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-accent/10 text-accent/60 px-2 py-0.5 rounded">
                          5 - Encadrement mission
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-accent/10 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-accent/5 border-b border-accent/10 text-[10px] font-black text-accent/50 uppercase tracking-wider">
                            <tr>
                              <th className="p-3.5">Nom Accompagné</th>
                              <th className="p-3.5">Date Début</th>
                              <th className="p-3.5">Date Fin</th>
                              <th className="p-3.5">Libellé Statut</th>
                              <th className="p-3.5">Lien Fiche Encadrement</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-accent/5 font-light">
                            {referentData.loading ? (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-accent/40">
                                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-secondary" />
                                  Chargement des encadrements...
                                </td>
                              </tr>
                            ) : referentData.encadrement.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-accent/40 italic">
                                  Aucun encadrement en mission enregistré pour la campagne.
                                </td>
                              </tr>
                            ) : (
                              referentData.encadrement.map((item, idx) => (
                                <tr key={idx} className="hover:bg-accent/[0.02] transition-colors">
                                  <td className="p-3.5 font-bold text-secondary">{item.nomAccompagne || '-'}</td>
                                  <td className="p-3.5 text-accent/80">{item.dateDebut || '-'}</td>
                                  <td className="p-3.5 text-accent/80">{item.dateFin || '-'}</td>
                                  <td className="p-3.5">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                                      {item.libelleStatut || 'En cours'}
                                    </span>
                                  </td>
                                  <td className="p-3.5">
                                    {item.lienFicheEncadrement ? (
                                      <a
                                        href={item.lienFicheEncadrement.startsWith('http') ? item.lienFicheEncadrement : `https://${item.lienFicheEncadrement}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary/10 hover:bg-secondary/20 text-secondary font-bold text-xs rounded-md transition-colors"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span>Ouvrir la fiche</span>
                                      </a>
                                    ) : (
                                      <span className="text-accent/30 italic">Aucun lien</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <FormField
                        label="Commentaire (Encadrement en mission)"
                        value={reportData.referentEncadrementComment || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentEncadrementComment: v }))}
                        placeholder="Vos observations sur les encadrements en mission..."
                      />
                    </div>

                    {/* Parrain */}
                    <div className="space-y-4 pt-6 border-t border-accent/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-accent/70 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-primary" />
                          Parrainage ({referentData.parrain.length})
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-accent/10 text-accent/60 px-2 py-0.5 rounded">
                          2 - Parrain
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-accent/10 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-accent/5 border-b border-accent/10 text-[10px] font-black text-accent/50 uppercase tracking-wider">
                            <tr>
                              <th className="p-3.5">Nom Accompagné</th>
                              <th className="p-3.5">Date Début</th>
                              <th className="p-3.5">Date Fin</th>
                              <th className="p-3.5">Libellé Statut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-accent/5 font-light">
                            {referentData.loading ? (
                              <tr>
                                <td colSpan={4} className="p-6 text-center text-accent/40">
                                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-secondary" />
                                  Chargement des parrainages...
                                </td>
                              </tr>
                            ) : referentData.parrain.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-6 text-center text-accent/40 italic">
                                  Aucun parrainage enregistré pour la campagne.
                                </td>
                              </tr>
                            ) : (
                              referentData.parrain.map((item, idx) => (
                                <tr key={idx} className="hover:bg-accent/[0.02] transition-colors">
                                  <td className="p-3.5 font-bold text-secondary">{item.nomAccompagne || '-'}</td>
                                  <td className="p-3.5 text-accent/80">{item.dateDebut || '-'}</td>
                                  <td className="p-3.5 text-accent/80">{item.dateFin || '-'}</td>
                                  <td className="p-3.5">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                                      {item.libelleStatut || 'En cours'}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <FormField
                        label="Commentaire (Parrainage)"
                        value={reportData.referentParrainComment || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentParrainComment: v }))}
                        placeholder="Vos observations sur le parrainage..."
                      />
                    </div>

                    {/* Champ On-boarding conservé */}
                    <div className="pt-6 border-t border-accent/10">
                      <FormField
                        label="Ai-je animé le On-boarding Logiclever ?"
                        value={reportData.referentOnboardingAnimation || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentOnboardingAnimation: v }))}
                        placeholder="Précisez votre participation ou animation lors des sessions d'on-boarding..."
                      />
                    </div>
                  </div>

                  {/* 4. Avoir la responsabilité d’un compte (pré-rempli depuis vue Client) */}
                  <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-accent/10 pb-4">
                      <div>
                        <h4 className="text-lg font-bold text-secondary">Avoir la responsabilité d’un compte</h4>
                        <p className="text-xs text-accent/60 mt-1">
                          Comptes attribués au candidat pré-remplis automatiquement depuis la vue Client ({referentData.clients.length})
                        </p>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider bg-secondary/10 text-secondary px-2.5 py-1 rounded-md shrink-0">
                        Vue Client
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-accent/10 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-accent/5 border-b border-accent/10 text-[10px] font-black text-accent/50 uppercase tracking-wider">
                          <tr>
                            <th className="p-3.5">Nom Client</th>
                            <th className="p-3.5">Type Client</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-accent/5 font-light">
                          {referentData.loading ? (
                            <tr>
                              <td colSpan={2} className="p-6 text-center text-accent/40">
                                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-secondary" />
                                Chargement des comptes clients...
                              </td>
                            </tr>
                          ) : referentData.clients.length === 0 ? (
                            <tr>
                              <td colSpan={2} className="p-6 text-center text-accent/40 italic">
                                Aucun compte client actuellement attribué au candidat dans la base.
                              </td>
                            </tr>
                          ) : (
                            referentData.clients.map((item, idx) => (
                              <tr key={idx} className="hover:bg-accent/[0.02] transition-colors">
                                <td className="p-3.5 font-bold text-secondary">{item.nomClient || '-'}</td>
                                <td className="p-3.5">
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                                    {item.typeClient || 'Client'}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <FormField
                      label="Commentaire (Responsabilité de compte)"
                      value={reportData.referentAccountsComment || ''}
                      onChange={v => setReportData(prev => ({ ...prev, referentAccountsComment: v }))}
                      placeholder="Vos actions, développements et faits marquants sur vos comptes clients..."
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {section === 'AMELIORATION' && (
            <div className="space-y-8">
              <div className="p-6 bg-accent/[0.02] border border-accent/10 rounded-xl space-y-3">
                <p className="text-sm font-semibold text-accent/90 leading-relaxed">
                  Logiclever a mis en place un back-log d’EPIC. Il est important que chaque consultant soit partie prenante d’au moins une Squad pour :
                </p>
                <ul className="space-y-2 text-xs text-accent/80 font-medium">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Participer à l’amélioration de Logiclever sur un sujet qui l’intéresse</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Travailler/pratiquer la méthode SAFE utilisée pour notre amélioration continue</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span>Développer son leadership (ex : être responsable de Squad si l’on veut passer Expert)</span>
                  </li>
                </ul>
              </div>

              {squadEntries.map((entry, index) => (
                <div key={index} className="p-8 bg-primary/5 rounded-xl border border-primary/10 space-y-6">
                  <label className="block text-sm font-bold text-accent">
                    SQUAD
                    <input value={entry.squad} onChange={e => {
                      const value = e.target.value;
                      updateSquads(entries => entries.map((row, i) => i === index ? { ...row, squad: value } : row));
                    }} placeholder="EPIC 55..." className="mt-3 w-full bg-white px-6 py-4 rounded-xl border border-primary/10" />
                  </label>
                  <FormField label="Rôle tenu et apports principaux que vous avez apportés à la SQUAD" value={entry.contributions} onChange={value => updateSquads(entries => entries.map((row, i) => i === index ? { ...row, contributions: value } : row))} />
                  <button
                    type="button"
                    onClick={() => updateSquads(entries => entries.filter((_, i) => i !== index))}
                    title="Supprimer cette SQUAD"
                    className="text-red-500 hover:text-red-700 p-1 transition-colors cursor-pointer inline-flex items-center gap-1 text-xs"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => updateSquads(entries => [...entries, { squad: '', contributions: '' }])} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold">Ajouter une SQUAD</button>
            </div>
          )}
        </div>
      </Section>
    </motion.div>
  );
}
