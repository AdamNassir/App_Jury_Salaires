import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, ExternalLink, FileSpreadsheet, CloudSun, AlertCircle, Copy, Check } from 'lucide-react';
import { ClientFeedback } from '../../../types';

interface MeteosTabProps {
  meteoLinks?: string[];
  setMeteoLinks?: React.Dispatch<React.SetStateAction<string[]>>;
  // Props de rétrocompatibilité
  feedbacks?: ClientFeedback[];
  setFeedbacks?: React.Dispatch<React.SetStateAction<ClientFeedback[]>>;
  meteoSubTab?: 'LIST' | 'CHART';
  setMeteoSubTab?: (tab: 'LIST' | 'CHART') => void;
  selectedMeteoIndex?: number | null;
  setSelectedMeteoIndex?: (index: number | null) => void;
}

function getValidUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to execCommand
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    textArea.remove();
    return successful;
  } catch {
    return false;
  }
}

export function MeteosTab({
  meteoLinks = [],
  setMeteoLinks,
  feedbacks = []
}: MeteosTabProps) {
  const [newLinkInput, setNewLinkInput] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Rassemble les liens météos du profil (colonne Q de Vues_Meteo + éventuels liens antérieurs)
  const allMeteoLinks = Array.from(
    new Set([
      ...(meteoLinks || []),
      ...feedbacks.flatMap(f => [
        ...(f.liensMeteo ? [f.liensMeteo] : []),
        ...(f.fileUrl ? [f.fileUrl] : [])
      ])
    ].filter(Boolean))
  );

  const handleOpenAndCopy = async (link: string, idx: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const validUrl = getValidUrl(link);
    
    // 1. Toujours copier l'URL dans le presse-papier
    await copyToClipboard(validUrl || link);
    setCopiedIndex(idx);
    setTimeout(() => {
      setCopiedIndex(prev => (prev === idx ? null : prev));
    }, 3000);

    // 2. Tenter d'ouvrir l'URL dans un nouvel onglet externe
    try {
      window.open(validUrl, '_blank', 'noopener,noreferrer');
    } catch {
      // Ignoré si restreint par l'iframe
    }
  };

  const handleCopyOnly = async (link: string, idx: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const validUrl = getValidUrl(link);
    await copyToClipboard(validUrl || link);
    setCopiedIndex(idx);
    setTimeout(() => {
      setCopiedIndex(prev => (prev === idx ? null : prev));
    }, 3000);
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newLinkInput.trim();
    if (!trimmed) return;

    if (setMeteoLinks) {
      setMeteoLinks(prev => Array.from(new Set([...(prev || []), trimmed])));
    }
    setNewLinkInput('');
    setShowAddForm(false);
  };

  const handleRemoveLink = (linkToRemove: string) => {
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <CloudSun className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-accent">Météos Client</h2>
              <p className="text-xs text-accent/50 font-normal mt-0.5">
                Fiches et retours météo client associés à votre profil (issus de la colonne Q du fichier Vues_Meteos)
              </p>
            </div>
          </div>

          {setMeteoLinks && !showAddForm && (
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
                const validUrl = getValidUrl(link);
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
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-accent">Météo {idx + 1}</span>
                          <span className="text-[10px] text-accent/40 font-mono">#{idx + 1}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <a
                            href={validUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyOnly(link, idx);
                            }}
                            className="text-xs font-mono text-primary hover:text-secondary hover:underline break-all select-all inline-flex items-center gap-1.5 transition-colors cursor-pointer text-left"
                            title="Ouvrir le lien dans un nouvel onglet"
                          >
                            <span>{link}</span>
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
                        onClick={(e) => handleCopyOnly(link, idx, e)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          copiedIndex === idx
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'bg-white border-accent/20 text-accent/80 hover:bg-accent/5 hover:text-accent'
                        }`}
                        title="Copier l'URL dans le presse-papier"
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
                          handleCopyOnly(link, idx);
                        }}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
                          copiedIndex === idx
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-primary text-white hover:brightness-110'
                        }`}
                        title="Ouvrir la fiche météo dans un nouvel onglet"
                      >
                        {copiedIndex === idx ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Lien copié !</span>
                          </>
                        ) : (
                          <>
                            <span>Ouvrir la fiche météo</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </>
                        )}
                      </a>
                      {setMeteoLinks && (
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
