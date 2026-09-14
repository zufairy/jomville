/**
 * Minimal placeholder word list. Real launch needs a maintained list plus
 * moderation review. Kept tiny here so tests are honest.
 */
const WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot', 'retard'];

const NORMALISE: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

function normalise(word: string) {
  return word
    .toLowerCase()
    .split('')
    .map((c) => NORMALISE[c] ?? c)
    .join('')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1'); // collapse repeats (fuuuck -> fuck)
}

export function containsProfanity(text: string): boolean {
  for (const token of text.split(/\s+/)) {
    const n = normalise(token);
    if (!n) continue;
    if (WORDS.some((w) => n === w || n.includes(w))) return true;
  }
  return false;
}

/** Replace each profane token with asterisks, preserving length. */
export function censor(text: string): string {
  return text
    .split(/(\s+)/)
    .map((token) => (/\s/.test(token) || !containsProfanity(token) ? token : '*'.repeat(token.length)))
    .join('');
}
