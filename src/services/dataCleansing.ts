/** Historical dossiers are never automatically deleted. Imports report conflicts for review. */
export async function cleanDatabase(): Promise<{ deletedOrphans: number; deletedDuplicates: number }> {
  return { deletedOrphans: 0, deletedDuplicates: 0 };
}
