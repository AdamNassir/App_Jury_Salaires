import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Trash2, AlertTriangle, ShieldCheck, Users } from 'lucide-react';
import { UserProfile } from '../../types';

interface MassDeleteUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmMassDelete: (deleteRelatedDossiers: boolean) => Promise<void> | void;
  isDeleting: boolean;
  nonAdminCount: number;
  adminUsers: UserProfile[];
}

export function MassDeleteUsersModal({
  isOpen,
  onClose,
  onConfirmMassDelete,
  isDeleting,
  nonAdminCount,
  adminUsers
}: MassDeleteUsersModalProps) {
  const [deleteRelatedDossiers, setDeleteRelatedDossiers] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-2xl border border-accent/10 shadow-2xl max-w-lg w-full p-8 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
          <Trash2 className="w-7 h-7" />
        </div>

        <h3 className="text-xl font-black text-center text-secondary mb-2">
          Suppression massive des utilisateurs
        </h3>

        <p className="text-sm text-accent/70 text-center mb-5 leading-relaxed">
          Cette action va supprimer l'ensemble des collaborateurs non-administrateurs du système et mettre à jour le fichier <code className="bg-accent/5 px-1.5 py-0.5 rounded text-xs font-mono font-bold">data/users.json</code>.
        </p>

        {/* Stats box */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="p-3.5 bg-rose-50 border border-rose-200/80 rounded-xl text-center">
            <div className="flex items-center justify-center gap-1.5 text-rose-600 mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-wider">À supprimer</span>
            </div>
            <div className="text-2xl font-black text-rose-700">{nonAdminCount}</div>
            <div className="text-[11px] text-rose-600/80 mt-0.5">comptes non-admins</div>
          </div>

          <div className="p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-center">
            <div className="flex items-center justify-center gap-1.5 text-emerald-600 mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-wider">Préservés</span>
            </div>
            <div className="text-2xl font-black text-emerald-700">{adminUsers.length}</div>
            <div className="text-[11px] text-emerald-600/80 mt-0.5">administrateurs</div>
          </div>
        </div>

        {/* Admins kept preview */}
        <div className="bg-accent/[0.03] border border-accent/10 rounded-xl p-3 mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-accent/50 mb-2 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Comptes administrateurs conservés :
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {adminUsers.map(admin => (
              <span
                key={admin.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-xs"
              >
                {admin.displayName || admin.email}
              </span>
            ))}
          </div>
        </div>

        {/* Option to also delete dossiers */}
        <label className="flex items-start gap-3 p-3.5 rounded-xl bg-accent/[0.03] border border-accent/10 cursor-pointer mb-5 hover:bg-accent/[0.05] transition-colors">
          <input
            type="checkbox"
            checked={deleteRelatedDossiers}
            onChange={(e) => setDeleteRelatedDossiers(e.target.checked)}
            className="mt-0.5 rounded border-accent/30 text-rose-600 focus:ring-rose-500 cursor-pointer"
          />
          <span className="text-xs text-accent/80 leading-snug">
            Supprimer également les <strong>dossiers annuels et fiches de délibération</strong> associés aux candidats supprimés.
          </span>
        </label>

        {/* Warning banner */}
        <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 mb-6 flex items-start gap-2.5 text-left">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Cette opération est <strong>irréversible</strong>. Seuls les administrateurs ci-dessus conserveront leurs accès.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border border-accent/20 text-accent font-bold text-xs uppercase tracking-wider hover:bg-accent/5 transition-colors cursor-pointer disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={isDeleting || nonAdminCount === 0}
            onClick={() => onConfirmMassDelete(deleteRelatedDossiers)}
            className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Suppression...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Supprimer {nonAdminCount} comptes</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
