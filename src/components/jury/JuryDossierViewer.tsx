import React, { useState } from 'react';
import { Dossier, UserProfile } from '../../types';
import { CheckCircle2, Briefcase, Calendar, Maximize2, ExternalLink, FileSpreadsheet, Copy, Check } from 'lucide-react';
import { cn, formatCurrency } from '../../lib/utils';
import { AccordionSection, ReportSection, SatisfactionDisplay } from './JuryUI';
import { JuryDecisionForm } from './JuryDecisionForm';
import { SalaryCalculatorTab } from '../candidate/tabs/SalaryCalculatorTab';
import { EngagementTab, engagementSections } from '../candidate/tabs/EngagementTab';
import { SyntheseTab } from '../candidate/tabs/SyntheseTab';
import { PretentionsTab } from '../candidate/tabs/PretentionsTab';

interface JuryDossierViewerProps {
  dossier: Dossier;
  candidate: UserProfile | null;
  profile: UserProfile;
  expandedTabs: Record<string, boolean>;
  toggleTab: (tab: string) => void;
  setZoomData: (data: { title: string; content: string }) => void;
  onDoneDecision: () => void;
  isAssigned?: boolean;
}

function getValidUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to execCommand
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    textArea.remove();
    return successful;
  } catch {
    return false;
  }
}

