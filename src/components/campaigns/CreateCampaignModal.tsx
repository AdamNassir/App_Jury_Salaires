import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CampaignFile } from '../../types';
import { 
  Plus, 
  X, 
  Building, 
  FileUp, 
  FileText, 
  Trash2, 
  Users, 
  Info, 
  CheckCircle2 
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingYears: number[];
  onCreateCampaign: (campaignData: {
    year: number;
    title: string;
    description: string;
    rhDocuments: CampaignFile[];
    pairsDocuments: CampaignFile[];
    otherDocuments: CampaignFile[];
  }) => Promise<void>;
  onShowToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function CreateCampaignModal({
  isOpen,
  onClose,
  existingYears,
  onCreateCampaign,
  onShowToast
}: CreateCampaignModalProps) {
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear() + 1);
  const [newTitle, setNewTitle] = useState<string>(`Campagne Annuelle ${new Date().getFullYear() + 1}`);
  const [newDescription, setNewDescription] = useState<string>('');

  const [rhFiles, setRhFiles] = useState<CampaignFile[]>([]);
  const [pairsFiles, setPairsFiles] = useState<CampaignFile[]>([]);
  const [otherFiles, setOtherFiles] = useState<CampaignFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    category: 'RH_EFFECTIFS' | 'PAIRS_CONFIG' | 'AUTRE',
    setter: React.Dispatch<React.SetStateAction<CampaignFile[]>>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const fileObj: CampaignFile = {
          id: uuidv4(),
          name: file.name,
          category,
          url: reader.result as string,
          size: file.size,
          uploadedAt: new Date().toISOString()
        };
        setter(prev => [...prev, fileObj]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeFile = (
    id: string, 
    setter: React.Dispatch<React.SetStateAction<CampaignFile[]>>
  ) => {
    setter(prev => prev.filter(f => f.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYear || !newTitle.trim()) {
      onShowToast('error', "L'année et le titre de la campagne sont obligatoires.");
      return;
    }

    if (existingYears.includes(Number(newYear))) {
      onShowToast('error', `Une campagne existe déjà pour l'année ${newYear}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateCampaign({
        year: Number(newYear),
        title: newTitle.trim(),
        description: newDescription.trim() || `Campagne de jury des salaires pour l'année ${newYear}.`,
        rhDocuments: rhFiles,
        pairsDocuments: pairsFiles,
        otherDocuments: otherFiles
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl border border-accent/10 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-8 lg:p-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-6 border-b border-accent/10 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-secondary">Créer une Campagne de Jury</h3>
              <p className="text-xs font-bold uppercase tracking-wider text-accent/40">Initialisation & Dépôt des Fichiers RH / Pairs</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-accent/40 hover:text-accent rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-accent/60 mb-2">
                Année de la campagne *
              </label>
              <input
                type="number"
                required
                min={2020}
                max={2100}
                value={newYear}
                onChange={(e) => {
                  const yr = Number(e.target.value);
                  setNewYear(yr);
                  setNewTitle(`Campagne Annuelle ${yr}`);
                }}
                className="w-full px-4 py-3 bg-accent/5 border border-accent/10 rounded-xl font-bold text-secondary text-lg focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-black uppercase tracking-wider text-accent/60 mb-2">
                Titre de la campagne *
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="ex: Campagne Annuelle 2026"
                className="w-full px-4 py-3 bg-accent/5 border border-accent/10 rounded-xl font-bold text-secondary text-base focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-accent/60 mb-2">
              Description & Cadrage de la campagne
            </label>
            <textarea
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Objectifs, périmètre et instructions particulières pour ce jury..."
              className="w-full px-4 py-3 bg-accent/5 border border-accent/10 rounded-xl text-sm font-medium text-secondary focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* Section 1: Documents RH */}
          <div className="p-6 bg-accent/5 rounded-xl border border-accent/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-secondary font-bold text-base">
                <Building className="w-5 h-5 text-primary" />
                1. Documents RH (Mise à jour des effectifs entreprise)
              </div>
              <span className="text-xs text-accent/50 font-medium">Excel, PDF, CSV</span>
            </div>

            <p className="text-xs text-accent/60">
              Déposez ici les fichiers RH d'entreprise afin d'actualiser la liste des collaborateurs, équipes et matricules.
            </p>

            <label className="block border-2 border-dashed border-accent/20 hover:border-primary bg-white p-6 rounded-xl text-center cursor-pointer transition-colors">
              <FileUp className="w-8 h-8 text-primary mx-auto mb-2 opacity-60" />
              <span className="text-sm font-bold text-primary">Parcourir les fichiers RH</span>
              <span className="text-xs text-accent/40 block mt-1">Glissez-déposez ou cliquez ici</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e, 'RH_EFFECTIFS', setRhFiles)}
              />
            </label>

            {rhFiles.length > 0 && (
              <div className="space-y-2 pt-2">
                {rhFiles.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-accent/10 text-xs font-semibold">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-accent/40">({formatFileSize(f.size)})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(f.id, setRhFiles)}
                      className="p-1 text-accent/40 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Document de gestion des Pairs */}
          <div className="p-6 bg-accent/5 rounded-xl border border-accent/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-secondary font-bold text-base">
                <Users className="w-5 h-5 text-primary" />
                2. Document de gestion des Pairs (Evaluations & Candidats à juger)
              </div>
              <span className="text-xs text-accent/50 font-medium">Excel, CSV, PDF</span>
            </div>

            <p className="text-xs text-accent/60">
              Déposez les retours de l'espace Candidat et le document de configuration des profils Pairs avec la liste des candidats à attribuer aux consultants/pairs.
            </p>

            <label className="block border-2 border-dashed border-accent/20 hover:border-primary bg-white p-6 rounded-xl text-center cursor-pointer transition-colors">
              <FileUp className="w-8 h-8 text-primary mx-auto mb-2 opacity-60" />
              <span className="text-sm font-bold text-primary">Parcourir les fichiers Pairs & Candidats</span>
              <span className="text-xs text-accent/40 block mt-1">Glissez-déposez ou cliquez ici</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e, 'PAIRS_CONFIG', setPairsFiles)}
              />
            </label>

            {pairsFiles.length > 0 && (
              <div className="space-y-2 pt-2">
                {pairsFiles.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-accent/10 text-xs font-semibold">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-accent/40">({formatFileSize(f.size)})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(f.id, setPairsFiles)}
                      className="p-1 text-accent/40 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Autres documents d'initialisation */}
          <div className="p-6 bg-accent/5 rounded-xl border border-accent/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-secondary font-bold text-base">
                <FileText className="w-5 h-5 text-accent/60" />
                3. Autres documents d'initialisation (Optionnel)
              </div>
            </div>

            <label className="block border-2 border-dashed border-accent/20 hover:border-primary bg-white p-4 rounded-xl text-center cursor-pointer transition-colors">
              <span className="text-xs font-bold text-accent">Ajouter des documents complémentaires</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e, 'AUTRE', setOtherFiles)}
              />
            </label>

            {otherFiles.length > 0 && (
              <div className="space-y-2 pt-2">
                {otherFiles.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-accent/10 text-xs font-semibold">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-accent/60 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-accent/40">({formatFileSize(f.size)})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(f.id, setOtherFiles)}
                      className="p-1 text-accent/40 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Informational banner */}
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl flex items-start gap-3 text-xs text-sky-800 font-medium">
            <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <strong>Note de structure :</strong> La campagne et ses documents d'initialisation seront sauvegardés dans le système. La logique spécifique de parsing et de mise à jour automatique des profils s'appliquera lors des prochaines étapes.
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 pt-4 border-t border-accent/10">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-xl border border-accent/20 font-bold text-sm text-accent hover:bg-accent/5 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20 flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Initialisation...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Initialiser & Lancer la Campagne
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
