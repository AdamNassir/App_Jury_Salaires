import React from 'react';
import { Gavel, ChevronRight } from 'lucide-react';
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
          <div className="flex items-center gap-6">
            <div className={cn(
              "w-14 h-14 rounded-base flex items-center justify-center shrink-0 transition-colors shadow-inner",
              selectedDossierId === d.id ? "bg-white/10" : "bg-accent/5"
            )}>
              <Gavel className={cn("w-7 h-7", selectedDossierId === d.id ? "text-white" : "text-primary")} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate text-xl mb-1">{d.candidateName}</div>
              <div className={cn(
                "text-[10px] font-black uppercase tracking-[0.2em] mt-1",
                selectedDossierId === d.id ? "text-white/40" : "text-accent/30"
              )}>
                {d.status === 'COMPLET' ? 'À STATUER' : d.status === 'OUVERT' ? 'OUVERT' : 'VALIDÉ'}
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
