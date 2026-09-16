import { collection, getDocs, doc, deleteDoc } from '../lib/localDatabase';
import { db } from '../lib/localDatabase';

export async function cleanDatabase(): Promise<{ deletedOrphans: number; deletedDuplicates: number }> {
  try {
    console.log('[DataCleansing] Starting client-side database cleansing...');
    
    // 1. Fetch all users
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const candidatesMap = new Map<string, any>();
    
    usersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const roles = data.roles || [];
      if (roles.includes('CANDIDATE')) {
        candidatesMap.set(docSnap.id, { id: docSnap.id, ...data });
      }
    });

    // 2. Fetch all dossiers
    const dossiersSnapshot = await getDocs(collection(db, 'dossiers'));
    
    const candidateDossiers = new Map<string, any[]>();
    const orphans: any[] = [];
    
    dossiersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;
      const item = { id, ref: docSnap.ref, ...data };
      
      const candidateId = data.candidateId;
      if (!candidateId || !candidatesMap.has(candidateId)) {
        orphans.push(item);
      } else {
        if (!candidateDossiers.has(candidateId)) {
          candidateDossiers.set(candidateId, []);
        }
        candidateDossiers.get(candidateId)!.push(item);
      }
    });

    let deletedOrphans = 0;
    let deletedDuplicates = 0;

    // Delete orphans
    for (const orphan of orphans) {
      await deleteDoc(orphan.ref);
      console.log(`[DataCleansing] Deleted orphan dossier: ${orphan.id}`);
      deletedOrphans++;
    }

    // Delete duplicates
    for (const [candidateId, list] of candidateDossiers.entries()) {
      if (list.length > 1) {
        // Sort to keep the best one
        const sorted = [...list].sort((a, b) => {
          const aScore = (a.status === 'VALIDE' ? 3 : a.status === 'COMPLET' ? 2 : 1) + (a.juryDecision ? 2 : 0) + (a.id === `${candidateId}_2025` ? 1 : 0);
          const bScore = (b.status === 'VALIDE' ? 3 : b.status === 'COMPLET' ? 2 : 1) + (b.juryDecision ? 2 : 0) + (b.id === `${candidateId}_2025` ? 1 : 0);
          return bScore - aScore; // Highest score first
        });
        
        const keep = sorted[0];
        const toDelete = sorted.slice(1);
        
        console.log(`[DataCleansing] Keeping dossier ${keep.id} for candidate ${candidateId}`);
        for (const d of toDelete) {
          await deleteDoc(d.ref);
          console.log(`[DataCleansing] Deleted duplicate dossier: ${d.id}`);
          deletedDuplicates++;
        }
      }
    }

    console.log(`[DataCleansing] Cleansing complete. Deleted ${deletedOrphans} orphans and ${deletedDuplicates} duplicates.`);
    return { deletedOrphans, deletedDuplicates };
  } catch (error) {
    console.error('[DataCleansing] Error during cleansing:', error);
    throw error;
  }
}
