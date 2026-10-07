import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';
import { Campaign, CampaignFile, UserProfile } from '../types';
import { LocalDatabaseService } from '../services/localDatabaseService';
import { 
  FolderKanban, 
  Plus, 
  CheckCircle2, 
  Lock, 
  AlertTriangle, 
  Info,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { requestGoogleSheetsAccess, requestGoogleDriveAccess } from '../lib/firebase';

// Subcomponents
import { CampaignCard } from './campaigns/CampaignCard';
import { CreateCampaignModal } from './campaigns/CreateCampaignModal';
import { CloseCampaignModal } from './campaigns/CloseCampaignModal';
import { DeleteCampaignModal } from './campaigns/DeleteCampaignModal';
import { CatchupCampaignModal } from './campaigns/CatchupCampaignModal';
import { History } from 'lucide-react';

interface CampaignManagementProps {
  currentUser?: UserProfile | null;
}

export function CampaignManagement({ currentUser }: CampaignManagementProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OUVERTE' | 'CLÔTURÉE'>('ALL');
  
  // Notification toast state
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCatchupModalOpen, setIsCatchupModalOpen] = useState(false);
  const [isAuthenticatingGoogle, setIsAuthenticatingGoogle] = useState(false);
  const [campaignToClose, setCampaignToClose] = useState<Campaign | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleOpenCatchup = async () => {
    setIsAuthenticatingGoogle(true);
    showToast('info', "Vérification et rafraîchissement des autorisations Google (Sheets & Drive)...");
    try {
      await requestGoogleSheetsAccess();
      await requestGoogleDriveAccess(true);
      showToast('success', "Jetons Google renouvelés avec succès.");
      setIsCatchupModalOpen(true);
    } catch (err: any) {
      console.warn("Google authentication refresh notification:", err);
      // Même en cas de fermeture du popup, ouvrir la modale afin que l'utilisateur puisse poursuivre ou réessayer
      setIsCatchupModalOpen(true);
    } finally {
      setIsAuthenticatingGoogle(false);
    }
  };

  useEffect(() => {
    const syncLocal = () => {
      setCampaigns(LocalDatabaseService.getCampaigns());
      setLoading(false);
    };
    syncLocal();
    return LocalDatabaseService.subscribeCampaigns(syncLocal);
  }, []);

  const handleConfirmCloseCampaign = async () => {
    if (!campaignToClose) return;
    setIsClosing(true);
    try {
      await updateDoc(doc(db, 'campaigns', campaignToClose.id), {
        status: 'CLÔTURÉE',
        closedAt: new Date().toISOString(),
        closedBy: currentUser?.displayName || currentUser?.email || 'Administrateur',
        updatedAt: new Date().toISOString()
      });

      showToast('success', `La campagne "${campaignToClose.title}" a été clôturée avec succès.`);
      setCampaignToClose(null);
    } catch (error: any) {
      console.error("Error closing campaign:", error);
      showToast('error', `Erreur lors de la clôture : ${error.message || String(error)}`);
    } finally {
      setIsClosing(false);
    }
  };

  const handleConfirmDeleteCampaign = async (deleteRelatedDossiers: boolean) => {
    if (!campaignToDelete) return;
    setIsDeleting(true);
    try {
      LocalDatabaseService.deleteCampaign(campaignToDelete.id, deleteRelatedDossiers);
      showToast('success', `La campagne "${campaignToDelete.title}" a été supprimée avec succès.`);
      setCampaignToDelete(null);
    } catch (error: any) {
      console.error("Error deleting campaign:", error);
      showToast('error', `Erreur lors de la suppression : ${error.message || String(error)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCampaigns = campaigns.filter(c => {
    if (filterStatus === 'ALL') return true;
    return c.status === filterStatus;
  });

  return (
    <div className="space-y-10 pb-20 font-sans">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "fixed top-24 right-8 z-[60] p-4 rounded-xl shadow-2xl border flex items-center gap-3 text-sm font-bold max-w-md",
              notification.type === 'success' && "bg-emerald-50 text-emerald-800 border-emerald-200",
              notification.type === 'error' && "bg-rose-50 text-rose-800 border-rose-200",
              notification.type === 'info' && "bg-sky-50 text-sky-800 border-sky-200"
            )}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
            {notification.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />}
            {notification.type === 'info' && <Info className="w-5 h-5 text-sky-600 shrink-0" />}
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="bg-white p-8 lg:p-12 rounded-2xl border border-accent/10 shadow-sm flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <FolderKanban className="w-6 h-6" />
            </div>
            <span className="text-xs font-black uppercase tracking-[0.2em] text-primary">Espace Administrateur</span>
          </div>
          <h2 className="text-secondary text-3xl font-extrabold tracking-tight">Gestion des Campagnes de Jury</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleOpenCatchup}
            disabled={isAuthenticatingGoogle}
            className="px-5 py-4 rounded-xl bg-white border border-accent/20 text-accent font-bold text-sm hover:bg-accent/5 hover:border-accent/30 transition-all flex items-center gap-2.5 shadow-sm cursor-pointer active:scale-95 disabled:opacity-60"
          >
            {isAuthenticatingGoogle ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            ) : (
              <History className="w-5 h-5 text-primary" />
            )}
            <span>{isAuthenticatingGoogle ? "Renouvellement Google..." : "Rattrapage / Compléter une campagne"}</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-6 py-4 rounded-xl bg-primary text-white font-bold text-base hover:brightness-110 transition-all flex items-center gap-3 shadow-lg shadow-primary/20 cursor-pointer active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Créer une nouvelle campagne
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-accent/10 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-accent/40 mb-1">Campagnes Actives</div>
            <div className="text-3xl font-black text-emerald-600">
              {campaigns.filter(c => c.status === 'OUVERTE').length}
            </div>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-accent/10 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-accent/40 mb-1">Campagnes Clôturées</div>
            <div className="text-3xl font-black text-slate-700">
              {campaigns.filter(c => c.status === 'CLÔTURÉE').length}
            </div>
          </div>
          <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Campaign List */}
      <div className="bg-white rounded-2xl border border-accent/10 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-accent/10 flex flex-wrap items-center justify-between gap-4 bg-accent/5">
          <h3 className="text-lg font-bold text-secondary flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-primary" />
            Liste des Campagnes ({filteredCampaigns.length})
          </h3>

          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-accent/10">
            {(['ALL', 'OUVERTE', 'CLÔTURÉE'] as const).map(st => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  filterStatus === st 
                    ? "bg-accent text-white shadow-sm" 
                    : "text-accent/60 hover:text-accent hover:bg-accent/5"
                )}
              >
                {st === 'ALL' ? 'Toutes' : st === 'OUVERTE' ? 'Ouvertes' : 'Clôturées'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center text-accent/40 font-medium flex items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Chargement des campagnes...
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-16 text-center text-accent/40">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-base font-semibold">Aucune campagne trouvée pour ce filtre.</p>
          </div>
        ) : (
          <div className="divide-y divide-accent/10">
            {filteredCampaigns.map((camp) => (
              <CampaignCard
                key={camp.id}
                campaign={camp}
                onRequestClose={(c) => setCampaignToClose(c)}
                onRequestDelete={(c) => setCampaignToDelete(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <CreateCampaignModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            existingYears={campaigns.map(c => c.year)}
            onShowToast={showToast}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCatchupModalOpen && (
          <CatchupCampaignModal
            isOpen={isCatchupModalOpen}
            onClose={() => setIsCatchupModalOpen(false)}
            existingCampaigns={campaigns}
            currentUser={currentUser}
            onSuccess={(msg) => showToast('success', msg)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {campaignToClose && (
          <CloseCampaignModal
            campaignToClose={campaignToClose}
            onClose={() => setCampaignToClose(null)}
            onConfirmClose={handleConfirmCloseCampaign}
            isClosing={isClosing}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {campaignToDelete && (
          <DeleteCampaignModal
            campaignToDelete={campaignToDelete}
            onClose={() => setCampaignToDelete(null)}
            onConfirmDelete={handleConfirmDeleteCampaign}
            isDeleting={isDeleting}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
