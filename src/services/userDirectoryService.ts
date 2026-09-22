import { UserProfile, UserRole } from '../types';
import { readCollection, commitMutations, subscribeLocal } from './localStore';

class UserDirectoryServiceImpl {
  public normalizeUser(data: any): UserProfile {
    const email = (data.email || '').trim().toLowerCase();
    const isMaster =
      email === 'guillaumebestece@gmail.com' ||
      email === 'guillaume.best@logiclever.com' ||
      email === 'adam.nassir@logiclever.com';

    let roles: UserRole[] = Array.isArray(data.roles) ? [...data.roles] : [];
    if (roles.length === 0 && data.role) roles = [data.role];
    if (isMaster) {
      if (!roles.includes('ADMIN')) roles.push('ADMIN');
      if (!roles.includes('JURY')) roles.push('JURY');
      if (!roles.includes('CANDIDATE')) roles.push('CANDIDATE');
    }
    if (roles.length === 0) {
      roles = ['CANDIDATE'];
    }

    return {
      ...data,
      id: data.id || data.idProfil || `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      idProfil: data.idProfil || data.id,
      matricule: data.matricule || '',
      displayName: data.displayName || data.email || 'Utilisateur',
      email: data.email || '',
      roles,
      team: data.team || 'Logic Clever',
      position: data.position || '',
      currentGrade: data.currentGrade || 'Senior',
      currentSalary: Number(data.currentSalary) || 0,
      currentTJM: Number(data.currentTJM) || 0,
      currentTJSalaire: Number(data.currentTJSalaire) || 0,
      entryDate: data.entryDate || '',
      expertGradeDate: data.expertGradeDate || '',
      experienceYears: Number(data.experienceYears) || 0,
      assignedCandidateIds: Array.isArray(data.assignedCandidateIds) ? data.assignedCandidateIds : [],
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString()
    };
  }


  subscribe = subscribeLocal;
  getAllUsers(): UserProfile[] {
    return readCollection<UserProfile>('users').map(u => this.normalizeUser(u)).sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
  }
  getUserByEmail(email?: string | null): UserProfile | undefined {
    return email ? this.getAllUsers().find(u => u.email?.trim().toLowerCase() === email.trim().toLowerCase()) : undefined;
  }
  getUserById(id?: string | null): UserProfile | undefined {
    return id ? this.getAllUsers().find(u => u.id === id || u.idProfil === id) : undefined;
  }
  getUserByMatricule(matricule?: string | null): UserProfile | undefined {
    return matricule ? this.getAllUsers().find(u => u.matricule?.trim().toLowerCase() === matricule.trim().toLowerCase()) : undefined;
  }
  getCandidates(): UserProfile[] { return this.getAllUsers().filter(u => u.roles.includes('CANDIDATE')); }
  getJuryMembers(): UserProfile[] { return this.getAllUsers().filter(u => u.roles.includes('JURY')); }
  getEvaluators(): UserProfile[] { return this.getAllUsers().filter(u => u.roles.includes('EVALUATOR')); }
  prepareUsers(rows: Partial<UserProfile>[]): UserProfile[] {
    const users = this.getAllUsers();
    const prepared = new Map<string, UserProfile>();
    for (const row of rows) {
      if (!row.id && !row.idProfil && !row.email) continue;
      const existing = [...prepared.values(), ...users].find(u =>
        (row.id && u.id === row.id) || (row.idProfil && u.idProfil === row.idProfil) ||
        (row.email && u.email?.trim().toLowerCase() === row.email.trim().toLowerCase()));
      const merged = this.normalizeUser({
        ...existing, ...row, id: existing?.id || row.id,
        roles: [...new Set([...(existing?.roles || []), ...(row.roles || [])])],
        assignedCandidateIds: [...new Set([...(existing?.assignedCandidateIds || []), ...(row.assignedCandidateIds || [])])],
        updatedAt: new Date().toISOString(),
      });
      prepared.set(merged.id, merged);
    }
    return [...prepared.values()];
  }
  syncUsersToDisk(users: UserProfile | UserProfile[]): void {
    try {
      if (typeof window === 'undefined') return;
      const payload = Array.isArray(users) ? users : [users];
      if (payload.length === 0) return;
      fetch('/api/sync/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.warn('Could not sync user to disk:', err));
    } catch (e) {
      console.warn('Sync user failed:', e);
    }
  }
  registerUsers(rows: Partial<UserProfile>[]): number {
    const users = this.prepareUsers(rows);
    commitMutations(users.map(user => ({ collection: 'users', id: user.id, kind: 'set', data: user })));
    this.syncUsersToDisk(users);
    return users.length;
  }
  addUser(user: Partial<UserProfile>): UserProfile {
    const normalized = this.normalizeUser({ ...user, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    commitMutations([{ collection: 'users', id: normalized.id, kind: 'set', data: normalized }]);
    this.syncUsersToDisk(normalized);
    return normalized;
  }
  updateUser(id: string, updates: Partial<UserProfile>): UserProfile | null {
    const existing = this.getUserById(id) || this.getUserByEmail(updates.email);
    if (!existing) return null;
    const merged = this.normalizeUser({ ...existing, ...updates, updatedAt: new Date().toISOString() });
    commitMutations([{ collection: 'users', id: existing.id, kind: 'set', data: merged }]);
    this.syncUsersToDisk(merged);
    return merged;
  }
  deleteUser(id: string): boolean {
    const existing = this.getUserById(id);
    if (!existing) return false;
    commitMutations([{ collection: 'users', id: existing.id, kind: 'delete' }]);
    return true;
  }
  replaceAllUsers(remainingUsers: UserProfile[]): void {
    const all = this.getAllUsers();
    const mutations: { collection: 'users'; id: string; kind: 'delete' | 'set'; data?: any }[] = all.map(u => ({
      collection: 'users' as const,
      id: u.id,
      kind: 'delete' as const
    }));
    for (const r of remainingUsers) {
      mutations.push({
        collection: 'users',
        id: r.id,
        kind: 'set',
        data: r
      });
    }
    commitMutations(mutations);

    try {
      if (typeof window !== 'undefined') {
        fetch('/api/sync/users/replace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(remainingUsers)
        }).catch(err => console.warn('Could not sync user replacement to disk:', err));
      }
    } catch (e) {
      console.warn('Sync users replacement failed:', e);
    }
  }
  public exportUsersJson(): string {
    const list = this.getAllUsers();
    return JSON.stringify(list, null, 2);
  }

  public downloadUsersJson(): void {
    const jsonString = this.exportUsersJson();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'users.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
export const UserDirectoryService = new UserDirectoryServiceImpl();
