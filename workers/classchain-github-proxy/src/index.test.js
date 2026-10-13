import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';

const env = {
  AUTH_SIGNING_SECRET: 'test-signing-secret-that-is-long-enough-for-tests',
  GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
  GITHUB_OAUTH_CLIENT_SECRET: 'test-client-secret',
  GITHUB_TOKEN: 'test-github-token',
  ADMIN_GITHUB_USER: 'classchain',
  ADMIN_APP_URL: 'https://classchain.github.io/ClassChain/Admin/',
  OAUTH_REDIRECT_URI: 'https://classchain-github-proxy.classchain.workers.dev/auth/callback',
  ADMIN_ORIGINS: 'https://classchain.github.io',
};
const sha = 'a'.repeat(40);
const validContent = Buffer.from(JSON.stringify({ features: [] }), 'utf8').toString('base64');

async function obtainToken(login = 'classchain') {
  const loginResponse = await worker.fetch(new Request('https://proxy.example/auth/login'), env);
  assert.equal(loginResponse.status, 302);
  const authorizeUrl = new URL(loginResponse.headers.get('Location'));
  const state = authorizeUrl.searchParams.get('state');
  const cookie = loginResponse.headers.get('Set-Cookie').split(';')[0];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === 'https://github.com/login/oauth/access_token') {
      return new Response(JSON.stringify({ access_token: 'mock-access-token' }), { status: 200 });
    }
    if (String(url) === 'https://api.github.com/user') {
      return new Response(JSON.stringify({ login }), { status: 200 });
    }
    throw new Error('Unexpected upstream request: ' + url);
  };
  try {
    const callback = await worker.fetch(new Request(
      'https://proxy.example/auth/callback?code=mock-code&state=' + encodeURIComponent(state),
      { headers: { Cookie: cookie } }
    ), env);
    return { callback, state, cookie };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function apiRequest(token, method = 'GET', body) {
  const url = 'https://proxy.example/' + (method === 'GET' ? '?path=frontend%2Fdata%2FProjects.json' : '');
  return new Request(url, {
    method,
    headers: {
      Origin: 'https://classchain.github.io',
      Authorization: 'Bearer ' + token,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test('login redirects to GitHub with state and secure HttpOnly state cookie', async () => {
  const response = await worker.fetch(new Request('https://proxy.example/auth/login'), env);
  assert.equal(response.status, 302);
  const url = new URL(response.headers.get('Location'));
  assert.equal(url.origin + url.pathname, 'https://github.com/login/oauth/authorize');
  assert.ok(url.searchParams.get('state'));
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly/);
  assert.match(response.headers.get('Set-Cookie'), /Secure/);
});

test('callback issues a short-lived token only for the allowlisted GitHub login', async () => {
  const { callback } = await obtainToken();
  assert.equal(callback.status, 302);
  const location = new URL(callback.headers.get('Location'));
  assert.equal(location.origin + location.pathname, env.ADMIN_APP_URL);
  assert.match(location.hash, /^#token=/);
});

test('callback denies a different GitHub account', async () => {
  const { callback } = await obtainToken('someone-else');
  assert.match(callback.headers.get('Location'), /auth=denied/);
});

test('callback rejects missing or mismatched OAuth state', async () => {
  const response = await worker.fetch(new Request('https://proxy.example/auth/callback?code=mock-code&state=wrong', {
    headers: { Cookie: 'cc_oauth_state=right' },
  }), env);
  assert.match(response.headers.get('Location'), /auth=failed/);
});

test('API rejects missing and tampered bearer tokens', async () => {
  assert.equal((await worker.fetch(apiRequest(''), env)).status, 401);
  assert.equal((await worker.fetch(apiRequest('fake.payload'), env)).status, 401);
});

test('API accepts a valid token and restricts reads to Projects.json on admin branch', async () => {
  const { callback } = await obtainToken();
  const location = new URL(callback.headers.get('Location'));
  const token = decodeURIComponent(location.hash.slice('#token='.length));
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ path: 'frontend/data/Projects.json', sha }), { status: 200 });
  };
  try {
    const response = await worker.fetch(apiRequest(token), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sha });
    assert.equal(requestedUrl, 'https://api.github.com/repos/classchain/ClassChain/contents/frontend/data/Projects.json?ref=admin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API rejects unapproved origins and missing GitHub token', async () => {
  const { callback } = await obtainToken();
  const token = decodeURIComponent(new URL(callback.headers.get('Location')).hash.slice('#token='.length));
  const request = apiRequest(token);
  const badOrigin = new Request(request, { headers: { ...Object.fromEntries(request.headers), Origin: 'https://attacker.example' } });
  assert.equal((await worker.fetch(badOrigin, env)).status, 403);
  assert.equal((await worker.fetch(apiRequest(token), { ...env, GITHUB_TOKEN: '' })).status, 503);
});
