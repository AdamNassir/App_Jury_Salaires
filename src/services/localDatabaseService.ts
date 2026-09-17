import { Campaign, Dossier, CampaignParticipant, Personne, JuryDecision } from '../types';
import { UserDirectoryService } from './userDirectoryService';
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
    }
    commitMutations(mutations);
  }
  getDossiers(): Dossier[] { return readCollection<Dossier>('dossiers').sort((a, b) => (a.candidateName || '').localeCompare(b.candidateName || '')); }
  getDossierById(id: string): Dossier | undefined { return readRecord('dossiers', id) as Dossier; }
  getDossiersByCandidate(candidateId: string, idProfil?: string): Dossier[] {
    const ids = [candidateId?.trim(), idProfil?.trim()].filter(Boolean);
    return this.getDossiers().filter(d => ids.includes(d.candidateId) || ids.includes(d.idProfil));
  }
  saveDossier(dossier: Dossier) { this.save('dossiers', dossier.id, dossier); }
  updateDossier(id: string, updates: Partial<Dossier>) {
    const current = this.getDossierById(id);
    const next = { ...updates };
    if (updates.juryDecision && !this.sameDecision(current?.juryDecision, updates.juryDecision)) {
      next.juryFinalizations = {};
      if (current?.status === 'VALIDE') next.status = 'COMPLET';
    }
    if (next.status === 'VALIDE') {
      const members = UserDirectoryService.getJuryMembers();
      const finalizations = next.juryFinalizations ?? current?.juryFinalizations ?? {};
      if (!members.length || !members.every(member => Boolean(finalizations[member.id]))) {
        throw new Error('Chaque membre du jury doit finaliser sa décision.');
      }
    }
    this.update('dossiers', id, next);
  }
  private sameDecision(a?: JuryDecision, b?: JuryDecision) {
    const content = (decision?: JuryDecision) => Object.entries(decision || {})
      .filter(([key, value]) => key !== 'date' && key !== 'unanimous' && value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(content(a)) === JSON.stringify(content(b));
  }
  saveJuryDecision(id: string, decision: JuryDecision, expected?: JuryDecision) {
    const current = this.getDossierById(id);
    if (!current || current.status !== 'COMPLET') throw new Error('Le dossier doit être complet.');
    if (!this.sameDecision(current.juryDecision, expected)) {
      throw new Error('La décision a changé. Rechargez le dossier avant de continuer.');
    }
    this.updateDossier(id, { juryDecision: decision });
  }
  finalizeJuryDecision(id: string, memberId: string, decision: JuryDecision, expected?: JuryDecision) {
    const members = UserDirectoryService.getJuryMembers();
    if (!members.some(member => member.id === memberId)) throw new Error('Membre du jury introuvable.');
    const current = this.getDossierById(id);
    if (!current || current.status !== 'COMPLET') throw new Error('Le dossier doit être complet.');
    if (!this.sameDecision(current.juryDecision, expected)) {
      throw new Error('La décision a changé. Rechargez le dossier avant de continuer.');
    }
    const finalizations = this.sameDecision(current.juryDecision, decision) ? { ...current.juryFinalizations } : {};
    finalizations[memberId] ||= new Date().toISOString();
    const status = members.every(member => Boolean(finalizations[member.id])) ? 'VALIDE' : 'COMPLET';
    this.update('dossiers', id, { juryDecision: decision, juryFinalizations: finalizations, status });
    return status;
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
