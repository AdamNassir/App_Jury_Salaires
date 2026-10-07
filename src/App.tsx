import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, logout, googleRedirectError } from './lib/firebase';
import { describeAuthError } from './lib/authErrors';
import { AuthErrorNotice } from './components/AuthErrorNotice';
import { UserProfile, UserRole, Dossier, ConsultantFeedback } from './types';
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
import { AdminLinksTable } from './components/admin/AdminLinksTable';
import { PersonalSpaceView } from './components/personal/PersonalSpaceView';
import { LogIn, ShieldAlert, Loader2, Settings, Users, User as UserIcon, FolderKanban, ShieldCheck, Calendar, Link as LinkIcon, ArrowRight, UserCheck, FileText, Scale, LogOut, Award } from 'lucide-react';

type ActiveViewType = 'PERSONAL_SPACE' | 'CANDIDATE' | 'EVALUATIONS' | 'JURY' | 'CAMPAIGNS' | 'ADMIN' | 'LINKS';

interface HistoryItem {
  view: ActiveViewType | null;
  tab?: string | null;
  showRoleSelection: boolean;
  candidateId?: string;
  linkId?: string | null;
  fromLinkId?: string | null;
  scrollY?: number;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [allDossiers, setAllDossiers] = useState<Dossier[]>([]);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [activeView, setActiveView] = useState<ActiveViewType | null>(null);
  const [candidateInitialTab, setCandidateInitialTab] = useState<string | null>(null);
  const [targetLinkId, setTargetLinkId] = useState<string | null>(null);
  const [candidateProfiles, setCandidateProfiles] = useState<UserProfile[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [evaluatorProfiles, setEvaluatorProfiles] = useState<UserProfile[]>([]);
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string>('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [profileRetry, setProfileRetry] = useState(0);
  const signInPending = useRef(false);
  const hasAttemptedSignIn = useRef(false);
  const [canGoBackState, setCanGoBackState] = useState(false);
  const previousStateRef = useRef<{
    sourceView: ActiveViewType | null;
    tab: string | null;
    showRoleSelection: boolean;
    candidateId: string;
  } | null>(null);

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

    // Read candidate and evaluator profiles from the local directory.
    const syncUsers = () => {
      const allUsers = UserDirectoryService.getAllUsers();
      setCandidateProfiles(allUsers.filter(u => u.roles?.includes('CANDIDATE')));
      setEvaluatorProfiles(allUsers.filter(u => u.roles?.includes('EVALUATOR')));
    };
    syncUsers();
    const unsubDir = UserDirectoryService.subscribe(syncUsers);

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
        const normalizedEmail = firebaseUser.email?.toLowerCase();
        const isJulien = normalizedEmail === 'julien.bourlon@logiclever.com';
        const isMaster =
          normalizedEmail === 'guillaumebestece@gmail.com' ||
          normalizedEmail === 'guillaume.best@logiclever.com' ||
          normalizedEmail === 'adam.nassir@logiclever.com' ||
          normalizedEmail === 'muriel.guiochet@logiclever.com' ||
          isJulien;

        // Résolution immédiate via le répertoire d'utilisateurs local / JSON
        const directoryUser = UserDirectoryService.getUserByEmail(firebaseUser.email);

        const resolvedRoles: UserRole[] = isMaster
          ? [...new Set<UserRole>([
              ...(directoryUser?.roles || []),
              'CANDIDATE',
              'JURY',
              'ADMIN',
              ...(isJulien ? ['EVALUATOR' as UserRole] : [])
            ])]
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
      LocalDatabaseService.syncEvaluatorAssignments();
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

    void LocalDatabaseService.refreshDossiersFromServer();
    const refreshTimer = window.setInterval(() => {
      void LocalDatabaseService.refreshDossiersFromServer();
    }, 5000);

    return () => {
      window.clearInterval(refreshTimer);
      unsubLocal();
    };
  }, [profile, activeView, showRoleSelection]);

