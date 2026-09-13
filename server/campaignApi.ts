import type { Express, Request, Response, NextFunction } from 'express';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash, randomUUID } from 'node:crypto';
import config from '../firebase-applet-config.json';
import { buildImportPlan, type ImportRequest, type ImportState, evaluationType, numberValue, stableId } from '../src/services/importModel';

function admin() {
  if (!getApps().length) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || config.projectId, credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) : applicationDefault() });
  return getFirestore();
}
const masters = () => (process.env.ADMIN_EMAILS || 'guillaumebestece@gmail.com,guillaume.best@logiclever.com,adam.nassir@logiclever.com').split(',').map(s => s.trim().toLowerCase());
const clean = (v: any): any => {
  if (v?.toDate) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, clean(x)]));
  return v;
};
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response) => fn(req, res).catch(e => { console.error(e); res.status(e.status || 400).json({ error: e.message || 'Erreur de traitement.' }); });
const deny = (message: string, status = 403) => { throw Object.assign(new Error(message), { status }); };

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return res.status(401).json({ error: 'Connexion requise.' });
    admin();
    const decoded = await getAuth().verifyIdToken(token);
    if (!decoded.email_verified || !decoded.email) return res.status(403).json({ error: 'Adresse Google vérifiée requise.' });
    const u = await admin().doc(`users/${decoded.uid}`).get();
    res.locals.identity = decoded;
    res.locals.account = u.exists ? u.data() : null;
    res.locals.isAdmin = masters().includes(decoded.email.toLowerCase()) || (u.data()?.accessVersion === 2 && u.data()?.roles?.includes('ADMIN'));
    next();
  } catch (e) { console.error('Authentication:', e); res.status(401).json({ error: 'Session invalide ou configuration Firebase serveur indisponible.' }); }
}
export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.isAdmin) return res.status(403).json({ error: 'Administrateur requis.' }); next();
}
export function requireMember(_req: Request, res: Response, next: NextFunction) {
  if ((res.locals.account?.accessVersion !== 2 || !res.locals.account?.profileId || !res.locals.account?.roles?.some((r: string) => ['ADMIN', 'JURY', 'EVALUATOR'].includes(r))) && !res.locals.isAdmin) return res.status(403).json({ error: 'Profil non rattaché ou accès désactivé.' }); next();
}
async function state(): Promise<ImportState> {
  const db = admin(); const [p, d, e, u] = await Promise.all(['profiles', 'dossiers', 'evaluations', 'users'].map(c => db.collection(c).get()));
  return clean({ profiles: p.docs.map(v => ({ ...v.data(), id: v.id })), dossiers: d.docs.map(v => ({ ...v.data(), id: v.id })), evaluations: e.docs.map(v => ({ ...v.data(), id: v.id })), legacyUsers: u.docs.map(v => ({ ...v.data(), id: v.id })) });
}
function validateRequest(body: any): ImportRequest {
  if (!body || !['NEW', 'HISTORY'].includes(body.mode) || !Number.isInteger(body.year) || body.year < 2000 || body.year > 2100 || !Array.isArray(body.tables) || body.tables.length > 30) deny('Requête d’import invalide.', 400);
  let cells = 0;
  for (const table of body.tables) {
    if (!['profiles', 'resources', 'values', 'rh', 'evaluations', 'documents', 'meteos'].includes(table.kind) || typeof table.file !== 'string' || typeof table.sheet !== 'string' || !Array.isArray(table.rows)) deny('Table invalide.', 400);
    for (const row of table.rows) { if (!Array.isArray(row) || row.some(v => typeof v !== 'string' || v.length > 100000)) deny('Cellule invalide.', 400); cells += row.length; }
  }
  if (cells > 500000) deny('Import trop volumineux : limiter à 500 000 cellules.', 400);
  if (body.meteoFrom && (!/^\d{4}-\d{2}-\d{2}$/.test(body.meteoFrom) || body.meteoFrom > body.meteoTo)) deny('Période météo invalide.', 400);
  return { year: body.year, mode: body.mode, tables: body.tables, ...(body.meteoFrom ? { meteoFrom: body.meteoFrom, meteoTo: body.meteoTo } : {}) };
}

