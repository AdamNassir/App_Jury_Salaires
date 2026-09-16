import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileUp, Eye, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { doc, setDoc } from '../../../lib/localDatabase';
import { db } from '../../../lib/localDatabase';
import { Dossier, DossierDocument, UserProfile } from '../../../types';
import { cn } from '../../../lib/utils';

interface DocumentsTabProps {
  profile: UserProfile;
  dossier?: Dossier;
  isDragging: boolean;
  isObjectParsing: boolean;
  isLockedForEditing: boolean;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => Promise<void>;
  handleViewDocument: (dDoc: DossierDocument) => void;
}

export function DocumentsTab({
  profile,
  dossier,
  isDragging,
  isObjectParsing,
  isLockedForEditing,
  handleFileSelect,
  handleDragOver,
  handleDragEnter,
  handleDragLeave,
  handleDrop,
  handleViewDocument
}: DocumentsTabProps) {
  return (
    <motion.div key="docs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-sm font-sans">
        <input 
          id="file-upload"
          type="file" 
          onChange={(e) => {
            handleFileSelect(e);
            e.target.value = '';
          }} 
          accept=".pdf,.docx" 
          className="hidden" 
        />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <h2 className="text-secondary">Pièces Jointes & Import</h2>
          <div className="flex flex-wrap gap-3">
            <label 
              htmlFor="file-upload"
              className="flex items-center gap-3 bg-accent text-white px-6 py-3 rounded-base text-sm font-bold hover:brightness-110 transition-all shadow-md cursor-pointer"
            >
              <FileUp className="w-5 h-5" /> Sélectionner un Bilan (.docx, .pdf)
            </label>
          </div>
        </div>
        <p className="text-xl text-accent/40 mb-8 pb-6 border-b border-accent/10 font-light italic">
          Ajoutez vos justificatifs ou déposez votre document de bilan annuel (format PDF ou Word) pour remplir automatiquement tous les champs de votre dossier candidat.
        </p>

        {/* Bannière Étape 1 intégrée dans l'onglet */}
        {(!dossier?.documents || dossier.documents.length === 0) && !isLockedForEditing && (
          <div className="mb-8 p-6 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-2xl border border-primary/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary text-white rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
                <FileUp className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
                    Recommandé
                  </span>
                  <span className="text-xs text-accent/40 font-medium">Pré-remplissage intelligent par IA</span>
                </div>
                <h3 className="text-base font-bold text-accent mt-1">Déposez votre Bilan Annuel (.pdf ou .docx)</h3>
                <p className="text-xs text-accent/60 mt-1 max-w-2xl font-light">
                  Notre intelligence artificielle analyse votre document pour pré-remplir instantanément vos objectifs, réalisations et compétences. Vous pourrez ensuite réviser chaque section à votre convenance.
                </p>
              </div>
            </div>
          </div>
        )}

        {dossier?.documents && dossier.documents.length > 0 && (
          <div className="mb-8 p-4 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center gap-3 text-xs text-emerald-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>
              <strong>Bilan importé avec succès :</strong> Votre dossier a été pré-rempli. Vous pouvez déposer un nouveau document ci-dessous pour réactualiser les données, ou affiner chaque section dans le menu de gauche.
            </span>
          </div>
        )}

        {/* Zone de Drag and Drop interactive */}
        <label 
          htmlFor="file-upload"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "mb-12 p-10 border-2 border-dashed rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-4 select-none",
            isDragging 
              ? "border-primary bg-primary/5 scale-[1.01]" 
              : "border-accent/10 hover:border-primary/40 bg-accent/5 hover:bg-primary/5"
          )}
        >
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm text-primary pointer-events-none">
            <FileUp className="w-8 h-8" />
          </div>
          <div className="pointer-events-none">
            <h3 className="text-base font-bold text-accent mb-1">
              Glissez-déposez votre bilan annuel (.pdf, .docx) ici
            </h3>
            <p className="text-xs text-accent/40">
              Ou cliquez pour parcourir vos fichiers locaux. Gemini extraira et complétera votre dossier instantanément !
            </p>
          </div>
        </label>

        {/* Animation et information de chargement par IA */}
        <AnimatePresence>
          {isObjectParsing && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-10 p-6 bg-primary/10 border border-primary/20 rounded-xl flex items-center gap-6 overflow-hidden"
            >
              <Loader2 className="w-8 h-8 animate-spin text-primary shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-primary mb-1">Analyse intelligente en cours par Gemini...</h4>
                <p className="text-xs text-accent/60">
                  Notre intelligence artificielle analyse votre bilan de promotion pour en extraire vos objectifs, compétences clés, synthèses d'activité et réalisations afin de compléter l'intégralité du dossier. Veuillez patienter...
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                    <span className="p-2 text-emerald-500 cursor-help" title="Traité avec succès par l'intelligence artificielle localement">
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
                  <span>Champs alimentés à partir de la pièce jointe chargée</span>
                </div>
              ) : null}
            </div>
          ))}
          {(!dossier?.documents || dossier.documents.length === 0) && (
            <div className="col-span-2 text-center py-20 bg-accent/5 rounded-xl border-2 border-dashed border-accent/10">
              <p className="text-accent/30 text-lg font-light italic">Aucun document déposé pour le moment.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
