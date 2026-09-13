import React from 'react';
import { LogOut, User as UserIcon, Building2 } from 'lucide-react';
import { UserProfile } from '../types';

interface NavbarProps {
  profile: UserProfile;
  onLogout: () => void;
  onHome: () => void;
}

export function Navbar({ profile, onLogout, onHome }: NavbarProps) {
  return (
    <nav className="bg-white border-b border-accent/10 py-6 px-4 fixed top-0 w-full z-50 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary rounded-base flex items-center justify-center text-white shadow-lg">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-secondary leading-none mb-1">Jury des Salaires</h1>
            <p className="text-[10px] uppercase tracking-widest text-accent/40 font-black">Campagne Annuelle 2025</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <button 
            onClick={onHome} 
            className="flex items-center gap-3 px-6 py-3 bg-secondary/5 rounded-base text-base font-bold text-secondary hover:bg-secondary/10 transition-all border border-secondary/10"
            title="Retour au menu principal"
          >
            <Building2 className="w-5 h-5" />
            Accueil
          </button>

          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-base font-bold text-accent">{profile.displayName}</div>
              <div className="text-[10px] text-primary uppercase tracking-widest font-black">
                {profile.roles?.map(r => r === 'CANDIDATE' ? 'Candidat' : r === 'ADMIN' ? 'Administrateur' : 'Jury').join(' / ') || 'Utilisateur'}
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
