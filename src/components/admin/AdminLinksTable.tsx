import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AppLinkItem, 
  AppLinksService 
} from '../../services/appLinksService';
import { 
  exportAppLinksToGoogleSheet, 
  APP_LINKS_SPREADSHEET_URL 
} from '../../services/googleSheetsService';
import { UserProfile } from '../../types';
import { 
  Link as LinkIcon, 
  ExternalLink, 
  Copy, 
  Check, 
  Edit2, 
  Plus, 
  Trash2, 
  Eraser,
  Search, 
  RotateCcw, 
  X, 
  Save, 
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Navigation,
  Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface AdminLinksTableProps {
  currentUser?: UserProfile | null;
  onNavigate?: (view: 'CANDIDATE' | 'EVALUATIONS' | 'JURY' | 'CAMPAIGNS' | 'ADMIN', tab?: string, linkId?: string) => void;
}

export function AdminLinksTable({ currentUser, onNavigate }: AdminLinksTableProps) {
  const [links, setLinks] = useState<AppLinkItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLibelle, setEditLibelle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppLinkItem | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newLibelle, setNewLibelle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState<AppLinkItem['category']>('CANDIDAT');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  useEffect(() => {
    const sync = () => {
      setLinks(AppLinksService.getLinks());
    };
    sync();
    return AppLinksService.subscribe(sync);
  }, []);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  const handleStartEdit = (item: AppLinkItem) => {
    setEditingId(item.id);
    setEditLibelle(item.libelle);
    setEditUrl(item.url);
  };

  const handleSaveEdit = (id: string) => {
    AppLinksService.updateLink(id, {
      libelle: editLibelle.trim(),
      url: editUrl.trim()
    });
    setEditingId(null);
    showToast('Lien mis à jour avec succès');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleCopyUrl = (url: string, id: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast('URL copiée dans le presse-papier');
  };

  const handleExportToGoogleSheets = async () => {
    setIsExporting(true);
    try {
      const linksToExport = filteredLinks.length > 0 ? filteredLinks : links;
      const result = await exportAppLinksToGoogleSheet(linksToExport);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
      showToast(`${result.rowsExported} liens exportés avec succès vers Google Sheets !`);
    } catch (err: any) {
      console.error('Export error:', err);
      showToast(err.message || "Erreur lors de l'export vers Google Sheets", 'info');
    } finally {
      setIsExporting(false);
    }
  };

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLibelle.trim()) return;

    AppLinksService.addLink({
      libelle: newLibelle.trim(),
      url: newUrl.trim(),
      category: newCategory,
      appLocation: 'Ajout manuel Admin',
      inAppAccessType: 'CLICKABLE',
      inAppDetails: 'Ajouté manuellement par un administrateur'
    });

    setNewLibelle('');
    setNewUrl('');
    setIsAddModalOpen(false);
    showToast('Nouveau lien ajouté au répertoire');
  };

  const handleClearUrl = (id: string) => {
    AppLinksService.clearLinkUrl(id);
    setDeleteTarget(null);
    showToast("L'hyperlien a été effacé (URL vidée)");
  };

  const handleConfirmDelete = (id: string) => {
    AppLinksService.deleteLink(id);
    setDeleteTarget(null);
    showToast('Lien supprimé du répertoire');
  };

  const handleConfirmReset = () => {
    AppLinksService.resetToDefaults();
    setIsResetModalOpen(false);
    showToast('Répertoire réinitialisé aux valeurs d’origine');
  };

  // Filter links
  const filteredLinks = links.filter(l => {
    const matchesSearch = 
      l.libelle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.description && l.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'ALL' || l.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: 'ALL', label: 'Tous les hyperliens' },
    { id: 'CANDIDAT', label: 'Espace Candidat' },
    { id: 'REFERENT', label: 'Espace Référent' },
    { id: 'DRIVE', label: 'Dossiers Google Drive' },
  ];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 right-6 z-50 bg-secondary text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-white/10 text-sm font-semibold"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header section */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-accent/10 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <LinkIcon className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-black text-secondary tracking-tight">
              Répertoire des Hyperliens & URLs
            </h2>
          </div>
          <p className="text-sm text-accent/60 font-light max-w-2xl leading-relaxed">
            Table centralisant chaque hyperlien utilisé dans l'application (modèles, drives, fiches de suivi, barèmes et classeurs Google Sheets). Vous pouvez consulter, éditer les URLs manquantes ou exporter la table.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportToGoogleSheets}
            disabled={isExporting}
            className="px-4 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-60"
            title="Exporter directement ce tableau vers le classeur Google Sheets"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span>Export en cours...</span>
              </>
            ) : exportSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">Exporté vers Google Sheets !</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Exporter vers Google Sheets</span>
              </>
            )}
          </button>

          <a
            href={APP_LINKS_SPREADSHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 rounded-xl border border-accent/20 text-accent/60 hover:text-emerald-700 hover:bg-emerald-50 transition-all cursor-pointer"
            title="Ouvrir le classeur Google Sheets dans un nouvel onglet"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-primary hover:brightness-110 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter un lien</span>
          </button>

          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="p-2.5 rounded-xl border border-accent/20 text-accent/60 hover:text-accent hover:bg-accent/5 transition-all cursor-pointer"
            title="Réinitialiser tous les liens par défaut"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters and search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-accent/40" />
          <input
            type="text"
            placeholder="Rechercher par libellé ou URL..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-accent/20 rounded-xl text-xs font-medium text-accent focus:ring-2 focus:ring-primary focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-accent/40 hover:text-accent"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Categories */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                selectedCategory === c.id
                  ? "bg-secondary text-white shadow-xs"
                  : "bg-accent/5 text-accent/60 hover:text-accent hover:bg-accent/10"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table: Libelle_Lien | Url_Lien */}
      <div className="bg-white rounded-2xl border border-accent/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-accent/5 border-b border-accent/10 text-xs font-black uppercase tracking-wider text-accent/70">
                <th className="py-4 px-6 w-[30%]">Libelle_Lien</th>
                <th className="py-4 px-6 w-[32%]">Url_Lien</th>
                <th className="py-4 px-6 w-[26%]">Emplacement dans l'app</th>
                <th className="py-4 px-6 text-right w-[12%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/5 text-xs font-medium text-accent">
              {filteredLinks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-accent/50 italic">
                    Aucun hyperlien correspondant à votre recherche.
                  </td>
                </tr>
              ) : (
                filteredLinks.map((item, index) => {
                  const isEditing = editingId === item.id;
                  const isCopied = copiedId === item.id;
                  const hasUrl = !!item.url && item.url.trim().length > 0;

                  return (
                    <tr 
                      key={item.id} 
                      id={`link_row_${item.id}`}
                      className={cn(
                        "hover:bg-accent/[0.02] transition-colors group",
                        index % 2 === 0 ? "bg-white" : "bg-accent/[0.01]"
                      )}
                    >
                      {/* Libelle_Lien */}
                      <td className="py-4 px-6 align-top">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editLibelle}
                            onChange={e => setEditLibelle(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-primary rounded-lg text-xs font-bold text-accent focus:outline-none"
                            placeholder="Libellé du lien"
                          />
                        ) : (
                          <div>
                            <div className="font-bold text-secondary text-sm flex items-center gap-2">
                              <span>{item.libelle}</span>
                              {item.category && (
                                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-accent/5 text-accent/60">
                                  {item.category}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-[11px] text-accent/50 font-light mt-0.5">
                                {item.description}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Url_Lien */}
                      <td className="py-4 px-6 align-top">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="url"
                              value={editUrl}
                              onChange={e => setEditUrl(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-primary rounded-lg text-xs font-mono text-accent focus:outline-none"
                              placeholder="https://..."
                            />
                            <p className="text-[10px] text-accent/40 italic">
                              Collez l'URL complète avec https://
                            </p>
                          </div>
                        ) : hasUrl ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-primary hover:underline hover:text-primary-dark break-all inline-flex items-center gap-1.5 group-hover:text-primary transition-colors text-xs"
                              title={item.url}
                            >
                              <span className="truncate max-w-sm">{item.url}</span>
                              <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" />
                            </a>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                          >
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>URL non renseignée (cliquer pour éditer)</span>
                          </button>
                        )}
                      </td>

                      {/* Emplacement dans l'app */}
                      <td className="py-4 px-6 align-top">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.inAppAccessType === 'CLICKABLE' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Cliquable dans l'app
                              </span>
                            )}
                            {item.inAppAccessType === 'BACKGROUND_API' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                Requête API / Arrière-plan
                              </span>
                            )}
                            {item.inAppAccessType === 'CONFIG' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                Configuration Système
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-bold text-secondary leading-snug">
                            {item.appLocation || '-'}
                          </div>
                          {item.targetView && onNavigate ? (
                            <button
                              type="button"
                              onClick={() => onNavigate(item.targetView!, item.targetTab, item.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-white font-bold text-xs transition-all cursor-pointer shadow-2xs border border-primary/25 mt-1 group/nav"
                              title={item.inAppDetails || `Naviguer vers ${item.appLocation}`}
                            >
                              <Navigation className="w-3.5 h-3.5 group-hover/nav:translate-x-0.5 transition-transform" />
                              <span>Accéder à l'écran</span>
                            </button>
                          ) : null}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 align-top text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(item.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-1 cursor-pointer"
                              title="Enregistrer"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Enregistrer</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="p-1.5 rounded-lg border border-accent/20 text-accent/60 hover:text-accent hover:bg-accent/5 transition-all cursor-pointer"
                              title="Annuler"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {hasUrl && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleCopyUrl(item.url, item.id)}
                                  className={cn(
                                    "p-1.5 rounded-lg border transition-all cursor-pointer",
                                    isCopied
                                      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                      : "border-accent/10 hover:border-accent/30 text-accent/60 hover:text-accent hover:bg-accent/5"
                                  )}
                                  title="Copier l'URL"
                                >
                                  {isCopied ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>

                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg border border-accent/10 hover:border-primary/40 text-primary hover:bg-primary/5 transition-all cursor-pointer"
                                  title="Ouvrir dans un nouvel onglet"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              className="p-1.5 rounded-lg border border-accent/10 hover:border-accent/30 text-accent/60 hover:text-accent hover:bg-accent/5 transition-all cursor-pointer"
                              title="Modifier"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              className="p-1.5 rounded-lg border border-red-100 hover:border-red-300 text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                              title="Effacer ou supprimer le lien"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-accent/[0.02] border-t border-accent/10 flex items-center justify-between text-xs text-accent/50 font-medium">
          <div>
            Total : <strong>{filteredLinks.length}</strong> lien(s) répertorié(s)
            {filteredLinks.filter(l => !l.url).length > 0 && (
              <span className="ml-2 text-amber-700 font-bold">
                ({filteredLinks.filter(l => !l.url).length} sans URL)
              </span>
            )}
          </div>
          <div>Format conforme : Libelle_Lien | Url_Lien</div>
        </div>
      </div>

      {/* Add New Link Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-accent/10 shadow-2xl max-w-lg w-full p-6 sm:p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-accent/10 mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Plus className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-black text-secondary">
                    Ajouter un nouvel hyperlien
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1.5 text-accent/40 hover:text-accent rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddNew} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-accent uppercase tracking-wider mb-1.5">
                    Libelle_Lien *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLibelle}
                    onChange={e => setNewLibelle(e.target.value)}
                    placeholder="Ex: Espace Candidat (Synthèse) - Synthèse de l’année"
                    className="w-full px-3.5 py-2.5 border border-accent/20 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-accent uppercase tracking-wider mb-1.5">
                    Url_Lien
                  </label>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={e => setNewUrl(e.target.value)}
                    placeholder="https://drive.google.com/... ou https://..."
                    className="w-full px-3.5 py-2.5 border border-accent/20 rounded-xl text-xs font-mono focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                  <p className="text-[11px] text-accent/40 italic mt-1">
                    Peut rester vide et être renseigné ultérieurement.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-accent uppercase tracking-wider mb-1.5">
                    Catégorie
                  </label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 border border-accent/20 rounded-xl text-xs font-bold text-accent focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="CANDIDAT">Espace Candidat</option>
                    <option value="REFERENT">Espace Référent</option>
                    <option value="DRIVE">Dossiers Google Drive</option>
                    <option value="AUTRE">Autre</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-accent/10 flex items-center justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-accent/20 text-accent font-bold text-xs hover:bg-accent/5 cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-primary text-white font-bold text-xs hover:brightness-110 cursor-pointer shadow-xs"
                  >
                    Enregistrer le lien
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete / Clear Link Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-accent/10 shadow-2xl max-w-md w-full p-6 sm:p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-accent/10 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-black text-secondary">
                    Gestion de l'hyperlien
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="p-1.5 text-accent/40 hover:text-accent rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-accent/5 rounded-xl border border-accent/10">
                  <p className="text-xs font-bold text-secondary">
                    {deleteTarget.libelle}
                  </p>
                  {deleteTarget.url ? (
                    <p className="text-[11px] font-mono text-accent/60 truncate mt-1">
                      {deleteTarget.url}
                    </p>
                  ) : (
                    <p className="text-[11px] text-accent/40 italic mt-1">
                      Aucune URL actuellement renseignée
                    </p>
                  )}
                </div>

                <p className="text-xs text-accent/70 leading-relaxed">
                  Que souhaitez-vous faire pour cet hyperlien ?
                </p>

                <div className="space-y-2 pt-2">
                  {deleteTarget.url && (
                    <button
                      type="button"
                      onClick={() => handleClearUrl(deleteTarget.id)}
                      className="w-full px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-between transition-all cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Eraser className="w-4 h-4 text-amber-600" />
                        <span>Effacer l'hyperlien (Vider l'URL)</span>
                      </span>
                      <span className="text-[10px] text-amber-700/80 font-normal">Garde la ligne</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleConfirmDelete(deleteTarget.id)}
                    className="w-full px-4 py-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs flex items-center justify-between transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-red-600" />
                      <span>Supprimer définitivement la ligne</span>
                    </span>
                    <span className="text-[10px] text-red-600/80 font-normal">Retire du répertoire</span>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-accent/10 flex justify-end mt-6">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-xl border border-accent/20 text-accent font-bold text-xs hover:bg-accent/5 cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Defaults Confirmation Modal */}
      <AnimatePresence>
        {isResetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-accent/10 shadow-2xl max-w-md w-full p-6 sm:p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-accent/10 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-black text-secondary">
                    Réinitialiser les hyperliens
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="p-1.5 text-accent/40 hover:text-accent rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-accent/70 leading-relaxed mb-6">
                Voulez-vous réinitialiser tous les liens avec les valeurs par défaut de l’application ? Toutes les modifications personnalisées seront restaurées aux valeurs d'origine.
              </p>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-accent/20 text-accent font-bold text-xs hover:bg-accent/5 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 cursor-pointer shadow-xs"
                >
                  Réinitialiser aux valeurs d'origine
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
