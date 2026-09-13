import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { api } from '../services/api';
import type { UserProfile } from '../types';
export function AccessWorkspace({ profiles }: { profiles: UserProfile[] }) {
  const [accounts, setAccounts] = useState<any[]>([]), [message, setMessage] = useState('');
  useEffect(() => onSnapshot(collection(db, 'users'), s => setAccounts(s.docs.map(d => ({ ...d.data(), id: d.id }))), e => setMessage(e.message)), []);
  return <section className="space-y-5"><h2>Profils et accès</h2><p>Les profils viennent du référentiel APP_LL. Un compte Google est rattaché à l’adresse exacte du profil lors de sa première connexion. Les rôles ne sont jamais importés depuis les colonnes RH.</p>{message && <p role="status">{message}</p>}
    {accounts.map(a => <Account key={a.id} account={a} profiles={profiles} onMessage={setMessage} />)}
    <h3>Référentiel ({profiles.length})</h3><div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{['Id_Profil', 'Nom', 'Matricule', 'Type', 'Email', 'Boond'].map(h => <th className="text-left p-2" key={h}>{h}</th>)}</tr></thead><tbody>{profiles.map(p => <tr key={p.id}>{[p.id, p.displayName, p.matricule, p.profileType, p.email, p.boondId].map((v, i) => <td className="p-2 border-t" key={i}>{v || '—'}</td>)}</tr>)}</tbody></table></div></section>;
}
function Account({ account, profiles, onMessage }: { account: any; profiles: UserProfile[]; onMessage: (s: string) => void }) {
  const [profileId, setId] = useState(account.profileId || ''), [roles, setRoles] = useState<string[]>(account.roles || []), [busy, setBusy] = useState(false);
  return <div className="border p-4 space-y-3"><strong>{account.email || account.id}</strong><select className="field block" value={profileId} onChange={e => setId(e.target.value)}><option value="">Choisir le profil</option>{profiles.map(p => <option value={p.id} key={p.id}>{p.displayName} — {p.id}</option>)}</select><div className="flex gap-4">{['EVALUATOR', 'JURY', 'ADMIN'].map(r => <label key={r}><input type="checkbox" checked={roles.includes(r)} onChange={e => setRoles(old => e.target.checked ? [...old, r] : old.filter(v => v !== r))} /> {r}</label>)}</div><button className="action" disabled={busy || !profileId} onClick={async () => { setBusy(true); try { await api('/api/users/access', { uid: account.id, profileId, roles }); onMessage('Accès enregistrés. La personne doit se reconnecter pour actualiser son espace.'); } catch (e) { onMessage((e as Error).message); } finally { setBusy(false); } }}>Enregistrer les accès</button></div>;
}
