import React from 'react';
import { motion } from 'motion/react';
import { Campaign } from '../../types';
import { ShieldAlert } from 'lucide-react';

interface CloseCampaignModalProps {
  campaignToClose: Campaign | null;
  onClose: () => void;
  onConfirmClose: () => Promise<void>;
  isClosing: boolean;
}

export function CloseCampaignModal({
  campaignToClose,
  onClose,
  onConfirmClose,
  isClosing
}: CloseCampaignModalProps) {
  if (!campaignToClose) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl border border-accent/10 shadow-2xl max-w-md w-full p-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <h3 className="text-xl font-black text-center text-secondary mb-2">
          Clôturer la campagne {campaignToClose.year} ?
        </h3>

        <p className="text-sm text-accent/60 text-center mb-6 leading-relaxed">
          Êtes-vous certain de vouloir clôturer la <strong>"{campaignToClose.title}"</strong> ? La campagne basculera en état clôturé et les dossiers associés seront verrouillés en consultation.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isClosing}
            className="flex-1 py-3 rounded-xl border border-accent/20 text-sm font-bold text-accent hover:bg-accent/5 transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirmClose}
            disabled={isClosing}
            className="flex-1 py-3 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 cursor-pointer"
          >
            {isClosing ? 'Clôture...' : 'Confirmer la clôture'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
