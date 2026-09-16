/** Local document API used by the app. No Firebase database or network operations. */
import { CollectionName, RecordData, Mutation, readCollection, readRecord, commitMutations, subscribeLocal } from '../services/localStore';

export const db = Object.freeze({ storage: 'localStorage' });
type Filter = { field: string; operator: '==' | 'array-contains'; value: any };
type CollectionRef = { name: CollectionName; filters: Filter[] };
type DocumentRef = { name: CollectionName; id: string };
export function collection(_database: typeof db, name: CollectionName): CollectionRef { return { name, filters: [] }; }
export function doc(parent: typeof db | CollectionRef, nameOrId?: string, id?: string): DocumentRef {
  if ('name' in parent) return { name: parent.name, id: nameOrId || crypto.randomUUID() };
  if (!nameOrId || !id) throw new Error('Collection and document id are required.');
  return { name: nameOrId as CollectionName, id };
}
export function where(field: string, operator: Filter['operator'], value: any): Filter { return { field, operator, value }; }
export function query(ref: CollectionRef, ...filters: Filter[]): CollectionRef { return { ...ref, filters: [...ref.filters, ...filters] }; }
function documentSnapshot(ref: DocumentRef, value = readRecord(ref.name, ref.id)) {
  return { id: ref.id, ref, exists: () => value !== undefined, data: (): RecordData => value && JSON.parse(JSON.stringify(value)) };
}
function collectionSnapshot(ref: CollectionRef) {
  const rows = readCollection(ref.name).filter(row => ref.filters.every(filter => {
    const value = filter.field.split('.').reduce((data, key) => data?.[key], row);
    return filter.operator === '==' ? value === filter.value : Array.isArray(value) && value.includes(filter.value);
  }));
  const docs = rows.map(row => documentSnapshot({ name: ref.name, id: row.id || row.idProfil }, row));
  return { docs, empty: docs.length === 0, size: docs.length, forEach: (callback: (doc: ReturnType<typeof documentSnapshot>) => void) => docs.forEach(callback) };
}
export async function getDoc(ref: DocumentRef) { return documentSnapshot(ref); }
export async function getDocs(ref: CollectionRef) { return collectionSnapshot(ref); }
export async function setDoc(ref: DocumentRef, data: RecordData, options?: { merge?: boolean }) {
  commitMutations([{ collection: ref.name, id: ref.id, kind: 'set', data, merge: options?.merge }]);
}
export async function updateDoc(ref: DocumentRef, data: RecordData) {
  commitMutations([{ collection: ref.name, id: ref.id, kind: 'update', data }]);
}
export async function deleteDoc(ref: DocumentRef) { commitMutations([{ collection: ref.name, id: ref.id, kind: 'delete' }]); }
export function serverTimestamp() { return new Date().toISOString(); }
export function writeBatch(_database: typeof db) {
  const operations: Mutation[] = [];
  return {
    set(ref: DocumentRef, data: RecordData, options?: { merge?: boolean }) { operations.push({ collection: ref.name, id: ref.id, kind: 'set', data, merge: options?.merge }); },
    update(ref: DocumentRef, data: RecordData) { operations.push({ collection: ref.name, id: ref.id, kind: 'update', data }); },
    delete(ref: DocumentRef) { operations.push({ collection: ref.name, id: ref.id, kind: 'delete' }); },
    async commit() { commitMutations(operations); operations.length = 0; },
  };
}
export function onSnapshot(ref: DocumentRef, callback: (snapshot: ReturnType<typeof documentSnapshot>) => void, onError?: (error: Error) => void): () => void;
export function onSnapshot(ref: CollectionRef, callback: (snapshot: ReturnType<typeof collectionSnapshot>) => void, onError?: (error: Error) => void): () => void;
export function onSnapshot(ref: DocumentRef | CollectionRef, callback: (snapshot: any) => void, onError?: (error: Error) => void): () => void {
  let previous: string | undefined;
  let initialized = false;
  const sync = () => {
    try {
      const snapshot = 'id' in ref ? documentSnapshot(ref) : collectionSnapshot(ref);
      const serialized = JSON.stringify('docs' in snapshot ? snapshot.docs.map(item => item.data()) : snapshot.data());
      if (initialized && previous === serialized) return;
      initialized = true;
      previous = serialized;
      callback(snapshot);
    } catch (error) { if (onError) onError(error as Error); else console.error(error); }
  };
  const unsubscribe = subscribeLocal(sync);
  sync();
  return unsubscribe;
}
