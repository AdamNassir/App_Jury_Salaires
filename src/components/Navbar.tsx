import React from 'react';
import { LogOut, User as UserIcon, Building2, ArrowLeft } from 'lucide-react';
import { UserProfile } from '../types';

interface NavbarProps {
  profile: UserProfile;
  onLogout: () => void;
  onHome: () => void;
  onOpenPersonalSpace?: () => void;
  onBack?: () => void;
  canGoBack?: boolean;
}

export function Navbar({ profile, onLogout, onHome, onOpenPersonalSpace, onBack, canGoBack }: NavbarProps) {
  return (
    <nav className="bg-white border-b border-accent/10 py-6 px-4 fixed top-0 w-full z-50 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              disabled={canGoBack === false}
              className={`p-2.5 rounded-xl border transition-all flex items-center justify-center group ${
                canGoBack === false
                  ? 'border-accent/10 text-accent/20 cursor-not-allowed bg-accent/[0.02]'
                  : 'border-accent/20 bg-accent/5 hover:bg-primary hover:text-white hover:border-primary text-secondary cursor-pointer shadow-2xs'
              }`}
              title="Page précédente"
              aria-label="Retour à la page précédente"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            </button>
          )}

          <div className="w-12 h-12 bg-primary rounded-base flex items-center justify-center text-white shadow-lg">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-secondary leading-none">Jury des Salaires</h1>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={onHome} 
            className="flex items-center gap-2.5 px-5 py-2.5 bg-secondary/5 rounded-base text-sm font-bold text-secondary hover:bg-secondary/10 transition-all border border-secondary/10 cursor-pointer"
            title="Retour au menu principal"
          >
            <Building2 className="w-4 h-4" />
            Accueil
          </button>

          {onOpenPersonalSpace && (
            <button
              onClick={onOpenPersonalSpace}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-base text-sm font-bold transition-all shadow-xs cursor-pointer"
              title="Accéder à votre Espace Personnel (Historique des dossiers, décisions, primes et bilans annuels)"
            >
              <UserIcon className="w-4 h-4" />
              Espace Personnel
            </button>
          )}

          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-base font-bold text-accent">{profile.displayName}</div>
              <div className="text-[10px] text-primary uppercase tracking-widest font-black">
                {profile.roles?.map(r => r === 'CANDIDATE' ? 'Candidat' : r === 'ADMIN' ? 'Administrateur' : r === 'EVALUATOR' ? 'Évaluateur' : 'Jury').join(' / ') || 'Utilisateur'}
              </div>
            </div>
            <div className="w-11 h-11 bg-accent/5 rounded-full flex items-center justify-center border border-accent/10">
              <UserIcon className="w-6 h-6 text-accent/40" />
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="p-3 text-accent/30 hover:text-red-500 hover:bg-red-50 rounded-base transition-all"
            title="Déconnexion"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </div>
    </nav>
  );
}
