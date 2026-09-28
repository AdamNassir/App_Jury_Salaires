import React from 'react';
import { ExternalLink } from 'lucide-react';
import { AnnualReport } from '../../../types';
import { FormField } from '../CandidateUI';

interface SkillsDossierFieldsProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  disabled: boolean;
}

export function SkillsDossierFields({ reportData, setReportData, disabled }: SkillsDossierFieldsProps) {
  return (
    <div className="space-y-10 mb-10 pb-10 border-b border-accent/10">
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-accent">
          <a
            href="https://docs.google.com/presentation/d/1hkoD3yAMaqFRhoLe0VrIp5ljT_0onNI8qZsbNH2cH3k/edit?slide=id.g34bcd725496_0_385#slide=id.g34bcd725496_0_385"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80 transition-colors"
          >
            CV
          </a>
        </h3>
        <p className="text-accent/60">Lien vers le CV qui doit être à jour et mettre en lumière vos points forts.</p>
        <div>
          <a
            href="https://drive.google.com/drive/u/0/folders/157QwJI_599602Iqb5fXpveFELz79Qy57"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline hover:text-primary/80 transition-colors inline-flex items-center gap-1.5 text-sm"
          >
            [Rep dépôt CV]
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <div className="space-y-8">
        <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 text-accent text-sm leading-relaxed">
          <a
            href="https://docs.google.com/spreadsheets/d/1x-_DOsA2PsG9YK7Wbl5jBoXJE8abDHWn4EtQnrfBDXA/edit?gid=2103496025#gid=2103496025"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline hover:text-primary/80 transition-colors"
          >
            Dossier des compétences
          </a>
          {' '}: Remplir ou mettre à jour le dossier des compétences (Onglet “Salariés”)
        </div>

        <h4 className="text-sm font-bold text-accent">Progression</h4>
        {([
          ['progressionDetails', 'Sur quelles compétences métier / applicatifs ?'],
          ['techDetails', 'Sur quels logiciels / technologies ?'],
          ['certificationsDetail', 'Avez-vous de nouvelles certifications ?'],
          ['meetingPrep', 'Préparation / Animation de réunion ?'],
          ['deliverables', 'Quels livrables avez-vous faits ?'],
        ] as const).map(([key, label]) => (
          <div key={key}>
            <FormField
              label={label}
              value={reportData[key] || ''}
              onChange={value => setReportData(prev => ({ ...prev, [key]: value }))}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
