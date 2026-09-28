import React from 'react';
import { motion } from 'motion/react';
import { Section } from '../CandidateUI';
import { ExternalLink } from 'lucide-react';

export function BilanIntroTab() {
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
                    href="https://docs.google.com/spreadsheets/d/1LatJvU7ZI5m6-is2oyVihfBSDqzJsdbvxL3pCMQhpJQ/edit?gid=1753043028#gid=1753043028"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary underline hover:text-primary/80 transition-colors inline-flex items-center gap-0.5 not-italic"
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
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span>
                  Lien vers les météo client (
                  <a
                    href="https://docs.google.com/spreadsheets/d/1YZ2XBW2DSbP79vT0IwKJoK_80jDJR7ZJZi4_LeF53tw/edit?gid=2004870848#gid=2004870848"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary underline hover:text-primary/80 transition-colors inline-flex items-center gap-0.5"
                  >
                    ici
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  )
                </span>
              </li>

              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span>
                  Lien vers l’évaluation par ses pairs (encadrant en mission, collègues sur les EPIC…) (
                  <a
                    href="https://docs.google.com/spreadsheets/d/1DgkpCkCzj2_LGdH_BjnRScxatIidzVBj0ASwzJhD0zU/edit?gid=448715688#gid=448715688"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary underline hover:text-primary/80 transition-colors inline-flex items-center gap-0.5"
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
        </div>
      </Section>
    </motion.div>
  );
}