  const navigateTo = (view: ActiveViewType, tab?: string | null, candidateId?: string, linkId?: string | null, _fromLinkId?: string | null) => {
    previousStateRef.current = {
      sourceView: activeView,
      tab: candidateInitialTab,
      showRoleSelection,
      candidateId: selectedCandidateId,
    };
    setCanGoBackState(true);

    setActiveView(view);
    setShowRoleSelection(false);
    if (tab !== undefined) {
      setCandidateInitialTab(tab);
    }
    if (candidateId) {
      setSelectedCandidateId(candidateId);
    }
    setTargetLinkId(linkId || null);

    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleGoBack = () => {
    if (previousStateRef.current) {
      const saved = previousStateRef.current;
      previousStateRef.current = null;
      setCanGoBackState(false);

      setActiveView(saved.sourceView);
      setShowRoleSelection(saved.showRoleSelection);
      setCandidateInitialTab(saved.tab || null);
      if (saved.candidateId !== undefined) {
        setSelectedCandidateId(saved.candidateId);
      }
      setTargetLinkId(null);
    } else if (!showRoleSelection) {
      setCanGoBackState(false);
      setShowRoleSelection(true);
    }
    // Always bring back to the top of the page
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleViewSelection = (view: ActiveViewType) => {
    navigateTo(view, null);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowRoleSelection(false);
      setActiveView(null);
      setProfileError(null);
      setSignInError(null);
      setSelectedCandidateId('');
      previousStateRef.current = null;
      setCanGoBackState(false);
    } catch (error) {
      setSignInError(describeAuthError(error));
    }
  };

  const goHome = () => {
    if (!showRoleSelection) {
      previousStateRef.current = {
        sourceView: activeView,
        tab: candidateInitialTab,
        showRoleSelection,
        candidateId: selectedCandidateId,
      };
      setCanGoBackState(true);
      setShowRoleSelection(true);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50/50 px-4 sm:px-6 lg:px-8 font-sans py-10 sm:py-16">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-6 sm:p-10 lg:p-12 rounded-3xl shadow-xl max-w-6xl w-full border border-accent/10 space-y-8"
        >
          {/* En-tête élargi et accueillant */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-accent/10 pb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-secondary tracking-tight">
                Bienvenue, {user.displayName}
              </h1>
              <p className="text-accent/60 text-sm sm:text-base font-light mt-1">
                Sélectionnez votre espace de travail pour accéder à vos outils et dossiers.
              </p>
            </div>
            <button 
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200/80 rounded-xl transition-all cursor-pointer self-start sm:self-center"
              title="Se déconnecter"
            >
              <LogOut className="w-4 h-4" />
              <span>Déconnexion</span>
            </button>
          </div>

          {/* Grille principale des espaces de travail */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* 0. Espace Personnel (Compte, Historique, Bilans Drive) */}
            <button
              onClick={() => handleViewSelection('PERSONAL_SPACE')}
              className={cn(
                "p-6 sm:p-7 border rounded-2xl text-left transition-all group relative overflow-hidden bg-white flex flex-col justify-between hover:shadow-md cursor-pointer",
                activeView === 'PERSONAL_SPACE' 
                  ? "border-primary bg-primary/5 ring-2 ring-primary" 
                  : "border-accent/15 hover:border-primary/60 hover:bg-primary/[0.02]"
              )}
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <UserCheck className="w-6 h-6" />
                </div>
                <span className="text-[10px] bg-primary/10 text-primary px-3 py-1 rounded-full uppercase tracking-wider font-black">
                  Mon Compte & Historique
                </span>
              </div>
              <div>
                <div className="font-bold text-lg text-secondary group-hover:text-primary transition-colors flex items-center justify-between mb-2">
                  <span>Espace Personnel</span>
                  <ArrowRight className="w-4 h-4 text-accent/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-xs sm:text-sm text-accent/60 font-light leading-relaxed">
                  Consulter vos dossiers de campagnes passées (2024, 2025...), décisions du jury, météos clients et vos bilans annuels Drive.
                </p>
              </div>
            </button>

            {/* 1. Interface Candidat (Mon dossier) */}
            {(profile.roles?.includes('CANDIDATE') || isAdminUser) && (
              <button
                onClick={() => handleViewSelection('CANDIDATE')}
                className={cn(
                  "p-6 sm:p-7 border rounded-2xl text-left transition-all group relative overflow-hidden bg-white flex flex-col justify-between hover:shadow-md cursor-pointer",
                  activeView === 'CANDIDATE' 
                    ? "border-primary bg-primary/5 ring-2 ring-primary" 
                    : "border-accent/15 hover:border-secondary/60 hover:bg-secondary/[0.02]"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <FileText className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] bg-secondary/10 text-secondary px-3 py-1 rounded-full uppercase tracking-wider font-black">
                    Mon dossier
                  </span>
                </div>
                <div>
                  <div className="font-bold text-lg text-accent group-hover:text-secondary transition-colors flex items-center justify-between mb-2">
                    <span>Interface Candidat</span>
                    <ArrowRight className="w-4 h-4 text-accent/30 group-hover:text-secondary group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-xs sm:text-sm text-accent/60 font-light leading-relaxed">
                    Gérer votre bilan annuel personnel, votre auto-évaluation et vos pièces justificatives.
                  </p>
                </div>
              </button>
            )}

            {/* 2. Évaluation des Collègues (Feedback pairs) */}
            {(profile.roles?.includes('CANDIDATE') || profile.roles?.includes('EVALUATOR') || profile.roles?.includes('JURY') || isAdminUser) && (
              <button
                onClick={() => handleViewSelection('EVALUATIONS')}
                className={cn(
                  "p-6 sm:p-7 border rounded-2xl text-left transition-all group relative overflow-hidden bg-white flex flex-col justify-between hover:shadow-md cursor-pointer",
                  activeView === 'EVALUATIONS' 
                    ? "border-primary bg-primary/5 ring-2 ring-primary" 
                    : "border-accent/15 hover:border-primary/60 hover:bg-primary/[0.02]"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Users className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-3 py-1 rounded-full uppercase tracking-wider font-black">
                    Évaluateur
                  </span>
                </div>
                <div>
                  <div className="font-bold text-lg text-secondary group-hover:text-primary transition-colors flex items-center justify-between mb-2">
                    <span>Évaluations & Feedback Pairs</span>
                    <ArrowRight className="w-4 h-4 text-accent/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-xs sm:text-sm text-accent/60 font-light leading-relaxed">
                    Consulter les dossiers de vos collègues et partager vos retours d'expérience et avis techniques.
                  </p>
                </div>
              </button>
            )}

            {/* 3. Conseil du Jury (Délibérations) */}
            {(isJuryUser || isAdminUser) && (
              <button
                onClick={() => handleViewSelection('JURY')}
                className={cn(
                  "p-6 sm:p-7 border rounded-2xl text-left transition-all group relative overflow-hidden bg-white flex flex-col justify-between hover:shadow-md cursor-pointer",
                  activeView === 'JURY' 
                    ? "border-primary bg-primary/5 ring-2 ring-primary" 
                    : "border-accent/15 hover:border-secondary/60 hover:bg-secondary/[0.02]"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Scale className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-3 py-1 rounded-full uppercase tracking-wider font-black">
                    Délibérations
                  </span>
                </div>
                <div>
                  <div className="font-bold text-lg text-secondary group-hover:text-secondary transition-colors flex items-center justify-between mb-2">
                    <span>Conseil du Jury</span>
                    <ArrowRight className="w-4 h-4 text-accent/30 group-hover:text-secondary group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-xs sm:text-sm text-accent/60 font-light leading-relaxed">
                    Piloter les décisions finales, barèmes, augmentations salariales et arbitrage global.
                  </p>
                </div>
              </button>
            )}
          </div>

          {/* Section Administration & Paramétrage */}
          {(isAdminUser || isJuryUser) && (
            <div className="pt-6 border-t border-accent/10 space-y-4">
              <div className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span>Espace Administration & Paramétrage</span>
              </div>
              <div className={cn(
                "grid gap-4 sm:gap-5",
                isAdminUser ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"
              )}>
                {isAdminUser && (
                  <button
                    onClick={() => handleViewSelection('CAMPAIGNS')}
                    className={cn(
                      "p-5 sm:p-6 border rounded-2xl text-left transition-all group relative overflow-hidden bg-primary/5 hover:shadow-xs cursor-pointer",
                      activeView === 'CAMPAIGNS' 
                        ? "border-primary bg-primary/10 ring-2 ring-primary" 
                        : "border-primary/20 hover:border-primary"
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                    <div className="font-bold text-base text-primary mb-1 flex items-center justify-between">
                      <span>Gestion des Campagnes</span>
                      <ArrowRight className="w-4 h-4 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </div>
                    <p className="text-xs text-accent/60 font-light leading-relaxed">
                      Créer, initialiser, rattraper et clôturer les campagnes de jury.
                    </p>
                  </button>
                )}

                <button
                  onClick={() => handleViewSelection('ADMIN')}
                  className={cn(
                    "p-5 sm:p-6 border rounded-2xl text-left transition-all group relative overflow-hidden bg-accent/5 hover:shadow-xs cursor-pointer",
                    activeView === 'ADMIN' 
                      ? "border-primary bg-primary/5 ring-2 ring-primary" 
                      : "border-accent/15 hover:border-primary/50"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Settings className="w-5 h-5 opacity-70" />
                  </div>
                  <div className="font-bold text-base text-secondary mb-1 flex items-center justify-between">
                    <span>Paramétrage Utilisateurs</span>
                    <ArrowRight className="w-4 h-4 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-xs text-accent/60 font-light leading-relaxed">
                    Gestion des collaborateurs, effectifs, rôles et synchronisations.
                  </p>
                </button>

                <button
                  onClick={() => handleViewSelection('LINKS')}
                  className={cn(
                    "p-5 sm:p-6 border rounded-2xl text-left transition-all group relative overflow-hidden bg-secondary/5 hover:shadow-xs cursor-pointer",
                    activeView === 'LINKS' 
                      ? "border-primary bg-primary/5 ring-2 ring-primary" 
                      : "border-accent/15 hover:border-primary/50"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <LinkIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="font-bold text-base text-secondary mb-1 flex items-center justify-between">
                    <span>Répertoire des Liens</span>
                    <ArrowRight className="w-4 h-4 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-xs text-accent/60 font-light leading-relaxed">
                    Gestion des hyperliens (Drives, Sheets, Modèles officiels).
                  </p>
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  const isAdmin = profile?.roles?.includes('ADMIN');

  return (
    <div className="min-h-screen bg-white font-sans text-accent pb-20">
      <Navbar 
        profile={profile} 
        onLogout={handleLogout} 
        onHome={goHome} 
        onOpenPersonalSpace={() => handleViewSelection('PERSONAL_SPACE')}
        onBack={handleGoBack}
        canGoBack={canGoBackState || !showRoleSelection}
      />
      
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

          // Map des évaluateurs autorisés (pour le sélecteur d'impersonation admin - strictement le rôle EVALUATOR)
          const evaluatorMap = new Map<string, UserProfile>();
          if (profile) evaluatorMap.set(profile.id, profile);
          evaluatorProfiles.forEach(e => {
            if (e.roles?.includes('EVALUATOR')) {
              evaluatorMap.set(e.id, e);
            }
          });
          const evaluatorOptions = Array.from(evaluatorMap.values()).sort((a, b) => {
            if (a.id === profile?.id) return -1;
            if (b.id === profile?.id) return 1;
            return (a.displayName || a.email).localeCompare(b.displayName || b.email);
          });
          const activeEvaluatorId = selectedEvaluatorId || profile?.id || '';
          const activeEvaluatorProfile = evaluatorMap.get(activeEvaluatorId) || profile!;

          // Trouver tous les dossiers appartenant à ce candidat
          const candidateDossiers = allDossiers.filter(d => 
            d.candidateId === activeCandidateId || 
            (activeCandidateProfile.id && d.candidateId === activeCandidateProfile.id) ||
            (activeCandidateProfile.idProfil && (d.idProfil === activeCandidateProfile.idProfil || d.candidateId === activeCandidateProfile.idProfil)) ||
            (activeCandidateProfile.matricule && d.matricule && d.matricule === activeCandidateProfile.matricule)
          );

          // Récupérer toutes les campagnes existantes
          const allCampaigns = LocalDatabaseService.getCampaigns();

          const getDossierYear = (d: Dossier): number => {
            if (d.campaignYear && typeof d.campaignYear === 'number') return d.campaignYear;
            if (d.campaignId) {
              const m = d.campaignId.match(/\d{4}/);
              if (m) return parseInt(m[0]);
            }
            return 2025;
          };

          // Répertorier les années de campagnes disponibles (priorité aux dossiers du candidat)
          const candidateYears: number[] = Array.from(new Set(candidateDossiers.map(d => getDossierYear(d))));
          const systemYears: number[] = allCampaigns.map(c => Number(c.year)).filter(y => !isNaN(y));
          const combinedYears: number[] = Array.from(new Set([...candidateYears, ...systemYears]));
          const availableYears: number[] = (combinedYears.length > 0 ? combinedYears : [2026, 2025, 2024]).sort((a: number, b: number) => b - a);

          // La campagne par défaut est la plus récente en termes d'années
          const currentSelectedYear = selectedCampaignId 
            ? parseInt(selectedCampaignId.replace(/[^0-9]/g, '')) 
            : availableYears[0];
          
          const activeCampaignYear = availableYears.includes(currentSelectedYear) ? currentSelectedYear : availableYears[0];

          // Dossier correspondant exactement à la campagne / année choisie
          const activeCandidateDossier = candidateDossiers.find(
            d => getDossierYear(d) === activeCampaignYear
          );

          return (
            <>
              <div className="mb-12">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-primary text-xs font-black uppercase tracking-[0.2em] mb-1">JURY DES SALAIRES LOGICLEVER</h1>
                    <h2 className="text-secondary text-3xl font-extrabold tracking-tight">
                      {activeView === 'PERSONAL_SPACE' && 'Espace Personnel'}
                      {activeView === 'CANDIDATE' && 'Espace Candidat'}
                      {activeView === 'EVALUATIONS' && 'Évaluation des Collègues'}
                      {activeView === 'JURY' && 'Espace de Pilotage'}
                      {activeView === 'CAMPAIGNS' && 'Gestion des Campagnes'}
                      {activeView === 'ADMIN' && 'Administration Système'}
                      {activeView === 'LINKS' && 'Répertoire des Liens & Hyperliens'}
                    </h2>
                  </div>

                  {/* Sub-navigation tabs for Admin and Jury */}
                  {(isAdmin || profile?.roles?.includes('JURY')) && (activeView === 'CAMPAIGNS' || activeView === 'ADMIN' || activeView === 'LINKS') && (
                    <div className="flex items-center gap-2 bg-accent/5 p-1.5 rounded-xl border border-accent/10">
                      {isAdmin && (
                        <button
                          onClick={() => navigateTo('CAMPAIGNS')}
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
                        onClick={() => navigateTo('ADMIN')}
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
                      <button
                        onClick={() => navigateTo('LINKS')}
                        className={cn(
                          "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer",
                          activeView === 'LINKS' 
                            ? "bg-primary text-white shadow-sm" 
                            : "text-accent/60 hover:text-accent hover:bg-white"
                        )}
                      >
                        <LinkIcon className="w-4 h-4" />
                        Hyperliens & URLs
                      </button>
                    </div>
                  )}

                  {/* Sélecteur de Collaborateur pour Admin dans l'Espace Personnel */}
                  {isAdmin && activeView === 'PERSONAL_SPACE' && (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2.5 bg-accent/5 p-2 px-3.5 rounded-xl border border-accent/10 shadow-sm">
                        <UserIcon className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider text-accent/60">Collaborateur :</span>
                        <select
                          value={activeCandidateId}
                          onChange={(e) => setSelectedCandidateId(e.target.value)}
                          className="bg-white border border-accent/20 rounded-lg px-3 py-1.5 text-sm font-bold text-accent focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                        >
                          {candidateOptions.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.id === profile.id ? `Mon compte personnel (${c.displayName || c.email})` : (c.displayName || c.email)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Conteneur des filtres / sélecteurs en haut à droite */}
                  {activeView === 'CANDIDATE' && (
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Sélecteur de Campagne (le plus récent par défaut) */}
                      <div className="flex items-center gap-2.5 bg-accent/5 p-2 px-3.5 rounded-xl border border-accent/10 shadow-sm">
                        <Calendar className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider text-accent/60">Campagne :</span>
                        <select
                          value={activeCampaignYear}
                          onChange={(e) => setSelectedCampaignId(`campaign_${e.target.value}`)}
                          className="bg-white border border-accent/20 rounded-lg px-3 py-1.5 text-sm font-bold text-accent focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                        >
                          {availableYears.map(yr => {
                            const campObj = allCampaigns.find(c => c.year === yr);
                            return (
                              <option key={yr} value={yr}>
                                Campagne {yr} {campObj?.status === 'CLÔTURÉE' ? '(Clôturée)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Sélecteur de Candidat pour Jury/Admin */}
                      {(profile?.roles?.includes('JURY') || isAdmin) && (
                        <div className="flex items-center gap-2.5 bg-accent/5 p-2 px-3.5 rounded-xl border border-accent/10 shadow-sm">
                          <UserIcon className="w-4 h-4 text-primary shrink-0" />
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
                  )}

                  {/* Sélecteur d'Évaluateur pour Admin dans l'espace Évaluateurs */}
                  {isAdmin && activeView === 'EVALUATIONS' && (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2.5 bg-accent/5 p-2 px-3.5 rounded-xl border border-accent/10 shadow-sm">
                        <UserIcon className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider text-accent/60">Évaluateur :</span>
                        <select
                          value={activeEvaluatorId}
                          onChange={(e) => setSelectedEvaluatorId(e.target.value)}
                          className="bg-white border border-accent/20 rounded-lg px-3 py-1.5 text-sm font-bold text-accent focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                        >
                          {evaluatorOptions.map(ev => (
                            <option key={ev.id} value={ev.id}>
                              {ev.id === profile?.id ? `Mon profil (${ev.displayName || ev.email})` : (ev.displayName || ev.email)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {activeView === 'JURY' && (
                <div className="mb-16">
                  <Dashboard dossiers={allDossiers} roles={profile.roles} />
                </div>
              )}

              <AnimatePresence>
                {activeView === 'PERSONAL_SPACE' && (
                  <motion.div key={`personal_space_${activeCandidateId}`} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                    <PersonalSpaceView 
                      currentUser={activeCandidateProfile} 
                      dossiers={allDossiers} 
                      campaigns={allCampaigns} 
                      isAdmin={isAdmin}
                      allUsers={candidateOptions}
                      selectedUserId={activeCandidateId}
                      onSelectUser={(id) => setSelectedCandidateId(id)}
                    />
                  </motion.div>
                )}
                {activeView === 'CANDIDATE' && (
                  <motion.div key={activeCandidateId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <CandidateView 
                      profile={activeCandidateProfile} 
                      dossier={activeCandidateDossier} 
                      currentUser={profile} 
                      initialTab={candidateInitialTab}
                      targetLinkId={targetLinkId}
                      onTabChange={(tab) => setCandidateInitialTab(tab)}
                    />
                  </motion.div>
                )}
                {activeView === 'EVALUATIONS' && (
                  <motion.div key={`evaluations_${activeEvaluatorId}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <ConsultantView dossiers={allDossiers} profile={activeEvaluatorProfile} />
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
                {activeView === 'LINKS' && (
                  <motion.div key="links" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <AdminLinksTable 
                      currentUser={profile} 
                      onNavigate={(view, tab, linkId) => {
                        navigateTo(view, tab, undefined, linkId, linkId);
                      }}
                    />
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
