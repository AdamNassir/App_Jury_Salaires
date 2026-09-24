/**
 * Utilitaire d'extraction et de nettoyage d'URL en texte brut.
 * Gère les cas où les données issues d'Excel contiennent :
 * - Une formule =HYPERLINK("https://...", "titre") ou =LIEN_HYPERTEXTE("https://...", "titre")
 * - Un lien hypertexte encapsulé dans du HTML <a href="...">...</a>
 * - Des guillemets parasites ou des espaces
 */
export function extractPlainTextUrl(input: string | undefined | null): string {
  if (!input) return '';
  let str = String(input).trim();

  // 1. Extraire l'URL si c'est une formule Excel =HYPERLINK(...) ou =LIEN_HYPERTEXTE(...)
  const formulaMatch = str.match(/=(?:HYPERLINK|LIEN_HYPERTEXTE)\(\s*["']([^"']+)["']/i);
  if (formulaMatch && formulaMatch[1]) {
    str = formulaMatch[1].trim();
  }

  // 2. Extraire l'URL si c'est une balise HTML <a href="...">
  const htmlMatch = str.match(/<a[^>]+href=["']([^"']+)["']/i);
  if (htmlMatch && htmlMatch[1]) {
    str = htmlMatch[1].trim();
  }

  // 3. Nettoyer les guillemets ou quotes de début/fin
  str = str.replace(/^["']+|["']+$/g, '').trim();

  // 4. Si la chaîne contient une URL au format https?:// quelque part
  const urlRegexMatch = str.match(/(https?:\/\/[^\s"'<>]+)/i);
  if (urlRegexMatch && urlRegexMatch[1]) {
    return urlRegexMatch[1].trim();
  }

  // 5. Si commence par // ou www. ou domaine drive/docs
  if (/^\/\//.test(str)) {
    return `https:${str}`;
  }
  if (/^(?:www\.|drive\.google\.com|docs\.google\.com)/i.test(str)) {
    return `https://${str}`;
  }

  return str;
}

/**
 * Assure qu'une URL valide https:// est retournée pour la navigation
 */
export function getValidUrl(url: string | undefined | null): string {
  const plainUrl = extractPlainTextUrl(url);
  if (!plainUrl) return '';
  if (/^https?:\/\//i.test(plainUrl)) return plainUrl;
  return `https://${plainUrl}`;
}

/**
 * Copie une chaîne dans le presse-papier rigoureusement au format texte brut (text/plain).
 * Évite tout formatage HTML ou objet riche pour que le collage donne toujours une URL texte simple.
 */
export async function copyPlainTextToClipboard(text: string): Promise<boolean> {
  const plainText = extractPlainTextUrl(text) || text;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      if (typeof ClipboardItem !== 'undefined') {
        try {
          const blob = new Blob([plainText], { type: 'text/plain' });
          const item = new ClipboardItem({ 'text/plain': blob });
          await navigator.clipboard.write([item]);
          return true;
        } catch {
          // Fallback to writeText
          await navigator.clipboard.writeText(plainText);
          return true;
        }
      } else {
        await navigator.clipboard.writeText(plainText);
        return true;
      }
    }
  } catch {
    // Fallback if clipboard API failed
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = plainText;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    textArea.remove();
    return successful;
  } catch {
    return false;
  }
}
