const WORKER_URL = 'https://classchain-github-proxy.classchain.workers.dev';
const WORKER_ORIGIN = new URL(WORKER_URL).origin;
const AUTH_MESSAGE_TYPE = 'classchain-admin-auth';
let adminToken = null;
let loginPopup = null;

export function getAdminToken() {
  return adminToken;
}

export function startAdminLogin() {
  if (loginPopup && !loginPopup.closed) {
    loginPopup.focus();
    return;
  }

  // Open synchronously from the click handler so browsers do not block the popup.
  loginPopup = window.open(
    WORKER_URL + '/auth/login',
    'classchainAdminGitHubLogin',
    'popup,width=600,height=720,resizable=yes,scrollbars=yes'
  );

  if (!loginPopup) {
    window.alert('ورود در پنجره جداگانه مسدود شد. اجازه بازشدن پنجره (Pop-up) را برای این سایت فعال کنید.');
    return;
  }

  const handleMessage = (event) => {
    if (event.origin !== WORKER_ORIGIN || event.source !== loginPopup) return;
    if (!event.data || event.data.type !== AUTH_MESSAGE_TYPE ||
        typeof event.data.token !== 'string' || event.data.token.length > 2048) return;

    adminToken = event.data.token;
    window.removeEventListener('message', handleMessage);
    loginPopup = null;
    window.dispatchEvent(new CustomEvent('classchain-admin-auth-changed'));
  };

  window.addEventListener('message', handleMessage);
}

export function clearAdminAuth() {
  adminToken = null;
  if (loginPopup && !loginPopup.closed) loginPopup.close();
  loginPopup = null;
  window.dispatchEvent(new CustomEvent('classchain-admin-auth-changed'));
}
