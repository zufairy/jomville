/** Anonymous device identity. Secret token lives only in this browser; server stores a hash. */
const KEY = 'dovey.token';

function generate(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function deviceToken(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 16) return existing;
    const t = generate();
    localStorage.setItem(KEY, t);
    return t;
  } catch {
    return generate(); // private mode: fresh identity per load
  }
}
