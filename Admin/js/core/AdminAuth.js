const WORKER_URL = 'https://classchain-github-proxy.classchain.workers.dev';
let adminToken = null;

export function consumeAuthFragment() {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#token=')) return false;
  const token = new URLSearchParams(hash.slice(1)).get('token');
  if (token) adminToken = token;
  window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  return Boolean(adminToken);
}

export function getAdminToken() {
  return adminToken;
}

export function startAdminLogin() {
  window.location.assign(WORKER_URL + '/auth/login');
}

export function clearAdminAuth() {
  adminToken = null;
}
