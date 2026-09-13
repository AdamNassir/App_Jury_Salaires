import React, { useState } from 'react';
import type { UserProfile, ConsultantFeedback } from '../types';
import { evaluationTypes } from '../services/importModel';
import { api } from '../services/api';
export function EvaluationsWorkspace({ year, locked, profile, participants, evaluations }: { year: number | null; locked: boolean; profile: UserProfile; participants: any[]; evaluations: ConsultantFeedback[] }) {
  const empty = { candidateId: '', type: 'Commerciale', client: '', project: '', targetTJMin: '', targetTJMax: '', confidenceIndex: '', justification: '', improvementAxes: '' };
  const [form, setForm] = useState<any>(empty), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const readOnly = locked || participants.find(p => p.candidateId === form.candidateId)?.status === 'VALIDE';
  const field = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const save = async (validated: boolean) => { setBusy(true); setMessage(''); try { await api('/api/evaluations/save', { ...form, year, validated }); setMessage(validated ? 'Évaluation validée.' : 'Brouillon enregistré.'); setEditing(true); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  return <section className="space-y-6"><h2>Évaluations — {year || 'aucune campagne'}</h2><p>Choisissez le candidat, le client, le projet et votre relation. Plusieurs projets ou relations donnent lieu à des évaluations distinctes.</p>
    <div className="flex flex-wrap gap-3">{evaluations.map(e => <button className="action secondary" key={e.id} onClick={() => { setForm({ ...e }); setEditing(true); setMessage(''); }}>{participants.find(p => p.candidateId === e.candidateId)?.displayName || e.candidateId} — {e.client} / {e.project} — {e.type} ({e.validated ? 'validée' : 'brouillon/importée'})</button>)}<button className="action" onClick={() => { setForm(empty); setEditing(false); }}>Nouvelle évaluation</button></div>
    {locked && <p>Cette campagne est en consultation.</p>}
    <fieldset disabled={busy || readOnly} className="space-y-4 border p-5">
      <label className="block">Candidat <select className="field" disabled={editing} value={form.candidateId} onChange={e => { field('candidateId', e.target.value); field('type', e.target.value === profile.id ? 'Auto_Evaluation' : 'Commerciale'); }}><option value="">Choisir</option>{participants.map(p => <option key={p.id} value={p.candidateId}>{p.displayName}{p.candidateId === profile.id ? ' (moi)' : ''}</option>)}</select></label>
      <label className="block">Relation <select className="field" disabled={editing} value={form.type} onChange={e => field('type', e.target.value)}>{evaluationTypes.filter(t => (t === 'Auto_Evaluation') === (form.candidateId === profile.id)).map(t => <option key={t}>{t}</option>)}</select></label>
      {['client', 'project'].map(k => <label className="block" key={k}>{k === 'client' ? 'Client' : 'Projet'} <input className="field" disabled={editing} maxLength={200} value={form[k] || ''} onChange={e => field(k, e.target.value)} /></label>)}
      {[['targetTJMin', 'TJ cible minimum'], ['targetTJMax', 'TJ cible maximum'], ['confidenceIndex', 'Indice de confiance (0–10)']].map(([k, l]) => <label className="block" key={k}>{l} <input className="field" type="number" min="0" max={k === 'confidenceIndex' ? 10 : undefined} value={form[k] ?? ''} onChange={e => field(k, e.target.value)} /></label>)}
      {[['justification', 'Justification TJ cible'], ['improvementAxes', 'Axes pour augmenter le TJ']].map(([k, l]) => <label className="block" key={k}>{l}<textarea className="field block w-full" maxLength={20000} value={form[k] || ''} onChange={e => field(k, e.target.value)} /></label>)}
      <button className="action secondary mr-3" onClick={() => save(false)}>Enregistrer le brouillon</button><button className="action" onClick={() => save(true)}>Valider l’évaluation</button>
    </fieldset>{message && <p role="status">{message}</p>}
  </section>;
}
