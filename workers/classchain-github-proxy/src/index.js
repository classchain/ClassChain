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
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

// Hash first, then compare fixed-length digests to avoid a character-by-character
// early exit. This does not replace a proper identity/session system.
async function secretMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !provided || !expected) return false;
  if (provided.length > 512 || expected.length > 512) return false;

  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function decodeAndValidate(content) {
  if (typeof content !== 'string' || !content) throw new Error('Invalid content');
  let decoded;
  try {
    const binary = atob(content.replace(/\\s/g, ''));
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
    const headers = cors(request, env);
    const origin = request.headers.get('Origin');
    const origins = allowedOrigins(env);

    // This endpoint is exclusively for the browser-based admin UI.
    // CORS alone is not authentication, so requests without an allowed Origin
    // are rejected here and every accepted request must also authenticate.
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

    let authorized = false;
    try {
      authorized = await secretMatches(request.headers.get('X-Admin-Key') || '', env.ADMIN_SECRET || '');
    } catch {
      return response({ error: 'Authentication unavailable' }, 503, headers);
    }
    if (!authorized) return response({ error: 'Unauthorized' }, 401, headers);

    if (!env.GITHUB_TOKEN) {
      return response({ error: 'GitHub integration unavailable' }, 503, headers);
    }

    const url = new URL(request.url);
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
    if (contentLength && (!/^\\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)) {
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
            content: body.content.replace(/\\s/g, ''),
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
