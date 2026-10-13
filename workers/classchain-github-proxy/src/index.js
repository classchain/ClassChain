
const TOKEN_TTL_SECONDS = 15 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const GITHUB_API = 'https://api.github.com';

function base64url(bytes) {
  const binary = typeof bytes === 'string'
    ? bytes
    : Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64url(bytes);
}

async function hmacSign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function issueAdminToken(login, env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: login, iss: 'classchain-github-proxy', aud: 'classchain-admin',
    iat: now, exp: now + TOKEN_TTL_SECONDS
  }));
  const signature = base64url(await hmacSign(payload, env.AUTH_SIGNING_SECRET));
  return payload + '.' + signature;
}

async function verifyAdminToken(token, env) {
  if (!env.AUTH_SIGNING_SECRET || typeof token !== 'string' || token.length > 2048) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  let payload;
  try { payload = JSON.parse(fromBase64url(parts[0])); } catch { return false; }
  if (!payload || payload.iss !== 'classchain-github-proxy' ||
      payload.aud !== 'classchain-admin' ||
      payload.sub !== env.ADMIN_GITHUB_USER.toLowerCase() ||
      !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000) ||
      !Number.isInteger(payload.iat) || payload.iat > Math.floor(Date.now() / 1000) + 30 ||
      payload.exp - payload.iat > TOKEN_TTL_SECONDS) return false;
  try {
    const expected = base64url(await hmacSign(parts[0], env.AUTH_SIGNING_SECRET));
    const a = new TextEncoder().encode(parts[1]);
    const b = new TextEncoder().encode(expected);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } catch { return false; }
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...headers } });
}

function cookieValue(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

async function handleOAuth(request, env, url) {
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET || !env.AUTH_SIGNING_SECRET || !env.ADMIN_GITHUB_USER) {
    return response({ error: 'GitHub OAuth is not configured' }, 503);
  }
  const redirectUri = env.OAUTH_REDIRECT_URI || 'https://classchain-github-proxy.classchain.workers.dev/auth/callback';
  const appUrl = env.ADMIN_APP_URL || 'https://classchain.github.io/ClassChain/Admin/';
  if (url.pathname === '/auth/login') {
    if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
    const state = randomState();
    const authorize = new URL('https://github.com/login/oauth/authorize');
    authorize.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
    authorize.searchParams.set('redirect_uri', redirectUri);
    authorize.searchParams.set('scope', 'read:user');
    authorize.searchParams.set('state', state);
    return redirect(authorize.toString(), {
      'Set-Cookie': 'cc_oauth_state=' + encodeURIComponent(state) + '; Max-Age=' + OAUTH_STATE_TTL_SECONDS + '; Path=/auth/callback; HttpOnly; Secure; SameSite=Lax'
    });
  }
  if (url.pathname === '/auth/callback') {
    if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
    const state = url.searchParams.get('state') || '';
    const storedState = cookieValue(request, 'cc_oauth_state');
    const clearCookie = 'cc_oauth_state=; Max-Age=0; Path=/auth/callback; HttpOnly; Secure; SameSite=Lax';
    if (!state || !storedState || state.length > 256 || state !== storedState) {
      return redirect(appUrl + '?auth=failed#login', { 'Set-Cookie': clearCookie });
    }
    const code = url.searchParams.get('code') || '';
    if (!code || code.length > 2048) return redirect(appUrl + '?auth=failed#login', { 'Set-Cookie': clearCookie });
    try {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'ClassChain-Admin-Worker' },
        body: JSON.stringify({
          client_id: env.GITHUB_OAUTH_CLIENT_ID,
          client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          state
        })
      });
      if (!tokenResponse.ok) return redirect(appUrl + '?auth=failed#login', { 'Set-Cookie': clearCookie });
      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token || tokenData.error) return redirect(appUrl + '?auth=failed#login', { 'Set-Cookie': clearCookie });
      const userResponse = await fetch(GITHUB_API + '/user', {
        headers: {
          Authorization: 'Bearer ' + tokenData.access_token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'ClassChain-Admin-Worker'
        }
      });
      if (!userResponse.ok) return redirect(appUrl + '?auth=failed#login', { 'Set-Cookie': clearCookie });
      const user = await userResponse.json();
      const allowedUser = env.ADMIN_GITHUB_USER.toLowerCase();
      if (typeof user.login !== 'string' || user.login.toLowerCase() !== allowedUser) {
        return redirect(appUrl + '?auth=denied#login', { 'Set-Cookie': clearCookie });
      }
      const adminToken = await issueAdminToken(user.login.toLowerCase(), env);
      const appOrigin = new URL(appUrl).origin;
      const message = JSON.stringify({ type: 'classchain-admin-auth', token: adminToken })
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
      return new Response(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>ClassChain Admin sign-in</title></head><body>' +
        '<p>Sign-in complete. You may close this window.</p>' +
        '<script>if (window.opener) { window.opener.postMessage(' + message + ', ' + JSON.stringify(appOrigin) + '); window.close(); }</script>' +
        '</body></html>',
        { status: 200, headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
        }}
      );
    } catch {
      return redirect(appUrl + '?auth=failed#login', { 'Set-Cookie': clearCookie });
    }
  }
  return null;
}

