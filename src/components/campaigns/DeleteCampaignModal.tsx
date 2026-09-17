import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Campaign } from '../../types';
import { Trash2, AlertTriangle } from 'lucide-react';

interface DeleteCampaignModalProps {
  campaignToDelete: Campaign | null;
  onClose: () => void;
  onConfirmDelete: (deleteRelatedDossiers: boolean) => Promise<void> | void;
  isDeleting: boolean;
}

export function DeleteCampaignModal({
  campaignToDelete,
  onClose,
  onConfirmDelete,
  isDeleting
}: DeleteCampaignModalProps) {
  const [deleteRelatedDossiers, setDeleteRelatedDossiers] = useState(true);

  if (!campaignToDelete) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-2xl border border-accent/10 shadow-2xl max-w-md w-full p-8 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-6 h-6" />
        </div>

        <h3 className="text-xl font-black text-center text-secondary mb-2">
          Supprimer la campagne {campaignToDelete.year} ?
        </h3>

        <p className="text-sm text-accent/70 text-center mb-4 leading-relaxed">
          Êtes-vous certain de vouloir supprimer définitivement la campagne{' '}
          <strong className="text-accent">"{campaignToDelete.title}"</strong> ?
        </p>

        <div className="bg-rose-50 border border-rose-200/80 rounded-xl p-3.5 mb-5 flex items-start gap-3 text-left">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-800 leading-relaxed">
            Cette action est <strong>irréversible</strong>. La campagne sera retirée de la liste des exercices.
          </p>
        </div>

        <label className="flex items-start gap-3 p-3.5 rounded-xl bg-accent/[0.03] border border-accent/10 cursor-pointer mb-6 hover:bg-accent/[0.05] transition-colors">
          <input
            type="checkbox"
            checked={deleteRelatedDossiers}
            onChange={(e) => setDeleteRelatedDossiers(e.target.checked)}
            className="mt-0.5 rounded border-accent/30 text-rose-600 focus:ring-rose-500 cursor-pointer"
          />
          <span className="text-xs text-accent/80 leading-snug">
            Supprimer également tous les <strong>dossiers et délibérations</strong> liés à cette campagne.
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-3 rounded-xl border border-accent/20 text-sm font-bold text-accent hover:bg-accent/5 transition-colors cursor-pointer disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirmDelete(deleteRelatedDossiers)}
            disabled={isDeleting}
            className="flex-1 py-3 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? 'Suppression...' : 'Supprimer'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
