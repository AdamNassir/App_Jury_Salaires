import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, AlertTriangle, X, Loader2, CheckCircle2 } from 'lucide-react';

interface DeleteAllDossiersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  dossiersCount: number;
}

export function DeleteAllDossiersModal({
  isOpen,
  onClose,
  onConfirm,
  dossiersCount
}: DeleteAllDossiersModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen) return null;

  const handleExecute = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl border border-rose-200"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-black text-rose-950">
                Supprimer tous les dossiers existants
              </h3>
              <p className="text-xs text-rose-800/80 leading-relaxed">
                Action irréversible réservée aux administrateurs.
              </p>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200/80 space-y-3 text-xs text-rose-900 leading-relaxed">
            <p>
              Vous êtes sur le point de supprimer définitivement <strong>l'intégralité des dossiers ({dossiersCount} dossier(s) en base)</strong> pour toutes les campagnes et tous les collaborateurs (y compris les administrateurs).
            </p>
            <p className="font-semibold text-rose-950">
              Important : Seuls les dossiers sont supprimés. Les comptes utilisateurs, les campagnes, les documents officiels et le répertoire des liens sont intégralement conservés.
            </p>
          </div>

          <div className="mt-6 space-y-2">
            <label className="text-xs font-bold text-accent/70 block">
              Pour confirmer cette suppression, tapez <strong>SUPPRIMER</strong> ci-dessous :
            </label>
            <input
              type="text"
              placeholder="SUPPRIMER"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="w-full px-4 py-2.5 border border-accent/20 rounded-xl text-xs font-bold uppercase tracking-wider outline-none focus:border-rose-500"
            />
          </div>

          <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-accent/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-5 py-2.5 rounded-xl border border-accent/20 font-bold text-xs text-accent hover:bg-accent/5 transition-all cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={confirmText !== 'SUPPRIMER' || isDeleting}
              className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-md cursor-pointer active:scale-95"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Suppression en cours...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Confirmer la suppression totale</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
