import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  writes = 0;
  failWrites = false;
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.writes++;
    this.values.set(key, String(value));
  }
}
const storage = new MemoryStorage();
const events = new EventTarget();
Object.defineProperty(globalThis, 'window', { value: { localStorage: storage, addEventListener: events.addEventListener.bind(events) }, configurable: true });
const { DATABASE_KEY, readCollection } = await import('../src/services/localStore');
const { db, collection, doc, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } = await import('../src/lib/localDatabase');
const { LocalDatabaseService } = await import('../src/services/localDatabaseService');
const { UserDirectoryService } = await import('../src/services/userDirectoryService');
const { CampaignInitializationService } = await import('../src/services/campaignInitializationService');
import type { CampaignInitPreview } from '../src/services/campaignInitializationService';

function preview(year = 2031): CampaignInitPreview {
  return {
    year, totalCandidatesParsed: 1,
    candidatesToProcess: [{ idProfil: 'test-candidate', nom: 'Candidate', prenom: 'Test', displayName: 'Test Candidate', email: 'candidate@example.test', grade: 'Senior', currentSalary: 50000, currentTJM: 650, isExistingPersonne: false, isExistingParticipant: false, isExistingUser: false, action: 'CREATE', warnings: [] }],
    evaluatorsToProcess: [{ idProfil: 'test-evaluator', matricule: 'E1', nom: 'Evaluator', prenom: 'Test', displayName: 'Test Evaluator', email: 'evaluator@example.test', isCandidate: false, isExistingPersonne: false, isExistingUser: false, assignedCandidateIds: ['test-candidate'] }],
    assignmentsByCandidate: { 'test-candidate': ['test-evaluator'] },
    newPersonnesCount: 2, existingPersonnesCount: 0, participantsToCreateCount: 2, participantsToUpdateCount: 0,
    evaluatorsCount: 1, newEvaluatorsOnlyCount: 1, newUsersCount: 2, totalPrimesParsed: 1, activePrimesCount: 1, expiredPrimesCount: 0,
    meteoLinksCount: 0, meteoLinksByCandidate: {},
    warnings: [], blockingErrors: [], canProceed: true,
  };
}
const metadata = { title: 'Test campaign', createdBy: 'Test admin', rhDocuments: [{ id: 'rh', name: 'RH.xlsx' }], pairsDocuments: [], otherDocuments: [{ id: 'other', name: 'Notes.txt' }] };
beforeEach(() => {
  storage.clear();
  storage.failWrites = false;
  storage.writes = 0;
});

test('fresh local directory retains both template administrators and Guillaume Gmail', () => {
  for (const email of ['adam.nassir@logiclever.com', 'guillaume.best@logiclever.com', 'guillaumebestece@gmail.com', 'julien.bourlon@logiclever.com']) {
    const user = UserDirectoryService.getUserByEmail(email);
    assert.ok(user, `Missing template account: ${email}`);
    assert.ok(user.roles.includes('ADMIN'), `Missing administrator role: ${email}`);
  }
  const julien = UserDirectoryService.getUserByEmail('julien.bourlon@logiclever.com')!;
  assert.equal(julien.idProfil, 'COMP1');
  assert.equal(julien.matricule, 'JBO');
  assert.deepEqual([...julien.roles].sort(), ['ADMIN', 'CANDIDATE', 'EVALUATOR', 'JURY']);

  const restoredJulien = UserDirectoryService.normalizeUser({ email: 'julien.bourlon@logiclever.com' });
  assert.deepEqual([...restoredJulien.roles].sort(), ['ADMIN', 'CANDIDATE', 'EVALUATOR', 'JURY']);
});

test('existing browser databases add Julien without replacing current users', () => {
  readCollection('users');
  const database = JSON.parse(storage.getItem(DATABASE_KEY)!);
  database.users = database.users.filter((user: any) => user.idProfil !== 'COMP1');
  database.users.push({ id: 'custom-user', email: 'custom@example.test', roles: ['CANDIDATE'] });
  storage.setItem(DATABASE_KEY, JSON.stringify(database));
  storage.removeItem('app_local_builtin_users_version');

  const visibleUsers = UserDirectoryService.getAllUsers();
  assert.equal(visibleUsers.find(user => user.email === 'julien.bourlon@logiclever.com')?.idProfil, 'COMP1');
  assert.ok(visibleUsers.some(user => user.email === 'custom@example.test'));
  assert.equal(visibleUsers.filter(user => user.idProfil === 'COMP1').length, 1);
});

