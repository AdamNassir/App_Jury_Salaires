import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Dossier } from '../../types';

interface JuryCandidateListProps {
  dossiers: Dossier[];
  selectedDossierId: string | null;
  onSelectDossier: (id: string) => void;
}

export function JuryCandidateList({
  dossiers,
  selectedDossierId,
  onSelectDossier
}: JuryCandidateListProps) {
  return (
    <div className="space-y-4 max-h-[800px] overflow-y-auto pr-4 custom-scrollbar">
      {dossiers.map(d => (
        <button
          key={d.id}
          onClick={() => onSelectDossier(d.id)}
          className={cn(
            "w-full p-8 rounded-xl border transition-all text-left group shadow-sm",
            selectedDossierId === d.id 
              ? "bg-secondary border-secondary text-white shadow-secondary/20 translate-x-2" 
              : "bg-white border-accent/10 hover:border-secondary/50"
          )}
        >
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate text-xl mb-1">{d.candidateName}</div>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-[0.2em]",
                  selectedDossierId === d.id ? "text-white/60" : "text-accent/40"
                )}>
                  {d.status === 'COMPLET' ? 'À STATUER' : d.status === 'OUVERT' ? 'OUVERT' : 'VALIDÉ'}
                </span>
                {d.juryDecision?.referentJury && (
                  <>
                    <span className={cn("w-1 h-1 rounded-full", selectedDossierId === d.id ? "bg-white/40" : "bg-accent/20")} />
                    <span className={cn(
                      "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                      selectedDossierId === d.id 
                        ? "bg-white/20 text-white" 
                        : "bg-secondary/10 text-secondary"
                    )}>
                      {d.juryDecision.referentJury}
                    </span>
                  </>
                )}
              </div>
            </div>
            <ChevronRight className={cn(
              "w-6 h-6 transition-transform group-hover:translate-x-2", 
              selectedDossierId === d.id ? "text-white/40" : "text-accent/10"
            )} />
          </div>
        </button>
      ))}
      {dossiers.length === 0 && (
        <div className="text-center py-20 bg-white/50 rounded-[40px] border border-dashed border-black/10">
          <p className="text-black/30 text-sm italic">Aucun dossier trouvé pour ce filtre.</p>
        </div>
      )}
    </div>
  );
}