const REPO = 'classchain/ClassChain';
const BRANCH = 'admin';
const ALLOWED_PATH = 'frontend/data/Projects.json';
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 1_500_000;

function response(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function allowedOrigins(env) {
  return (env.ADMIN_ORIGINS || 'https://classchain.github.io')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function cors(request, env) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function decodeAndValidate(content) {
  if (typeof content !== 'string' || !content) throw new Error('Invalid content');
  let decoded;
  try {
    const binary = atob(content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Invalid base64 UTF-8 content');
  }

  if (new TextEncoder().encode(decoded).byteLength > MAX_FILE_BYTES) {
    throw new Error('File too large');
  }

  let data;
  try {
    data = JSON.parse(decoded);
  } catch {
    throw new Error('Invalid JSON');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.features)) {
    throw new Error('Expected features array');
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/auth/login' || url.pathname === '/auth/callback') {
      return (await handleOAuth(request, env, url)) || response({ error: 'Not found' }, 404);
    }

    const headers = cors(request, env);
    const origin = request.headers.get('Origin');
    const origins = allowedOrigins(env);

    if (!origin || !origins.includes(origin)) {
      return response({ error: 'Origin not allowed' }, 403, headers);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (!['GET', 'POST'].includes(request.method)) {
      return response({ error: 'Method not allowed' }, 405, {
        ...headers,
        Allow: 'GET, POST, OPTIONS',
      });
    }

    const authorization = request.headers.get('Authorization') || '';
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    let authorized = false;
    try {
      authorized = await verifyAdminToken(bearer, env);
    } catch {
      return response({ error: 'Authentication unavailable' }, 503, headers);
    }
    if (!authorized) return response({ error: 'Unauthorized' }, 401, headers);

    if (!env.GITHUB_TOKEN) {
      return response({ error: 'GitHub integration unavailable' }, 503, headers);
    }

    if (request.method === 'GET') {
      if (url.searchParams.get('path') !== ALLOWED_PATH) {
        return response({ error: 'Path not allowed' }, 403, headers);
      }

      try {
        const upstream = await fetch(
          `https://api.github.com/repos/${REPO}/contents/${ALLOWED_PATH}?ref=${BRANCH}`,
          {
            headers: {
              Authorization: `Bearer ${env.GITHUB_TOKEN}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'ClassChain-Admin-Worker',
            },
          },
        );
        if (!upstream.ok) {
          return response({ error: 'GitHub read failed', upstreamStatus: upstream.status }, 502, headers);
        }
        const data = await upstream.json();
        if (data.path !== ALLOWED_PATH || typeof data.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(data.sha)) {
          return response({ error: 'Unexpected GitHub response' }, 502, headers);
        }
        return response({ sha: data.sha }, 200, headers);
      } catch {
        return response({ error: 'GitHub read failed' }, 502, headers);
      }
    }

    if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
      return response({ error: 'Content-Type must be application/json' }, 415, headers);
    }

    const contentLength = request.headers.get('Content-Length');
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)) {
      return response({ error: 'Request too large or invalid length' }, 413, headers);
    }

    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
        return response({ error: 'Request too large' }, 413, headers);
      }
      body = JSON.parse(raw);
    } catch {
      return response({ error: 'Invalid request body' }, 400, headers);
    }

    if (!body || typeof body !== 'object' || Array.isArray(body) || body.path !== ALLOWED_PATH) {
      return response({ error: 'Path not allowed' }, 403, headers);
    }
    if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 200) {
      return response({ error: 'Invalid commit message' }, 400, headers);
    }
    if (typeof body.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(body.sha)) {
      return response({ error: 'Valid existing file SHA required' }, 400, headers);
    }

    try {
      decodeAndValidate(body.content);
    } catch (error) {
      const tooLarge = error.message === 'File too large';
      return response(
        { error: tooLarge ? 'File too large' : 'Invalid Projects.json content' },
        tooLarge ? 413 : 400,
        headers,
      );
    }

    try {
      const upstream = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${ALLOWED_PATH}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'ClassChain-Admin-Worker',
          },
          body: JSON.stringify({
            message: body.message.trim(),
            content: body.content.replace(/\s/g, ''),
            sha: body.sha,
            branch: BRANCH,
          }),
        },
      );
      if (!upstream.ok) {
        return response({ error: 'GitHub rejected the update', upstreamStatus: upstream.status }, 502, headers);
      }
      const result = await upstream.json();
      return response({
        content: { path: result.content?.path, sha: result.content?.sha },
        commit: { sha: result.commit?.sha },
      }, 200, headers);
    } catch {
      return response({ error: 'GitHub update failed' }, 502, headers);
    }
  },
};