test('campaign preview resolves Primes assignments to a pre-created app user', async () => {
  const originalRapportParser = CampaignInitializationService.parseRapportRhSalariesFile;
  const originalPrimesParser = CampaignInitializationService.parsePrimesFile;
  const originalMeteoParser = CampaignInitializationService.parseVuesMeteosFile;

  CampaignInitializationService.parseRapportRhSalariesFile = async () => [
    {
      idProfil: 'CAND1', matricule: 'CAND', nom: 'Candidate', prenom: 'Test', displayName: 'Test Candidate',
      email: 'candidate@example.test', grade: 'Senior', currentSalary: 50000, currentTJM: 650,
      isExistingPersonne: false, isExistingParticipant: false, isExistingUser: false, action: 'CREATE',
      warnings: [], isEligibleCandidate: true
    }
  ];
  CampaignInitializationService.parsePrimesFile = async () => [
    { rawRowIndex: 2, evaluatorMatricule: 'JBO', candidateMatricule: 'CAND', typePrime: '', isActive: true, explanation: 'Prime active' }
  ];
  CampaignInitializationService.parseVuesMeteosFile = async () => [];

  try {
    const dummyFile = {} as File;
    const result = await CampaignInitializationService.prepareCampaignPreview(2031, {
      rapportRhFile: dummyFile,
      primesFile: dummyFile,
      vuesMeteosFile: dummyFile
    });

    assert.deepEqual(result.assignmentsByCandidate.CAND1, ['COMP1']);
    assert.equal(result.evaluatorsToProcess.find(e => e.idProfil === 'COMP1')?.displayName, 'Julien Bourlon');
    assert.equal(result.evaluatorsToProcess.find(e => e.idProfil === 'COMP1')?.isExistingUser, true);
  } finally {
    CampaignInitializationService.parseRapportRhSalariesFile = originalRapportParser;
    CampaignInitializationService.parsePrimesFile = originalPrimesParser;
    CampaignInitializationService.parseVuesMeteosFile = originalMeteoParser;
  }
});

test('seeds and legacy local records migrate once, and deletions survive a reload', async () => {
  storage.setItem('app_local_dossiers_v1', JSON.stringify([{ id: 'legacy', candidateId: 'legacy-person', status: 'OUVERT' }]));
  assert.equal(LocalDatabaseService.getDossierById('legacy')?.candidateId, 'legacy-person');
  const seed = LocalDatabaseService.getCampaigns()[0];
  assert.ok(seed.title);
  await deleteDoc(doc(db, 'campaigns', seed.id));
  await deleteDoc(doc(db, 'dossiers', 'legacy'));
  // Only persisted JSON is retained, as when a browser opens the app again.
  const persisted = storage.getItem(DATABASE_KEY)!;
  storage.clear();
  storage.setItem(DATABASE_KEY, persisted);
  assert.equal(LocalDatabaseService.getCampaignById(seed.id), undefined);
  assert.equal(LocalDatabaseService.getDossierById('legacy'), undefined);
});

test('launch saves the campaign and every related entity with one write and no partial notifications', async () => {
  readCollection('campaigns');
  const before = storage.writes;
  let notifications = 0;
  const unsubscribe = LocalDatabaseService.subscribe(() => {
    notifications++;
    assert.ok(LocalDatabaseService.getDossierById('test-candidate_2031'));
    assert.ok(UserDirectoryService.getUserById('test-evaluator'));
  });
  try {
    const result = await CampaignInitializationService.executeCampaignInitialization(preview(), metadata);
    assert.equal(result.success, true);
    assert.equal(storage.writes - before, 1);
    assert.equal(notifications, 1);
    const persisted = JSON.parse(storage.getItem(DATABASE_KEY)!);
    assert.equal(persisted.campaigns.find(c => c.id === 'campaign_2031').otherDocuments[0].id, 'other');
    assert.equal(persisted.campaign_participants.filter(p => p.campaignYear === 2031).length, 2);
    assert.equal(persisted.personnes.filter(p => p.idProfil.startsWith('test-')).length, 2);
    assert.deepEqual(LocalDatabaseService.getDossierById('test-candidate_2031')?.assignedConsultantIds, ['test-evaluator']);
    assert.deepEqual(UserDirectoryService.getUserById('test-evaluator')?.assignedCandidateIds, ['test-candidate']);
  } finally { unsubscribe(); }
});

