import React from 'react';
import { motion } from 'motion/react';
import { FileUp, Eye, Trash2, CheckCircle2, Loader2, CloudDownload, AlertCircle } from 'lucide-react';
import { doc, setDoc } from '../../../lib/localDatabase';
import { db } from '../../../lib/localDatabase';
import { Dossier, DossierDocument, UserProfile } from '../../../types';

interface DocumentsTabProps {
  profile: UserProfile;
  dossier?: Dossier;
  isLockedForEditing: boolean;
  handleViewDocument: (dDoc: DossierDocument) => void;
  handleImportPastYearObjectives?: () => Promise<void>;
  isImportingPastObjectives?: boolean;
  pastImportSuccessMessage?: string | null;
  pastImportErrorMessage?: string | null;
}

export function DocumentsTab({
  profile,
  dossier,
  isLockedForEditing,
  handleViewDocument,
  handleImportPastYearObjectives,
  isImportingPastObjectives,
  pastImportSuccessMessage,
  pastImportErrorMessage
}: DocumentsTabProps) {
  return (
    <motion.div key="docs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-sm font-sans">
        <div className="mb-8 border-b border-accent/10 pb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-secondary">Pièces Jointes & Import</h2>
            <div className="flex flex-wrap items-center gap-3">
            {handleImportPastYearObjectives && (
              <button
                type="button"
                onClick={handleImportPastYearObjectives}
                disabled={isImportingPastObjectives || isLockedForEditing}
                className="flex items-center gap-2.5 bg-primary text-white px-6 py-3.5 rounded-base text-sm font-bold hover:brightness-110 transition-all shadow-md cursor-pointer disabled:opacity-50"
                title="Recherche automatiquement dans le Drive d'entreprise le bilan de l'année passée pour pré-remplir les objectifs"
              >
                {isImportingPastObjectives ? (
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                ) : (
                  <CloudDownload className="w-5 h-5 shrink-0" />
                )}
                <span>{isImportingPastObjectives ? 'Recherche Drive en cours...' : 'Importer Bilan Année Passée'}</span>
              </button>
            )}
            </div>
          </div>
        </div>

        <div className="mb-6 p-4 bg-red-50 border-2 border-red-500 rounded-xl flex items-center gap-3 text-red-600 font-bold text-xs sm:text-sm shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <span>
            Cliquez sur le bouton « Importer Bilan Année Passée » ci-dessus pour récupérer automatiquement vos objectifs N-1 depuis le Google Drive de l'entreprise.
          </span>
        </div>

        {pastImportSuccessMessage && (
          <div className="mb-8 p-4 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center gap-3 text-xs text-emerald-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{pastImportSuccessMessage}</span>
          </div>
        )}

        {pastImportErrorMessage && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200/80 rounded-xl flex items-center gap-3 text-xs text-red-800">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{pastImportErrorMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {dossier?.documents?.map((dDoc, idx) => (
            <div key={idx} className="p-6 bg-accent/5 rounded-xl border border-accent/10 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-white rounded-base flex items-center justify-center text-accent/20 shrink-0">
                    <FileUp className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-accent truncate" title={dDoc.name}>{dDoc.name}</div>
                    <div className="text-[10px] text-accent/30 font-black uppercase tracking-widest">{dDoc.type}</div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {dDoc.url?.startsWith('local-file://') ? (
                    <span className="p-2 text-emerald-500 cursor-help" title="Traité avec succès">
                      <CheckCircle2 className="w-5 h-5" />
                    </span>
                  ) : (
                    <button 
                      type="button"
                      onClick={() => handleViewDocument(dDoc)} 
                      className="p-2 text-accent/40 hover:text-primary transition-colors cursor-pointer"
                      title="Visualiser / Télécharger le document"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  )}
                  {!isLockedForEditing && (
                    <button 
                      type="button"
                      onClick={() => {
                        const targetDossierId = dossier?.id || `${profile.id}_2025`;
                        const newDocs = dossier?.documents?.filter((_, i) => i !== idx) || [];
                        setDoc(doc(db, 'dossiers', targetDossierId), { documents: newDocs }, { merge: true });
                      }}
                      className="p-2 text-accent/40 hover:text-red-500 transition-colors"
                      title="Supprimer ce document"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {dDoc.name.startsWith('Bilan_Annuel') ? (
                <div className="flex items-center gap-2 bg-blue-50 text-blue-700 p-3 rounded-lg border border-blue-100/60 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Fichier PDF récapitulatif généré lors de la soumission</span>
                </div>
              ) : dDoc.fieldsPopulated ? (
                <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 p-3 rounded-lg border border-emerald-100/60 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Champs alimentés à partir du bilan importé</span>
                </div>
              ) : null}
            </div>
          ))}
          {(!dossier?.documents || dossier.documents.length === 0) && (
            <div className="col-span-2 text-center py-16 bg-accent/5 rounded-xl border-2 border-dashed border-accent/10 flex flex-col items-center justify-center gap-3">
              <CloudDownload className="w-10 h-10 text-accent/30" />
              <p className="text-accent/60 text-base font-semibold">Aucun bilan importé pour le moment.</p>
              <p className="text-accent/40 text-xs max-w-md">
                Cliquez sur le bouton <strong>« Importer Bilan Année Passée »</strong> ci-dessus pour récupérer automatiquement vos objectifs N-1 depuis le Google Drive de l'entreprise.
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
