import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';

const env = {
  ADMIN_SECRET: 'test-secret',
  GITHUB_TOKEN: 'test-token',
  ADMIN_ORIGINS: 'https://classchain.github.io',
};
const validContent = Buffer.from(JSON.stringify({ features: [] }), 'utf8').toString('base64');
const sha = 'a'.repeat(40);

function makeRequest({
  path = 'frontend/data/Projects.json',
  method = 'GET',
  key = 'test-secret',
  origin = 'https://classchain.github.io',
  body,
  headers: extraHeaders = {},
} = {}) {
  const url = 'https://proxy.example/' + (path ? '?path=' + encodeURIComponent(path) : '');
  const headers = { ...extraHeaders };
  if (key) headers['X-Admin-Key'] = key;
  if (origin) headers.Origin = origin;
  if (body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  return new Request(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test('rejects missing and incorrect keys', async () => {
  assert.equal((await worker.fetch(makeRequest({ key: '' }), env)).status, 401);
  assert.equal((await worker.fetch(makeRequest({ key: 'wrong' }), env)).status, 401);
});

test('rejects requests without an Origin and non-allowlisted origins', async () => {
  assert.equal((await worker.fetch(makeRequest({ origin: null }), env)).status, 403);
  assert.equal((await worker.fetch(makeRequest({ origin: 'https://attacker.example' }), env)).status, 403);
});

test('allows preflight only from the configured admin origin', async () => {
  assert.equal((await worker.fetch(new Request('https://proxy.example/', {
    method: 'OPTIONS',
    headers: { Origin: 'https://classchain.github.io' },
  }), env)).status, 204);
  assert.equal((await worker.fetch(new Request('https://proxy.example/', {
    method: 'OPTIONS',
    headers: { Origin: 'https://attacker.example' },
  }), env)).status, 403);
});

test('rejects unsupported methods', async () => {
  assert.equal((await worker.fetch(new Request('https://proxy.example/', {
    method: 'DELETE',
    headers: { Origin: 'https://classchain.github.io', 'X-Admin-Key': 'test-secret' },
  }), env)).status, 405);
});

test('rejects non-allowlisted paths and invalid JSON content without calling GitHub', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('should not be called'); };
  try {
    assert.equal((await worker.fetch(makeRequest({ path: 'README.md' }), env)).status, 403);
    const wrongPath = await worker.fetch(makeRequest({
      path: '',
      method: 'POST',
      body: { path: 'README.md', message: 'test', content: validContent, sha },
    }), env);
    assert.equal(wrongPath.status, 403);
    const invalid = await worker.fetch(makeRequest({
      path: '',
      method: 'POST',
      body: { path: 'frontend/data/Projects.json', message: 'test', content: Buffer.from('{}').toString('base64'), sha },
    }), env);
    assert.equal(invalid.status, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requires a valid existing file SHA before writing', async () => {
  const response = await worker.fetch(makeRequest({
    path: '',
    method: 'POST',
    body: { path: 'frontend/data/Projects.json', message: 'test', content: validContent },
  }), env);
  assert.equal(response.status, 400);
});

test('rejects missing GitHub token before making upstream requests', async () => {
  const response = await worker.fetch(makeRequest(), { ...env, GITHUB_TOKEN: '' });
  assert.equal(response.status, 503);
});

test('GET reads only the allowlisted file from the fixed admin branch', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ path: 'frontend/data/Projects.json', sha }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await worker.fetch(makeRequest(), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sha });
    assert.equal(requestedUrl, 'https://api.github.com/repos/classchain/ClassChain/contents/frontend/data/Projects.json?ref=admin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST writes only the allowlisted file and fixed admin branch', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestOptions = options;
    return new Response(JSON.stringify({
      content: { path: 'frontend/data/Projects.json', sha: 'b'.repeat(40) },
      commit: { sha: 'c'.repeat(40) },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await worker.fetch(makeRequest({
      path: '',
      method: 'POST',
      body: { path: 'frontend/data/Projects.json', message: 'test update', content: validContent, sha },
    }), env);
    assert.equal(response.status, 200);
    assert.equal(requestedUrl, 'https://api.github.com/repos/classchain/ClassChain/contents/frontend/data/Projects.json');
    const upstreamBody = JSON.parse(requestOptions.body);
    assert.equal(upstreamBody.branch, 'admin');
    assert.equal(upstreamBody.sha, sha);
    assert.equal(upstreamBody.message, 'test update');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not leak upstream response bodies on GitHub errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('sensitive upstream diagnostic', { status: 500 });
  try {
    const response = await worker.fetch(makeRequest(), env);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'GitHub read failed', upstreamStatus: 500 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