test('empty legacy collections remain empty instead of resurrecting seed records', () => {
  storage.setItem('app_local_campaigns_v1', '[]');
  storage.setItem('app_users_directory_custom_v1', '[]');
  assert.deepEqual(LocalDatabaseService.getCampaigns(), []);
  assert.deepEqual(UserDirectoryService.getAllUsers(), []);
});

test('candidate, jury, dashboard and directory reads share persisted updates and role removals', async () => {
  await CampaignInitializationService.executeCampaignInitialization(preview(), metadata);
  const changes: string[][] = [];
  const unsubscribe = onSnapshot(query(collection(db, 'users'), where('roles', 'array-contains', 'CANDIDATE')), snapshot => changes.push(snapshot.docs.map(d => d.id)));
  try {
    await updateDoc(doc(db, 'users', 'test-candidate'), { currentSalary: 55000, roles: ['JURY'] });
    assert.equal(UserDirectoryService.getUserById('test-candidate')?.currentSalary, 55000);
    assert.ok(!changes.at(-1)!.includes('test-candidate'));
    await updateDoc(doc(db, 'dossiers', 'test-candidate_2031'), { 'consultantFeedbacks.review': { comment: 'Saved feedback' }, juryDecision: { comment: 'Saved decision' }, status: 'VALIDE' });
    const dossier = LocalDatabaseService.getDossiersByCandidate('auth-uid', 'test-candidate')[0];
    assert.equal(dossier.status, 'VALIDE');
    assert.equal((dossier.consultantFeedbacks.review as any).comment, 'Saved feedback');
    assert.equal((dossier.juryDecision as any).comment, 'Saved decision');
    const persisted = storage.getItem(DATABASE_KEY)!;
    storage.clear(); storage.setItem(DATABASE_KEY, persisted);
    assert.equal(LocalDatabaseService.getDossierById(dossier.id)?.status, 'VALIDE');
    assert.equal(UserDirectoryService.getUserById('test-candidate')?.currentSalary, 55000);
  } finally { unsubscribe(); }
});

test('relaunch preserves submitted content, decisions, document attachments and closed campaign state', async () => {
  await CampaignInitializationService.executeCampaignInitialization(preview(), metadata);
  await updateDoc(doc(db, 'dossiers', 'test-candidate_2031'), { status: 'VALIDE', 'annualReport.synthesis': 'Keep my report', documents: [{ name: 'report.pdf' }], consultantFeedbacks: { review: { comment: 'Keep feedback' } }, juryDecision: { comment: 'Keep decision' } });
  await updateDoc(doc(db, 'campaigns', 'campaign_2031'), { status: 'CLÔTURÉE' });
  await CampaignInitializationService.executeCampaignInitialization(preview(), metadata);
  const dossier = LocalDatabaseService.getDossierById('test-candidate_2031')!;
  assert.equal(dossier.annualReport?.synthesis, 'Keep my report');
  assert.equal(dossier.documents[0].name, 'report.pdf');
  assert.equal(dossier.status, 'VALIDE');
  assert.equal((dossier.consultantFeedbacks.review as any).comment, 'Keep feedback');
  assert.equal((dossier.juryDecision as any).comment, 'Keep decision');
  assert.equal(LocalDatabaseService.getCampaignById('campaign_2031')?.status, 'CLÔTURÉE');
  assert.equal(readCollection('users').filter(u => u.id === 'test-candidate').length, 1);
});

