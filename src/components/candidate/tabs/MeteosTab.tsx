import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, ExternalLink, FileSpreadsheet, AlertCircle, Copy, Check, Calendar } from 'lucide-react';
import { ClientFeedback, Dossier } from '../../../types';
import { extractPlainTextUrl, getValidUrl, copyPlainTextToClipboard } from '../../../utils/urlUtils';

interface MeteosTabProps {
  meteoLinks?: string[];
  setMeteoLinks?: React.Dispatch<React.SetStateAction<string[]>>;
  dossier?: Dossier;
  // Props de rétrocompatibilité
  feedbacks?: ClientFeedback[];
  setFeedbacks?: React.Dispatch<React.SetStateAction<ClientFeedback[]>>;
  meteoSubTab?: 'LIST' | 'CHART';
  setMeteoSubTab?: (tab: 'LIST' | 'CHART') => void;
  selectedMeteoIndex?: number | null;
  setSelectedMeteoIndex?: (index: number | null) => void;
  isLockedForEditing?: boolean;
}

export function MeteosTab({
  meteoLinks = [],
  setMeteoLinks,
  dossier,
  feedbacks = [],
  isLockedForEditing = false
}: MeteosTabProps) {
  const [newLinkInput, setNewLinkInput] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const getMeteoDate = (linkUrl: string): string | undefined => {
    const clean = extractPlainTextUrl(linkUrl).toLowerCase();
    if (!clean) return undefined;

    // 1. Depuis dossier.meteoDetails (rempli lors de l'initialisation de campagne)
    const detail = dossier?.meteoDetails?.find(
      d => extractPlainTextUrl(d.link).toLowerCase() === clean
    );
    if (detail?.date) return detail.date;

    // 2. Depuis dossier.referentData?.meteos (colonne F de Vue_Meteo)
    const refMeteo = dossier?.referentData?.meteos?.find(m => {
      const l1 = extractPlainTextUrl(m.lienMeteo || '').toLowerCase();
      const l2 = extractPlainTextUrl(m.id || '').toLowerCase();
      return (l1 && (l1 === clean || clean.includes(l1) || l1.includes(clean))) ||
             (l2 && (l2 === clean || clean.includes(l2) || l2.includes(clean)));
    });
    if (refMeteo?.dateMeteo) return refMeteo.dateMeteo;

    // 3. Depuis feedbacks clients
    const fb = feedbacks.find(f => {
      const fl = extractPlainTextUrl(f.liensMeteo || f.fileUrl || '').toLowerCase();
      return fl && (fl === clean || clean.includes(fl) || fl.includes(clean));
    });
    if (fb?.realizationDate) return fb.realizationDate;

    return undefined;
  };

  // Rassemble les liens météos du profil (colonne Q de Vues_Meteo + éventuels liens antérieurs)
  const allMeteoLinks = Array.from(
    new Set([
      ...(meteoLinks || []),
      ...feedbacks.flatMap(f => [
        ...(f.liensMeteo ? [f.liensMeteo] : []),
        ...(f.fileUrl ? [f.fileUrl] : [])
      ])
    ].map(l => extractPlainTextUrl(l)).filter(Boolean))
  );

  const handleCopyOnly = async (link: string, idx: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const plainText = extractPlainTextUrl(link);
    const validUrl = getValidUrl(plainText);
    await copyPlainTextToClipboard(plainText || validUrl);
    setCopiedIndex(idx);
    setTimeout(() => {
      setCopiedIndex(prev => (prev === idx ? null : prev));
    }, 3000);
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedForEditing) return;
    const cleaned = extractPlainTextUrl(newLinkInput);
    if (!cleaned) return;

    if (setMeteoLinks) {
      setMeteoLinks(prev => Array.from(new Set([...(prev || []), cleaned])));
    }
    setNewLinkInput('');
    setShowAddForm(false);
  };

  const handleRemoveLink = (linkToRemove: string) => {
    if (isLockedForEditing) return;
    if (setMeteoLinks) {
      setMeteoLinks(prev => (prev || []).filter(l => l !== linkToRemove));
    }
  };

  return (
    <motion.div
      key="meteos"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      <div className="bg-white p-8 md:p-12 rounded-xl border border-accent/10 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-accent/10 pb-6">
          <h2 className="text-secondary">Météos Client</h2>

          {!isLockedForEditing && setMeteoLinks && !showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 bg-secondary text-white px-5 py-2.5 rounded-lg text-xs font-bold hover:brightness-110 transition-all shadow-sm shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Ajouter un lien
            </button>
          )}
        </div>

        {/* Formulaire simple d'ajout manuel de lien si nécessaire */}
        {showAddForm && (
          <form onSubmit={handleAddLink} className="mb-8 p-5 bg-accent/5 rounded-xl border border-accent/10 space-y-3">
            <label className="block text-xs font-bold text-accent">
              Ajouter un lien de fiche météo :
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newLinkInput}
                onChange={e => setNewLinkInput(e.target.value)}
                placeholder="https://... ou identifiant du document"
                className="flex-1 px-4 py-2.5 bg-white border border-accent/20 rounded-lg text-xs text-accent placeholder:text-accent/30 focus:outline-none focus:border-secondary"
                autoFocus
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="submit"
                  disabled={!newLinkInput.trim()}
                  className="px-4 py-2.5 bg-secondary text-white rounded-lg text-xs font-bold hover:brightness-110 transition-all disabled:opacity-40 cursor-pointer"
                >
                  Valider
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewLinkInput('');
                  }}
                  className="px-4 py-2.5 bg-accent/10 text-accent rounded-lg text-xs font-bold hover:bg-accent/20 transition-all cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Liste des liens météo */}
        {allMeteoLinks.length > 0 ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between text-xs text-accent/60 font-medium pb-2 border-b border-accent/5">
              <span>{allMeteoLinks.length} fiche{allMeteoLinks.length > 1 ? 's' : ''} météo disponible{allMeteoLinks.length > 1 ? 's' : ''}</span>
              <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full uppercase">
                Colonne Q · Vues_Meteos
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {allMeteoLinks.map((link, idx) => {
                const plainTextUrl = extractPlainTextUrl(link);
                const validUrl = getValidUrl(plainTextUrl);
                const meteoDate = getMeteoDate(link);
                return (
                  <div
                    key={idx}
                    className="p-5 bg-accent/[0.02] hover:bg-accent/[0.04] border border-accent/10 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-white border border-accent/10 flex items-center justify-center text-primary shrink-0 shadow-2xs">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-accent">Météo {idx + 1}</span>
                          <span className="text-[10px] text-accent/40 font-mono">#{idx + 1}</span>
                          {meteoDate && (
                            <span className="text-[11px] font-semibold text-accent/80 bg-accent/5 border border-accent/10 px-2 py-0.5 rounded-md inline-flex items-center gap-1.5 shadow-2xs">
                              <Calendar className="w-3 h-3 text-primary shrink-0" />
                              <span>{meteoDate}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <a
                            href={validUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="text-xs font-mono text-primary hover:text-secondary hover:underline break-all select-all inline-flex items-center gap-1.5 transition-colors cursor-pointer text-left"
                            title="Ouvrir le lien dans un nouvel onglet"
                          >
                            <span>{plainTextUrl || link}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                          </a>
                          {copiedIndex === idx && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full shrink-0 animate-in fade-in duration-150">
                              <Check className="w-3 h-3" /> Copié !
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleCopyOnly(plainTextUrl, idx, e)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          copiedIndex === idx
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'bg-white border-accent/20 text-accent/80 hover:bg-accent/5 hover:text-accent'
                        }`}
                        title="Copier le lien en texte brut dans le presse-papier"
                      >
                        {copiedIndex === idx ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copié</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-accent/60" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>

                      <a
                        href={validUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer bg-primary text-white hover:brightness-110"
                        title="Ouvrir la fiche météo dans un nouvel onglet"
                      >
                        <span>Ouvrir la fiche météo</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {!isLockedForEditing && setMeteoLinks && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLink(link)}
                          className="p-2 text-accent/30 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Supprimer ce lien"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-12 border border-dashed border-accent/15 rounded-xl text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-accent/5 flex items-center justify-center mx-auto text-accent/40">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-accent">Aucune météo client rattachée</h3>
            <p className="text-xs text-accent/60 max-w-md mx-auto">
              Aucun lien de météo n'a été trouvé dans le fichier Vues_Meteos pour votre profil. Vous pouvez en ajouter un manuellement à l'aide du bouton « Ajouter un lien ».
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
