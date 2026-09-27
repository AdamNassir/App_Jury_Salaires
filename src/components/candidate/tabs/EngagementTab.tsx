import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Plus, Trash2, ExternalLink, AlertCircle } from 'lucide-react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport } from '../../../types';
import { cn } from '../../../lib/utils';
import { GradeCriteriaTable } from '../GradeCriteriaTable';
import { AutonomieGuidelineTable } from '../AutonomieGuidelineTable';

export const engagementSections = [
  { id: 'AUTONOMIE', label: 'Autonomie en mission' },
  { id: 'COMMERCIAL', label: 'Vente/commercial' },
  { id: 'VIE_LOGICLEVER', label: 'Vie LogicLever' },
  { id: 'RECRUTEMENT', label: 'Recrutement' },
  { id: 'ENCADREMENT', label: 'Encadrement' },
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
}

export function EngagementTab({
  section,
  reportData,
  setReportData
}: EngagementTabProps) {
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
                            <textarea aria-label={`Actions du client ${index + 1}`} value={row.actions} onChange={e => updateRow('actions', e.target.value)} className="w-full min-w-56 min-h-32 p-3 rounded-lg border border-accent/10" />
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
                            <button type="button" aria-label={`Supprimer le client ${index + 1}`} onClick={() => setReportData(prev => ({ ...prev, missionClients: (prev.missionClients ?? []).filter((_, i) => i !== index) }))} className="text-red-600 p-2">Supprimer</button>
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
              <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10">Vie Logiclever</h4>

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
              <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10">Recrutement & Promotion</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <FormField label="Promouvoir Logiclever : Avec qui ?, Comment ?" value={reportData.recruitmentPromotion} onChange={v => setReportData(prev => ({ ...prev, recruitmentPromotion: v }))} tooltip="Points sur votre implication dans la promotion de l'image de marque." />
                <FormField label="Recrutement : Avez vous interviewé des candidats ?" value={reportData.recruitmentInterviews} onChange={v => setReportData(prev => ({ ...prev, recruitmentInterviews: v }))} />
                <FormField label="Réseaux sociaux : Avez vous ajouté des collègues sur LinkedIn ?, etc" value={reportData.recruitmentSocial} onChange={v => setReportData(prev => ({ ...prev, recruitmentSocial: v }))} />
              </div>
            </div>
          )}

          {section === 'ENCADREMENT' && (
            <div>
              <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10">Encadrement & Coaching</h4>
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
                  {/* 1. Suivre les missions */}
                  <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-6">
                    <div>
                      <h4 className="text-lg font-bold text-secondary">Suivre les missions</h4>
                    </div>

                    <div className="space-y-6">
                      {missionFollowUps.length === 0 && (
                        <p className="text-xs text-accent/40 italic py-2">Aucun suivi enregistré.</p>
                      )}
                      {missionFollowUps.map((item, index) => (
                        <div key={index} className="p-6 bg-white rounded-xl border border-accent/10 space-y-4 shadow-sm relative">
                          <div className="flex items-center justify-between border-b border-accent/10 pb-3">
                            <span className="text-[10px] font-black text-accent/40 uppercase tracking-widest">
                              Mission / Client #{index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateMissionFollowUps(entries => entries.filter((_, i) => i !== index))}
                              className="text-red-500 hover:text-red-700 flex items-center gap-1 text-xs font-bold cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Supprimer
                            </button>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Clients</label>
                            <input
                              type="text"
                              value={item.client}
                              onChange={e => {
                                const val = e.target.value;
                                updateMissionFollowUps(entries => entries.map((r, i) => i === index ? { ...r, client: val } : r));
                              }}
                              className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Quelles météos avez-vous menées ?</label>
                              <textarea
                                value={item.meteosMenees}
                                onChange={e => {
                                  const val = e.target.value;
                                  updateMissionFollowUps(entries => entries.map((r, i) => i === index ? { ...r, meteosMenees: val } : r));
                                }}
                                className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm min-h-[90px] resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Quels sont les principaux points remontés lors des météos ?</label>
                              <textarea
                                value={item.pointsRemontes}
                                onChange={e => {
                                  const val = e.target.value;
                                  updateMissionFollowUps(entries => entries.map((r, i) => i === index ? { ...r, pointsRemontes: val } : r));
                                }}
                                className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm min-h-[90px] resize-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => updateMissionFollowUps(entries => [...entries, { client: '', meteosMenees: '', pointsRemontes: '' }])}
                        className="px-4 py-2.5 rounded-lg bg-accent text-white font-semibold text-xs flex items-center gap-2 hover:bg-accent/90 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Ajouter un suivi
                      </button>
                    </div>
                  </div>

                  {/* 2. Disposer d’un réseau de donneur d’ordre */}
                  <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-6">
                    <div>
                      <h4 className="text-lg font-bold text-secondary">Disposer d’un réseau de donneur d’ordre</h4>
                    </div>

                    <div className="space-y-6">
                      {networkEntries.length === 0 && (
                        <p className="text-xs text-accent/40 italic py-2">Aucun contact enregistré.</p>
                      )}
                      {networkEntries.map((item, index) => (
                        <div key={index} className="p-6 bg-white rounded-xl border border-accent/10 space-y-4 shadow-sm">
                          <div className="flex items-center justify-between border-b border-accent/10 pb-3">
                            <span className="text-[10px] font-black text-accent/40 uppercase tracking-widest">
                              Contact #{index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateNetworkEntries(entries => entries.filter((_, i) => i !== index))}
                              className="text-red-500 hover:text-red-700 flex items-center gap-1 text-xs font-bold cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Supprimer
                            </button>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Clients / Prospects</label>
                            <input
                              type="text"
                              value={item.clientProspect}
                              onChange={e => {
                                const val = e.target.value;
                                updateNetworkEntries(entries => entries.map((r, i) => i === index ? { ...r, clientProspect: val } : r));
                              }}
                              className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Principales actions effectuées pour créer/entretenir les liens avec les donneurs d’ordre</label>
                            <textarea
                              value={item.actions}
                              onChange={e => {
                                const val = e.target.value;
                                updateNetworkEntries(entries => entries.map((r, i) => i === index ? { ...r, actions: val } : r));
                              }}
                              className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm min-h-[90px] resize-none"
                            />
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => updateNetworkEntries(entries => [...entries, { clientProspect: '', actions: '' }])}
                        className="px-4 py-2.5 rounded-lg bg-accent text-white font-semibold text-xs flex items-center gap-2 hover:bg-accent/90 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Ajouter un client / prospect
                      </button>
                    </div>
                  </div>

                  {/* 3. Encadrement */}
                  <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-8">
                    <div>
                      <h4 className="text-lg font-bold text-secondary">Encadrement</h4>
                      <p className="text-xs text-accent/70 font-medium mt-1">
                        Un bon encadrant fait progresser. Avez-vous réussi à faire grandir les consultants Logiclever ?
                      </p>
                    </div>

                    {/* En mission */}
                    <div className="space-y-4">
                      <h5 className="text-xs font-black text-accent/60 uppercase tracking-widest">En mission</h5>
                      <div className="space-y-4">
                        {missionEncadrements.length === 0 && (
                          <p className="text-xs text-accent/40 italic py-2">Aucun encadrement enregistré.</p>
                        )}
                        {missionEncadrements.map((item, index) => (
                          <div key={index} className="p-6 bg-white rounded-xl border border-accent/10 space-y-4 shadow-sm">
                            <div className="flex items-center justify-between border-b border-accent/10 pb-3">
                              <span className="text-[10px] font-black text-accent/40 uppercase tracking-widest">
                                Encadrement mission #{index + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateMissionEncadrements(entries => entries.filter((_, i) => i !== index))}
                                className="text-red-500 hover:text-red-700 flex items-center gap-1 text-xs font-bold cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Supprimer
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Client</label>
                                <input
                                  type="text"
                                  value={item.client}
                                  onChange={e => {
                                    const val = e.target.value;
                                    updateMissionEncadrements(entries => entries.map((r, i) => i === index ? { ...r, client: val } : r));
                                  }}
                                  className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Personne encadrée</label>
                                <input
                                  type="text"
                                  value={item.personneEncadree}
                                  onChange={e => {
                                    const val = e.target.value;
                                    updateMissionEncadrements(entries => entries.map((r, i) => i === index ? { ...r, personneEncadree: val } : r));
                                  }}
                                  className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Commentaire/Contexte</label>
                              <textarea
                                value={item.commentaire}
                                onChange={e => {
                                  const val = e.target.value;
                                  updateMissionEncadrements(entries => entries.map((r, i) => i === index ? { ...r, commentaire: val } : r));
                                }}
                                className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm min-h-[80px] resize-none"
                              />
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => updateMissionEncadrements(entries => [...entries, { client: '', personneEncadree: '', commentaire: '' }])}
                          className="px-4 py-2.5 rounded-lg bg-accent text-white font-semibold text-xs flex items-center gap-2 hover:bg-accent/90 transition-all cursor-pointer"
                        >
                          <Plus className="w-4 h-4" /> Ajouter un encadrement en mission
                        </button>
                      </div>
                    </div>

                    {/* Coaching */}
                    <div className="space-y-4 pt-4 border-t border-accent/10">
                      <h5 className="text-xs font-black text-accent/60 uppercase tracking-widest">Coaching</h5>
                      <div className="space-y-4">
                        {coachingEntries.length === 0 && (
                          <p className="text-xs text-accent/40 italic py-2">Aucun coaching enregistré.</p>
                        )}
                        {coachingEntries.map((item, index) => (
                          <div key={index} className="p-6 bg-white rounded-xl border border-accent/10 space-y-4 shadow-sm">
                            <div className="flex items-center justify-between border-b border-accent/10 pb-3">
                              <span className="text-[10px] font-black text-accent/40 uppercase tracking-widest">
                                Coaching #{index + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateCoachingEntries(entries => entries.filter((_, i) => i !== index))}
                                className="text-red-500 hover:text-red-700 flex items-center gap-1 text-xs font-bold cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Supprimer
                              </button>
                            </div>
                            <div>
                              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Personne coachée</label>
                              <input
                                type="text"
                                value={item.personneCoachee}
                                onChange={e => {
                                  const val = e.target.value;
                                  updateCoachingEntries(entries => entries.map((r, i) => i === index ? { ...r, personneCoachee: val } : r));
                                }}
                                className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Commentaire/Contexte</label>
                              <textarea
                                value={item.commentaire}
                                onChange={e => {
                                  const val = e.target.value;
                                  updateCoachingEntries(entries => entries.map((r, i) => i === index ? { ...r, commentaire: val } : r));
                                }}
                                className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm min-h-[80px] resize-none"
                              />
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => updateCoachingEntries(entries => [...entries, { personneCoachee: '', commentaire: '' }])}
                          className="px-4 py-2.5 rounded-lg bg-accent text-white font-semibold text-xs flex items-center gap-2 hover:bg-accent/90 transition-all cursor-pointer"
                        >
                          <Plus className="w-4 h-4" /> Ajouter un coaching
                        </button>
                      </div>
                    </div>

                    {/* On-boarding */}
                    <div className="pt-4 border-t border-accent/10">
                      <FormField
                        label="Ai-je animé le On-boarding Logiclever ?"
                        value={reportData.referentOnboardingAnimation || ''}
                        onChange={v => setReportData(prev => ({ ...prev, referentOnboardingAnimation: v }))}
                      />
                    </div>
                  </div>

                  {/* 4. Avoir la responsabilité d’un compte */}
                  <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-6">
                    <div>
                      <h4 className="text-lg font-bold text-secondary">Avoir la responsabilité d’un compte</h4>
                    </div>

                    <div className="space-y-6">
                      {accountEntries.length === 0 && (
                        <p className="text-xs text-accent/40 italic py-2">Aucun compte enregistré.</p>
                      )}
                      {accountEntries.map((item, index) => (
                        <div key={index} className="p-6 bg-white rounded-xl border border-accent/10 space-y-4 shadow-sm">
                          <div className="flex items-center justify-between border-b border-accent/10 pb-3">
                            <span className="text-[10px] font-black text-accent/40 uppercase tracking-widest">
                              Compte #{index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateAccountEntries(entries => entries.filter((_, i) => i !== index))}
                              className="text-red-500 hover:text-red-700 flex items-center gap-1 text-xs font-bold cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Supprimer
                            </button>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Compte</label>
                            <input
                              type="text"
                              value={item.compte}
                              onChange={e => {
                                const val = e.target.value;
                                updateAccountEntries(entries => entries.map((r, i) => i === index ? { ...r, compte: val } : r));
                              }}
                              className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Principales actions effectuées</label>
                            <textarea
                              value={item.actions}
                              onChange={e => {
                                const val = e.target.value;
                                updateAccountEntries(entries => entries.map((r, i) => i === index ? { ...r, actions: val } : r));
                              }}
                              className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm min-h-[90px] resize-none"
                            />
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => updateAccountEntries(entries => [...entries, { compte: '', actions: '' }])}
                        className="px-4 py-2.5 rounded-lg bg-accent text-white font-semibold text-xs flex items-center gap-2 hover:bg-accent/90 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Ajouter un compte
                      </button>
                    </div>

                  </div>

                  {/* 5. Développer de nouveaux clients (nouvelles offres…) */}
                  <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-6">
                    <div>
                      <h4 className="text-lg font-bold text-secondary">Développer de nouveaux clients (nouvelles offres…)</h4>
                    </div>

                    <div className="space-y-6">
                      {offersEntries.length === 0 && (
                        <p className="text-xs text-accent/40 italic py-2">Aucune offre enregistrée.</p>
                      )}
                      {offersEntries.map((item, index) => (
                        <div key={index} className="p-6 bg-white rounded-xl border border-accent/10 space-y-4 shadow-sm">
                          <div className="flex items-center justify-between border-b border-accent/10 pb-3">
                            <span className="text-[10px] font-black text-accent/40 uppercase tracking-widest">
                              Offre #{index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateOffersEntries(entries => entries.filter((_, i) => i !== index))}
                              className="text-red-500 hover:text-red-700 flex items-center gap-1 text-xs font-bold cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Supprimer
                            </button>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Offres</label>
                            <input
                              type="text"
                              value={item.offre}
                              onChange={e => {
                                const val = e.target.value;
                                updateOffersEntries(entries => entries.map((r, i) => i === index ? { ...r, offre: val } : r));
                              }}
                              className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-2">Quelles offres avez vous développées pour Logiclever</label>
                            <textarea
                              value={item.details}
                              onChange={e => {
                                const val = e.target.value;
                                updateOffersEntries(entries => entries.map((r, i) => i === index ? { ...r, details: val } : r));
                              }}
                              className="w-full p-4 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-sm min-h-[90px] resize-none"
                            />
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => updateOffersEntries(entries => [...entries, { offre: '', details: '' }])}
                        className="px-4 py-2.5 rounded-lg bg-accent text-white font-semibold text-xs flex items-center gap-2 hover:bg-accent/90 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Ajouter une offre
                      </button>
                    </div>
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
                  <button type="button" onClick={() => updateSquads(entries => entries.filter((_, i) => i !== index))} className="text-red-600">Supprimer cette SQUAD</button>
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
