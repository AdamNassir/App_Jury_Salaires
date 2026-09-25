import React from 'react';
import { Campaign } from '../../types';
import { 
  Calendar, 
  Clock, 
  Lock, 
  Trash2
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface CampaignCardProps {
  key?: React.Key;
  campaign: Campaign;
  onRequestClose: (campaign: Campaign) => void;
  onRequestDelete: (campaign: Campaign) => void;
}

export function CampaignCard({ campaign, onRequestClose, onRequestDelete }: CampaignCardProps) {
  return (
    <div className="p-8 hover:bg-accent/[0.02] transition-colors flex flex-wrap lg:flex-nowrap items-center justify-between gap-6">
      <div className="space-y-3 max-w-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-secondary">{campaign.title}</span>
          <span className={cn(
            "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5",
            campaign.status === 'OUVERTE' && "bg-emerald-100 text-emerald-800 border border-emerald-200",
            campaign.status === 'CLÔTURÉE' && "bg-slate-100 text-slate-700 border border-slate-200"
          )}>
            {campaign.status === 'OUVERTE' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
            {campaign.status}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs text-accent/50 font-medium">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-primary" /> Exercice : <strong className="text-accent">{campaign.year}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-accent/40" /> Créée le : {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString('fr-FR') : '-'}
          </span>
          {campaign.closedAt && (
            <span className="flex items-center gap-1.5 text-slate-500">
              <Lock className="w-4 h-4" /> Clôturée le : {new Date(campaign.closedAt).toLocaleDateString('fr-FR')}
            </span>
          )}
        </div>
      </div>

      {/* Right Action Block */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
        {campaign.status === 'OUVERTE' ? (
          <button
            onClick={() => onRequestClose(campaign)}
            className="px-5 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            Clôturer la campagne
          </button>
        ) : (
          <div className="px-5 py-3 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" />
            Campagne Clôturée
          </div>
        )}

        <button
          type="button"
          onClick={() => onRequestDelete(campaign)}
          title="Supprimer la campagne"
          aria-label="Supprimer la campagne"
          className="px-3.5 py-3 rounded-xl bg-rose-50/70 hover:bg-rose-100 border border-rose-200 text-rose-600 hover:text-rose-700 font-bold text-sm transition-all flex items-center justify-center cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
