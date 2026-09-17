import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, logout, googleRedirectError } from './lib/firebase';
import { describeAuthError } from './lib/authErrors';
import { AuthErrorNotice } from './components/AuthErrorNotice';
import { UserProfile, UserRole, Dossier } from './types';
import { UserDirectoryService } from './services/userDirectoryService';
import { LocalDatabaseService } from './services/localDatabaseService';
import { cn } from './lib/utils';
import { Navbar } from './components/Navbar';
import { CandidateView } from './components/CandidateView';
import { ConsultantView } from './components/ConsultantView';
import { JuryView } from './components/JuryView';
import { Dashboard } from './components/Dashboard';
import { UserManagement } from './components/UserManagement';
import { CampaignManagement } from './components/CampaignManagement';
import { LogIn, ShieldAlert, Loader2, Settings, Users, User as UserIcon, FolderKanban, ShieldCheck } from 'lucide-react';

type ActiveViewType = 'CANDIDATE' | 'EVALUATIONS' | 'JURY' | 'CAMPAIGNS' | 'ADMIN';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [allDossiers, setAllDossiers] = useState<Dossier[]>([]);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [activeView, setActiveView] = useState<ActiveViewType | null>(null);
  const [candidateProfiles, setCandidateProfiles] = useState<UserProfile[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [profileRetry, setProfileRetry] = useState(0);
  const signInPending = useRef(false);
  const hasAttemptedSignIn = useRef(false);

  useEffect(() => {
    let active = true;
    void googleRedirectError.then(error => {
      if (active && error && !hasAttemptedSignIn.current) {
        setSignInError(describeAuthError(error));
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const handleSignIn = async () => {
    if (signInPending.current) return;
    signInPending.current = true;
    hasAttemptedSignIn.current = true;
    setIsSigningIn(true);
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setSignInError(describeAuthError(error));
    } finally {
      signInPending.current = false;
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    if (profile && !selectedCandidateId) {
      setSelectedCandidateId(profile.id);
    }
  }, [profile]);

  useEffect(() => {
    if (!profile || (!profile.roles?.includes('JURY') && !profile.roles?.includes('ADMIN'))) return;

    // Read candidate profiles from the local directory.
    const syncCandidates = () => {
      const directoryCandidates = UserDirectoryService.getCandidates();
      setCandidateProfiles(directoryCandidates);
    };
    syncCandidates();
    const unsubDir = UserDirectoryService.subscribe(syncCandidates);

    return unsubDir;
  }, [profile]);

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const failProfile = (error: unknown) => {
      console.error('Local profile loading failed:', error);
      setProfile(null);
      setProfileError(describeAuthError(error));
      setLoading(false);
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      setUser(firebaseUser);
      setProfileError(null);

      if (!firebaseUser) {
        setProfile(null);
        setActiveView(null);
        setShowRoleSelection(false);
        setLoading(false);
        return;
      }

      setSignInError(null);
      try {
        const isMaster =
          firebaseUser.email?.toLowerCase() === 'guillaumebestece@gmail.com' ||
          firebaseUser.email?.toLowerCase() === 'guillaume.best@logiclever.com' ||
          firebaseUser.email?.toLowerCase() === 'adam.nassir@logiclever.com';

        // Résolution immédiate via le répertoire d'utilisateurs local / JSON
        const directoryUser = UserDirectoryService.getUserByEmail(firebaseUser.email);

        const resolvedRoles: UserRole[] = isMaster
          ? ['CANDIDATE', 'JURY', 'ADMIN']
          : (directoryUser?.roles && directoryUser.roles.length > 0 ? directoryUser.roles : ['CANDIDATE']);

        const instantProfile: UserProfile = {
          id: firebaseUser.uid,
          idProfil: directoryUser?.idProfil || firebaseUser.uid,
          matricule: directoryUser?.matricule || '',
          email: firebaseUser.email || '',
          displayName: directoryUser?.displayName || firebaseUser.displayName || 'Utilisateur',
          roles: resolvedRoles,
          team: directoryUser?.team || 'Logic Clever',
          position: directoryUser?.position || '',
          currentGrade: directoryUser?.currentGrade,
          currentSalary: directoryUser?.currentSalary,
          currentTJM: directoryUser?.currentTJM,
          entryDate: directoryUser?.entryDate,
          experienceYears: directoryUser?.experienceYears,
          assignedCandidateIds: directoryUser?.assignedCandidateIds || [],
          createdAt: new Date(),
        };

        // Mettre à jour immédiatement l'état utilisateur pour rendre l'interface ultra-réactive
        setProfile(instantProfile);
        setLoading(false);

        if (instantProfile.roles.length === 1 && !activeView) {
          if (instantProfile.roles[0] === 'EVALUATOR') {
            setActiveView('EVALUATIONS');
          } else {
            setActiveView(instantProfile.roles[0]);
          }
          setShowRoleSelection(false);
        } else if (!activeView) {
          setShowRoleSelection(true);
        }

        const syncProfile = () => {
          try {
            const local = UserDirectoryService.getUserByEmail(firebaseUser.email);
            if (local) setProfile({ ...instantProfile, ...local, id: firebaseUser.uid });
          } catch (error) {
            failProfile(error);
          }
        };
        unsubUserDoc = UserDirectoryService.subscribe(syncProfile);
      } catch (error) {
        failProfile(error);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      setSignInError(describeAuthError(error));
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, [profileRetry]);

  useEffect(() => {
    if (!profile || showRoleSelection || !activeView) {
      setAllDossiers([]);
      return;
    }

    const isJuryOrAdmin = profile.roles?.includes('JURY') || profile.roles?.includes('ADMIN');

    // 1. Synchronisation instantanée depuis la base locale JSON
    const syncLocalDossiers = () => {
      if (isJuryOrAdmin || activeView === 'EVALUATIONS') {
        setAllDossiers(LocalDatabaseService.getDossiers());
      } else if (profile.roles?.includes('CANDIDATE') && activeView === 'CANDIDATE') {
        const list = LocalDatabaseService.getDossiersByCandidate(profile.id, profile.idProfil);
        setAllDossiers(list);
      } else {
        setAllDossiers([]);
      }
    };
    syncLocalDossiers();
    const unsubLocal = LocalDatabaseService.subscribeDossiers(syncLocalDossiers);

    return unsubLocal;
  }, [profile, activeView, showRoleSelection]);

  const handleViewSelection = (view: ActiveViewType) => {
    setActiveView(view);
    setShowRoleSelection(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowRoleSelection(false);
      setActiveView(null);
      setProfileError(null);
      setSignInError(null);
      setSelectedCandidateId('');
    } catch (error) {
      setSignInError(describeAuthError(error));
    }
  };

  const goHome = () => {
    setShowRoleSelection(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-xl shadow-lg border border-accent/10 max-w-md w-full text-center"
        >
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <ShieldAlert className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-secondary mb-4">Jury des Salaires</h2>
          <p className="text-accent/60 mb-10 text-xl font-light">Connectez-vous pour accéder à votre espace campagne annuelle.</p>
          <button 
            onClick={handleSignIn}
            disabled={isSigningIn}
            aria-busy={isSigningIn}
            className="w-full flex items-center justify-center gap-4 bg-primary text-white py-5 rounded-base font-bold text-lg hover:brightness-110 transition-all shadow-md active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
          >
            {isSigningIn ? <Loader2 className="w-6 h-6 animate-spin" /> : <LogIn className="w-6 h-6" />}
            {isSigningIn ? 'Connexion en cours…' : 'Se connecter avec Google'}
          </button>
          {signInError && (
            <div className="mt-5">
              <AuthErrorNotice title="Connexion Google impossible" message={signInError} />
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  if (!profile) {
    if (profileError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4 font-sans">
          <div className="w-full max-w-md space-y-5">
            <AuthErrorNotice title="Impossible de charger votre profil local" message={profileError} />
            <p className="text-sm text-accent/60">La connexion Google a réussi, mais les données locales n’ont pas pu être chargées.</p>
            <button
              onClick={() => {
                setProfileError(null);
                setLoading(true);
                setProfileRetry(value => value + 1);
              }}
              className="w-full bg-primary text-white py-3 rounded-xl font-bold"
            >
              Réessayer le chargement
            </button>
            <button onClick={handleLogout} className="w-full text-accent py-3 rounded-xl border border-accent/20">
              Se déconnecter
            </button>
            {signInError && <AuthErrorNotice title="Déconnexion impossible" message={signInError} />}
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-white flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-accent/60 font-medium">Initialisation du profil...</p>
      </div>
    );
  }

  if (showRoleSelection) {
    const isAdminUser = profile.roles?.includes('ADMIN');
    const isJuryUser = profile.roles?.includes('JURY');

    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4 font-sans py-12">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 sm:p-12 rounded-2xl shadow-xl max-w-2xl w-full border border-accent/5"
        >
          <h2 className="text-accent mb-2 text-center leading-tight">Bienvenue, {user.displayName}</h2>
          <p className="text-accent/60 mb-8 text-center text-lg font-light">
            Accédez à votre espace de travail.
          </p>
          <div className="grid gap-4">
            {/* 1. Interface Candidat (Mon dossier) */}
            {(profile.roles?.includes('CANDIDATE') || isAdminUser) && (
              <button
                onClick={() => handleViewSelection('CANDIDATE')}
                className={cn(
                  "p-6 border rounded-xl text-left transition-all group relative overflow-hidden",
                  activeView === 'CANDIDATE' 
                    ? "border-primary bg-primary/5 ring-1 ring-primary" 
                    : "border-accent/10 hover:border-secondary hover:bg-secondary/5 cursor-pointer"
                )}
              >
                <div className={cn(
                  "font-bold text-lg mb-1 flex items-center gap-3",
                  activeView === 'CANDIDATE' ? "text-primary" : "text-accent group-hover:text-secondary"
                )}>
                  Interface Candidat
                  <span className="text-[10px] bg-secondary/10 text-secondary px-3 py-1 rounded-base uppercase tracking-widest font-black">Mon dossier</span>
                </div>
                <div className="text-sm text-accent/60 font-light font-sans">
                  Gérer votre bilan annuel personnel, auto-évaluation et vos pièces justificatives
                </div>
              </button>
            )}

            {/* 2. Évaluation des Collègues (Feedback pairs) */}
            {(profile.roles?.includes('CANDIDATE') || profile.roles?.includes('EVALUATOR') || profile.roles?.includes('JURY') || isAdminUser) && (
              <button
                onClick={() => handleViewSelection('EVALUATIONS')}
                className={cn(
                  "p-6 border rounded-xl text-left transition-all group relative overflow-hidden",
                  activeView === 'EVALUATIONS' 
                    ? "border-primary bg-primary/5 ring-1 ring-primary" 
                    : "border-accent/10 hover:border-secondary hover:bg-secondary/5 cursor-pointer"
                )}
              >
                <div className={cn(
                  "font-bold text-lg mb-1 flex items-center gap-3",
                  activeView === 'EVALUATIONS' ? "text-primary" : "text-accent group-hover:text-secondary"
                )}>
                  Évaluations & Feedback Pairs
                  <span className="text-[10px] bg-primary/10 text-primary px-3 py-1 rounded-base uppercase tracking-widest font-black">Évaluateur</span>
                </div>
                <div className="text-sm text-accent/60 font-light font-sans">
                  Consulter les dossiers de vos collègues et partager vos retours d'expérience et avis techniques
                </div>
              </button>
            )}

            {/* 3. Conseil du Jury (Délibérations) */}
            {(isJuryUser || isAdminUser) && (
              <button
                onClick={() => handleViewSelection('JURY')}
                className={cn(
                  "p-6 border rounded-xl text-left transition-all group relative overflow-hidden",
                  activeView === 'JURY' 
                    ? "border-primary bg-primary/5 ring-1 ring-primary" 
                    : "border-accent/10 hover:border-secondary hover:bg-secondary/5 cursor-pointer"
                )}
              >
                <div className={cn(
                  "font-bold text-lg mb-1 flex items-center gap-3",
                  activeView === 'JURY' ? "text-primary" : "text-accent group-hover:text-secondary"
                )}>
                  Conseil du Jury
                  <span className="text-[10px] bg-secondary/10 text-secondary px-3 py-1 rounded-base uppercase tracking-widest font-black">Délibérations</span>
                </div>
                <div className="text-sm text-accent/60 font-light font-sans">
                  Piloter les décisions finales, barèmes, augmentations salariales et arbitrage global
                </div>
              </button>
            )}

            {(isAdminUser || isJuryUser) && (
              <div className="pt-4 border-t border-accent/10 space-y-3">
                <div className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" /> Espace Administration & Paramétrage
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {isAdminUser && (
                    <button
                      onClick={() => handleViewSelection('CAMPAIGNS')}
                      className={cn(
                        "p-6 border rounded-xl text-left transition-all group relative overflow-hidden bg-primary/5",
                        activeView === 'CAMPAIGNS' 
                          ? "border-primary bg-primary/10 ring-1 ring-primary" 
                          : "border-primary/20 hover:border-primary cursor-pointer"
                      )}
                    >
                      <div className="font-bold text-base text-primary mb-1 flex items-center gap-2">
                        <FolderKanban className="w-5 h-5" />
                        Gestion des Campagnes
                      </div>
                      <div className="text-xs text-accent/60 font-light">
                        Créer, initialiser et clôturer les campagnes de jury.
                      </div>
                    </button>
                  )}

                  <button
                    onClick={() => handleViewSelection('ADMIN')}
                    className={cn(
                      "p-6 border rounded-xl text-left transition-all group relative overflow-hidden bg-accent/5",
                      activeView === 'ADMIN' 
                        ? "border-primary bg-primary/5 ring-1 ring-primary" 
                        : "border-accent/10 hover:border-primary/50 cursor-pointer",
                      !isAdminUser && "sm:col-span-2"
                    )}
                  >
                    <div className="font-bold text-base text-accent mb-1 flex items-center gap-2">
                      <Settings className="w-5 h-5 opacity-50" />
                      Paramétrage Utilisateurs
                    </div>
                    <div className="text-xs text-accent/60 font-light">
                      Gestion des utilisateurs, effectifs et rôles.
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <button 
            onClick={handleLogout}
            className="mt-8 w-full border border-red-200 text-red-500 py-3 rounded-xl text-base font-bold hover:bg-red-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            Se déconnecter
          </button>
        </motion.div>
      </div>
    );
  }

  const isAdmin = profile?.roles?.includes('ADMIN');

  return (
    <div className="min-h-screen bg-white font-sans text-accent pb-20">
      <Navbar profile={profile} onLogout={handleLogout} onHome={goHome} />
      
      <main className="max-w-7xl mx-auto px-4 pt-44">
        {(() => {
          const candidateMap = new Map<string, UserProfile>();
          if (profile) candidateMap.set(profile.id, profile);
          candidateProfiles.forEach(c => candidateMap.set(c.id, c));
          allDossiers.forEach(d => {
            if (d.candidateId && !candidateMap.has(d.candidateId)) {
              candidateMap.set(d.candidateId, {
                id: d.candidateId,
                displayName: d.candidateName || 'Anonyme',
                email: d.candidateEmail || '',
                roles: ['CANDIDATE'],
                createdAt: null,
              });
            }
          });
          const candidateOptions = Array.from(candidateMap.values());
          const activeCandidateId = selectedCandidateId || profile?.id || '';
          const activeCandidateProfile = candidateMap.get(activeCandidateId) || profile!;
          const activeCandidateDossier = allDossiers.find(d => d.candidateId === activeCandidateId || (activeCandidateProfile.idProfil && (d.idProfil === activeCandidateProfile.idProfil || d.candidateId === activeCandidateProfile.idProfil)));

          return (
            <>
              <div className="mb-12">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-primary text-xs font-black uppercase tracking-[0.2em] mb-1">JURY DES SALAIRES LOGICLEVER</h1>
                    <h2 className="text-secondary text-3xl font-extrabold tracking-tight">
                      {activeView === 'CANDIDATE' && 'Espace Candidat'}
                      {activeView === 'EVALUATIONS' && 'Évaluation des Collègues'}
                      {activeView === 'JURY' && 'Espace de Pilotage'}
                      {activeView === 'CAMPAIGNS' && 'Gestion des Campagnes'}
                      {activeView === 'ADMIN' && 'Administration Système'}
                    </h2>
                  </div>

                  {/* Sub-navigation tabs for Admin and Jury */}
                  {(isAdmin || profile?.roles?.includes('JURY')) && (activeView === 'CAMPAIGNS' || activeView === 'ADMIN') && (
                    <div className="flex items-center gap-2 bg-accent/5 p-1.5 rounded-xl border border-accent/10">
                      {isAdmin && (
                        <button
                          onClick={() => setActiveView('CAMPAIGNS')}
                          className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer",
                            activeView === 'CAMPAIGNS' 
                              ? "bg-primary text-white shadow-sm" 
                              : "text-accent/60 hover:text-accent hover:bg-white"
                          )}
                        >
                          <FolderKanban className="w-4 h-4" />
                          Campagnes
                        </button>
                      )}
                      <button
                        onClick={() => setActiveView('ADMIN')}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer",
                          activeView === 'ADMIN' 
                            ? "bg-primary text-white shadow-sm" 
                            : "text-accent/60 hover:text-accent hover:bg-white"
                        )}
                      >
                        <Settings className="w-4 h-4" />
                        Utilisateurs & Rôles
                      </button>
                    </div>
                  )}

                  {activeView === 'CANDIDATE' && (profile?.roles?.includes('JURY') || isAdmin) && (
                    <div className="flex items-center gap-3 bg-accent/5 p-2 px-4 rounded-xl border border-accent/10 shadow-sm">
                      <UserIcon className="w-5 h-5 text-primary" />
                      <span className="text-xs font-bold uppercase tracking-wider text-accent/60">Candidat :</span>
                      <select
                        value={activeCandidateId}
                        onChange={(e) => setSelectedCandidateId(e.target.value)}
                        className="bg-white border border-accent/20 rounded-lg px-3 py-1.5 text-sm font-bold text-accent focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                      >
                        {candidateOptions.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.id === profile.id ? `Mon bilan personnel (${c.displayName || c.email})` : (c.displayName || c.email)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              
              {activeView === 'JURY' && (
                <div className="mb-16">
                  <Dashboard dossiers={allDossiers} roles={profile.roles} />
                </div>
              )}

              <AnimatePresence mode="wait">
                {activeView === 'CANDIDATE' && (
                  <motion.div key={activeCandidateId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <CandidateView 
                      profile={activeCandidateProfile} 
                      dossier={activeCandidateDossier} 
                      currentUser={profile} 
                    />
                  </motion.div>
                )}
                {activeView === 'EVALUATIONS' && (
                  <motion.div key="evaluations" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <ConsultantView dossiers={allDossiers} profile={profile} />
                  </motion.div>
                )}
                {activeView === 'JURY' && (
                  <motion.div key="jury" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <JuryView 
                      dossiers={allDossiers} 
                      profile={profile} 
                    />
                  </motion.div>
                )}
                {activeView === 'CAMPAIGNS' && (
                  <motion.div key="campaigns" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <CampaignManagement currentUser={profile} />
                  </motion.div>
                )}
                {activeView === 'ADMIN' && (
                  <motion.div key="admin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <UserManagement currentUser={profile} />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          );
        })()}
      </main>
    </div>
  );
}