export function JuryDossierViewer({
  dossier,
  candidate,
  profile,
  expandedTabs,
  toggleTab,
  setZoomData,
  onDoneDecision,
  isAssigned = true
}: JuryDossierViewerProps) {
  const [copiedMeteoIndex, setCopiedMeteoIndex] = useState<number | null>(null);

  const handleOpenAndCopy = async (link: string, idx: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const validUrl = getValidUrl(link);
    await copyToClipboard(validUrl || link);
    setCopiedMeteoIndex(idx);
    setTimeout(() => {
      setCopiedMeteoIndex(prev => (prev === idx ? null : prev));
    }, 3000);

    try {
      window.open(validUrl, '_blank', 'noopener,noreferrer');
    } catch {
      // Ignoré si bloqué par l'iframe
    }
  };

  const handleCopyOnly = async (link: string, idx: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const validUrl = getValidUrl(link);
    await copyToClipboard(validUrl || link);
    setCopiedMeteoIndex(idx);
    setTimeout(() => {
      setCopiedMeteoIndex(prev => (prev === idx ? null : prev));
    }, 3000);
  };

  const isAdmin = profile.roles?.includes('ADMIN') || 
    profile.email?.toLowerCase() === 'adam.nassir@logiclever.com' ||
    profile.email?.toLowerCase() === 'guillaume.best@logiclever.com';
  const isReadOnly = !isAssigned && !isAdmin;
  const dossierTabs = ([
    ['SYNTHESE', 'Introduction & Synthèse'],
    ['OBJECTIFS_PASSES', 'Objectifs Année Passée'],
    ['EXPERTISES', 'Savoir-faire'],
    ['AUTONOMIE', 'Autonomie en mission'],
    ['COMMERCIAL', 'Vente/commercial'],
    ['VIE_LOGICLEVER', 'Vie LogicLever'],
    ['RECRUTEMENT', 'Recrutement'],
    ['ENCADREMENT', 'Encadrement'],
    ['AMELIORATION', 'Amélioration Continue'],
    ['REFERENT_LOGICLEVER', 'Référent LogicLever'],
    ['METEOS', 'Météos Client'],
    ['RETOURS_PAIRS', 'Retours Pairs'],
    ['PRETENTIONS', 'Objectifs'],
    ['CALCULATRICE', 'Calculette du salaire'],
    ['DECISION', 'Décision']
  ] as const).filter(([id]) => id !== 'REFERENT_LOGICLEVER' || !!dossier.annualReport?.isReferentOrAspiring);
  const activeEngagementSection = engagementSections.find(section =>
    !!expandedTabs[section.id] &&
    (section.id !== 'REFERENT_LOGICLEVER' || !!dossier.annualReport?.isReferentOrAspiring)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-accent/10 pb-4" role="tablist" aria-label="Sections du dossier">
        {dossierTabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={!!expandedTabs[id]}
            onClick={() => toggleTab(id)}
            className={cn(
              "px-3 py-2 rounded-base text-[10px] font-black uppercase tracking-wider transition-colors",
              expandedTabs[id] ? "bg-primary text-white" : "bg-accent/5 text-accent/50 hover:text-accent"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeEngagementSection && dossier.annualReport && (
        <fieldset disabled className="min-w-0 border-0 p-0 m-0 pointer-events-none" aria-label={`${activeEngagementSection.label} en lecture seule`}>
          <EngagementTab
            section={activeEngagementSection.id}
            reportData={dossier.annualReport}
            setReportData={() => undefined}
          />
        </fieldset>
      )}

      {expandedTabs['SYNTHESE'] && dossier.annualReport && (
        <fieldset disabled className="min-w-0 border-0 p-0 m-0 pointer-events-none" aria-label="Introduction et synthèse en lecture seule">
          <SyntheseTab
            reportData={dossier.annualReport}
            setReportData={() => undefined}
          />
        </fieldset>
      )}

      {expandedTabs['PRETENTIONS'] && dossier.annualReport && (
        <fieldset disabled className="min-w-0 border-0 p-0 m-0 pointer-events-none" aria-label="Objectifs en lecture seule">
          <PretentionsTab
            profile={candidate || undefined}
            reportData={dossier.annualReport}
            setReportData={() => undefined}
          />
        </fieldset>
      )}

      {/* 1. Synthèse */}
      <AccordionSection 
        label="Synthèse" 
        tabMode
        isOpen={false}
        onToggle={() => toggleTab('SYNTHESE')}
      >
        <div className="space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ReportSection title="Synthèse Annuelle" content={dossier.annualReport?.yearSummary} onZoom={setZoomData} />
            <ReportSection title="Auto-évaluation globale" content={dossier.annualReport?.synthesis} onZoom={setZoomData} />
          </div>
          
          <div className="space-y-6">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4">Satisfaction</h4>
            {dossier.annualReport?.satisfaction ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SatisfactionDisplay label="Tâches" value={dossier.annualReport.satisfaction.tasks} />
                <SatisfactionDisplay label="Bien-être Mission" value={dossier.annualReport.satisfaction.wellBeingMission} />
                <SatisfactionDisplay label="Bien-être Client" value={dossier.annualReport.satisfaction.wellBeingClient} />
                <SatisfactionDisplay label="Bien-être LL" value={dossier.annualReport.satisfaction.wellBeingLogiclever} />
              </div>
            ) : (
              <div className="p-8 border border-dashed border-accent/10 rounded-xl text-center text-accent/30 italic">
                Données de satisfaction non renseignées.
              </div>
            )}
          </div>
        </div>
      </AccordionSection>

      {/* 2. Objectifs Passés */}
      <AccordionSection 
        label="Objectifs Passés" 
        tabMode
        isOpen={!!expandedTabs['OBJECTIFS_PASSES']} 
        onToggle={() => toggleTab('OBJECTIFS_PASSES')}
      >
        <div className="space-y-12">
          {dossier.annualReport?.previousObjectives && dossier.annualReport.previousObjectives.length > 0 ? (
            <div className="space-y-6">
              <h5 className="text-[10px] font-black text-accent/30 uppercase tracking-widest">Suivi des Objectifs 2024</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {dossier.annualReport.previousObjectives.map((obj, idx) => (
                  <div key={idx} className="p-6 bg-accent/5 rounded-xl border border-accent/10 group/obj relative flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="font-bold text-accent">{obj.objective}</div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                            obj.reached === 'OUI' ? "bg-green-100 text-green-700" : 
                            obj.reached === 'NON' ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                          )}>
                            {obj.reached}
                          </span>
                          {obj.comments && (
                            <button
                              type="button"
                              onClick={() => setZoomData({ title: `Objectif : ${obj.objective}`, content: obj.comments })}
                              className="opacity-0 group-hover/obj:opacity-100 focus:opacity-100 p-1 text-accent/30 hover:text-secondary hover:bg-secondary/10 rounded transition-all cursor-pointer"
                              title="Agrandir le commentaire"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-accent/60 italic leading-relaxed">"{obj.comments}"</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-12 border border-dashed border-accent/10 rounded-xl text-center text-accent/30 italic">Aucun objectif passé renseigné.</div>
          )}
        </div>
      </AccordionSection>

      {/* 3. Expertises */}
      <AccordionSection 
        label="Expertises" 
        tabMode
        isOpen={!!expandedTabs['EXPERTISES']} 
        onToggle={() => toggleTab('EXPERTISES')}
      >
        <div className="space-y-12">
          <ReportSection title="Savoir-faire identifiés" content={dossier.annualReport?.knowHow} onZoom={setZoomData} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ReportSection title="Activités Commerciales" content={dossier.annualReport?.commercialActivities} onZoom={setZoomData} />
            <ReportSection title="Formations" content={dossier.annualReport?.training} onZoom={setZoomData} />
          </div>
          <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-8">
            <h5 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-4">Expertise Technique & Progression</h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <ReportSection title="Progression métier" content={dossier.annualReport?.progressionDetails} noBg onZoom={setZoomData} />
              <ReportSection title="Logiciels & Tech" content={dossier.annualReport?.techDetails} noBg onZoom={setZoomData} />
              <ReportSection title="Certifications" content={dossier.annualReport?.certificationsDetail} noBg onZoom={setZoomData} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-accent/5 pt-8">
              <ReportSection title="Livrables marquants" content={dossier.annualReport?.deliverables} noBg onZoom={setZoomData} />
              <ReportSection title="Préparation réunions" content={dossier.annualReport?.meetingPrep} noBg onZoom={setZoomData} />
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* 4. Engagement sections, aligned with the candidate dossier tabs */}
      <AccordionSection 
        label="Engagement" 
        tabMode
        isOpen={false}
        onToggle={() => toggleTab('AUTONOMIE')}
      >
        <div className="space-y-12">
          {expandedTabs['AUTONOMIE'] && <div className="space-y-8">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between p-8 bg-secondary/5 border border-secondary/10 rounded-xl gap-6 group/autonomy relative">
            <div className="space-y-2">
              <h5 className="text-[10px] font-black text-secondary/60 uppercase tracking-widest">Niveau d'Autonomie Agi / Mission</h5>
              <div className="text-2xl font-bold text-secondary uppercase tracking-tight">{dossier.annualReport?.autonomyLevel}</div>
            </div>
            <div className="text-left md:max-w-[60%] md:border-l border-secondary/10 md:pl-8 flex items-center justify-between flex-1">
              <div className="text-sm text-accent/60 italic leading-relaxed font-light">"{dossier.annualReport?.autonomyJustification || dossier.annualReport?.missionAutonomy}"</div>
              {(dossier.annualReport?.autonomyJustification || dossier.annualReport?.missionAutonomy) && (
                <button
                  type="button"
                  onClick={() => setZoomData({ title: "Justification Autonomie", content: dossier.annualReport?.autonomyJustification || dossier.annualReport?.missionAutonomy || "" })}
                  className="opacity-0 group-hover/autonomy:opacity-100 focus:opacity-100 p-1.5 text-accent/30 hover:text-secondary hover:bg-secondary/10 rounded transition-all cursor-pointer ml-4 self-center"
                  title="Agrandir"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
            <ReportSection title="Autonomie en mission" content={dossier.annualReport?.missionAutonomy} onZoom={setZoomData} />
          </div>}

          {expandedTabs['COMMERCIAL'] && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <ReportSection title="Présentation LogicLever" content={dossier.annualReport?.commercialPresentation} onZoom={setZoomData} />
              <ReportSection title="Conseils aux clients" content={dossier.annualReport?.commercialAdvice} onZoom={setZoomData} />
              <ReportSection title="Force de proposition" content={dossier.annualReport?.commercialProposition} onZoom={setZoomData} />
              <ReportSection title="Propositions commerciales" content={dossier.annualReport?.commercialOffers} onZoom={setZoomData} />
            </div>
          )}
          
          {expandedTabs['VIE_LOGICLEVER'] && <div className="p-8 bg-accent/5 rounded-xl border border-accent/10 space-y-8">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest">Vie de l'Agence & Rayonnement</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <ReportSection title="Vie Logiclever (Meetups, Partages)" content={dossier.annualReport?.lifeLogiclever || dossier.annualReport?.lifeKnowledgeSharing} noBg onZoom={setZoomData} />
              <ReportSection title="Esprit d'équipe" content={dossier.annualReport?.lifeTeamSpirit} noBg onZoom={setZoomData} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-accent/5 pt-8">
              <ReportSection title="Communication (Slack)" content={dossier.annualReport?.lifeSlack} noBg onZoom={setZoomData} />
              <ReportSection title="Business Model" content={dossier.annualReport?.lifeBusinessModel} noBg onZoom={setZoomData} />
            </div>
          </div>}

          {expandedTabs['RECRUTEMENT'] && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <ReportSection title="Promotion LogicLever" content={dossier.annualReport?.recruitmentPromotion} onZoom={setZoomData} />
              <ReportSection title="Entretiens candidats" content={dossier.annualReport?.recruitmentInterviews} onZoom={setZoomData} />
              <ReportSection title="Réseaux sociaux" content={dossier.annualReport?.recruitmentSocial} onZoom={setZoomData} />
            </div>
          )}

          {expandedTabs['ENCADREMENT'] && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <ReportSection title="Sollicitation du coach" content={dossier.annualReport?.encadrementCoach} onZoom={setZoomData} />
              <ReportSection title="Sollicitation de l'encadrant" content={dossier.annualReport?.encadrementManager} onZoom={setZoomData} />
            </div>
          )}

          {expandedTabs['AMELIORATION'] && (dossier.annualReport?.squadEntries?.length || dossier.annualReport?.squadName) && (
            <div className="p-8 bg-primary/5 rounded-xl border border-primary/10 group/squad relative">
              <h5 className="text-[10px] font-black text-primary/60 uppercase tracking-widest mb-4 flex items-center justify-between">
                SQUAD : {dossier.annualReport?.squadName || dossier.annualReport?.squadEntries?.map(entry => entry.squad).filter(Boolean).join(', ')}
                <div className="flex items-center gap-3">
                  <span className="bg-primary/10 px-3 py-1 rounded-full text-[9px]">{dossier.annualReport.squadRole}</span>
                  <button
                    type="button"
                    onClick={() => setZoomData({ title: `Contributions SQUAD : ${dossier.annualReport?.squadName}`, content: dossier.annualReport?.squadContributions || "" })}
                    className="opacity-0 group-hover/squad:opacity-100 focus:opacity-100 p-1 text-primary/40 hover:text-primary hover:bg-primary/10 rounded transition-all cursor-pointer"
                    title="Agrandir"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </h5>
              <div className="text-base text-accent/70 leading-relaxed italic font-light">"{dossier.annualReport?.squadContributions || dossier.annualReport?.squadEntries?.map(entry => entry.contributions).filter(Boolean).join('\n\n')}"</div>
            </div>
          )}
        </div>
      </AccordionSection>

      {/* 5. Météos Client */}
      <AccordionSection 
        label="Météos Client" 
        tabMode
        isOpen={!!expandedTabs['METEOS']} 
        onToggle={() => toggleTab('METEOS')}
        count={(dossier.meteoLinks?.length || 0) + (dossier.clientFeedbacks?.length || 0)}
      >
        <div className="space-y-8">
          {/* Fiches météos issues de la colonne Q de Vues_Meteos */}
          {dossier.meteoLinks && dossier.meteoLinks.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-accent/40 uppercase tracking-[0.2em]">Fiches Météo Client ({dossier.meteoLinks.length})</h4>
                <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase">Source Vues_Meteos (Col Q)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dossier.meteoLinks.map((link, idx) => {
                  const validUrl = getValidUrl(link);
                  return (
                    <div key={idx} className="p-5 bg-white border border-accent/10 rounded-xl shadow-xs hover:border-primary/40 transition-all flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div className="truncate min-w-0">
                          <div className="text-xs font-bold text-accent">Météo {idx + 1}</div>
                          <div className="flex items-center gap-2">
                            <a 
                              href={validUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyOnly(link, idx);
                              }}
                              className="text-[11px] text-primary hover:text-secondary hover:underline font-mono truncate select-all inline-flex items-center gap-1 cursor-pointer transition-colors text-left"
                              title="Ouvrir le lien dans un nouvel onglet"
                            >
                              <span>{link}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                            </a>
                            {copiedMeteoIndex === idx && (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full shrink-0 animate-in fade-in duration-150">
                                <Check className="w-2.5 h-2.5" /> Copié !
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleCopyOnly(link, idx, e)}
                          className={`p-2 rounded-lg border transition-all cursor-pointer ${
                            copiedMeteoIndex === idx
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                              : 'bg-white border-accent/20 text-accent/70 hover:bg-accent/5 hover:text-accent'
                          }`}
                          title="Copier le lien"
                        >
                          {copiedMeteoIndex === idx ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <a 
                          href={validUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyOnly(link, idx);
                          }}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all shadow-xs cursor-pointer ${
                            copiedMeteoIndex === idx
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-primary text-white hover:brightness-110'
                          }`}
                          title="Ouvrir le lien dans un nouvel onglet"
                        >
                          <span>{copiedMeteoIndex === idx ? 'Copié' : 'Ouvrir'}</span>
                          {copiedMeteoIndex === idx ? <Check className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {dossier.clientFeedbacks && dossier.clientFeedbacks.length > 0 && (
            <div className="space-y-8">
              <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">Retours Clients (Météos détaillées)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {dossier.clientFeedbacks.map((cf, idx) => (
                  <div key={idx} className="p-8 bg-white border border-accent/10 rounded-xl shadow-sm hover:border-primary/30 transition-all flex flex-col gap-6">
                    <div className="flex items-start justify-between gap-4 border-b border-accent/5 pb-4">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary shrink-0"><Briefcase className="w-5 h-5" /></div>
                         <div>
                            <div className="text-xs font-black text-primary uppercase tracking-widest">{cf.client || 'Client anonyme'}</div>
                            <div className="text-sm font-bold text-accent underline decoration-primary/30">{cf.mission || 'Mission non spécifiée'}</div>
                         </div>
                      </div>
                      
                      {cf.realizationDate && (
                        <div className="flex items-center gap-1.5 bg-accent/5 text-accent/60 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{new Date(cf.realizationDate).toLocaleDateString('fr-FR')}</span>
                        </div>
                      )}
                    </div>

                    {/* Ratings if available */}
                    {((cf.clientRating !== undefined && cf.clientRating !== null) || (cf.consultantRating !== undefined && cf.consultantRating !== null)) && (
                      <div className="flex items-center gap-6 bg-accent/5 px-4 py-3 rounded-xl border border-accent/5 w-max">
                        {cf.clientRating !== undefined && cf.clientRating !== null && (
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase text-accent/30 tracking-widest font-sans">Note Client</span>
                            <span className="text-sm font-bold text-secondary">{cf.clientRating}/10</span>
                          </div>
                        )}
                        {cf.clientRating !== undefined && cf.clientRating !== null && cf.consultantRating !== undefined && cf.consultantRating !== null && (
                          <div className="w-px h-6 bg-accent/10" />
                        )}
                        {cf.consultantRating !== undefined && cf.consultantRating !== null && (
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase text-accent/30 tracking-widest font-sans">Note Consultant</span>
                            <span className="text-sm font-bold text-secondary">{cf.consultantRating}/10</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Details */}
                    <div className="space-y-4 text-sm leading-relaxed">
                      {cf.satisfactionItems && (
                        <div className="group/sat relative">
                          <div className="flex items-center justify-between">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-accent/30 mb-1 font-sans">Satisfactions</span>
                            <button
                              type="button"
                              onClick={() => setZoomData({ title: `Satisfactions Client - ${cf.client || 'Client'}`, content: cf.satisfactionItems })}
                              className="opacity-0 group-hover/sat:opacity-100 focus:opacity-100 p-1 text-accent/30 hover:text-secondary hover:bg-secondary/10 rounded transition-all cursor-pointer"
                              title="Agrandir"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-accent/80 font-light font-sans">{cf.satisfactionItems}</p>
                        </div>
                      )}
                      {cf.improvementAxes && (
                        <div className="group/imp relative">
                          <div className="flex items-center justify-between">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-accent/30 mb-1 font-sans">Axes de progrès</span>
                            <button
                              type="button"
                              onClick={() => setZoomData({ title: `Axes de progrès Client - ${cf.client || 'Client'}`, content: cf.improvementAxes })}
                              className="opacity-0 group-hover/imp:opacity-100 focus:opacity-100 p-1 text-accent/30 hover:text-secondary hover:bg-secondary/10 rounded transition-all cursor-pointer"
                              title="Agrandir"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-accent/80 font-light font-sans">{cf.improvementAxes}</p>
                        </div>
                      )}
                      {cf.recommendation && (
                        <div className="group/rec relative">
                          <div className="flex items-center justify-between">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-accent/30 mb-1 font-sans">Recommandation</span>
                            <button
                              type="button"
                              onClick={() => setZoomData({ title: `Recommandation Client - ${cf.client || 'Client'}`, content: cf.recommendation })}
                              className="opacity-0 group-hover/rec:opacity-100 focus:opacity-100 p-1 text-accent/30 hover:text-secondary hover:bg-secondary/10 rounded transition-all cursor-pointer"
                              title="Agrandir"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-accent/80 font-light font-sans">{cf.recommendation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!dossier.meteoLinks || dossier.meteoLinks.length === 0) && (!dossier.clientFeedbacks || dossier.clientFeedbacks.length === 0) && (
            <div className="p-12 border border-dashed border-accent/10 rounded-xl text-center text-accent/30 italic">Aucune météo client renseignée.</div>
          )}
        </div>
      </AccordionSection>

      {/* 6. Référent LogicLever */}
      <AccordionSection 
        label="Référent LogicLever"
        tabMode
        isOpen={false}
        onToggle={() => toggleTab('REFERENT_LOGICLEVER')}
      >
        <div className="space-y-12">
          {dossier.annualReport?.isReferentOrAspiring ? (
            <div className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-accent border border-accent/10 rounded-xl text-white">
                  <div className="text-[10px] font-black uppercase text-white/40 mb-2">Consultants coachés</div>
                  <div className="text-3xl font-bold">{dossier.annualReport.coachedConsultantsCount}</div>
                </div>
                <div className="p-6 bg-secondary border border-secondary/10 rounded-xl text-white">
                  <div className="text-[10px] font-black uppercase text-white/40 mb-2">Entretiens réalisés</div>
                  <div className="text-3xl font-bold">{dossier.annualReport.recruitmentInterviewsCount}</div>
                </div>
                <div className="p-6 bg-primary border border-primary/10 rounded-xl text-white text-center flex flex-col justify-center">
                  <div className="text-[10px] font-black uppercase text-white/40 mb-1">Rôle Squad Référent</div>
                  <div className="text-sm font-bold uppercase tracking-tight">{dossier.annualReport.referentSquadRole || 'N/A'}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <ReportSection title="Météos Consultants (Suivi)" content={dossier.annualReport.clientFollowUpMeteos} onZoom={setZoomData} />
                <ReportSection title="Points Coordination" content={dossier.annualReport.coordinationPoints} onZoom={setZoomData} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <ReportSection title="Actions Réseau Donneurs" content={dossier.annualReport.donorNetworkActions} onZoom={setZoomData} />
                <div className="space-y-6">
                  <ReportSection title="Détails Encadrement Mission" content={dossier.annualReport.encadrementMissionDetails} onZoom={setZoomData} />
                  <ReportSection title="Détails Coaching Carrière" content={dossier.annualReport.encadrementCoachingDetails} onZoom={setZoomData} />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 border border-dashed border-accent/10 rounded-xl text-center text-accent/30 italic">
              Le candidat n'a pas renseigné d'activités de Référent / Expert.
            </div>
          )}
        </div>
      </AccordionSection>

      {/* 8. Retours Pairs */}
      <AccordionSection 
        label="Retours Pairs" 
        tabMode
        isOpen={!!expandedTabs['RETOURS_PAIRS']} 
        onToggle={() => toggleTab('RETOURS_PAIRS')}
        count={Object.keys(dossier.consultantFeedbacks || {}).length}
      >
        <div className="space-y-12">
          <div className="space-y-8">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">Évaluations par les Pairs</h4>
            <div className="grid grid-cols-1 gap-6">
              {Object.values(dossier.consultantFeedbacks || {}).length > 0 ? (
                Object.values(dossier.consultantFeedbacks || {}).map((f, i) => {
                  const displayType = f.relationType || f.type;
                  const isLegacy = f.isLegacyType || ['Coach', 'Collègue en mission', 'Météo Client', 'Logiclever', 'COP & Epic'].includes(displayType as string);
                  const isValide = f.status === 'VALIDE' || f.validated;

                  return (
                    <div key={f.id || i} className="bg-white p-8 rounded-xl border border-accent/10 shadow-sm relative group">
                      <div className="absolute left-0 top-0 h-full w-1 bg-primary/30 rounded-full" />
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-accent/5 rounded-base flex items-center justify-center text-primary font-bold border border-accent/10 shadow-inner">
                            {f.consultantName ? f.consultantName.charAt(0) : 'E'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xl text-accent">{f.consultantName}</span>
                              <span className={cn(
                                "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border",
                                isValide ? "bg-green-50 text-green-600 border-green-200" : "bg-yellow-50 text-yellow-600 border-yellow-200"
                              )}>
                                {isValide ? 'Validé' : 'Brouillon'}
                              </span>
                              {isLegacy && (
                                <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  Type à rapprocher
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-accent/50 font-black uppercase tracking-widest mt-0.5">
                              {String(displayType).replace('_', ' ')}
                              {f.client ? ` • Client : ${f.client}` : ''}
                              {f.project ? ` • Mission : ${f.project}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-center bg-accent/5 px-6 py-3 rounded-xl border border-accent/10">
                            <div className="text-[9px] font-black uppercase text-accent/30 mb-1">Confiance</div>
                            <div className="text-2xl font-bold text-secondary leading-none">{f.confidenceIndex}<span className="text-xs opacity-30">/10</span></div>
                          </div>
                          {f.justification && (
                            <button
                              type="button"
                              onClick={() => setZoomData({ title: `Justification TJ Cible - ${f.consultantName}`, content: f.justification })}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center gap-1 text-[9px] font-black text-secondary uppercase tracking-widest hover:text-secondary-dark transition-all px-2.5 py-1 bg-secondary/5 hover:bg-secondary/15 rounded-md cursor-pointer h-max self-center"
                              title="Agrandir"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-1 mb-8">
                        <div className="text-[10px] font-black uppercase text-primary tracking-widest">Justification TJ Cible</div>
                        <div className="text-lg italic text-accent/70 font-light leading-relaxed">"{f.justification || 'Non renseigné'}"</div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-accent/5 pt-8">
                        <div className="group/axes relative">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-[10px] font-black uppercase text-secondary tracking-widest">Axes pour augmenter le TJ</div>
                            {f.improvementAxes && (
                              <button
                                type="button"
                                onClick={() => setZoomData({ title: `Axes pour augmenter le TJ - ${f.consultantName}`, content: f.improvementAxes })}
                                className="opacity-0 group-hover/axes:opacity-100 focus:opacity-100 flex items-center gap-1 text-[8px] font-black text-secondary uppercase tracking-widest hover:text-secondary-dark transition-all px-1.5 py-0.5 bg-secondary/5 hover:bg-secondary/15 rounded cursor-pointer"
                                title="Agrandir"
                              >
                                <Maximize2 className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                          <div className="text-sm text-accent/70 leading-relaxed">{f.improvementAxes || 'Aucun axe spécifique'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] font-black uppercase text-accent/30 mb-3 tracking-widest">TJM Préconisé</div>
                          <div className="text-2xl font-bold text-accent">{f.targetTJMin || 0}€ - {f.targetTJMax || 0}€</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-12 border border-dashed border-accent/10 rounded-xl text-center text-accent/30 italic">Aucun retour de pair pour le moment.</div>
              )}
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* 9. Souhaits */}
      <AccordionSection 
        label="Souhaits" 
        tabMode
        isOpen={false}
        onToggle={() => toggleTab('PRETENTIONS')}
      >
        <div className="space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <ReportSection title="Vision Moyen-Terme (Carrière)" content={dossier.annualReport?.careerGoals} onZoom={setZoomData} />
             <div className="p-8 bg-accent text-white rounded-xl shadow-xl space-y-6 group/pret relative">
                <div className="flex items-center justify-between">
                  <h5 className="text-[10px] font-black text-white/40 uppercase tracking-widest">Prétentions Financières</h5>
                  {dossier.annualReport?.salaryExpectations && (
                    <button
                      type="button"
                      onClick={() => setZoomData({ title: "Prétentions Financières - Justification", content: dossier.annualReport?.salaryExpectations || "" })}
                      className="opacity-0 group-hover/pret:opacity-100 focus:opacity-100 p-1 text-white/40 hover:text-white hover:bg-white/10 rounded transition-all cursor-pointer"
                      title="Agrandir"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-lg font-light italic leading-relaxed border-l-2 border-white/20 pl-4">"{dossier.annualReport?.salaryExpectations}"</p>
                <div className="grid grid-cols-2 gap-6">
                  <div><div className="text-[8px] font-black uppercase text-white/40 mb-1">Salaire / an</div><div className="text-xl font-bold">{dossier.annualReport?.wishedSalary ? formatCurrency(dossier.annualReport.wishedSalary) : 'N/A'}</div></div>
                  <div><div className="text-[8px] font-black uppercase text-white/40 mb-1">TJM Souhaité</div><div className="text-xl font-bold">{dossier.annualReport?.targetTJM ? `${dossier.annualReport.targetTJM}€` : 'N/A'}</div></div>
                </div>
             </div>
          </div>

          {dossier.annualReport?.nextObjectives && dossier.annualReport.nextObjectives.length > 0 && (
            <div className="space-y-6">
              <h5 className="text-[10px] font-black text-accent/30 uppercase tracking-widest">Objectifs Futurs (SMART)</h5>
              <div className="grid grid-cols-1 gap-4">
                {dossier.annualReport.nextObjectives.map((obj, idx) => (
                  <div key={idx} className="p-6 bg-primary/5 rounded-xl border border-primary/10 grid grid-cols-1 md:grid-cols-4 gap-6 group/obj relative">
                    <div className="absolute top-3 right-3">
                      <button
                        type="button"
                        onClick={() => setZoomData({ 
                          title: `Objectif SMART - ${obj.objective}`, 
                          content: `### Bénéfice\n${obj.benefit}\n\n### Moyens\n${obj.means}\n\n### Mesures\n${obj.measures}` 
                        })}
                        className="opacity-0 group-hover/obj:opacity-100 focus:opacity-100 p-1 text-primary/40 hover:text-primary hover:bg-primary/10 rounded transition-all cursor-pointer"
                        title="Agrandir"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div><div className="text-[9px] font-black text-primary/40 uppercase mb-2">Objectif</div><div className="font-bold text-accent pr-6">{obj.objective}</div></div>
                    <div><div className="text-[9px] font-black text-primary/40 uppercase mb-2">Bénéfice</div><div className="text-sm italic">"{obj.benefit}"</div></div>
                    <div><div className="text-[9px] font-black text-primary/40 uppercase mb-2">Moyens</div><div className="text-sm">{obj.means}</div></div>
                    <div><div className="text-[9px] font-black text-primary/40 uppercase mb-2">Mesures</div><div className="text-sm text-accent/50">{obj.measures}</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AccordionSection>

      {expandedTabs['CALCULATRICE'] && candidate && dossier.annualReport && (
        <fieldset disabled className="min-w-0 border-0 p-0 m-0 pointer-events-none" aria-label="Calculette du salaire en lecture seule">
          <SalaryCalculatorTab
            profile={candidate}
            dossier={dossier}
            reportData={dossier.annualReport}
          />
        </fieldset>
      )}

      {/* Décision du jury */}
      <AccordionSection 
        label="DÉCISION" 
        tabMode
        isOpen={!!expandedTabs['DECISION']} 
        onToggle={() => toggleTab('DECISION')}
        highlight
      >
        <div>
          {(dossier.status === 'COMPLET' && profile.roles.includes('JURY')) ? (
            <div key={dossier.id}>
              <JuryDecisionForm 
                dossier={dossier} 
                candidate={candidate} 
                onDone={onDoneDecision} 
                readOnly={isReadOnly}
                profile={profile}
              />
            </div>
          ) : dossier.status === 'VALIDE' ? (
            <div className="bg-green-50 p-12 rounded-[40px] border border-green-100 text-center space-y-8">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><CheckCircle2 className="w-10 h-10" /></div>
              <div>
                <h4 className="text-3xl font-serif text-green-800 mb-2">Décision Entérinée</h4>
                <p className="text-green-600/60 uppercase tracking-widest text-[10px] font-black">Augmentation validée pour 2025</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-8 max-w-2xl mx-auto py-8 border-y border-green-200/50">
                <div><div className="text-[10px] font-bold uppercase text-green-800/40 mb-2">Verdict</div><div className="text-2xl font-bold text-green-800">{dossier.juryDecision?.verdict}</div></div>
                <div><div className="text-[10px] font-bold uppercase text-green-800/40 mb-2">Nouveau Salaire</div><div className="text-2xl font-bold text-green-800">{formatCurrency(dossier.juryDecision?.amount || 0)}</div></div>
                {dossier.juryDecision?.maxSalaryIfTJIncreases && (
                  <div><div className="text-[10px] font-bold uppercase text-green-800/40 mb-2">Max si ↑ TJ</div><div className="text-2xl font-bold text-green-800">{formatCurrency(dossier.juryDecision.maxSalaryIfTJIncreases)}</div></div>
                )}
              </div>
              {dossier.juryDecision?.conclusion && (
                <div className="p-8 bg-white/50 rounded-2xl text-green-800/70 italic font-light leading-relaxed group/conclusion relative">
                  <div className="absolute top-3 right-3">
                    <button
                      type="button"
                      onClick={() => setZoomData({ title: "Conclusion Décision Jury", content: dossier.juryDecision?.conclusion || "" })}
                      className="opacity-0 group-hover/conclusion:opacity-100 focus:opacity-100 p-1 text-green-800/40 hover:text-green-800 hover:bg-green-100/50 rounded transition-all cursor-pointer"
                      title="Agrandir"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  "{dossier.juryDecision.conclusion}"
                </div>
              )}
            </div>
          ) : (
            <div className="p-20 text-center text-accent/30 italic">Décision en cours de délibération...</div>
          )}
        </div>
      </AccordionSection>
    </div>
  );
}
