import React, { useState } from 'react';
import type { Campaign } from '../types';
import { api } from '../services/api';
import { readSourceFile } from '../services/sourceFiles';
import { type SourceTable, type TableKind, type ImportRequest } from '../services/importModel';
import { GoogleSheetsConfigService } from '../services/googleSheetsConfigService';
const labels: Record<TableKind, string> = { profiles: 'Référentiel Profil APP_LL', resources: 'Ressources Boond', values: 'Liste de valeurs Boond', rh: 'RH / délibérations de campagne', evaluations: 'Évaluations historiques', documents: 'Liens Drive des auto-évaluations', meteos: 'Météos' };
export function CampaignWorkspace({ campaigns, onImported }: { campaigns: Campaign[]; onImported: (year: number) => void }) {
  const [year, setYear] = useState(new Date().getFullYear()), [mode, setMode] = useState<'NEW' | 'HISTORY'>('NEW');
  const [tables, setTables] = useState<SourceTable[]>([]), [kind, setKind] = useState<TableKind>('rh');
  const [preview, setPreview] = useState<any>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [meteoFrom, setFrom] = useState(''), [meteoTo, setTo] = useState('');
  const [includeMeteos, setIncludeMeteos] = useState(false);
  const input: ImportRequest = { year, mode, tables: tables.filter(t => includeMeteos || t.kind !== 'meteos'), ...(meteoFrom ? { meteoFrom, meteoTo } : {}) };
  const invalidate = () => { setPreview(null); setMessage(''); };
  const addFiles = async (files: File[]) => {
    setBusy(true); invalidate();
    try { const additions = []; for (const file of files) additions.push(...await readSourceFile(file, kind)); setTables(t => [...t.filter(old => !additions.some(a => a.file === old.file && a.sheet === old.sheet)), ...additions]); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  const run = async (apply = false) => {
    setBusy(true); setMessage('');
    try { const result = await api(`/api/import/${apply ? 'apply' : 'preview'}`, { ...input, ...(apply ? { token: preview.token } : {}) }); if (apply) { setMessage(`Import terminé : ${result.changes} modification(s). Les absents et les autres années ont été conservés.`); setPreview(null); onImported(year); setMode('HISTORY'); } else setPreview(result); }
    catch (e) { setMessage((e as Error).message); if (apply) setPreview(null); } finally { setBusy(false); }
  };
  const status = async (c: Campaign) => { setBusy(true); try { await api('/api/campaign/status', { year: c.year, status: c.status === 'CLÔTURÉE' ? 'OUVERTE' : 'CLÔTURÉE' }); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } };
  return <section className="space-y-6"><h2>Campagnes et imports</h2><p>Chargez les classeurs APP_LL (Profil), Boond (Ressources et Liste de valeurs) et le fichier RH de l’année. Les .xlsx sont reconnus par leurs onglets ; chaque CSV doit être associé à sa source. Aucun fichier de relations pairs n’est requis.</p>
    <fieldset disabled={busy} className="space-y-5 border p-5 rounded"><legend>Préparer l’import</legend>
      <label>Parcours <select className="field" value={mode} onChange={e => { setMode(e.target.value as any); invalidate(); }}><option value="NEW">Nouvelle campagne</option><option value="HISTORY">Rattrapage / compléter une campagne existante</option></select></label>
      <label className="block">Année <input className="field" type="number" min="2000" max="2100" value={year} onChange={e => { setYear(Number(e.target.value)); invalidate(); }} /></label>
      <p className="text-sm">Une ligne RH identifie un participant pour cette année. Une personne absente n’est pas ajoutée à une nouvelle campagne. Dans une campagne existante, une absence n’efface jamais un dossier. Les documents, météos et évaluations historiques sont facultatifs.</p>
      <label className="block">Source d’un CSV <select className="field" value={kind} onChange={e => setKind(e.target.value as TableKind)}>{Object.entries(labels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      <input aria-label="Fichiers sources" type="file" multiple accept=".xlsx,.csv" onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
      <button className="action secondary" onClick={async () => {
        setBusy(true); invalidate();
        try {
          const source = GoogleSheetsConfigService.getAllSpreadsheets().find(s => s.name === 'BDD_LL_NEW_DRIVE_test');
          if (!source) throw new Error('Référentiel APP_LL non configuré.');
          const { importDataFromGoogleSheet } = await import('../services/googleSheetsService');
          const result = await importDataFromGoogleSheet('A:Q', source.spreadsheetId, 'Meteo');
          const table: SourceTable = { kind: 'meteos', file: source.name, sheet: 'Meteo', rows: [result.headers, ...result.rows].map(r => r.map(v => String(v ?? ''))) };
          setTables(ts => [...ts.filter(t => t.kind !== 'meteos'), table]); setIncludeMeteos(true);
        } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
      }}>Charger les météos depuis APP_LL (facultatif)</button>
      <ul className="space-y-2">{tables.map((t, i) => <li key={`${t.file}-${t.sheet}`} className="flex flex-wrap gap-3 items-center"><span>{t.file} / {t.sheet}</span><select className="field" aria-label={`Source de ${t.sheet}`} value={t.kind} onChange={e => { setTables(ts => ts.map((v, j) => i === j ? { ...v, kind: e.target.value as TableKind } : v)); invalidate(); }}>{Object.entries(labels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><span>{t.rows.length} lignes</span><button onClick={() => { setTables(ts => ts.filter((_, j) => i !== j)); invalidate(); }}>Retirer</button></li>)}</ul>
      {tables.some(t => t.kind === 'meteos') && <div><label><input type="checkbox" checked={includeMeteos} onChange={e => { setIncludeMeteos(e.target.checked); invalidate(); }} /> Rattacher également les météos</label>{includeMeteos && <><p>Période des météos à rattacher (inclusive) :</p><input aria-label="Début période météo" className="field" type="date" value={meteoFrom} onChange={e => { setFrom(e.target.value); invalidate(); }} /><input aria-label="Fin période météo" className="field" type="date" value={meteoTo} onChange={e => { setTo(e.target.value); invalidate(); }} /></>}</div>}
      <button className="action" disabled={!tables.length} onClick={() => run()}>Vérifier et prévisualiser</button>
    </fieldset>
    {busy && <p role="status">Traitement en cours…</p>}{message && <p role="status" className="p-4 bg-amber-50 whitespace-pre-wrap">{message}</p>}
    {preview && <div className="space-y-4 border p-5"><h3>Aperçu — aucune écriture effectuée</h3><p>{preview.counts.profiles} profils, {preview.counts.dossiers} dossiers et {preview.counts.evaluations} évaluations à créer ou modifier.</p>{preview.errors.length > 0 && <div role="alert" className="text-red-800"><strong>Corriger avant import :</strong><ul>{preview.errors.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>}{preview.warnings.length > 0 && <details open><summary>Avertissements ({preview.warnings.length})</summary><ul>{preview.warnings.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></details>}<details><summary>Détail des changements</summary><ul>{preview.changes.map((c: any, i: number) => <li key={i}>{c.action} {c.entity} {c.id} : {c.fields.join(', ')}</li>)}</ul></details><button className="action" disabled={busy || preview.errors.length > 0} onClick={() => run(true)}>Appliquer cet import à la campagne {year}</button></div>}
    <h3>Campagnes existantes</h3><div className="space-y-3">{campaigns.map(c => <div className="border p-4 flex flex-wrap gap-4 justify-between" key={c.id}><span>{c.year} — {c.status} {c.importState === 'FAILED' && '— import à reprendre'}</span><button className="action secondary" disabled={busy} onClick={() => { setYear(c.year); setMode('HISTORY'); invalidate(); }}>Compléter / reprendre</button><button className="action secondary" disabled={busy || c.importState === 'RUNNING' || c.importState === 'FAILED'} onClick={() => status(c)}>{c.status === 'CLÔTURÉE' ? 'Rouvrir' : 'Clôturer'}</button></div>)}</div>
    {campaigns.some(c => c.importState === 'RUNNING') && <button className="action secondary" disabled={busy} onClick={async () => { setBusy(true); try { await api('/api/import/recover', {}); setMessage('Import interrompu récupéré. Relancer les fichiers en mode reprise.'); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } }}>Récupérer un import bloqué depuis plus de 15 minutes</button>}
  </section>;
}
