import React from 'react';
import firebaseConfig from '../../firebase-applet-config.json';

export function AuthErrorNotice({ title, message }: { title: string; message: string }) {
  const unauthorizedDomain = message.includes('auth/unauthorized-domain');
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return (
    <div role="alert" className="w-full rounded-xl border border-red-200 bg-red-50 p-4 text-left text-sm text-red-800">
      <p className="font-bold">{title}</p>
      <p className="mt-2 whitespace-pre-wrap break-words">{message}</p>
      {unauthorizedDomain && (
        <div className="mt-3 space-y-2">
          <p>Le domaine de cet aperçu doit être autorisé dans Firebase pour permettre la connexion Google.</p>
          {hostname && <p>Domaine à ajouter : <code className="break-all font-bold">{hostname}</code></p>}
          <p>
            Ouvrez <a className="font-semibold underline" href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`} target="_blank" rel="noopener noreferrer">les paramètres Firebase Authentication</a>,
            puis « Domaines autorisés » → « Ajouter un domaine ». Ajoutez le domaine indiqué ci-dessus, sans https:// ni chemin, puis réessayez la connexion.
          </p>
          <p>Dans AI Studio, utilisez le domaine de l’aperçu indiqué ici. Si son adresse change, le nouveau domaine doit aussi être autorisé.</p>
        </div>
      )}
    </div>
  );
}
