/**
 * ClassChain Indexer API config (Admin panel)
 */
export const INDEXER_URL =
  localStorage.getItem('classchain_indexer_url') ||
  'https://classchain-indexer.classchain.workers.dev';

export function getIndexerSecret() {
  return (
    sessionStorage.getItem('classchain_indexer_secret') ||
    localStorage.getItem('classchain_indexer_secret') ||
    ''
  );
}

export function setIndexerSecret(secret) {
  if (secret) sessionStorage.setItem('classchain_indexer_secret', secret.trim());
}

/**
 * @param {string} path - e.g. /api/disburse/pending
 * @param {RequestInit} [opts]
 */
export async function indexerFetch(path, opts = {}) {
  const url = `${INDEXER_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
  const headers = {
    Accept: 'application/json',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers || {}),
  };
  const secret = getIndexerSecret();
  if (secret) headers['X-Indexer-Secret'] = secret;

  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, error: text || res.statusText };
  }
  if (!res.ok && data.ok !== true) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function formatUsdt(raw, decimals = 6) {
  try {
    const n = BigInt(String(raw || '0'));
    const base = 10n ** BigInt(decimals);
    const whole = n / base;
    const frac = n % base;
    if (frac === 0n) return whole.toString();
    const f = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${whole}.${f}`;
  } catch {
    return String(raw);
  }
}

export function shortAddr(a) {
  if (!a || a.length < 12) return a || '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
