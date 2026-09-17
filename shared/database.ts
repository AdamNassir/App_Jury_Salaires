export type CollectionName = 'campaigns' | 'dossiers' | 'users' | 'personnes' | 'campaign_participants';
export type RecordData = Record<string, any>;
export type Database = Record<CollectionName, RecordData[]>;
export type Mutation = { collection: CollectionName; id: string; kind: 'set' | 'update' | 'delete'; data?: RecordData; merge?: boolean };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const recordId = (row: RecordData) => row.id || row.idProfil || row.email;
export const matchesId = (name: CollectionName, row: RecordData, id: string) =>
  recordId(row) === id || (name === 'users' && row.idProfil === id);

function mergeMaps(current: RecordData, incoming: RecordData): RecordData {
  const result = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length
      ? mergeMaps(current[key] || {}, value) : value;
  }
  return result;
}
export function applyMutations(current: Database, operations: Mutation[]): Database {
  const database = clone(current);
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
  return database;
}

