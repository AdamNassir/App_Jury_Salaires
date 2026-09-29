import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FileUp, Eye, Trash2, CheckCircle2, Loader2, CloudDownload, AlertCircle, Upload } from 'lucide-react';
import { doc, setDoc } from '../../../lib/localDatabase';
import { db } from '../../../lib/localDatabase';
import { Dossier, DossierDocument, UserProfile } from '../../../types';
import { cn } from '../../../lib/utils';

interface DocumentsTabProps {
  profile: UserProfile;
  dossier?: Dossier;
  isLockedForEditing: boolean;
  handleViewDocument: (dDoc: DossierDocument) => void;
  handleImportPastYearObjectives?: () => Promise<void>;
  isImportingPastObjectives?: boolean;
  handleManualDepositBilanN1?: (file: File) => Promise<void>;
  isManualDepositingBilan?: boolean;
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
  handleManualDepositBilanN1,
  isManualDepositingBilan,
  pastImportSuccessMessage,
  pastImportErrorMessage
}: DocumentsTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <motion.div key="docs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-sm font-sans">
        <div className="mb-8 border-b border-accent/10 pb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-secondary text-2xl font-bold">Pièces Jointes & Import</h2>
              <p className="text-xs text-accent/60 mt-1">
                Gérez vos documents justificatifs et importez votre Bilan Annuel N-1 pour remplir vos objectifs.
              </p>
            </div>
            <div id="link_drive_evaluation_n1" className="flex flex-wrap items-center gap-3 transition-all rounded-lg p-1">
              {handleImportPastYearObjectives && (
                <button
                  type="button"
                  onClick={handleImportPastYearObjectives}
                  disabled={isImportingPastObjectives || isManualDepositingBilan || isLockedForEditing}
                  className="flex items-center gap-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 px-5 py-3 rounded-base text-sm font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  title="Recherche automatiquement dans le Drive d'entreprise le bilan de l'année passée pour pré-remplir les objectifs"
                >
                  {isImportingPastObjectives ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <CloudDownload className="w-4 h-4 shrink-0" />
                  )}
                  <span>{isImportingPastObjectives ? 'Recherche Drive...' : 'Importer depuis Drive'}</span>
                </button>
              )}
              {handleManualDepositBilanN1 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isManualDepositingBilan || isImportingPastObjectives || isLockedForEditing}
                  className="flex items-center gap-2.5 bg-primary text-white px-5 py-3 rounded-base text-sm font-bold hover:brightness-110 transition-all shadow-md cursor-pointer disabled:opacity-50"
                  title="Déposer manuellement le fichier Bilan Annuel N-1 (.docx, .pdf) pour extraire les objectifs"
                >
                  {isManualDepositingBilan ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Upload className="w-4 h-4 shrink-0" />
                  )}
                  <span>{isManualDepositingBilan ? 'Extraction en cours...' : 'Déposer Bilan N-1'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Zone de glisser-déposer pour le Bilan N-1 */}
        {handleManualDepositBilanN1 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (isLockedForEditing || isManualDepositingBilan) return;
              const file = e.dataTransfer.files?.[0];
              if (file) {
                handleManualDepositBilanN1(file);
              }
            }}
            onClick={() => {
              if (!isLockedForEditing && !isManualDepositingBilan) {
                fileInputRef.current?.click();
              }
            }}
            className={cn(
              "mb-6 p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-3",
              isDragging
                ? "border-primary bg-primary/10 shadow-md scale-[1.01]"
                : "border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50",
              (isLockedForEditing || isManualDepositingBilan) && "opacity-60 cursor-not-allowed"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.doc,.pdf,.xlsx,.json,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && handleManualDepositBilanN1) {
                  handleManualDepositBilanN1(file);
                }
                e.target.value = '';
              }}
            />
            <div className="w-12 h-12 rounded-full bg-white shadow-xs flex items-center justify-center text-primary">
              {isManualDepositingBilan ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              ) : (
                <Upload className="w-6 h-6 text-primary" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-secondary">
                {isManualDepositingBilan
                  ? "Analyse du document et extraction des objectifs N-1 en cours..."
                  : "Déposer manuellement votre Bilan Annuel N-1"}
              </p>
              <p className="text-xs text-accent/70 max-w-lg">
                Glissez-déposez ici votre document Word (<strong>.docx</strong>), PDF (<strong>.pdf</strong>) ou JSON pour extraire automatiquement vos <strong>« Objectifs Année Passée »</strong>.
              </p>
            </div>
          </div>
        )}

        <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3 text-secondary text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-primary mt-0.5" />
          <span>
            Pour renseigner vos <strong>Objectifs Année Passée</strong>, vous pouvez soit utiliser le bouton <strong>« Importer depuis Drive »</strong> (recherche automatique dans Google Drive), soit <strong>glisser-déposer directement votre fichier</strong> de Bilan N-1 dans la zone ci-dessus.
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
