import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, ExternalLink, AlertCircle, RefreshCw, Table as TableIcon, Loader2, Sparkles, Building, UserCheck } from 'lucide-react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport, UserProfile, Dossier } from '../../../types';
import { cn } from '../../../lib/utils';
import { GradeCriteriaTable } from '../GradeCriteriaTable';
import { AutonomieGuidelineTable } from '../AutonomieGuidelineTable';
import { ReferentDataService, ReferentDatasets } from '../../../services/referentDataService';

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
  readOnly?: boolean;
}

export function EngagementTab({
  section,
  reportData,
  setReportData,
  profile,
  dossier,
  campaignYear = new Date().getFullYear(),
  readOnly = false
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

  const [referentData, setReferentData] = useState<ReferentDatasets>(() => {
    // 1. Priorité aux données référent préchargées et stockées dans le dossier
    if (dossier?.referentData && !dossier.referentData.loading) {
      return dossier.referentData;
    }
    // 2. Vérification dans le stockage applicatif de la campagne
    const stored = ReferentDataService.getStoredCampaignCandidateData(candidatIdProfil, campaignYear);
    if (stored) return stored;

    // 3. Vérification dans le cache mémoire
    const cached = ReferentDataService.getCachedData(candidatIdProfil, candidatName, campaignYear);
    if (cached) return cached;

    return {
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
    // Synchroniser si le dossier reçoit ses données préchargées
    if (dossier?.referentData) {
      setReferentData(dossier.referentData);
      return;
    }

    // Dès l'accès au sous-onglet Référent, préparer les données en arrière-plan sans attendre que le candidat coche la case
    if (section === 'REFERENT_LOGICLEVER') {
      const stored = ReferentDataService.getStoredCampaignCandidateData(candidatIdProfil, campaignYear) ||
                     ReferentDataService.getCachedData(candidatIdProfil, candidatName, campaignYear);
      if (stored) {
        setReferentData(stored);
      } else if (!referentData.loading && !dossier?.referentData) {
        // Préchargement silencieux en arrière-plan pour anciens dossiers
        loadData(false);
      }
    }
  }, [
    section,
    dossier?.referentData,
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
            <div className="space-y-8">
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
            <div className="space-y-8">
              <FormField label="Capitalisation de connaissance et Amélioration continue (Drive)" value={reportData.lifeKnowledgeSharing} onChange={v => setReportData(prev => ({ ...prev, lifeKnowledgeSharing: v }))} />
              <FormField label="Partage d’information (SLACK)" value={reportData.lifeSlack} onChange={v => setReportData(prev => ({ ...prev, lifeSlack: v }))} />
              <FormField label="Créer du lien entre consultants / Esprit d’équipe (Pot, journée Logiclever, parrainage…)" value={reportData.lifeTeamSpirit} onChange={v => setReportData(prev => ({ ...prev, lifeTeamSpirit: v }))} />
              <div id="link_business_model" className="rounded-xl transition-all">
                <FormField 
                  label="Est-ce que je maîtrise le business model de Logiclever (Taux de facturation, marge sur mission…)" 
                  labelHref="https://docs.google.com/presentation/d/1xSJVxDGK5nmIUUa37jsfGXfXSaYETjqgsHD7o7e2S84/edit?slide=id.p3#slide=id.p3"
                  value={reportData.lifeBusinessModel} 
                  onChange={v => setReportData(prev => ({ ...prev, lifeBusinessModel: v }))} 
                />
              </div>
              <FormField label="Autres" value={reportData.lifeLogiclever} onChange={v => setReportData(prev => ({ ...prev, lifeLogiclever: v }))} />
            </div>
          )}

          {section === 'RECRUTEMENT' && (
            <div className="space-y-8">
              <FormField label="Promouvoir Logiclever : Avec qui ?, Comment ?" value={reportData.recruitmentPromotion} onChange={v => setReportData(prev => ({ ...prev, recruitmentPromotion: v }))} tooltip="Points sur votre implication dans la promotion de l'image de marque." />
              <FormField label="Réseaux sociaux : Avez vous ajouté des collègues sur LinkedIn ?, etc" value={reportData.recruitmentSocial} onChange={v => setReportData(prev => ({ ...prev, recruitmentSocial: v }))} />
            </div>
          )}

          {section === 'ENCADREMENT' && (
            <div className="space-y-8">
              <FormField label="Ai-je sollicité mon coach pour m’aider à grandir et avoir des conseils pour aider au développement de Logiclever ?" value={reportData.encadrementCoach} onChange={v => setReportData(prev => ({ ...prev, encadrementCoach: v }))} />
              <FormField label="Ai-je sollicité mon encadrant en mission à chaque fois que nécessaire ? (ex : alerte sur la qualité de mes livrables, j’ai du temps et je pourrai être utile…)" value={reportData.encadrementManager} onChange={v => setReportData(prev => ({ ...prev, encadrementManager: v }))} />
            </div>
          )}

          {section === 'REFERENT_LOGICLEVER' && (
            <div className="space-y-12">
              <div className="p-6 bg-accent/[0.02] border border-accent/10 rounded-xl space-y-4">
                <h3 className="text-base font-bold text-secondary">
                  Tâches réalisées par les référents Logiclever ou ceux voulant le devenir :
                </h3>

                <div id="link_guide_expert" className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5 text-xs text-amber-950 font-medium transition-all">
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

              <div id="link_ref_pieces_jointes" className="space-y-12">
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
                  <div id="link_ref_meteo" className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-6 transition-all">
                    <div className="border-b border-accent/10 pb-4">
                      <h4 className="text-lg font-bold text-secondary">Liste des météos effectuées</h4>
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
                      label="Commentaire"
                      value={reportData.referentMeteosComment || ''}
                      onChange={v => setReportData(prev => ({ ...prev, referentMeteosComment: v }))}
                      disabled={readOnly}
                    />
                  </div>

                  {/* 2. Disposer d’un réseau de donneurs d’ordre dont proposer des offres */}
                  <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-8">
                    <div className="border-b border-accent/10 pb-4">
                      <h4 className="text-lg font-bold text-secondary">
                        Disposer d’un réseau de donneurs d’ordre dont proposer des offres
                      </h4>
                    </div>

                    {/* Tableau Vue_Action */}
                    <div id="link_ref_actions" className="space-y-4 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-accent/70 flex items-center gap-1.5">
                          <TableIcon className="w-3.5 h-3.5 text-primary" />
                          Actions réalisées par le candidat ({referentData.actions.length})
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
                        label="Commentaire"
                        value={reportData.referentActionsComment || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentActionsComment: v }))}
                        disabled={readOnly}
                      />
                    </div>

                    {/* Tableau Vue_Mission */}
                    <div id="link_ref_missions" className="space-y-4 pt-6 border-t border-accent/10 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-accent/70 flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-primary" />
                          Missions publiées dans l'app LL ({referentData.missions.length})
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
                        label="Commentaire"
                        value={reportData.referentMissionsComment || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentMissionsComment: v }))}
                        disabled={readOnly}
                      />
                    </div>
                  </div>

                  {/* 3. Accompagnement (anciennement Encadrement) */}
                  <div id="link_ref_accompagnement" className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-8 transition-all">
                    <div className="border-b border-accent/10 pb-4">
                      <h4 className="text-lg font-bold text-secondary">Accompagnement</h4>
                    </div>

                    {/* Coaching LL */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-accent/70 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-primary" />
                          Coaching ({referentData.coaching.length})
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
                        label="Commentaire"
                        value={reportData.referentCoachingComment || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentCoachingComment: v }))}
                        disabled={readOnly}
                      />
                    </div>

                    {/* Encadrement mission */}
                    <div className="space-y-4 pt-6 border-t border-accent/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-accent/70 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-primary" />
                          Encadrement en mission ({referentData.encadrement.length})
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
                        label="Commentaire"
                        value={reportData.referentEncadrementComment || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentEncadrementComment: v }))}
                        disabled={readOnly}
                      />
                    </div>

                    {/* Parrain */}
                    <div className="space-y-4 pt-6 border-t border-accent/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-accent/70 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-primary" />
                          Parrainage ({referentData.parrain.length})
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
                        label="Commentaire"
                        value={reportData.referentParrainComment || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentParrainComment: v }))}
                        disabled={readOnly}
                      />
                    </div>

                    {/* Champ On-boarding conservé */}
                    <div className="pt-6 border-t border-accent/10">
                      <FormField
                        label="Ai-je animé le On-boarding Logiclever ?"
                        value={reportData.referentOnboardingAnimation || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentOnboardingAnimation: v }))}
                        disabled={readOnly}
                      />
                    </div>
                  </div>

                  {/* 4. Avoir la responsabilité d’un compte (pré-rempli depuis vue Client) */}
                  <div id="link_ref_client" className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-6 transition-all">
                    <div className="border-b border-accent/10 pb-4">
                      <h4 className="text-lg font-bold text-secondary">Avoir la responsabilité d’un compte</h4>
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
                      label="Commentaire"
                      value={reportData.referentAccountsComment || ''}
                      onChange={v => setReportData(prev => ({ ...prev, referentAccountsComment: v }))}
                      disabled={readOnly}
                    />
                  </div>
                </div>
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
