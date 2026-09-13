import React, { useState } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Dossier, UserProfile, JuryDecision } from '../../types';
import { formatCurrency } from '../../lib/utils';
export function JuryDecisionForm({ dossier, candidate, onDone }: { dossier: Dossier; candidate: UserProfile | null; onDone: () => void }) {
  const [patch, setPatch] = useState<Record<string, any>>({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const values = { ...dossier.juryDecision, ...patch };
  const locked = dossier.campaignLocked || dossier.status === 'VALIDE';
  const numbers = [['amount','Salaire annuel proposé au 01/07'],['investmentPercentage','% Investissement'],['missionPercentage','% Mission'],['maxSalaryIfTJIncreases','Salaire MAX si TJ vendu augmente'],['maxSalaryIfVenduIncreases',"Salaire MAX si TJ vendu augmenté en cours d’année"],['primeBefore','Prime avant jury'],['primeAfter','Prime après jury']];
  const texts = [['whyThisSalary','Pourquoi ce salaire proposé'],['whatToDoMore',"Ce qu’il faut faire pour avoir plus"],['referentJury','Référent jury'],['consultantFeeling','Ressenti consultant'],['secondRoundFeedback','Retour second tour'],['advice','Conseils'],['conclusion','Conclusion']];
  const save = async (validate: boolean) => {
    setBusy(true); setError('');
    try {
      for (const [key] of numbers) if (values[key] != null && (!Number.isFinite(values[key]) || values[key] < 0 || (key.endsWith('Percentage') && values[key] > 100))) throw new Error('Montant ou pourcentage invalide.');
      if (validate && (values.amount == null || !values.verdict || values.unanimous !== true)) throw new Error('Salaire proposé, verdict et confirmation d’unanimité requis pour valider.');
      await runTransaction(db, async tx => {
        const ref = doc(db, 'dossiers', dossier.id), current = (await tx.get(ref)).data();
        if (!current || current.status === 'VALIDE') throw new Error('Dossier déjà validé.');
        const next = { ...(current.juryDecision || {}), ...patch };
        const currentSalary = current.rhSnapshot?.currentSalary;
        if (patch.amount !== undefined && currentSalary > 0) next.percentage = Math.round((next.amount - currentSalary) / currentSalary * 1000) / 10;
        if (validate) next.date = new Date().toISOString();
        tx.update(ref, { juryDecision: next, ...(validate ? { status: 'VALIDE' } : {}), updatedAt: new Date().toISOString() });
        if (validate) tx.update(doc(db, 'participants', dossier.id), { status: 'VALIDE' });
      }); setPatch({}); if (validate) onDone(); else setError('Décision enregistrée.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="space-y-5 border-t pt-8"><h3>Décision — campagne {dossier.campaignYear}</h3><p>Salaire de référence : {formatCurrency(candidate?.currentSalary)}</p>
    <fieldset disabled={locked || busy} className="space-y-4">
      <label className="block">Verdict <select className="field" value={values.verdict || ''} onChange={e => setPatch(p => ({ ...p, verdict: e.target.value }))}><option value="">Non renseigné</option>{['Favorable','Réserve','Défavorable'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label className="block">Nouveau grade <select className="field" value={values.finalGrade || ''} onChange={e => setPatch(p => ({ ...p, finalGrade: e.target.value }))}><option value="">Non renseigné</option>{['Junior','Confirmé','Senior','Expert'].map(v => <option key={v}>{v}</option>)}</select></label>
      <div className="grid md:grid-cols-2 gap-4">{numbers.map(([k,l]) => <label key={k}>{l}<input className="field block w-full" type="number" min="0" value={values[k] ?? ''} onChange={e => setPatch(p => ({ ...p, [k]: e.target.value === '' ? null : Number(e.target.value) }))} /></label>)}</div>
      {texts.map(([k,l]) => <label className="block" key={k}>{l}<textarea className="field block w-full" value={values[k] || ''} onChange={e => setPatch(p => ({ ...p, [k]: e.target.value }))} /></label>)}
      <label className="block"><input type="checkbox" checked={values.unanimous === true} onChange={e => setPatch(p => ({ ...p, unanimous: e.target.checked }))} /> Décision unanime confirmée</label>
      <button className="action secondary mr-3" onClick={() => save(false)}>Enregistrer</button><button className="action" onClick={() => save(true)}>Valider le dossier</button>
    </fieldset>{locked && <p>Consultation : campagne fermée ou décision déjà validée.</p>}{error && <p role="status">{error}</p>}
  </section>;
}