test('storage quota failure rejects launch without partial campaign data or success notifications', async () => {
  readCollection('campaigns');
  const before = storage.getItem(DATABASE_KEY);
  let notifications = 0;
  const unsubscribe = LocalDatabaseService.subscribe(() => { notifications++; });
  storage.failWrites = true;
  try {
    await assert.rejects(CampaignInitializationService.executeCampaignInitialization(preview(), metadata), /Enregistrement local impossible/);
    assert.equal(storage.getItem(DATABASE_KEY), before);
    assert.equal(notifications, 0);
    assert.equal(LocalDatabaseService.getDossierById('test-candidate_2031'), undefined);
  } finally { unsubscribe(); }
});

test('invalid preview is rejected before writing campaign data', async () => {
  const invalid = { ...preview(), canProceed: false, blockingErrors: ['Invalid input'] };
  await assert.rejects(CampaignInitializationService.executeCampaignInitialization(invalid, metadata));
  assert.equal(storage.writes, 0);
});

test('batch rollback and nested merge/update semantics preserve unrelated data', async () => {
  await setDoc(doc(db, 'dossiers', 'nested'), { annualReport: { synthesis: 'Keep', currentSalary: 100 } });
  await setDoc(doc(db, 'dossiers', 'nested'), { annualReport: { currentSalary: 200 } }, { merge: true });
  assert.equal((await getDoc(doc(db, 'dossiers', 'nested'))).data().annualReport.synthesis, 'Keep');
  const before = storage.getItem(DATABASE_KEY);
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', 'new-user'), { email: 'new@example.test' });
  batch.update(doc(db, 'dossiers', 'missing'), { status: 'COMPLET' });
  await assert.rejects(batch.commit(), /introuvable/);
  assert.equal(storage.getItem(DATABASE_KEY), before);
});

test('subscriptions receive empty results, missing documents, deletions and changes from another tab', async () => {
  const snapshots: number[] = [];
  const unsubscribe = onSnapshot(collection(db, 'personnes'), snapshot => snapshots.push(snapshot.size));
  let missingCalled = false;
  const unsubscribeMissing = onSnapshot(doc(db, 'personnes', 'missing'), snapshot => { missingCalled = !snapshot.exists(); });
  try {
    assert.equal(missingCalled, true);
    await setDoc(doc(db, 'personnes', 'p1'), { displayName: 'Person' });
    await deleteDoc(doc(db, 'personnes', 'p1'));
    const persisted = JSON.parse(storage.getItem(DATABASE_KEY)!);
    persisted.personnes.push({ idProfil: 'p2', displayName: 'Other tab' });
    storage.setItem(DATABASE_KEY, JSON.stringify(persisted));
    const event = new Event('storage');
    Object.defineProperty(event, 'key', { value: DATABASE_KEY });
    events.dispatchEvent(event);
    assert.deepEqual(snapshots, [0, 1, 0, 1]);
  } finally { unsubscribe(); unsubscribeMissing(); }
});

test('user registration preserves an existing auth id and avoids duplicate accounts', () => {
  UserDirectoryService.addUser({ id: 'auth-uid', idProfil: 'old-id', email: 'same@example.test', roles: ['ADMIN'] });
  UserDirectoryService.registerUsers([{ id: 'canonical-id', idProfil: 'canonical-id', email: 'SAME@example.test', roles: ['CANDIDATE'] }]);
  const matches = UserDirectoryService.getAllUsers().filter(u => u.email.toLowerCase() === 'same@example.test');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'auth-uid');
  assert.deepEqual(matches[0].roles, ['ADMIN', 'CANDIDATE']);
});

test('corrupt local data fails visibly without overwriting it with seed data', () => {
  storage.setItem(DATABASE_KEY, '{broken');
  assert.throws(() => readCollection('users'));
  assert.equal(storage.getItem(DATABASE_KEY), '{broken');
});

test('app source cannot initialize or import a Firestore database', () => {
  function check(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) check(path);
      else if (/\.tsx?$/.test(path)) assert.doesNotMatch(readFileSync(path, 'utf8'), /firebase\/firestore|getFirestore\s*\(/, path);
    }
  }
  check('src');
});
