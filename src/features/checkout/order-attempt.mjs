// An order attempt is one cart plus the exact choices sent. Repeating the same
// choices (double click, lost response, Render cold start) reuses the attempt's
// key so the server replays that order; changing any choice starts a new one.
// Only a digest of the choices is stored: no recipient data in sessionStorage.
const memory = new Map();

async function digest(choices) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(choices)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function orderAttemptKey(storage, cartId, choices, newKey = () => crypto.randomUUID()) {
  const name = `mb_checkout_key_${cartId}`, fingerprint = await digest(choices);
  let saved = memory.get(name);
  try { saved = JSON.parse(storage?.getItem(name) || 'null') ?? saved; } catch { /* Unavailable or legacy value. */ }
  if (saved?.fingerprint === fingerprint && typeof saved.key === 'string') return saved.key;
  const attempt = { fingerprint, key: newKey() };
  memory.set(name, attempt);
  try { storage?.setItem(name, JSON.stringify(attempt)); } catch { /* Memory keeps it for this page. */ }
  return attempt.key;
}
