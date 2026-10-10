/** ClassChain Ops core */
export const INDEXER = localStorage.getItem('classchain_indexer_url') || 'https://classchain-indexer.classchain.workers.dev';
export const PROJECTS_URL = '../frontend/data/Projects.json';
export const NET_COLORS = ['#22d3ee','#a78bfa','#34d399','#fbbf24','#f472b6','#60a5fa','#fb923c','#4ade80'];

export function $(id) { return document.getElementById(id); }

export function getSecret() {
  return sessionStorage.getItem('classchain_indexer_secret') || '';
}

export function setSecret(s) {
  try { localStorage.removeItem('classchain_indexer_secret'); } catch (_) {}
  if (s) sessionStorage.setItem('classchain_indexer_secret', s.trim());
  else sessionStorage.removeItem('classchain_indexer_secret');
}

export function fmtUsdt(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  const x = Number(n);
  if (x >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (x >= 1e3) return (x / 1e3).toFixed(digits) + 'k';
  return x.toFixed(x >= 100 ? 0 : 2);
}
export function usdtRaw(raw, decimals = 6) {
  try {
    const n = BigInt(String(raw || '0'));
    const base = 10n ** BigInt(decimals);
    const whole = n / base, frac = n % base;
    if (frac === 0n) return whole.toString();
    return whole + '.' + frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  } catch { return String(raw); }
}
export function short(a) {
  if (!a || a.length < 12) return a || '—';
  return a.slice(0, 6) + '…' + a.slice(-4);
}
export function colorForNetwork(networkId, index) {
  return NET_COLORS[index % NET_COLORS.length];
}
export function logOps(msg) {
  const el = $('opsLog');
  if (!el) return;
  const t = new Date().toLocaleTimeString('fa-IR');
  el.textContent = `[${t}] ${msg}\n` + el.textContent.slice(0, 3500);
}
export async function api(path, opts = {}) {
  const url = INDEXER.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
  const headers = {
    Accept: 'application/json',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers || {}),
  };
  const secret = getSecret();
  if (secret) headers['X-Indexer-Secret'] = secret;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { ok: false, error: text || res.statusText }; }
  if (!res.ok && data.ok !== true) {
    const err = new Error(data.error || ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}
export async function getNetworks() {
  const cfg = window.ClassChainNetworkConfig;
  if (!cfg) return [];
  await cfg.ready;
  if (typeof cfg.getReadNetworks === 'function') return cfg.getReadNetworks() || [];
  return Object.values(cfg.NETWORKS || {}).filter((n) => n && n.enabled !== false);
}
export function networkIdsFromSync(status) {
  const ids = new Set();
  (status?.treasuries || []).forEach((t) => { if (t.network_id) ids.add(t.network_id); });
  return [...ids];
}
export function badge(st) {
  const c = {
    PENDING_APPROVAL: '#fbbf24', APPROVED: '#60a5fa', EXECUTED: '#34d399',
    OPEN: '#34d399', CLOSED: '#8b93b0', ALLOCATED: '#a78bfa', SUCCESS: '#34d399', FAILED: '#f87171',
  }[st] || '#8b93b0';
  return `<span class="badge" style="background:${c}">${st}</span>`;
}
