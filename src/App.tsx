import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logout } from './lib/firebase';
import { api } from './services/api';
import type { Campaign, Dossier, UserProfile, ConsultantFeedback } from './types';
import { CandidateView } from './components/CandidateView';
import { JuryView } from './components/JuryView';
import { Dashboard } from './components/Dashboard';
import { CampaignWorkspace } from './components/CampaignWorkspace';
import { EvaluationsWorkspace } from './components/EvaluationsWorkspace';
import { AccessWorkspace } from './components/AccessWorkspace';

export default function App() {
  const [session, setSession] = useState<any>(null), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]), [year, setYear] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]), [dossiers, setDossiers] = useState<Dossier[]>([]), [evaluations, setEvaluations] = useState<ConsultantFeedback[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [view, setView] = useState('CANDIDATE'), [candidateId, setCandidateId] = useState('');
  useEffect(() => {
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      const current = ++generation; setSession(null); setError(''); setReady(false);
      setDossiers([]); setProfiles([]); setCampaigns([]); setEvaluations([]); setParticipants([]); setYear(null);
      if (!user) { setReady(true); return; }
      try { const s = await api('/api/session', {}); if (current === generation) { setSession(s); setCandidateId(s.profileId); setView(s.roles.includes('ADMIN') ? 'CAMPAIGNS' : 'CANDIDATE'); } }
      catch (e) { if (current === generation) setError((e as Error).message); }
      finally { if (current === generation) setReady(true); }
    });
    return () => { generation++; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!session?.uid) return;
    return onSnapshot(doc(db, 'users', session.uid), snapshot => {
      const account = snapshot.data();
      if (!account?.roles?.length || !account.profileId) { setError('Accès désactivé ou profil non rattaché. Reconnectez-vous après correction par un administrateur.'); setSession(null); return; }
      setSession((old: any) => old && (old.profileId !== account.profileId || JSON.stringify(old.roles) !== JSON.stringify(account.roles)) ? { ...old, profileId: account.profileId, roles: account.roles } : old);
    }, e => setError(e.message));
  }, [session?.uid]);
  const isAdmin = session?.roles.includes('ADMIN'), isStaff = isAdmin || session?.roles.includes('JURY');
  useEffect(() => {
    if (!session) return;
    const failed = (e: Error) => setError(e.message);
    const a = onSnapshot(collection(db, 'campaigns'), snap => { const c = snap.docs.map(d => ({ ...d.data(), id: d.id } as Campaign)).sort((a, b) => b.year - a.year); setCampaigns(c); setYear(y => c.some(v => v.year === y) ? y : c[0]?.year ?? null); }, failed);
    const b = onSnapshot(collection(db, 'profiles'), snap => setProfiles(snap.docs.map(d => ({ ...d.data(), id: d.id } as UserProfile))), failed);
    return () => { a(); b(); };
  }, [session]);
  useEffect(() => {
    setDossiers([]); setEvaluations([]); setParticipants([]);
    if (!session || year === null) return;
    const failed = (e: Error) => setError(e.message);
    const dq = isStaff ? query(collection(db, 'dossiers'), where('campaignYear', '==', year)) : query(collection(db, 'dossiers'), where('campaignYear', '==', year), where('candidateId', '==', session.profileId));
    const eq = isStaff ? query(collection(db, 'evaluations'), where('campaignYear', '==', year)) : query(collection(db, 'evaluations'), where('campaignYear', '==', year), where('consultantId', '==', session.profileId));
    const a = onSnapshot(dq, s => setDossiers(s.docs.map(d => ({ ...d.data(), id: d.id } as Dossier))), failed);
    const b = onSnapshot(eq, s => setEvaluations(s.docs.map(d => ({ ...d.data(), id: d.id } as ConsultantFeedback))), failed);
    const c = onSnapshot(query(collection(db, 'participants'), where('campaignYear', '==', year)), s => setParticipants(s.docs.map(d => ({ ...d.data(), id: d.id }))), failed);
    return () => { a(); b(); c(); };
  }, [session, year, isStaff]);
  if (!ready) return <div className="p-12">Connexion en cours…</div>;
  if (!session) return <main className="max-w-xl mx-auto my-20 p-8 space-y-6"><h2>Jury des salaires</h2>{error && <p role="alert" className="text-red-700">{error}</p>}<button className="action" onClick={() => signInWithGoogle().catch(e => setError(e.message))}>Se connecter avec Google</button>{auth.currentUser && <button className="action" onClick={logout}>Changer de compte</button>}</main>;
  const campaign = campaigns.find(c => c.year === year);
  const locked = !campaign || campaign.status !== 'OUVERTE' || campaign.importState === 'RUNNING';
  const currentUser = { ...profiles.find(p => p.id === session.profileId), id: session.profileId, email: auth.currentUser?.email || '', displayName: auth.currentUser?.displayName || '', roles: session.roles, createdAt: null } as UserProfile;
  const scoped = dossiers.map(d => ({ ...d, campaignLocked: locked, consultantFeedbacks: { ...(d.consultantFeedbacks || {}), ...Object.fromEntries(evaluations.filter(e => e.candidateId === d.candidateId).map(e => [e.id!, e])) } }));
  const candidates = Object.fromEntries(scoped.map(d => [d.candidateId, { ...profiles.find(p => p.id === d.candidateId), ...d.rhSnapshot, id: d.candidateId, displayName: d.rhSnapshot?.displayName || d.candidateName, email: d.candidateEmail, roles: ['CANDIDATE'], createdAt: null } as UserProfile]));
  const own = scoped.find(d => d.candidateId === (isStaff ? candidateId : session.profileId));
  return <div className="max-w-7xl mx-auto px-4 pb-16">
    <header className="py-6 border-b space-y-4"><div className="flex flex-wrap justify-between gap-4"><h1>Jury des salaires Logiclever</h1><button onClick={logout}>Déconnexion</button></div>
      <label>Campagne <select aria-label="Campagne" value={year ?? ''} onChange={e => setYear(Number(e.target.value))} className="field ml-3"><option value="" disabled>Aucune campagne</option>{campaigns.map(c => <option key={c.id} value={c.year}>{c.year} — {c.status}</option>)}</select></label>
      <nav className="flex flex-wrap gap-3">{[['CANDIDATE', 'Mon dossier'], ['EVALUATIONS', 'Évaluer'], ...(isStaff ? [['JURY', 'Jury']] : []), ...(isAdmin ? [['CAMPAIGNS', 'Campagnes & imports'], ['ACCESS', 'Profils & accès']] : [])].map(([id, label]) => <button className={view === id ? 'action' : 'action secondary'} key={id} onClick={() => { setError(''); setView(id); }}>{label}</button>)}</nav>
    </header>
    {error && <p role="alert" className="p-4 bg-red-50 text-red-800">{error}</p>}
    <main className="pt-8" key={`${year}-${view}`}>
      {view === 'CAMPAIGNS' && isAdmin && <CampaignWorkspace campaigns={campaigns} onImported={setYear} />}
      {view === 'ACCESS' && isAdmin && <AccessWorkspace profiles={profiles} />}
      {view === 'CANDIDATE' && <>{isStaff && <label className="block mb-6">Dossier <select className="field" value={candidateId} onChange={e => setCandidateId(e.target.value)}><option value={session.profileId}>Mon dossier</option>{scoped.filter(d => d.candidateId !== session.profileId).map(d => <option key={d.id} value={d.candidateId}>{d.candidateName}</option>)}</select></label>}{own ? <CandidateView key={own.id} profile={candidates[own.candidateId]} dossier={own} currentUser={currentUser} /> : <p>Aucun dossier pour cette personne dans cette campagne. Les dossiers des autres années sont conservés. L’espace Évaluer reste disponible.</p>}</>}
      {view === 'EVALUATIONS' && <EvaluationsWorkspace year={year} locked={locked} profile={currentUser} participants={participants} evaluations={evaluations.filter(e => e.consultantId === session.profileId)} />}
      {view === 'JURY' && isStaff && <><Dashboard dossiers={scoped} roles={session.roles} candidates={candidates} /><JuryView dossiers={scoped} profile={currentUser} candidates={candidates} /></>}
    </main>
  </div>;
}
