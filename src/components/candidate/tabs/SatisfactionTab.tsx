import React from 'react';
import { motion } from 'motion/react';
import { Section, FormField } from '../CandidateUI';
import { AnnualReport, Satisfaction } from '../../../types';
import { cn } from '../../../lib/utils';
import { Check } from 'lucide-react';

interface SatisfactionTabProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  isLockedForEditing?: boolean;
}

type SatisfactionLevel = 'TR' | 'M' | 'C' | 'S';

const LEVELS: Array<{ code: SatisfactionLevel; emoji: string; label: string; activeColor: string }> = [
  { code: 'TR', emoji: '😡', label: 'Insatisfait', activeColor: 'bg-red-500 text-white border-red-600 ring-red-300' },
  { code: 'M', emoji: '😐', label: 'Peu satisfait', activeColor: 'bg-amber-400 text-white border-amber-500 ring-amber-200' },
  { code: 'C', emoji: '😊', label: 'Satisfait', activeColor: 'bg-lime-500 text-white border-lime-600 ring-lime-200' },
  { code: 'S', emoji: '😁', label: 'Très satisfait', activeColor: 'bg-emerald-600 text-white border-emerald-700 ring-emerald-300' }
];

interface SatisfactionRowConfig {
  key: keyof Omit<Satisfaction, 'comment' | 'tasks'>;
  label: string;
}

const ROWS: SatisfactionRowConfig[] = [
  { key: 'wellBeingMission', label: 'Bien être en mission' },
  { key: 'wellBeingClient', label: 'Bien être chez le client' },
  { key: 'wellBeingLogiclever', label: 'Bien être chez Logiclever' }
];

export function SatisfactionTab({
  reportData,
  setReportData,
  isLockedForEditing = false
}: SatisfactionTabProps) {
  const currentSatisfaction: Satisfaction = reportData.satisfaction || {
    tasks: 'C',
    wellBeingMission: 'C',
    wellBeingClient: 'C',
    wellBeingLogiclever: 'C'
  };

  const handleSelect = (rowKey: keyof Omit<Satisfaction, 'comment'>, level: SatisfactionLevel) => {
    if (isLockedForEditing) return;
    setReportData(prev => ({
      ...prev,
      satisfaction: {
        ...(prev.satisfaction || {
          tasks: 'C',
          wellBeingMission: 'C',
          wellBeingClient: 'C',
          wellBeingLogiclever: 'C'
        }),
        [rowKey]: level
      }
    }));
  };

  return (
    <motion.div
      key="tab-satisfaction"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      <Section title="Satisfaction">
        <div className="overflow-x-auto rounded-2xl border border-accent/10 shadow-sm bg-white">
          <table className="w-full text-left border-collapse min-w-[580px]">
            <thead>
              {/* Ligne 1 de la table :
                  - Colonne 1, ligne 1 : "SATISFACTION"
                  - Colonnes 2 à 5, ligne 1 : Émojis (avec rowSpan=2 pour faire la hauteur combinée des 2 premières lignes de la colonne 1)
              */}
              <tr className="border-b border-accent/10 bg-accent/[0.03]">
                <th
                  scope="col"
                  className="py-3 px-6 text-sm font-black text-secondary uppercase tracking-[0.15em] border-r border-accent/10 w-1/3"
                >
                  SATISFACTION
                </th>
                {LEVELS.map(lvl => (
                  <th
                    key={lvl.code}
                    rowSpan={2}
                    scope="col"
                    className="py-4 px-4 text-center text-3xl select-none border-r border-accent/10 last:border-r-0 w-1/6 align-middle bg-accent/[0.02]"
                    title={lvl.label}
                  >
                    <span role="img" aria-label={lvl.label}>
                      {lvl.emoji}
                    </span>
                  </th>
                ))}
              </tr>

              {/* Ligne 2 de la table :
                  - Colonne 1, ligne 2 : "Tâches/Responsabilités"
                  (les 4 autres colonnes sont occupées par le rowSpan=2 de la ligne 1)
              */}
              <tr className="border-b border-accent/10 bg-accent/[0.015]">
                <th
                  scope="col"
                  className="py-3 px-6 text-sm font-bold text-accent border-r border-accent/10"
                >
                  Tâches/Responsabilités
                </th>
              </tr>
            </thead>

            {/* Lignes 3, 4 et 5 (corps de la table) :
                - Colonne 1, ligne 3 : "Bien être en mission" -> Ligne 2 des 4 autres colonnes (cases à cocher)
                - Colonne 1, ligne 4 : "Bien être chez le client" -> Ligne 3 des 4 autres colonnes (cases à cocher)
                - Colonne 1, ligne 5 : "Bien être chez Logiclever" -> Ligne 4 des 4 autres colonnes (cases à cocher)
            */}
            <tbody className="divide-y divide-accent/10 text-sm">
              {ROWS.map((row, idx) => {
                const isSelectedLevel = (lvlCode: SatisfactionLevel) => currentSatisfaction[row.key] === lvlCode;

                return (
                  <tr
                    key={row.key}
                    className={cn(
                      "transition-colors",
                      idx % 2 === 0 ? "bg-white" : "bg-accent/[0.015]",
                      "hover:bg-accent/[0.03]"
                    )}
                  >
                    {/* Colonne 1 : Libellé de la ligne */}
                    <td className="py-4 px-6 font-bold text-accent border-r border-accent/10">
                      {row.label}
                    </td>

                    {/* Les 4 colonnes : cases à cocher (1 seul choix possible par ligne) */}
                    {LEVELS.map(lvl => {
                      const checked = isSelectedLevel(lvl.code);

                      return (
                        <td
                          key={lvl.code}
                          className="py-4 px-4 text-center border-r border-accent/10 last:border-r-0"
                        >
                          <button
                            type="button"
                            disabled={isLockedForEditing}
                            onClick={() => handleSelect(row.key, lvl.code)}
                            className={cn(
                              "w-7 h-7 mx-auto rounded-lg border flex items-center justify-center transition-all cursor-pointer",
                              checked
                                ? `${lvl.activeColor} shadow-md scale-105 ring-2`
                                : "bg-accent/5 border-accent/20 hover:border-accent/40 hover:bg-accent/10 text-transparent",
                              isLockedForEditing && "cursor-not-allowed opacity-60"
                            )}
                            aria-label={`${row.label} - ${lvl.label}`}
                          >
                            {checked && <Check className="w-4 h-4 stroke-[3]" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-8 pt-6 border-t border-accent/10">
          <FormField
            label="Commentaire (obligatoire si mécontent)"
            value={currentSatisfaction.comment || ''}
            maxLength={2000}
            disabled={isLockedForEditing}
            onChange={val => {
              if (isLockedForEditing) return;
              setReportData(prev => ({
                ...prev,
                satisfaction: {
                  ...(prev.satisfaction || {
                    tasks: 'C',
                    wellBeingMission: 'C',
                    wellBeingClient: 'C',
                    wellBeingLogiclever: 'C'
                  }),
                  comment: val
                }
              }));
            }}
            placeholder="Partagez vos impressions, points d'attention ou améliorations..."
          />
        </div>
      </Section>
    </motion.div>
  );
}
