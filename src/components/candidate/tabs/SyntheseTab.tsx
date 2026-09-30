import React from 'react';
import { motion } from 'motion/react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport } from '../../../types';
import { ExternalLink, FileSpreadsheet } from 'lucide-react';

interface SyntheseTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  isLockedForEditing?: boolean;
}

export function SyntheseTab({ reportData, setReportData, isLockedForEditing }: SyntheseTabProps) {
  return (
    <motion.div
      key="synthese"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      <Section title="Synthèse">
        <div className="space-y-8">
          {/* Bloc 1 : Fichier RH (grade, salaire…) */}
          <div id="link_fichier_rh_synthese" className="p-6 bg-accent/[0.02] rounded-xl border border-accent/10 shadow-xs transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <a
                  href="https://docs.google.com/spreadsheets/d/1tgpQHKPHliYASkxm34cYFnO8ggzlzzQAwARihz3Eq5s/edit?gid=80099745#gid=80099745"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-bold text-primary underline inline-flex items-center gap-1.5 hover:text-primary-dark transition-colors"
                >
                  <span>Fichier RH (grade, salaire…)</span>
                  <ExternalLink className="w-4 h-4 inline" />
                </a>
              </div>
            </div>
          </div>

          {/* Bloc 2 : Synthèse de l’année */}
          <div id="link_synthese_jours" className="p-6 bg-accent/[0.02] rounded-xl border border-accent/10 space-y-2 shadow-xs transition-all">
            <h3 className="text-base font-bold text-secondary">Synthèse de l’année (01/07 au 30/06)</h3>
            <p className="text-xs text-accent/80 font-medium">
              Lien vers le fichier donnant les jours du consultant (mission, formation, intercontrat…) (
              <a
                href="https://docs.google.com/spreadsheets/d/1FLIUieYtqZtnYpABpNXRRDNYbZZXEFHA0J9NI2Cq450/edit?gid=291701908#gid=291701908"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-bold underline inline-flex items-center gap-0.5 hover:text-primary-dark"
              >
                lien
                <ExternalLink className="w-3 h-3 inline" />
              </a>
              )
            </p>
          </div>

          {/* Bloc 3 : Activités commerciales */}
          <div id="link_primes_synthese" className="p-6 bg-accent/[0.02] rounded-xl border border-accent/10 space-y-4 shadow-xs transition-all">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-secondary">Activités commerciales</h3>
              <p className="text-xs text-accent/80 font-medium">
                Lien vers le fichier qui consolide les primes données sur les 12 derniers mois (
                <a
                  href="https://drive.google.com/drive/u/1/folders/1_mrGq_Ym-i6LuzHHmtBFUkDyvJ0oLAZh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-bold underline inline-flex items-center gap-0.5 hover:text-primary-dark"
                >
                  lien
                  <ExternalLink className="w-3 h-3 inline" />
                </a>
                )
              </p>
            </div>
            <FormField
              label="Autres activités commerciales n’ayant pas permis la vente d’un consultant :"
              value={reportData.commercialActivities || ''}
              onChange={v => {
                if (isLockedForEditing) return;
                setReportData(prev => ({ ...prev, commercialActivities: v }));
              }}
              disabled={isLockedForEditing}
              placeholder="Écrivez vos activités commerciales ici..."
            />
          </div>

          {/* Bloc 4 : Formations */}
          <div id="link_formations_synthese" className="p-6 bg-accent/[0.02] rounded-xl border border-accent/10 space-y-4 shadow-xs transition-all">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-secondary">Formations</h3>
              <p className="text-xs text-accent/80 font-medium">
                Lien vers le fichier qui consolide les formations reçues (
                <a
                  href="https://docs.google.com/spreadsheets/d/1YLUZqCKNfGEGiHHY0qsrq6I8gBsnvlIJRQmYu_di-Y8/edit?gid=0#gid=0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-bold underline inline-flex items-center gap-0.5 hover:text-primary-dark"
                >
                  lien
                  <ExternalLink className="w-3 h-3 inline" />
                </a>
                )
              </p>
            </div>

            <div className="p-4 bg-primary/5 border border-primary/15 rounded-xl space-y-2">
              <div className="text-xs font-bold text-secondary">
                Formations obligatoires :
              </div>
              <ul className="space-y-1 text-xs text-accent/80 font-medium pl-5 list-disc">
                <li>On boarding</li>
                <li>Leading Safe ou PO/PM</li>
                <li>Conseiller mieux, Vendre Plus</li>
                <li>Progresser dans ses présentations</li>
                <li>S’initier à Power BI</li>
              </ul>
            </div>
          </div>
        </div>
      </Section>
    </motion.div>
  );
}
