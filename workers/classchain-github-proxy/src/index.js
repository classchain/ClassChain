const REPO = 'classchain/ClassChain';
const BRANCH = 'admin';
const ALLOWED_PATH = 'frontend/data/Projects.json';
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 1_500_000;

function response(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function allowedOrigins(env) {
  return (env.ADMIN_ORIGINS || 'https://classchain.github.io').split(',').map(x => x.trim()).filter(Boolean);
}

function cors(request, env) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins(env).includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function decodeAndValidate(content) {
  if (typeof content !== 'string' || !content) throw new Error('Invalid content');
  let decoded;
  try {
    const binary = atob(content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Invalid base64 UTF-8 content');
  }
  if (new TextEncoder().encode(decoded).byteLength > MAX_FILE_BYTES) throw new Error('File too large');
  let data;
  try { data = JSON.parse(decoded); } catch { throw new Error('Invalid JSON'); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.features)) throw new Error('Expected features array');
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') {
      if (origin && !allowedOrigins(env).includes(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }
    if (origin && !allowedOrigins(env).includes(origin)) return response({ error: 'Origin not allowed' }, 403, headers);
    if (!['GET', 'POST'].includes(request.method)) return response({ error: 'Method not allowed' }, 405, { ...headers, Allow: 'GET, POST, OPTIONS' });

    const key = request.headers.get('X-Admin-Key') || '';
    if (!env.ADMIN_SECRET || !key || key.length > 512 || key !== env.ADMIN_SECRET) return response({ error: 'Unauthorized' }, 401, headers);

    const url = new URL(request.url);
    if (request.method === 'GET') {
      if (url.searchParams.get('path') !== ALLOWED_PATH) return response({ error: 'Path not allowed' }, 403, headers);
      try {
        const upstream = await fetch(`https://api.github.com/repos/${REPO}/contents/${ALLOWED_PATH}?ref=${BRANCH}`, {
          headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ClassChain-Admin-Worker' },
        });
        if (upstream.status === 404) return response({ sha: null }, 200, headers);
        if (!upstream.ok) return response({ error: 'GitHub read failed', upstreamStatus: upstream.status }, 502, headers);
        const data = await upstream.json();
        if (data.path !== ALLOWED_PATH || !data.sha) return response({ error: 'Unexpected GitHub response' }, 502, headers);
        return response({ sha: data.sha }, 200, headers);
      } catch {
        return response({ error: 'GitHub read failed' }, 502, headers);
      }
    }

    if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return response({ error: 'Content-Type must be application/json' }, 415, headers);
    if (Number(request.headers.get('Content-Length') || 0) > MAX_REQUEST_BYTES) return response({ error: 'Request too large' }, 413, headers);
    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return response({ error: 'Request too large' }, 413, headers);
      body = JSON.parse(raw);
    } catch {
      return response({ error: 'Invalid request body' }, 400, headers);
    }
    if (!body || body.path !== ALLOWED_PATH) return response({ error: 'Path not allowed' }, 403, headers);
    if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 200) return response({ error: 'Invalid commit message' }, 400, headers);
    if (typeof body.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(body.sha)) return response({ error: 'Valid existing file SHA required' }, 400, headers);
    try { decodeAndValidate(body.content); } catch (error) {
      return response({ error: error.message === 'File too large' ? 'File too large' : 'Invalid Projects.json content' }, error.message === 'File too large' ? 413 : 400, headers);
    }

    try {
      const upstream = await fetch(`https://api.github.com/repos/${REPO}/contents/${ALLOWED_PATH}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ClassChain-Admin-Worker' },
        body: JSON.stringify({ message: body.message.trim(), content: body.content.replace(/\s/g, ''), sha: body.sha, branch: BRANCH }),
      });
      if (!upstream.ok) return response({ error: 'GitHub rejected the update', upstreamStatus: upstream.status }, 502, headers);
      const result = await upstream.json();
      return response({ content: { path: result.content?.path, sha: result.content?.sha }, commit: { sha: result.commit?.sha } }, 200, headers);
    } catch {
      return response({ error: 'GitHub update failed' }, 502, headers);
    }
  },
};
