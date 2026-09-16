/** Keep the provider's error code/message visible without exposing credential data. */
export function describeAuthError(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const details = error as { code?: unknown; name?: unknown; message?: unknown };
    const code = typeof details.code === 'string' ? details.code : '';
    const name = typeof details.name === 'string' && details.name !== 'Error' ? details.name : '';
    const message = typeof details.message === 'string' ? details.message : '';
    const identifier = code || name;
    if (message) return identifier && !message.includes(identifier) ? `${identifier} : ${message}` : message;
    if (identifier) return identifier;
  }
  return 'Une erreur inconnue est survenue. Veuillez réessayer.';
}
