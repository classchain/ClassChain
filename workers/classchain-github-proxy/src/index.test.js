import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';

const env = { ADMIN_SECRET: 'test-secret', GITHUB_TOKEN: 'test-token', ADMIN_ORIGINS: 'https://classchain.github.io' };
const validContent = Buffer.from(JSON.stringify({ features: [] }), 'utf8').toString('base64');
const sha = 'a'.repeat(40);

function makeRequest({ path = 'frontend/data/Projects.json', method = 'GET', key = 'test-secret', origin = 'https://classchain.github.io', body } = {}) {
  const url = 'https://proxy.example/' + (path ? '?path=' + encodeURIComponent(path) : '');
  const headers = {};
  if (key) headers['X-Admin-Key'] = key;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

test('rejects missing and incorrect keys', async () => {
  assert.equal((await worker.fetch(makeRequest({ key: '' }), env)).status, 401);
  assert.equal((await worker.fetch(makeRequest({ key: 'wrong' }), env)).status, 401);
});

test('rejects non-allowlisted paths and origins', async () => {
  assert.equal((await worker.fetch(makeRequest({ path: 'README.md' }), env)).status, 403);
  assert.equal((await worker.fetch(makeRequest({ origin: 'https://attacker.example' }), env)).status, 403);
});

test('rejects unsupported methods', async () => {
  assert.equal((await worker.fetch(new Request('https://proxy.example/', { method: 'DELETE', headers: { 'X-Admin-Key': 'test-secret' } }), env)).status, 405);
});

test('rejects wrong write path and invalid JSON content', async () => {
  const wrongPath = await worker.fetch(makeRequest({ path: '', method: 'POST', body: { path: 'README.md', message: 'test', content: validContent, sha } }), env);
  assert.equal(wrongPath.status, 403);
  const invalid = await worker.fetch(makeRequest({ path: '', method: 'POST', body: { path: 'frontend/data/Projects.json', message: 'test', content: Buffer.from('{}').toString('base64'), sha } }), env);
  assert.equal(invalid.status, 400);
});

test('requires existing file SHA before writing', async () => {
  const response = await worker.fetch(makeRequest({ path: '', method: 'POST', body: { path: 'frontend/data/Projects.json', message: 'test', content: validContent } }), env);
  assert.equal(response.status, 400);
});
