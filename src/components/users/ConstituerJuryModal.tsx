import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gavel, X, Check, Search, ShieldCheck, Users, CheckSquare, Square, Calendar, AlertCircle } from 'lucide-react';
import { UserProfile, Campaign } from '../../types';
import { UserDirectoryService } from '../../services/userDirectoryService';
import { LocalDatabaseService } from '../../services/localDatabaseService';
import { cn } from '../../lib/utils';

interface ConstituerJuryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  currentUser?: UserProfile | null;
}

export function ConstituerJuryModal({ isOpen, onClose, onSuccess, currentUser }: ConstituerJuryModalProps) {
  const campaigns = useMemo(() => LocalDatabaseService.getCampaigns(), [isOpen]);
  
  // Année par défaut : la plus récente ou l'année en cours
  const availableYears = useMemo(() => {
    const years: number[] = campaigns.map(c => Number(c.year)).filter(y => !isNaN(y));
    if (!years.includes(2026)) years.push(2026);
    return Array.from(new Set(years)).sort((a: number, b: number) => b - a);
  }, [campaigns]);

  const [selectedYear, setSelectedYear] = useState<number>(availableYears[0] || 2026);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Tous les utilisateurs ayant le grade Expert
  const allUsers = useMemo(() => UserDirectoryService.getAllUsers(), [isOpen]);
  const expertUsers = useMemo(() => {
    return allUsers.filter(u => u.currentGrade === 'Expert');
  }, [allUsers]);

  // Initialisation des experts sélectionnés pour cette campagne (ceux qui ont déjà le rôle JURY)
  const [selectedExpertIds, setSelectedExpertIds] = useState<Set<string>>(() => {
    const currentJuryExperts = expertUsers.filter(u => u.roles?.includes('JURY')).map(u => u.id);
    return new Set(currentJuryExperts);
  });

  // Mettre à jour la sélection si on change d'année ou si la modale s'ouvre
  React.useEffect(() => {
    if (isOpen) {
      const activeCampaign = campaigns.find(c => c.year === selectedYear);
      if (activeCampaign && (activeCampaign as any).juryMemberIds && Array.isArray((activeCampaign as any).juryMemberIds)) {
        setSelectedExpertIds(new Set((activeCampaign as any).juryMemberIds));
      } else {
        const currentJuryExperts = expertUsers.filter(u => u.roles?.includes('JURY')).map(u => u.id);
        setSelectedExpertIds(new Set(currentJuryExperts));
      }
    }
  }, [isOpen, selectedYear, campaigns, expertUsers]);

  if (!isOpen) return null;

  const toggleSelectExpert = (userId: string) => {
    setSelectedExpertIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedExpertIds(new Set(filteredExperts.map(u => u.id)));
  };

  const deselectAll = () => {
    setSelectedExpertIds(new Set());
  };

  const filteredExperts = expertUsers.filter(u => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = (u.displayName || '').toLowerCase().includes(q);
    const emailMatch = (u.email || '').toLowerCase().includes(q);
    const matriculeMatch = (u.matricule || '').toLowerCase().includes(q);
    return nameMatch || emailMatch || matriculeMatch;
  });

  const handleSaveJury = async () => {
    setIsSaving(true);
    try {
      const selectedList = Array.from(selectedExpertIds);

      // 1. Sauvegarder la composition du jury dans la campagne
      const campaignId = `campaign_${selectedYear}`;
      const existingCampaign = LocalDatabaseService.getCampaignById(campaignId) || campaigns.find(c => c.year === selectedYear);
      if (existingCampaign) {
        LocalDatabaseService.updateCampaign(existingCampaign.id, {
          ...(existingCampaign as any),
          juryMemberIds: selectedList,
          updatedAt: new Date().toISOString()
        });
      } else {
        LocalDatabaseService.saveCampaign({
          id: campaignId,
          year: selectedYear,
          title: `Campagne ${selectedYear}`,
          status: 'OUVERTE',
          rhDocuments: [],
          pairsDocuments: [],
          otherDocuments: [],
          ...( { juryMemberIds: selectedList } as any ),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      // 2. Mettre à jour les rôles des utilisateurs
      // Les experts cochés reçoivent le rôle JURY
      // Les experts non cochés perdent le rôle JURY
      for (const expert of expertUsers) {
        const isSelected = selectedExpertIds.has(expert.id);
        const hasJuryRole = expert.roles.includes('JURY');

        if (isSelected && !hasJuryRole) {
          const updatedRoles = [...expert.roles, 'JURY' as const];
          UserDirectoryService.updateUser(expert.id, { roles: updatedRoles });
        } else if (!isSelected && hasJuryRole) {
          const updatedRoles = expert.roles.filter(r => r !== 'JURY');
          UserDirectoryService.updateUser(expert.id, { roles: updatedRoles });
        }
      }

      onSuccess(`Le Jury de la campagne ${selectedYear} a été constitué avec succès (${selectedList.length} membres).`);
      onClose();
    } catch (error: any) {
      console.error("Erreur lors de la constitution du jury:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl max-w-3xl w-full p-8 shadow-2xl border border-accent/15 max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-6 border-b border-accent/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Gavel className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-secondary">Constituer le Jury</h3>
                <p className="text-xs text-accent/60 mt-0.5">
                  Sélectionnez les collaborateurs au grade <strong>Expert</strong> désignés pour siéger à la commission.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-accent/40 hover:text-accent hover:bg-accent/5 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Configuration Banner */}
          <div className="py-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-accent/[0.03] p-4 rounded-xl border border-accent/10">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-primary" />
                <label className="text-xs font-bold text-secondary uppercase tracking-wider">
                  Campagne ciblée :
                </label>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                  className="px-3 py-1.5 bg-white border border-accent/20 rounded-lg text-xs font-bold text-secondary outline-none focus:border-primary shadow-2xs"
                >
                  {availableYears.map(yr => (
                    <option key={yr} value={yr}>Campagne {yr}</option>
                  ))}
                </select>
              </div>

              <div className="text-xs font-black text-primary">
                {selectedExpertIds.size} / {expertUsers.length} Expert(s) sélectionné(s)
              </div>
            </div>

            {/* Note d'information sur les administrateurs */}
            <div className="flex items-start gap-2.5 p-3.5 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs text-amber-900 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>Règle de neutralité :</strong> Les membres du jury disposant également d'un rôle Administrateur ne pourront pas être affectés comme Référents Jury de dossiers, <em>à l'exception exclusive de Julien Bourlon</em>.
              </div>
            </div>

            {/* Search and Selection Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-accent/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, email ou matricule..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-accent/15 rounded-xl text-xs outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="px-3 py-1.5 text-xs font-bold bg-accent/5 hover:bg-accent/10 text-secondary rounded-lg transition-colors cursor-pointer"
                >
                  Tout cocher
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="px-3 py-1.5 text-xs font-bold bg-accent/5 hover:bg-accent/10 text-accent/70 rounded-lg transition-colors cursor-pointer"
                >
                  Tout décocher
                </button>
              </div>
            </div>
          </div>

          {/* Experts List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-accent/5">
            {filteredExperts.length === 0 ? (
              <div className="p-8 text-center text-xs text-accent/50 italic bg-accent/[0.02] rounded-xl border border-dashed border-accent/10">
                Aucun collaborateur avec le grade Expert trouvé correspondant à la recherche.
              </div>
            ) : (
              filteredExperts.map(expert => {
                const isSelected = selectedExpertIds.has(expert.id);
                const isAdmin = expert.roles?.includes('ADMIN');
                const isJulien = (expert.displayName || '').toLowerCase().includes('julien bourlon') || (expert.email || '').toLowerCase().includes('julien.bourlon');

                return (
                  <div
                    key={expert.id}
                    onClick={() => toggleSelectExpert(expert.id)}
                    className={cn(
                      "p-3.5 rounded-xl border transition-all flex items-center justify-between gap-4 cursor-pointer select-none",
                      isSelected 
                        ? "bg-primary/5 border-primary/30 shadow-2xs" 
                        : "bg-white hover:bg-accent/[0.02] border-accent/10"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-5 h-5 rounded flex items-center justify-center transition-colors",
                        isSelected ? "bg-primary text-white" : "border border-accent/30 bg-white"
                      )}>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-secondary truncate">
                            {expert.displayName}
                          </span>
                          {expert.matricule && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent font-bold">
                              {expert.matricule}
                            </span>
                          )}
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                            Grade Expert
                          </span>
                          {isAdmin && (
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                              isJulien
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            )}>
                              {isJulien ? "Admin (Référent autorisé)" : "Admin"}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-accent/50 truncate font-light mt-0.5">
                          {expert.email}
                          {expert.experienceYears ? ` • ${expert.experienceYears} an(s) d'exp.` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {isSelected ? (
                        <span className="text-xs font-bold text-primary flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          Membre du Jury
                        </span>
                      ) : (
                        <span className="text-xs text-accent/40 font-medium">Non assigné</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="pt-6 border-t border-accent/10 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-accent/5 hover:bg-accent/10 text-accent font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={handleSaveJury}
              disabled={isSaving}
              className="px-6 py-3 bg-primary hover:bg-primary/90 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Gavel className="w-4 h-4" />
              <span>Valider la composition du Jury ({selectedExpertIds.size})</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
