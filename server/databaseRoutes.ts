import { Router } from 'express';
import firebaseConfig from '../firebase-applet-config.json';
import { JsonFileStore, validateMutations } from './jsonFileStore';
import { applyMutations, matchesId, type Database, type Mutation } from '../shared/database';

export type Identity = { uid: string; email: string };
const masters = ['adam.nassir@logiclever.com', 'guillaume.best@logiclever.com', 'guillaumebestece@gmail.com'];
export async function verifyFirebaseIdentity(token: string): Promise<Identity> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  const user = result.users?.[0];
  if (!response.ok || !user?.emailVerified || user.disabled || !user.localId || !user.email) {
    throw new Error('Connexion Firebase invalide ou expirée. Reconnectez-vous.');
  }
  return { uid: user.localId, email: user.email.toLowerCase() };
}

function permissions(database: Database, identity: Identity) {
  const profile = database.users.find(row => row.email?.toLowerCase() === identity.email);
  const admin = masters.includes(identity.email) || profile?.roles?.includes('ADMIN');
  const jury = profile?.roles?.includes('JURY');
  const ids = [identity.uid, profile?.id, profile?.idProfil].filter(Boolean);
  return { profile, admin, jury, ids };
}
function visibleDatabase(database: Database, identity: Identity): Database {
  const { profile, admin, jury, ids } = permissions(database, identity);
  if (admin || jury) return database;
  if (!profile) throw new Error('Votre compte ne figure pas dans le répertoire. Contactez un administrateur.');
  const dossiers = database.dossiers.filter(row => ids.includes(row.candidateId) || ids.includes(row.idProfil) ||
    row.assignedConsultantIds?.some(id => ids.includes(id)));
  const candidateIds = dossiers.flatMap(row => [row.candidateId, row.idProfil]);
  return {
    campaigns: database.campaigns.map(({ rhDocuments, pairsDocuments, otherDocuments, ...row }) =>
      ({ ...row, rhDocuments: [], pairsDocuments: [], otherDocuments: [] })),
    dossiers, users: database.users.filter(row => row === profile || candidateIds.includes(row.id) || candidateIds.includes(row.idProfil)),
    personnes: database.personnes.filter(row => ids.includes(row.idProfil)),
    campaign_participants: database.campaign_participants.filter(row => ids.includes(row.idProfil)),
  };
}
export function authorizeMutations(database: Database, identity: Identity, operations: Mutation[]) {
  const { profile, admin, jury, ids } = permissions(database, identity);
  if (admin) return;
  if (!profile) throw new Error('Compte absent du répertoire.');
  for (const op of operations) {
    if (op.collection !== 'dossiers' || op.kind === 'delete') throw new Error('Modification réservée aux administrateurs.');
    const row = database.dossiers.find(row => matchesId('dossiers', row, op.id));
    if (!row || (op.kind === 'set' && !op.merge)) throw new Error('Création de dossier réservée aux administrateurs.');
    const own = ids.includes(row.candidateId) || ids.includes(row.idProfil);
    const evaluator = row.assignedConsultantIds?.some(id => ids.includes(id));
    const allowed = new Set(['updatedAt']);
    if (own) ['annualReport', 'documents', 'clientFeedbacks', 'status'].forEach(field => allowed.add(field));
    if (jury) ['juryDecision', 'status'].forEach(field => allowed.add(field));
    if (jury || evaluator) allowed.add('consultantFeedbacks');
    if (!Object.keys(op.data || {}).every(key => allowed.has(key.split('.')[0]))) throw new Error('Modification non autorisée pour ce dossier.');
    if (!jury && op.data?.status && !['OUVERT', 'COMPLET'].includes(op.data.status)) throw new Error('Statut réservé au jury.');
    if (own && !jury && row.status === 'VALIDE') throw new Error('Ce dossier est clôturé.');
  }
  // Validate the whole batch before touching any files.
  applyMutations(database, operations);
}

export function createDatabaseRouter(store: JsonFileStore, verify = verifyFirebaseIdentity) {
  const router = Router();
  router.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) { res.status(401).json({ error: 'Connexion Firebase requise.' }); return; }
    try { res.locals.identity = await verify(token); next(); }
    catch (error) { res.status(401).json({ error: (error as Error).message }); }
  });
  router.get('/', (_req, res) => {
    try {
      const database = store.read();
      res.json({ database: visibleDatabase(database, res.locals.identity), canImport: permissions(database, res.locals.identity).admin });
    } catch (error) { res.status(403).json({ error: (error as Error).message }); }
  });
  router.post('/mutations', (req, res) => {
    try {
      validateMutations(req.body.operations);
      const database = store.commit(req.body.operations, current => authorizeMutations(current, res.locals.identity, req.body.operations));
      res.json({ database: visibleDatabase(database, res.locals.identity) });
    } catch (error) { res.status(400).json({ error: `Enregistrement JSON impossible : ${(error as Error).message}` }); }
  });
  router.post('/import-browser', (req, res) => {
    try {
      if (!permissions(store.read(), res.locals.identity).admin) {
        res.status(403).json({ error: 'Import réservé aux administrateurs.' }); return;
      }
      res.json({ database: store.importBrowser(req.body.database) });
    } catch (error) { res.status(400).json({ error: `Import JSON impossible : ${(error as Error).message}` }); }
  });
  return router;
}
