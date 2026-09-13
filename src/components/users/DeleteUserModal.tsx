import React from 'react';
import { motion } from 'motion/react';
import { UserProfile } from '../../types';
import { Trash2 } from 'lucide-react';

interface DeleteUserModalProps {
  userToDelete: UserProfile | null;
  onClose: () => void;
  onConfirmDelete: () => Promise<void>;
  isDeleting: boolean;
}

export function DeleteUserModal({
  userToDelete,
  onClose,
  onConfirmDelete,
  isDeleting
}: DeleteUserModalProps) {
  if (!userToDelete) return null;

  return (
    <div className="fixed inset-0 bg-accent/60 backdrop-blur-sm flex items-center justify-center p-6 z-[60]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl border border-accent/10 shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center gap-4">
          <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center text-white shadow-md">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-rose-700">Supprimer l'utilisateur</h3>
            <p className="text-[9px] text-rose-500 uppercase tracking-widest font-black mt-0.5">Confirmation requise</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-accent/80 leading-relaxed">
            Êtes-vous sûr de vouloir supprimer définitivement l'utilisateur <strong className="text-accent">{userToDelete.displayName || userToDelete.email}</strong> ?
          </p>
          <p className="text-xs text-accent/40 bg-accent/5 p-4 rounded-xl border border-accent/5 leading-relaxed">
            Cette action est <strong>irréversible</strong>. Elle supprimera également son dossier annuel, ses documents, et réorganisera toutes ses assignations de dossiers ou de consultants.
          </p>
        </div>

        {/* Footer */}
        <div className="p-6 bg-accent/5 border-t border-accent/5 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-5 py-3 border border-accent/10 text-accent/60 hover:text-accent hover:bg-accent/5 rounded-base text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirmDelete}
            className="px-6 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2 cursor-pointer"
          >
            {isDeleting ? "Suppression..." : "Supprimer définitivement"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
