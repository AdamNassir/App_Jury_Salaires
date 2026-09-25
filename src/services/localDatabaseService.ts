import { Campaign, Dossier, CampaignParticipant, Personne } from '../types';
import { CollectionName, readCollection, readRecord, commitMutations, subscribeLocal } from './localStore';

class LocalDatabaseServiceImpl {
  private syncDossiersToServer(dossiers: Dossier[]) {
    if (typeof window === 'undefined' || dossiers.length === 0) return;
    fetch('/api/sync/dossiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dossiers),
    }).catch(error => console.warn('Could not sync dossiers to server:', error));
  }

  syncDossierDeletionToServer(ids: string[], campaignId?: string) {
    if (typeof window === 'undefined') return;
    if ((!ids || ids.length === 0) && !campaignId) return;
    fetch('/api/sync/dossiers/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, campaignId }),
    }).catch(error => console.warn('Could not sync dossier deletion to server:', error));
  }

  private save(name: CollectionName, id: string, data: object, merge = false) {
    commitMutations([{ collection: name, id, kind: 'set', data: { ...data, updatedAt: new Date().toISOString() }, merge }]);
  }
  private update(name: CollectionName, id: string, updates: object) {
    commitMutations([{ collection: name, id, kind: 'update', data: { ...updates, updatedAt: new Date().toISOString() } }]);
  }
  subscribeCampaigns = subscribeLocal;
  subscribeDossiers = subscribeLocal;
  subscribe = subscribeLocal;
  syncCampaignToDisk(campaign: Campaign | Campaign[] | Partial<Campaign>) {
    try {
      if (typeof window === 'undefined') return;
      const payload = Array.isArray(campaign) ? campaign : [campaign];
      if (payload.length === 0) return;
      fetch('/api/sync/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(err => console.warn('Could not sync campaign to disk:', err));
    } catch (e) {
      console.warn('Sync campaign failed:', e);
    }
  }
  getCampaigns(): Campaign[] { return readCollection<Campaign>('campaigns').sort((a, b) => b.year - a.year); }
  getCampaignById(id: string): Campaign | undefined { return readRecord('campaigns', id) as Campaign; }
  saveCampaign(campaign: Campaign) { 
    this.save('campaigns', campaign.id, campaign); 
    this.syncCampaignToDisk(campaign);
  }
  updateCampaign(id: string, updates: Partial<Campaign>) { 
    this.update('campaigns', id, updates); 
    const existing = this.getCampaignById(id);
    if (existing) {
      this.syncCampaignToDisk({ ...existing, ...updates });
    }
  }
  deleteCampaign(id: string, deleteRelatedDossiers = false) {
    const mutations: { collection: CollectionName; id: string; kind: 'delete' }[] = [
      { collection: 'campaigns', id, kind: 'delete' }
    ];
    if (deleteRelatedDossiers) {
      const dossiersToDelete = this.getDossiers().filter(d => d.campaignId === id);
      for (const d of dossiersToDelete) {
        mutations.push({ collection: 'dossiers', id: d.id, kind: 'delete' });
      }
      const participantsToDelete = this.getParticipants().filter(p => p.campaignId === id);
      for (const p of participantsToDelete) {
        mutations.push({ collection: 'campaign_participants', id: p.id, kind: 'delete' });
      }
      if (dossiersToDelete.length > 0) {
        this.syncDossierDeletionToServer(dossiersToDelete.map(d => d.id), id);
      }
    }
    commitMutations(mutations);
  }
  getDossiers(): Dossier[] { return readCollection<Dossier>('dossiers').sort((a, b) => (a.candidateName || '').localeCompare(b.candidateName || '')); }
  getDossierById(id: string): Dossier | undefined { return readRecord('dossiers', id) as Dossier; }
  getDossiersByCandidate(candidateId: string, idProfil?: string): Dossier[] {
    const ids = [candidateId?.trim(), idProfil?.trim()].filter(Boolean);
    return this.getDossiers().filter(d => ids.includes(d.candidateId) || ids.includes(d.idProfil));
  }
  saveDossier(dossier: Dossier) {
    this.save('dossiers', dossier.id, dossier);
    const saved = this.getDossierById(dossier.id);
    if (saved) this.syncDossiersToServer([saved]);
  }
  updateDossier(id: string, updates: Partial<Dossier>) {
    this.update('dossiers', id, updates);
    const saved = this.getDossierById(id);
    if (saved) this.syncDossiersToServer([saved]);
  }
  async refreshDossiersFromServer(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const response = await fetch('/api/data/dossiers', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      const remoteDossiers = Array.isArray(payload?.dossiers) ? payload.dossiers as Dossier[] : [];

      // Check current users in localStore: if users exist, do not resurrect dossiers for deleted users
      const users = readCollection<Personne>('users');
      const validUserIds = new Set(users.flatMap(u => [(u as any).id, u.idProfil, u.matricule].filter(Boolean)));

      const localById = new Map(this.getDossiers().map(dossier => [dossier.id, dossier]));
      const orphanedRemoteIds: string[] = [];

      const newer = remoteDossiers.filter(remote => {
        if (users.length > 0 && remote.candidateId && !validUserIds.has(remote.candidateId) && !validUserIds.has(remote.idProfil)) {
          orphanedRemoteIds.push(remote.id);
          return false;
        }
        const local = localById.get(remote.id);
        if (!local) return true;
        const remoteTime = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
        const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
        return remoteTime > localTime;
      });

      if (orphanedRemoteIds.length > 0) {
        this.syncDossierDeletionToServer(orphanedRemoteIds);
      }

      if (newer.length > 0) this.bulkSaveDossiers(newer);
    } catch (error) {
      console.warn('Could not refresh dossiers from server:', error);
    }
  }
  deleteDossier(id: string) {
    commitMutations([{ collection: 'dossiers', id, kind: 'delete' }]);
    this.syncDossierDeletionToServer([id]);
  }
  deleteDossiersByCampaign(campaignId: string, year?: number) {
    const dossiers = this.getDossiers();
    const toDelete = dossiers.filter(d => {
      if (d.campaignId === campaignId) return true;
      if (year && (d.campaignYear === year || d.campaignId === `campaign_${year}`)) return true;
      return false;
    });
    if (toDelete.length > 0) {
      commitMutations(toDelete.map(d => ({ collection: 'dossiers', id: d.id, kind: 'delete' })));
      this.syncDossierDeletionToServer(toDelete.map(d => d.id), campaignId);
    }
    return toDelete.length;
  }
  syncEvaluatorAssignments(): void {
    const dossiers = this.getDossiers();
    const mutations: Array<{ collection: CollectionName; id: string; kind: 'set'; data: any; merge: true }> = [];

    dossiers.forEach(d => {
      const assignedSet = new Set<string>(d.assignedConsultantIds || []);
      const prevCount = assignedSet.size;

      Object.values(d.consultantFeedbacks || {}).forEach(f => {
        if (f.evaluatorUid) assignedSet.add(f.evaluatorUid);
        if (f.consultantId) assignedSet.add(f.consultantId);
        if (f.evaluatorIdProfil) assignedSet.add(f.evaluatorIdProfil);
      });

      if (assignedSet.size > prevCount) {
        mutations.push({
          collection: 'dossiers',
          id: d.id,
          kind: 'set',
          data: { assignedConsultantIds: Array.from(assignedSet) },
          merge: true
        });
      }
    });

    if (mutations.length > 0) {
      commitMutations(mutations);
    }
  }
  bulkSaveDossiers(rows: Dossier[]) { this.bulkSave('dossiers', rows); }
  bulkSaveParticipants(rows: CampaignParticipant[]) { this.bulkSave('campaign_participants', rows); }
  bulkSavePersonnes(rows: Personne[]) { this.bulkSave('personnes', rows); }
  private bulkSave(name: CollectionName, rows: any[]) {
    commitMutations(rows.map(row => ({ collection: name, id: row.id || row.idProfil, kind: 'set', data: { ...row, updatedAt: new Date().toISOString() }, merge: true })));
  }
  getParticipants(): CampaignParticipant[] { return readCollection('campaign_participants'); }
  getPersonnes(): Personne[] { return readCollection('personnes'); }

  // --- Export JSON & Téléchargement direct ---
  public downloadJson(data: any, filename: string): void {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  public downloadDossiersJson(): void {
    this.downloadJson(this.getDossiers(), 'dossiers.json');
  }

  public downloadCampaignsJson(): void {
    this.downloadJson(this.getCampaigns(), 'campaigns.json');
  }
}
export const LocalDatabaseService = new LocalDatabaseServiceImpl();
