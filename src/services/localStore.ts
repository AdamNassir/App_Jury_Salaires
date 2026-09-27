import campaigns from '../data/campaigns.json';
import dossiers from '../data/dossiers.json';
import users from '../data/users.json';

export type CollectionName = 'campaigns' | 'dossiers' | 'users' | 'personnes' | 'campaign_participants';
export type RecordData = Record<string, any>;
type Database = Record<CollectionName, RecordData[]>;
export type Mutation = { collection: CollectionName; id: string; kind: 'set' | 'update' | 'delete'; data?: RecordData; merge?: boolean };
export const DATABASE_KEY = 'app_local_database_v2';
const BUILTIN_USERS_VERSION_KEY = 'app_local_builtin_users_version';
const BUILTIN_USERS_VERSION = '1';
const legacyKeys: Record<CollectionName, string> = {
  campaigns: 'app_local_campaigns_v1', dossiers: 'app_local_dossiers_v1',
  users: 'app_users_directory_custom_v1', personnes: 'app_local_personnes_v1',
  campaign_participants: 'app_local_participants_v1',
};
const listeners = new Set<() => void>();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const recordId = (row: RecordData) => row.id || row.idProfil || row.email;
const matchesId = (name: CollectionName, row: RecordData, id: string) =>
  recordId(row) === id || (name === 'users' && row.idProfil === id);

function storage(): Storage {
  if (typeof window === 'undefined') throw new Error('LocalStorage requires a browser.');
  return window.localStorage;
}

function readDatabase(): Database {
  const localStorage = storage();
  const saved = localStorage.getItem(DATABASE_KEY);
  if (saved !== null) {
    const parsed = JSON.parse(saved);
    if (!parsed || !Object.keys(legacyKeys).every(key => Array.isArray(parsed[key]))) {
      throw new Error('La base locale est invalide. Restaurez une sauvegarde avant de continuer.');
    }

    if (localStorage.getItem(BUILTIN_USERS_VERSION_KEY) !== BUILTIN_USERS_VERSION) {
      const julien = (users as RecordData[]).find(user => user.idProfil === 'COMP1');
      const existingIndex = parsed.users.findIndex((user: RecordData) =>
        user.idProfil === 'COMP1' ||
        user.email?.trim().toLowerCase() === 'julien.bourlon@logiclever.com'
      );
      if (julien && existingIndex < 0) {
        parsed.users.push(clone(julien));
        localStorage.setItem(DATABASE_KEY, JSON.stringify(parsed));
      }
      localStorage.setItem(BUILTIN_USERS_VERSION_KEY, BUILTIN_USERS_VERSION);
    }
    return parsed;
  }
  const initial: Database = { campaigns: clone(campaigns), dossiers: clone(dossiers), users: clone(users), personnes: [], campaign_participants: [] };
  for (const name of Object.keys(legacyKeys) as CollectionName[]) {
    const legacy = storage().getItem(legacyKeys[name]);
    if (legacy === null) continue;
    const rows = JSON.parse(legacy);
    if (!Array.isArray(rows)) throw new Error(`Données locales invalides : ${name}`);
    // The former services persisted full collection snapshots, including empty arrays.
    const merged = new Map<string, RecordData>();
    for (const row of rows) {
      // The former directory keyed users by idProfil, while documents use id.
      const previous = [...merged.values()].find(item =>
        recordId(item) === recordId(row) || (name === 'users' && (
          (row.idProfil && row.idProfil === item.idProfil) ||
          (row.email && row.email.toLowerCase() === item.email?.toLowerCase())
        )));
      if (previous) merged.delete(recordId(previous));
      merged.set(recordId(row), { ...previous, ...row });
    }
    initial[name] = [...merged.values()];
  }
  initial.campaigns = initial.campaigns.map(c => ({
    ...c, title: c.title || c.label || `Campagne ${c.year}`,
    rhDocuments: c.rhDocuments || [], pairsDocuments: c.pairsDocuments || [], otherDocuments: c.otherDocuments || [],
  }));
  // Seeds and legacy keys are imported only once. Deletions stay deleted on reload.
  localStorage.setItem(DATABASE_KEY, JSON.stringify(initial));
  localStorage.setItem(BUILTIN_USERS_VERSION_KEY, BUILTIN_USERS_VERSION);
  return initial;
}

function notify() {
  for (const listener of listeners) {
    try { listener(); } catch (error) { console.error('Local database subscriber:', error); }
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === DATABASE_KEY || event.key === null) notify();
  });
}

export function readCollection<T = RecordData>(name: CollectionName): T[] {
  return readDatabase()[name] as T[];
}
export function readRecord(name: CollectionName, id: string): RecordData | undefined {
  return readDatabase()[name].find(row => matchesId(name, row, id));
}
function mergeMaps(current: RecordData, incoming: RecordData): RecordData {
  const result = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length
      ? mergeMaps(current[key] || {}, value) : value;
  }
  return result;
}
export function commitMutations(operations: Mutation[]): void {
  const database = readDatabase();
  for (const op of operations) {
    const rows = database[op.collection];
    const index = rows.findIndex(row => matchesId(op.collection, row, op.id));
    if (op.kind === 'delete') {
      if (index >= 0) rows.splice(index, 1);
      continue;
    }
    if (op.kind === 'update' && index < 0) throw new Error(`Document local introuvable : ${op.collection}/${op.id}`);
    const incoming = clone(op.data || {});
    let value = op.kind === 'update' || op.merge ? { ...rows[index] } : {};
    if (op.kind === 'update') {
      for (const [path, fieldValue] of Object.entries(incoming)) {
        const parts = path.split('.');
        let target = value;
        for (const part of parts.slice(0, -1)) target = target[part] = { ...target[part] };
        target[parts[parts.length - 1]] = fieldValue;
      }
    } else value = op.merge ? mergeMaps(value, incoming) : incoming;
    if (op.collection === 'personnes') value.idProfil = value.idProfil || op.id;
    else value.id = value.id || op.id;
    if (index < 0) rows.push(value); else rows[index] = value;
  }
  // One atomic storage write for a whole campaign. Failure leaves persisted data unchanged.
  try { storage().setItem(DATABASE_KEY, JSON.stringify(database)); }
  catch { throw new Error('Enregistrement local impossible : espace insuffisant ou stockage désactivé. Les modifications ne sont pas enregistrées.'); }
  notify();
}
export function subscribeLocal(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