export function installCampaignApi(app: Express) {
  app.post('/api/session', authenticate, wrap(async (_req, res) => {
    const db = admin(), identity = res.locals.identity, email = identity.email.toLowerCase();
    const matches = await db.collection('profiles').where('email', '==', email).get();
    let profileId = res.locals.account?.profileId;
    if (!profileId && matches.size === 1) profileId = matches.docs[0].id;
    if (!profileId && res.locals.isAdmin) {
      profileId = `admin-${identity.uid}`;
      await db.doc(`profiles/${profileId}`).set({ id: profileId, displayName: identity.name || email, email, roles: [], createdAt: new Date().toISOString() }, { merge: true });
    }
    if (!profileId) {
      await db.doc(`users/${identity.uid}`).set({ id: identity.uid, email, displayName: identity.name || email, profileId: '', roles: [], accessVersion: 2 }, { merge: true });
      deny(matches.size > 1 ? 'Plusieurs profils portent cette adresse. Un administrateur doit résoudre le rapprochement.' : 'Votre demande de connexion est enregistrée. Votre profil doit être importé puis rattaché par un administrateur.');
    }
    const roles = res.locals.isAdmin ? ['ADMIN', 'JURY', 'EVALUATOR'] : (res.locals.account?.accessVersion === 2 && res.locals.account?.profileId ? res.locals.account.roles : ['EVALUATOR']);
    if (!roles?.length) deny('Accès désactivé. Contactez un administrateur.');
    await db.doc(`users/${identity.uid}`).set({ id: identity.uid, profileId, email, displayName: identity.name || email, roles, accessVersion: 2 }, { merge: true });
    res.json({ profileId, roles, uid: identity.uid });
  }));
  app.post('/api/import/preview', authenticate, requireAdmin, wrap(async (req, res) => {
    const input = validateRequest(req.body), before = await state(), campaign = (await admin().doc(`campaigns/campaign_${input.year}`).get()).data() || null;
    const plan = buildImportPlan(input, before);
    if (campaign?.importState === 'RUNNING') plan.errors.push('Un import est déjà en cours pour cette campagne.');
    if (campaign && input.mode === 'NEW') plan.errors.push('Cette campagne existe déjà. Utiliser le mode reprise / mise à jour.');
    res.json({ ...plan, token: hash({ input, before, campaign }), counts: { profiles: plan.profiles.length, dossiers: plan.dossiers.length, evaluations: plan.evaluations.length } });
  }));
  app.post('/api/import/apply', authenticate, requireAdmin, wrap(async (req, res) => {
    const input = validateRequest(req.body), db = admin(), campaignRef = db.doc(`campaigns/campaign_${input.year}`), before = await state();
    const campaign = (await campaignRef.get()).data() || null;
    if (req.body.token !== hash({ input, before, campaign })) deny('Les données ont changé depuis l’aperçu. Relancer la vérification.', 409);
    const plan = buildImportPlan(input, before);
    if (plan.errors.length) deny(plan.errors.join('\n'), 400);
    if (campaign && input.mode === 'NEW') deny('Campagne existante : utiliser reprise / mise à jour.', 409);
    const runId = randomUUID(), now = new Date().toISOString();
    const lockRef = db.doc('_system/importLock');
    const affectedYears = [...new Set([input.year, ...plan.dossiers.map(d => d.campaignYear)])];
    const previousStatuses: Record<string, string> = {};
    await db.runTransaction(async tx => {
      const lock = (await tx.get(lockRef)).data();
      if (lock?.status === 'RUNNING') deny('Un import est déjà en cours. Attendre sa fin ou utiliser la récupération après interruption.', 409);
      const campaignSnapshots = await tx.getAll(...affectedYears.map(y => db.doc(`campaigns/campaign_${y}`)));
      const priorIds = [...new Set(campaignSnapshots.filter(s => s.data()?.importState === 'FAILED' && s.data()?.importRunId).map(s => s.data()!.importRunId))];
      const priorRuns = priorIds.length ? await tx.getAll(...priorIds.map(id => db.doc(`importRuns/${id}`))) : [];
      const current = campaignSnapshots.find(s => s.id === campaignRef.id)?.data();
      if (hash(current || null) !== hash(campaign)) deny('Campagne modifiée depuis l’aperçu.', 409);
      // Detect any edit between preview and lock acquisition, including other campaigns.
      const snapshots = await Promise.all(['profiles', 'dossiers', 'evaluations', 'users'].map(c => tx.get(db.collection(c))));
      const currentState = clean({ profiles: snapshots[0].docs.map(v => ({ ...v.data(), id: v.id })), dossiers: snapshots[1].docs.map(v => ({ ...v.data(), id: v.id })), evaluations: snapshots[2].docs.map(v => ({ ...v.data(), id: v.id })), legacyUsers: snapshots[3].docs.map(v => ({ ...v.data(), id: v.id })) });
      if (hash(currentState) !== hash(before)) deny('Les données ont changé. Relancer l’aperçu.', 409);
      for (const snap of campaignSnapshots) {
        const data = snap.data(), y = Number(snap.id.slice('campaign_'.length));
        const previous = priorRuns.find(r => r.id === data?.importRunId)?.data()?.previousStatuses?.[snap.id] || data?.status;
        previousStatuses[snap.id] = previous === 'CLÔTURÉE' ? 'CLÔTURÉE' : 'OUVERTE';
        tx.set(snap.ref, { id: snap.id, year: y, title: `Campagne Annuelle ${y}`, rhDocuments: [], pairsDocuments: [], otherDocuments: [], ...data, status: 'EN_PRÉPARATION', mode: data?.mode || input.mode, importState: 'RUNNING', importRunId: runId, sourceFiles: [...new Set([...(data?.sourceFiles || []), ...input.tables.map(t => t.file)])], createdAt: data?.createdAt || now, updatedAt: now }, { merge: true });
      }
      tx.set(lockRef, { runId, status: 'RUNNING', heartbeat: now });
      tx.set(db.doc(`importRuns/${runId}`), { year: input.year, actor: res.locals.identity.uid, status: 'RUNNING', startedAt: now, previousStatuses, changesCount: plan.changes.length, sourceFiles: [...new Set(input.tables.map(t => t.file))] });
    });
    try {
      const writes = [...plan.profiles.map(value => ({ collection: 'profiles', value })), ...plan.dossiers.map(value => ({ collection: 'dossiers', value })), ...plan.evaluations.map(value => ({ collection: 'evaluations', value })), ...plan.accountLinks.map(link => ({ collection: 'users', value: { id: link.uid, profileId: link.profileId } }))];
      for (let i = 0; i < writes.length; i += 100) {
        await db.runTransaction(async batch => {
        const lease = (await batch.get(lockRef)).data();
        if (lease?.runId !== runId || lease.status !== 'RUNNING') deny('Import interrompu par récupération.', 409);
        const chunk = writes.slice(i, i + 100);
        const originals = await batch.getAll(...chunk.map(w => db.doc(`${w.collection}/${w.value.id}`)));
        for (const [index, { collection, value }] of chunk.entries()) {
          batch.set(db.doc(`importRuns/${runId}/before/${stableId(collection, value.id)}`), { path: `${collection}/${value.id}`, existed: originals[index].exists, value: originals[index].exists ? originals[index].data() : null });
          batch.set(db.doc(`${collection}/${value.id}`), clean(value), { merge: true });
          if (collection === 'dossiers') {
            const d = value as any;
            batch.set(db.doc(`participants/${d.id}`), { id: d.id, candidateId: d.candidateId, campaignYear: d.campaignYear, displayName: d.candidateName, status: d.status }, { merge: true });
          }
        }
        batch.set(db.doc(`importRuns/${runId}`), { completedWrites: Math.min(i + 100, writes.length) }, { merge: true });
        batch.update(lockRef, { heartbeat: new Date().toISOString() });
        });
      }
      await db.runTransaction(async batch => {
      const lease = (await batch.get(lockRef)).data();
      if (lease?.runId !== runId || lease.status !== 'RUNNING') deny('Import interrompu.', 409);
      for (const [id, status] of Object.entries(previousStatuses)) batch.update(db.doc(`campaigns/${id}`), { status, importState: 'READY', updatedAt: new Date().toISOString() });
      batch.update(lockRef, { status: 'READY' });
      batch.update(db.doc(`importRuns/${runId}`), { status: 'READY', finishedAt: new Date().toISOString() });
      });
      res.json({ success: true, runId, changes: plan.changes.length });
    } catch (e) {
      await db.runTransaction(async failed => {
        const lease = (await failed.get(lockRef)).data();
        if (lease?.runId === runId) {
          for (const id of Object.keys(previousStatuses)) failed.update(db.doc(`campaigns/${id}`), { importState: 'FAILED' });
          failed.update(lockRef, { status: 'FAILED' });
        }
        failed.set(db.doc(`importRuns/${runId}`), { status: 'FAILED', error: (e as Error).message }, { merge: true });
      });
      throw new Error('Import interrompu. La campagne reste en préparation. Relancer le même import en mode reprise ; aucune archive n’a été supprimée.');
    }
  }));
  app.post('/api/import/recover', authenticate, requireAdmin, wrap(async (_req, res) => {
    const db = admin(), lockRef = db.doc('_system/importLock');
    await db.runTransaction(async tx => {
      const lock = (await tx.get(lockRef)).data();
      if (!lock || lock.status !== 'RUNNING') deny('Aucun import bloqué en cours.', 409);
      if (Date.now() - Date.parse(lock.heartbeat) < 15 * 60 * 1000) deny('L’import est encore actif. La récupération est disponible après 15 minutes sans activité.', 409);
      const runRef = db.doc(`importRuns/${lock.runId}`), run = (await tx.get(runRef)).data();
      for (const id of Object.keys(run?.previousStatuses || {})) tx.update(db.doc(`campaigns/${id}`), { importState: 'FAILED' });
      tx.update(lockRef, { status: 'FAILED' }); tx.update(runRef, { status: 'FAILED', error: 'Récupération administrative après interruption.' });
    }); res.json({ success: true });
  }));
  app.post('/api/campaign/status', authenticate, requireAdmin, wrap(async (req, res) => {
    if (!Number.isInteger(req.body.year) || !['OUVERTE', 'CLÔTURÉE'].includes(req.body.status)) deny('Statut invalide.', 400);
    const ref = admin().doc(`campaigns/campaign_${req.body.year}`);
    await admin().runTransaction(async tx => {
      const c = (await tx.get(ref)).data(); if (!c || c.importState === 'RUNNING' || c.importState === 'FAILED') deny('Terminer l’import avant de modifier le statut.', 409);
      tx.update(ref, { status: req.body.status, updatedAt: new Date().toISOString(), closedBy: req.body.status === 'CLÔTURÉE' ? res.locals.identity.uid : null });
    }); res.json({ success: true });
  }));
  app.post('/api/evaluations/save', authenticate, requireMember, wrap(async (req, res) => {
    const b = req.body, db = admin(), account = res.locals.account;
    if (!Number.isInteger(b.year) || typeof b.candidateId !== 'string' || b.candidateId.includes('/') || !account?.profileId) deny('Évaluation invalide.', 400);
    const type = evaluationType(b.type), evaluatorId = account.profileId;
    if ((type === 'Auto_Evaluation') !== (evaluatorId === b.candidateId)) deny('Choisir Auto_Evaluation uniquement pour son propre dossier.', 400);
    const client = String(b.client || '').trim(), project = String(b.project || '').trim();
    if (!client || !project || client.length > 200 || project.length > 200) deny('Client et projet requis (200 caractères maximum).', 400);
    const min = numberValue(String(b.targetTJMin ?? '')), max = numberValue(String(b.targetTJMax ?? '')), confidence = numberValue(String(b.confidenceIndex ?? ''));
    if (min === undefined || max === undefined || min < 0 || max < min || confidence === undefined || confidence < 0 || confidence > 10) deny('Fourchette TJ ou confiance invalide.', 400);
    const justification = String(b.justification || '').trim(), axes = String(b.improvementAxes || '').trim();
    if (justification.length > 20000 || axes.length > 20000 || (b.validated && !justification)) deny('Justification requise pour valider (20 000 caractères maximum).', 400);
    const id = stableId(b.year, b.candidateId, evaluatorId, client, project, type), profile = (await db.doc(`profiles/${evaluatorId}`).get()).data();
    await db.runTransaction(async tx => {
      const c = (await tx.get(db.doc(`campaigns/campaign_${b.year}`))).data();
      const candidates = await tx.get(db.collection('dossiers').where('campaignYear', '==', b.year).where('candidateId', '==', b.candidateId));
      if (c?.status !== 'OUVERTE' || candidates.size !== 1 || candidates.docs[0].data().status === 'VALIDE') deny('Campagne ou dossier fermé.', 409);
      tx.set(db.doc(`evaluations/${id}`), { id, candidateId: b.candidateId, campaignYear: b.year, consultantId: evaluatorId, consultantName: profile?.displayName || account.email, type, client, project, targetTJMin: min, targetTJMax: max, confidenceIndex: confidence, justification, improvementAxes: axes, validated: b.validated === true, updatedAt: new Date().toISOString() }, { merge: true });
    }); res.json({ success: true, id });
  }));
  app.post('/api/users/access', authenticate, requireAdmin, wrap(async (req, res) => {
    const { uid, profileId, roles } = req.body;
    if (typeof uid !== 'string' || uid.includes('/') || typeof profileId !== 'string' || profileId.includes('/') || !Array.isArray(roles) || roles.some(r => !['ADMIN', 'JURY', 'EVALUATOR'].includes(r))) deny('Droits invalides.', 400);
    const p = await admin().doc(`profiles/${profileId}`).get(); if (!p.exists) deny('Profil inconnu.', 400);
    if (uid === res.locals.identity.uid && !roles.includes('ADMIN')) deny('Vous ne pouvez pas retirer votre propre accès administrateur.', 400);
    await admin().doc(`users/${uid}`).set({ profileId, roles, accessVersion: 2 }, { merge: true }); res.json({ success: true });
  }));
}
