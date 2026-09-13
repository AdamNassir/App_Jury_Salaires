import { auth } from '../lib/firebase';
export async function api(path: string, body?: unknown) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Connexion requise.');
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({ error: 'Réponse serveur invalide.' }));
  if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
  return data;
}
