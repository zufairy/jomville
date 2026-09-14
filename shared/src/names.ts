const ADJ = ['sunny', 'fuzzy', 'tiny', 'cozy', 'bouncy', 'sleepy', 'happy', 'minty', 'peachy', 'dizzy', 'lucky', 'snowy', 'jolly', 'rosy', 'zippy', 'mellow'];
const NOUN = ['otter', 'dove', 'bean', 'moth', 'frog', 'panda', 'koala', 'newt', 'bunny', 'goose', 'seal', 'yak', 'kiwi', 'duck', 'lark', 'fox'];

/** Random cute handle like "sunny_otter42". Matches HANDLE regex. */
export function randomHandle(rand: () => number = Math.random): string {
  const a = ADJ[Math.floor(rand() * ADJ.length)];
  const n = NOUN[Math.floor(rand() * NOUN.length)];
  const num = Math.floor(rand() * 90) + 10;
  return `${a}_${n}${num}`;
}

/** Random room slug, 8 chars [a-z0-9]. */
export function randomSlug(rand: () => number = Math.random): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return s;
}
