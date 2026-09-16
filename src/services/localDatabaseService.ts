import { Campaign, Dossier, CampaignParticipant, Personne } from '../types';
import { CollectionName, readCollection, readRecord, commitMutations, subscribeLocal } from './localStore';

class LocalDatabaseServiceImpl {
  private save(name: CollectionName, id: string, data: object, merge = false) {
    commitMutations([{ collection: name, id, kind: 'set', data: { ...data, updatedAt: new Date().toISOString() }, merge }]);
  }
  private update(name: CollectionName, id: string, updates: object) {
    commitMutations([{ collection: name, id, kind: 'update', data: { ...updates, updatedAt: new Date().toISOString() } }]);
  }
  subscribeCampaigns = subscribeLocal;
  subscribeDossiers = subscribeLocal;
  subscribe = subscribeLocal;
  getCampaigns(): Campaign[] { return readCollection<Campaign>('campaigns').sort((a, b) => b.year - a.year); }
  getCampaignById(id: string): Campaign | undefined { return readRecord('campaigns', id) as Campaign; }
  saveCampaign(campaign: Campaign) { this.save('campaigns', campaign.id, campaign); }
  updateCampaign(id: string, updates: Partial<Campaign>) { this.update('campaigns', id, updates); }
  deleteCampaign(id: string) { commitMutations([{ collection: 'campaigns', id, kind: 'delete' }]); }
  getDossiers(): Dossier[] { return readCollection<Dossier>('dossiers').sort((a, b) => (a.candidateName || '').localeCompare(b.candidateName || '')); }
  getDossierById(id: string): Dossier | undefined { return readRecord('dossiers', id) as Dossier; }
  getDossiersByCandidate(candidateId: string, idProfil?: string): Dossier[] {
    const ids = [candidateId?.trim(), idProfil?.trim()].filter(Boolean);
    return this.getDossiers().filter(d => ids.includes(d.candidateId) || ids.includes(d.idProfil));
  }
  saveDossier(dossier: Dossier) { this.save('dossiers', dossier.id, dossier); }
  updateDossier(id: string, updates: Partial<Dossier>) { this.update('dossiers', id, updates); }
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
