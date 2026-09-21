import React from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport, MissionAutonomyEntry, SquadEntry, ReferentMeteoFollowUp, ReferentDonorNetwork, ReferentEncadrement } from '../../../types';
import { cn } from '../../../lib/utils';

interface EngagementTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  isReferent?: boolean;
}

export function EngagementTab({
  reportData,
  setReportData,
  isReferent = false
}: EngagementTabProps) {
  // --- Mission Autonomy List ---
  const missions: MissionAutonomyEntry[] = 
    reportData.missionAutonomies && reportData.missionAutonomies.length > 0
      ? reportData.missionAutonomies
      : [{ id: '1', client: '', actions: '', grade: '', comment: '' }];

  const updateMission = (index: number, patch: Partial<MissionAutonomyEntry>) => {
    const updated = [...missions];
    updated[index] = { ...updated[index], ...patch };
    setReportData(prev => ({ ...prev, missionAutonomies: updated }));
  };

  const addMission = () => {
    const updated = [...missions, { id: Date.now().toString(), client: '', actions: '', grade: '', comment: '' }];
    setReportData(prev => ({ ...prev, missionAutonomies: updated }));
  };

  const removeMission = (index: number) => {
    if (missions.length <= 1) {
      setReportData(prev => ({ ...prev, missionAutonomies: [{ id: Date.now().toString(), client: '', actions: '', grade: '', comment: '' }] }));
      return;
    }
    const updated = missions.filter((_, i) => i !== index);
    setReportData(prev => ({ ...prev, missionAutonomies: updated }));
  };

  // --- Squad Entries List ---
  const squads: SquadEntry[] = 
    reportData.squadEntries && reportData.squadEntries.length > 0
      ? reportData.squadEntries
      : [{ id: '1', squad: '', roleAndContributions: '' }];

  const updateSquad = (index: number, patch: Partial<SquadEntry>) => {
    const updated = [...squads];
    updated[index] = { ...updated[index], ...patch };
    setReportData(prev => ({ ...prev, squadEntries: updated }));
  };

  const addSquad = () => {
    const updated = [...squads, { id: Date.now().toString(), squad: '', roleAndContributions: '' }];
    setReportData(prev => ({ ...prev, squadEntries: updated }));
  };

  const removeSquad = (index: number) => {
    if (squads.length <= 1) {
      setReportData(prev => ({ ...prev, squadEntries: [{ id: Date.now().toString(), squad: '', roleAndContributions: '' }] }));
      return;
    }
    const updated = squads.filter((_, i) => i !== index);
    setReportData(prev => ({ ...prev, squadEntries: updated }));
  };

  // --- Referent: Suivre les missions ---
  const referentMeteos: ReferentMeteoFollowUp[] =
    reportData.referentMeteos && reportData.referentMeteos.length > 0
      ? reportData.referentMeteos
      : [{ id: '1', clients: '', meteosConducted: '', keyPointsRaised: '' }];

  const updateReferentMeteo = (index: number, patch: Partial<ReferentMeteoFollowUp>) => {
    const updated = [...referentMeteos];
    updated[index] = { ...updated[index], ...patch };
    setReportData(prev => ({ ...prev, referentMeteos: updated }));
  };

  const addReferentMeteo = () => {
    const updated = [...referentMeteos, { id: Date.now().toString(), clients: '', meteosConducted: '', keyPointsRaised: '' }];
    setReportData(prev => ({ ...prev, referentMeteos: updated }));
  };

  const removeReferentMeteo = (index: number) => {
    if (referentMeteos.length <= 1) {
      setReportData(prev => ({ ...prev, referentMeteos: [{ id: Date.now().toString(), clients: '', meteosConducted: '', keyPointsRaised: '' }] }));
      return;
    }
    const updated = referentMeteos.filter((_, i) => i !== index);
    setReportData(prev => ({ ...prev, referentMeteos: updated }));
  };

  // --- Referent: Réseau de donneur d'ordre ---
  const referentNetworks: ReferentDonorNetwork[] =
    reportData.referentNetworks && reportData.referentNetworks.length > 0
      ? reportData.referentNetworks
      : [{ id: '1', clientsProspects: '', keyActions: '' }];

  const updateReferentNetwork = (index: number, patch: Partial<ReferentDonorNetwork>) => {
    const updated = [...referentNetworks];
    updated[index] = { ...updated[index], ...patch };
    setReportData(prev => ({ ...prev, referentNetworks: updated }));
  };

  const addReferentNetwork = () => {
    const updated = [...referentNetworks, { id: Date.now().toString(), clientsProspects: '', keyActions: '' }];
    setReportData(prev => ({ ...prev, referentNetworks: updated }));
  };

  const removeReferentNetwork = (index: number) => {
    if (referentNetworks.length <= 1) {
      setReportData(prev => ({ ...prev, referentNetworks: [{ id: Date.now().toString(), clientsProspects: '', keyActions: '' }] }));
      return;
    }
    const updated = referentNetworks.filter((_, i) => i !== index);
    setReportData(prev => ({ ...prev, referentNetworks: updated }));
  };

  // --- Referent: Encadrement ---
  const referentEncadrements: ReferentEncadrement[] =
    reportData.referentEncadrements && reportData.referentEncadrements.length > 0
      ? reportData.referentEncadrements
      : [{ id: '1', client: '', coachedPerson: '', commentContext: '' }];

  const updateReferentEncadrement = (index: number, patch: Partial<ReferentEncadrement>) => {
    const updated = [...referentEncadrements];
    updated[index] = { ...updated[index], ...patch };
    setReportData(prev => ({ ...prev, referentEncadrements: updated }));
  };

  const addReferentEncadrement = () => {
    const updated = [...referentEncadrements, { id: Date.now().toString(), client: '', coachedPerson: '', commentContext: '' }];
    setReportData(prev => ({ ...prev, referentEncadrements: updated }));
  };

  const removeReferentEncadrement = (index: number) => {
    if (referentEncadrements.length <= 1) {
      setReportData(prev => ({ ...prev, referentEncadrements: [{ id: Date.now().toString(), client: '', coachedPerson: '', commentContext: '' }] }));
      return;
    }
    const updated = referentEncadrements.filter((_, i) => i !== index);
    setReportData(prev => ({ ...prev, referentEncadrements: updated }));
  };

  const showReferentSection = isReferent || reportData.isReferentOrAspiring;

  return (
    <motion.div key="eng" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
      <Section title="Engagement & Autonomie">
        <div className="space-y-12">
          
          {/* 1. Autonomie en mission */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-secondary tracking-tight">Autonomie en mission</h3>
              <button
                type="button"
                onClick={addMission}
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter une mission</span>
              </button>
            </div>
            
            <div className="space-y-6">
              {missions.map((entry, idx) => (
                <div key={entry.id || idx} className="p-6 bg-accent/5 rounded-xl border border-accent/10 relative space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-accent/10">
                    <span className="text-[11px] font-black uppercase tracking-wider text-secondary">Mission #{idx + 1}</span>
                    {missions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMission(idx)}
                        className="text-accent/30 hover:text-red-500 transition-colors p-1"
                        title="Supprimer cette mission"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                        Client
                      </label>
                      <input
                        type="text"
                        value={entry.client}
                        onChange={e => updateMission(idx, { client: e.target.value })}
                        placeholder="Nom du client..."
                        className="w-full px-4 py-3 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                        Grade
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {(['Junior', 'Confirmé', 'Senior', 'Expert'] as const).map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => updateMission(idx, { grade: g })}
                            className={cn(
                              "py-2.5 px-2 rounded-lg text-xs font-bold transition-all border text-center",
                              entry.grade === g
                                ? "bg-secondary text-white border-secondary shadow-sm"
                                : "bg-white text-accent/60 border-accent/10 hover:border-accent/30"
                            )}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                      Actions dans le cadre de la mission (en qq mots)
                    </label>
                    <textarea
                      value={entry.actions}
                      onChange={e => updateMission(idx, { actions: e.target.value })}
                      placeholder="Décrivez brièvement les actions réalisées dans le cadre de la mission..."
                      rows={2}
                      className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                      Commentaire
                    </label>
                    <textarea
                      value={entry.comment}
                      onChange={e => updateMission(idx, { comment: e.target.value })}
                      placeholder="Commentaire sur votre niveau d'autonomie ou le contexte..."
                      rows={2}
                      className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Vente / Commercial */}
          <div className="pt-8 border-t border-accent/10">
            <h3 className="text-xl font-bold text-secondary tracking-tight mb-6">Vente / Commercial</h3>
            <div className="space-y-6">
              <FormField
                label="Avez-vous pu présenter Logiclever (Qui on est ?, nos offres ?, Nos valeurs ?)"
                value={reportData.commercialPresentation}
                onChange={v => setReportData(prev => ({ ...prev, commercialPresentation: v }))}
                placeholder="Détaillez vos échanges et présentations de Logiclever..."
              />
              <FormField
                label="Quels conseils avez-vous donnés à vos clients ?"
                value={reportData.commercialAdvice}
                onChange={v => setReportData(prev => ({ ...prev, commercialAdvice: v }))}
                placeholder="Conseils méthodologiques, organisationnels, techniques..."
              />
              <FormField
                label="Avez-vous été force de proposition ? Exemple de valeur ajoutée que vous avez apporté à vos clients"
                value={reportData.commercialProposition}
                onChange={v => setReportData(prev => ({ ...prev, commercialProposition: v }))}
                placeholder="Illustrez la valeur ajoutée concrètement apportée..."
              />
              <FormField
                label="Quelles propositions commerciales avez-vous faites ?"
                value={reportData.commercialOffers}
                onChange={v => setReportData(prev => ({ ...prev, commercialOffers: v }))}
                placeholder="Appels d'offres, extensions de périmètre, opportunités identifiées..."
              />
            </div>
          </div>

          {/* 3. Vie Logiclever */}
          <div className="pt-8 border-t border-accent/10">
            <h3 className="text-xl font-bold text-secondary tracking-tight mb-6">Vie Logiclever</h3>
            <div className="space-y-6">
              <FormField
                label="Capitalisation de connaissance et Amélioration continue (Drive)"
                value={reportData.lifeKnowledgeSharing}
                onChange={v => setReportData(prev => ({ ...prev, lifeKnowledgeSharing: v }))}
                placeholder="Documents partagés, REX rédigés sur le Drive..."
              />
              <FormField
                label="Partage d’information (SLACK)"
                value={reportData.lifeSlack}
                onChange={v => setReportData(prev => ({ ...prev, lifeSlack: v }))}
                placeholder="Participation aux canaux Slack, veille partagée..."
              />
              <FormField
                label="Créer du lien entre consultants / Esprit d’équipe (Pot, journée Logiclever, parrainage…)"
                value={reportData.lifeTeamSpirit}
                onChange={v => setReportData(prev => ({ ...prev, lifeTeamSpirit: v }))}
                placeholder="Événements internes, accueil de nouveaux collègues, parrainage..."
              />
              <FormField
                label="Est-ce que je maîtrise le business model de Logiclever (Taux de facturation, marge sur mission…)"
                value={reportData.lifeBusinessModel}
                onChange={v => setReportData(prev => ({ ...prev, lifeBusinessModel: v }))}
                placeholder="Votre compréhension des indicateurs économiques..."
              />
              <FormField
                label="Autres"
                value={reportData.lifeOther || ''}
                onChange={v => setReportData(prev => ({ ...prev, lifeOther: v }))}
                placeholder="Autres contributions à la vie d'entreprise..."
              />
            </div>
          </div>

          {/* 4. Recrutement */}
          <div className="pt-8 border-t border-accent/10">
            <h3 className="text-xl font-bold text-secondary tracking-tight mb-6">Recrutement</h3>
            <div className="space-y-6">
              <FormField
                label="Promouvoir Logiclever : Avec qui ?, Comment ?"
                value={reportData.recruitmentPromotion}
                onChange={v => setReportData(prev => ({ ...prev, recruitmentPromotion: v }))}
                placeholder="Recommandations, réseau professionnel, écoles..."
              />
              <FormField
                label="Recrutement : Avez vous interviewé des candidats ?"
                value={reportData.recruitmentInterviews}
                onChange={v => setReportData(prev => ({ ...prev, recruitmentInterviews: v }))}
                placeholder="Entretiens techniques ou de cooptation réalisés..."
              />
              <FormField
                label="Réseaux sociaux : Avez vous ajouté des collègues sur LinkedIn ?, etc"
                value={reportData.recruitmentSocial}
                onChange={v => setReportData(prev => ({ ...prev, recruitmentSocial: v }))}
                placeholder="Actions sur les réseaux sociaux..."
              />
            </div>
          </div>

          {/* 5. Encadrement */}
          <div className="pt-8 border-t border-accent/10">
            <h3 className="text-xl font-bold text-secondary tracking-tight mb-6">Encadrement</h3>
            <div className="space-y-6">
              <FormField
                label="Ai-je sollicité mon coach pour m’aider à grandir et avoir des conseils pour aider au développement de Logiclever ?"
                value={reportData.encadrementCoach}
                onChange={v => setReportData(prev => ({ ...prev, encadrementCoach: v }))}
                placeholder="Échanges avec votre coach, axes de progression partagés..."
              />
              <FormField
                label="Ai-je sollicité mon encadrant en mission à chaque fois que nécessaire ? (ex : alerte sur la qualité de mes livrables, j’ai du temps et je pourrai être utile…)"
                value={reportData.encadrementManager}
                onChange={v => setReportData(prev => ({ ...prev, encadrementManager: v }))}
                placeholder="Communication et alertes avec votre encadrant en mission..."
              />
            </div>
          </div>

          {/* 6. Amélioration continue */}
          <div className="pt-8 border-t border-accent/10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-secondary tracking-tight">Amélioration continue</h3>
              <button
                type="button"
                onClick={addSquad}
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter une SQUAD</span>
              </button>
            </div>

            <div className="space-y-6">
              {squads.map((entry, idx) => (
                <div key={entry.id || idx} className="p-6 bg-accent/5 rounded-xl border border-accent/10 relative space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-accent/10">
                    <span className="text-[11px] font-black uppercase tracking-wider text-secondary">Entrée #{idx + 1}</span>
                    {squads.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSquad(idx)}
                        className="text-accent/30 hover:text-red-500 transition-colors p-1"
                        title="Supprimer cette SQUAD"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                      SQUAD
                    </label>
                    <input
                      type="text"
                      value={entry.squad}
                      onChange={e => updateSquad(idx, { squad: e.target.value })}
                      placeholder="Nom de la SQUAD..."
                      className="w-full px-4 py-3 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                      Rôle tenu et apports principaux que vous avez apportés à la SQUAD
                    </label>
                    <textarea
                      value={entry.roleAndContributions}
                      onChange={e => updateSquad(idx, { roleAndContributions: e.target.value })}
                      placeholder="Détaillez votre rôle et vos apports principaux..."
                      rows={3}
                      className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Toggle explicite pour statut Référent si non défini dans le profil */}
          <div className="pt-8 border-t border-accent/10">
            <button
              type="button"
              onClick={() => setReportData(prev => ({ ...prev, isReferentOrAspiring: !prev.isReferentOrAspiring }))}
              className={cn(
                "w-full p-5 rounded-xl border transition-all flex items-center justify-between text-left",
                showReferentSection 
                  ? "bg-secondary/5 border-secondary/30 text-secondary" 
                  : "bg-white border-accent/10 hover:border-accent/30 text-accent/60"
              )}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className={cn("w-5 h-5", showReferentSection ? "text-secondary" : "text-accent/30")} />
                <div>
                  <div className="text-sm font-bold">Je suis Référent Logiclever</div>
                  <div className="text-xs opacity-60">Activer les sections spécifiques d'évaluation pour les Référents</div>
                </div>
              </div>
              <div className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                showReferentSection ? "bg-secondary border-secondary text-white" : "border-accent/20 text-transparent"
              )}>
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </button>
          </div>

        </div>
      </Section>

      {/* ==================================================
          SI REFERENT LOGICLEVER
          Section dédiée, strictement séparée des sections normales
          ================================================== */}
      {showReferentSection && (
        <div className="p-8 bg-white rounded-xl border-2 border-secondary/20 shadow-sm space-y-10">
          <div className="pb-6 border-b border-secondary/15">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-secondary/10 text-secondary rounded-md text-xs font-black uppercase tracking-wider mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>SI REFERENT LOGICLEVER</span>
            </div>
            <h2 className="text-2xl font-bold text-secondary tracking-tight">Volet spécifique Référent</h2>
            <p className="text-sm text-accent/60 mt-1">Section réservée exclusivement aux Référents Logiclever.</p>
          </div>

          {/* 1. Suivre les missions */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-secondary tracking-tight">Suivre les missions</h3>
              <button
                type="button"
                onClick={addReferentMeteo}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-secondary/10 hover:bg-secondary/20 text-secondary text-xs font-bold rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter un suivi</span>
              </button>
            </div>

            <div className="space-y-5">
              {referentMeteos.map((entry, idx) => (
                <div key={entry.id || idx} className="p-6 bg-accent/5 rounded-xl border border-accent/10 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-accent/10">
                    <span className="text-[11px] font-black uppercase tracking-wider text-secondary">Suivi #{idx + 1}</span>
                    {referentMeteos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeReferentMeteo(idx)}
                        className="text-accent/30 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                      Clients
                    </label>
                    <input
                      type="text"
                      value={entry.clients}
                      onChange={e => updateReferentMeteo(idx, { clients: e.target.value })}
                      placeholder="Nom des clients..."
                      className="w-full px-4 py-3 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                      Quelles météos avez-vous menées ?
                    </label>
                    <textarea
                      value={entry.meteosConducted}
                      onChange={e => updateReferentMeteo(idx, { meteosConducted: e.target.value })}
                      placeholder="Météos réalisées..."
                      rows={2}
                      className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                      Quels sont les principaux points remontés lors des météos ?
                    </label>
                    <textarea
                      value={entry.keyPointsRaised}
                      onChange={e => updateReferentMeteo(idx, { keyPointsRaised: e.target.value })}
                      placeholder="Points d'attention, satisfactions, axes d'amélioration..."
                      rows={3}
                      className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Disposer d’un réseau de donneur d’ordre */}
          <div className="pt-6 border-t border-accent/10 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-secondary tracking-tight">Disposer d’un réseau de donneur d’ordre</h3>
              <button
                type="button"
                onClick={addReferentNetwork}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-secondary/10 hover:bg-secondary/20 text-secondary text-xs font-bold rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter une action réseau</span>
              </button>
            </div>

            <div className="space-y-5">
              {referentNetworks.map((entry, idx) => (
                <div key={entry.id || idx} className="p-6 bg-accent/5 rounded-xl border border-accent/10 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-accent/10">
                    <span className="text-[11px] font-black uppercase tracking-wider text-secondary">Réseau #{idx + 1}</span>
                    {referentNetworks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeReferentNetwork(idx)}
                        className="text-accent/30 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                      Clients / Prospects
                    </label>
                    <input
                      type="text"
                      value={entry.clientsProspects}
                      onChange={e => updateReferentNetwork(idx, { clientsProspects: e.target.value })}
                      placeholder="Clients ou prospects ciblés..."
                      className="w-full px-4 py-3 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                      Principales actions effectuées pour créer/entretenir les liens avec les donneurs d’ordre
                    </label>
                    <textarea
                      value={entry.keyActions}
                      onChange={e => updateReferentNetwork(idx, { keyActions: e.target.value })}
                      placeholder="Actions réalisées, rendez-vous, déjeuners, échanges..."
                      rows={3}
                      className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Encadrement */}
          <div className="pt-6 border-t border-accent/10 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-secondary tracking-tight">Encadrement</h3>
                <p className="text-sm text-accent/70 italic mt-1 font-medium">
                  "Un bon encadrant fait progresser. Avez-vous réussi à faire grandir les consultants Logiclever ?"
                </p>
              </div>
              <button
                type="button"
                onClick={addReferentEncadrement}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-secondary/10 hover:bg-secondary/20 text-secondary text-xs font-bold rounded-lg transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter un encadrement</span>
              </button>
            </div>

            <div className="space-y-5">
              {referentEncadrements.map((entry, idx) => (
                <div key={entry.id || idx} className="p-6 bg-accent/5 rounded-xl border border-accent/10 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-accent/10">
                    <span className="text-[11px] font-black uppercase tracking-wider text-secondary">Encadrement #{idx + 1}</span>
                    {referentEncadrements.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeReferentEncadrement(idx)}
                        className="text-accent/30 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                        Client
                      </label>
                      <input
                        type="text"
                        value={entry.client}
                        onChange={e => updateReferentEncadrement(idx, { client: e.target.value })}
                        placeholder="Client..."
                        className="w-full px-4 py-3 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                        Personne encadrée
                      </label>
                      <input
                        type="text"
                        value={entry.coachedPerson}
                        onChange={e => updateReferentEncadrement(idx, { coachedPerson: e.target.value })}
                        placeholder="Nom du consultant encadré..."
                        className="w-full px-4 py-3 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-accent/40 uppercase tracking-widest mb-2">
                      Commentaire/Contexte
                    </label>
                    <textarea
                      value={entry.commentContext}
                      onChange={e => updateReferentEncadrement(idx, { commentContext: e.target.value })}
                      placeholder="Commentaires, réalisations, progression observée..."
                      rows={3}
                      className="w-full p-4 bg-white rounded-lg border border-accent/10 focus:border-secondary focus:ring-0 text-sm font-normal resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </motion.div>
  );
}
