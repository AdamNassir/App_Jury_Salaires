import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { applyMutations, matchesId, type Database, type Mutation } from '../shared/database';

export const collections = ['users', 'campaigns', 'dossiers', 'personnes', 'campaign_participants'] as const;
const stateName = '.json-store-state.json';
const journalName = '.json-store-pending.json';
type State = { imports: string[] };

export function validateDatabase(value: any): asserts value is Database {
  if (!value || !collections.every(name => Array.isArray(value[name]) && value[name].every(row =>
    row && typeof row === 'object' && !Array.isArray(row) && typeof (row.id || row.idProfil) === 'string'))) {
    throw new Error('Format de base JSON invalide.');
  }
  rejectUnsafeKeys(value);
}

function rejectUnsafeKeys(value: any) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part))) throw new Error('Champ JSON invalide.');
    rejectUnsafeKeys(child);
  }
}

export function validateMutations(value: any): asserts value is Mutation[] {
  if (!Array.isArray(value) || value.length > 50000 || !value.every(op => op &&
    collections.includes(op.collection) && typeof op.id === 'string' && op.id.length > 0 &&
    ['set', 'update', 'delete'].includes(op.kind) &&
    (op.kind === 'delete' || (op.data && typeof op.data === 'object' && !Array.isArray(op.data))))) {
    throw new Error('Modifications JSON invalides.');
  }
  rejectUnsafeKeys(value);
}

/** Single-process JSON storage. A rollback journal covers multi-file campaign saves. */
export class JsonFileStore {
  constructor(readonly directory: string) {
    fs.mkdirSync(directory, { recursive: true });
    this.recover();
  }
  private atomicWrite(filename: string, value: unknown) {
    const destination = path.join(this.directory, filename);
    const temporary = `${destination}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(temporary, destination);
  }
  private recover() {
    const journal = path.join(this.directory, journalName);
    if (!fs.existsSync(journal)) return;
    const previous = JSON.parse(fs.readFileSync(journal, 'utf8'));
    validateDatabase(previous.database);
    for (const name of collections) this.atomicWrite(`${name}.json`, previous.database[name]);
    this.atomicWrite(stateName, previous.state);
    fs.unlinkSync(journal);
  }
  read(): Database {
    this.recover();
    const database = Object.fromEntries(collections.map(name => {
      const filename = path.join(this.directory, `${name}.json`);
      // Only the two auxiliary collections may be absent in older projects.
      const rows = !fs.existsSync(filename) && ['personnes', 'campaign_participants'].includes(name)
        ? [] : JSON.parse(fs.readFileSync(filename, 'utf8'));
      return [name, rows];
    })) as Database;
    validateDatabase(database);
    return database;
  }
  private state(): State {
    const filename = path.join(this.directory, stateName);
    return fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : { imports: [] };
  }
  private save(before: Database, after: Database, state = this.state()) {
    validateDatabase(after);
    this.atomicWrite(journalName, { database: before, state: this.state() });
    try {
      for (const name of collections) this.atomicWrite(`${name}.json`, after[name]);
      this.atomicWrite(stateName, state);
      fs.unlinkSync(path.join(this.directory, journalName));
    } catch (error) {
      // Keep the journal if rollback itself fails; next read/start retries recovery.
      this.recover();
      throw error;
    }
    return after;
  }
  commit(operations: Mutation[], authorize: (database: Database) => void = () => {}) {
    validateMutations(operations);
    const before = this.read();
    authorize(before);
    return this.save(before, applyMutations(before, operations));
  }
  importBrowser(database: Database) {
    validateDatabase(database);
    const before = this.read();
    const state = this.state();
    const fingerprint = createHash('sha256').update(JSON.stringify(database)).digest('hex');
    if (state.imports.includes(fingerprint)) return before;
    // Preserve server edits and deletions on repeated imports. Existing records win.
    const operations: Mutation[] = [];
    for (const name of collections) {
      for (const row of database[name]) {
        const id = row.id || row.idProfil;
        const exists = before[name].some(existing => matchesId(name, existing, id) ||
          (name === 'users' && row.email && existing.email?.toLowerCase() === row.email.toLowerCase()));
        if (!exists) operations.push({ collection: name, id, kind: 'set', data: row });
      }
    }
    return this.save(before, applyMutations(before, operations), { imports: [...state.imports, fingerprint] });
  }
}
