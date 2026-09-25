import React from 'react';
import { motion } from 'motion/react';
import { Campaign } from '../../types';
import { 
  Building, 
  Users, 
  FileText, 
  Download, 
  X 
} from 'lucide-react';

interface CampaignDocsModalProps {
  campaign: Campaign | null;
  onClose: () => void;
}

export function CampaignDocsModal({ campaign, onClose }: CampaignDocsModalProps) {
  if (!campaign) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl border border-accent/10 shadow-2xl max-w-2xl w-full p-8 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-accent/10 mb-6">
          <div>
            <h3 className="text-xl font-extrabold text-secondary">
              Documents de la campagne - {campaign.title}
            </h3>
            <p className="text-xs text-accent/50 font-bold uppercase tracking-wider">
              Exercice {campaign.year}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-accent/40 hover:text-accent rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* RH Docs */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-primary mb-3 flex items-center gap-2">
              <Building className="w-4 h-4" />
              Documents RH ({campaign.rhDocuments?.length || 0})
            </h4>
            {campaign.rhDocuments && campaign.rhDocuments.length > 0 ? (
              <div className="space-y-2">
                {campaign.rhDocuments.map(f => (
                  <div key={f.id} className="p-3 bg-accent/5 rounded-xl border border-accent/10 flex items-center justify-between text-xs font-bold">
                    <span className="truncate">{f.name}</span>
                    <a href={f.url} download={f.name} className="p-1 text-primary hover:underline flex items-center gap-1">
                      <Download className="w-4 h-4" /> Télécharger
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-accent/40 italic">Aucun document RH attaché.</p>
            )}
          </div>

          {/* Pairs Docs */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-primary mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Document de gestion des Pairs ({campaign.pairsDocuments?.length || 0})
            </h4>
            {campaign.pairsDocuments && campaign.pairsDocuments.length > 0 ? (
              <div className="space-y-2">
                {campaign.pairsDocuments.map(f => (
                  <div key={f.id} className="p-3 bg-accent/5 rounded-xl border border-accent/10 flex items-center justify-between text-xs font-bold">
                    <span className="truncate">{f.name}</span>
                    <a href={f.url} download={f.name} className="p-1 text-primary hover:underline flex items-center gap-1">
                      <Download className="w-4 h-4" /> Télécharger
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-accent/40 italic">Aucun document de gestion des pairs attaché.</p>
            )}
          </div>

          {/* Other Docs */}
          {campaign.otherDocuments && campaign.otherDocuments.length > 0 && (
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-accent/60 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Autres documents ({campaign.otherDocuments.length})
              </h4>
              <div className="space-y-2">
                {campaign.otherDocuments.map(f => (
                  <div key={f.id} className="p-3 bg-accent/5 rounded-xl border border-accent/10 flex items-center justify-between text-xs font-bold">
                    <span className="truncate">{f.name}</span>
                    <a href={f.url} download={f.name} className="p-1 text-primary hover:underline flex items-center gap-1">
                      <Download className="w-4 h-4" /> Télécharger
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 pt-4 border-t border-accent/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-accent text-white font-bold text-xs hover:brightness-110 cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </motion.div>
    </div>
  );
}
