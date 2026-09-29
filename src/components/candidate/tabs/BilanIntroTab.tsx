import React from 'react';
import { motion } from 'motion/react';
import { Section } from '../CandidateUI';
import { ExternalLink, FileText } from 'lucide-react';
import { useAppLink } from '../../../services/appLinksService';

export function BilanIntroTab() {
  const postureLink = useAppLink(
    'link_posture_attendue',
    'https://docs.google.com/spreadsheets/d/1LatJvU7ZI5m6-is2oyVihfBSDqzJsdbvxL3pCMQhpJQ/edit?gid=1753043028#gid=1753043028'
  );
  const meteoLink = useAppLink(
    'link_meteo_client_intro',
    'https://docs.google.com/spreadsheets/d/1YZ2XBW2DSbP79vT0IwKJoK_80jDJR7ZJZi4_LeF53tw/edit?gid=2004870848#gid=2004870848'
  );
  const evalPairsLink = useAppLink(
    'link_eval_pairs_intro',
    'https://docs.google.com/spreadsheets/d/1DgkpCkCzj2_LGdH_BjnRScxatIidzVBj0ASwzJhD0zU/edit?gid=448715688#gid=448715688'
  );

  const exemple1 = useAppLink('link_exemple_bilan_1');
  const exemple2 = useAppLink('link_exemple_bilan_2');
  const exemple3 = useAppLink('link_exemple_bilan_3');

  return (
    <motion.div
      key="bilan_intro"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      <Section
        title="Objectifs Bilan Annuel"
      >
        <div className="space-y-6 text-sm text-accent leading-relaxed">
          <div className="p-5 rounded-2xl bg-accent/5 border border-accent/10 space-y-4">
            <p>
              Il s’agit pour le collaborateur de faire un bilan sur le travail qu’il a accompli depuis un an et de se donner des perspectives/objectifs sur l’année à venir. Ce n’est pas un jugement sur ce qu’il est mais une réflexion sur son travail pour qu’il prenne du recul sur ce qu’il a fait, sur ce qu’il veut faire et sur ce qu’il peut apporter à Logiclever.
            </p>
            <p>
              C’est aussi un moment de transparence au sein de Logiclever qui doit permettre de partager les savoir-faire et de rétribuer les collaborateurs à leur juste valeur.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-accent/10 space-y-4">
            <h4 className="font-bold text-accent text-base">
              Ce dossier permet :
            </h4>
            <ul className="space-y-2.5 pl-2">
              {[
                'de faire le point sur le travail accompli et les compétences mises en œuvre',
                'de mieux connaître les attentes et difficultés rencontrées par les collaborateurs',
                'de connaître des sources de motivation ou de mécontentement',
                'd’identifier les besoins en formation et les perspectives de carrière',
                'de fixer de nouveaux objectifs en concertation avec son coach',
              ].map((item, index) => (
                <li key={index} className="flex items-start gap-2.5 text-accent/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
              <li className="space-y-1.5">
                <div className="flex items-start gap-2.5 text-accent/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>de justifier une demande de revalorisation salariale</span>
                </div>
                <p className="pl-6 text-xs text-accent/70 italic leading-relaxed">
                  Si un changement de grade est demandé, donner les éléments factuels montrant que vous l’avez anticipé et que vous avez déjà commencé à prendre la{' '}
                  <a
                    id="link_posture_attendue"
                    href={postureLink.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-primary underline hover:text-primary/80 transition-all inline-flex items-center gap-0.5 not-italic px-1 py-0.5 rounded"
                  >
                    posture attendue
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  .
                </p>
              </li>
            </ul>
          </div>

          <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 space-y-4">
            <h4 className="font-bold text-accent text-base">
              Il comprend :
            </h4>
            <ul className="space-y-3 pl-2">
              <li className="flex items-center gap-2 rounded-lg transition-all p-1" id="link_meteo_client_intro">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span>
                  Lien vers les météo client (
                  <a
                    href={meteoLink.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-primary underline hover:text-primary/80 transition-colors inline-flex items-center gap-0.5"
                  >
                    ici
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  )
                </span>
              </li>

              <li className="flex items-center gap-2 rounded-lg transition-all p-1" id="link_eval_pairs_intro">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span>
                  Lien vers l’évaluation par ses pairs (encadrant en mission, collègues sur les EPIC…) (
                  <a
                    href={evalPairsLink.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-primary underline hover:text-primary/80 transition-colors inline-flex items-center gap-0.5"
                  >
                    ici
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  )
                </span>
              </li>

              <li className="flex items-center gap-2 text-accent/80">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span>Une fiche de synthèse</span>
              </li>

              <li className="flex items-center gap-2 text-accent/80">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span>Une auto-évaluation</span>
              </li>

              <li className="flex items-center gap-2 text-accent/80">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span>Objectifs et prétentions</span>
              </li>
            </ul>
          </div>

          {/* Section Exemples d'Aide Bilan Annuel */}
          <div className="p-6 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <FileText className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-indigo-950 text-base">
                  Exemples d'aide au remplissage
                </h4>
                <p className="text-xs text-indigo-905 leading-relaxed font-medium">
                  Si vous ne savez pas comment renseigner certains champs de l'autoévaluation, ces exemples sont faits pour vous aider
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
              {[
                { id: 'link_exemple_bilan_1', label: 'Bilan Annuel - Exemple 1', link: exemple1 },
                { id: 'link_exemple_bilan_2', label: 'Bilan Annuel - Exemple 2', link: exemple2 },
                { id: 'link_exemple_bilan_3', label: 'Bilan Annuel - Exemple 3', link: exemple3 },
              ].map(({ id, label, link }, idx) => (
                <div
                  key={id}
                  id={id}
                  className="p-4 rounded-xl bg-white border border-indigo-100 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-secondary text-sm group-hover:text-indigo-600 transition-colors">
                      {label}
                    </span>
                  </div>
                  {link.url ? (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold transition-all shadow-2xs"
                    >
                      <span>Consulter l'exemple</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-accent/50 italic px-3 py-2 bg-accent/5 rounded-lg border border-dashed border-accent/20">
                      <span>Lien en configuration</span>
                      <span className="text-[10px] text-accent/40 font-mono">Admin</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </motion.div>
  );
}
