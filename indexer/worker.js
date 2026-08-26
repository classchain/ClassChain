/**
 * ClassChain Indexer — Cloudflare Worker + HTTP API
 *
 * Routes:
 *   GET  /health
 *   POST /sync          (with X-Indexer-Secret)
 *   GET  /api/donors
 *   GET  /api/transfers
 *   GET  /api/sync-status
 */

import { ProjectRegistry } from './core/discovery/ProjectRegistry.js';
import { NetworkResolver } from './core/discovery/NetworkResolver.js';
import { IndexerRunner } from './core/runner/IndexerRunner.js';
import { TreasuryRepository } from './db/TreasuryRepository.js';
import { TransferRepository } from './db/TransferRepository.js';
import { SyncStateRepository } from './db/SyncStateRepository.js';
import { createAdapter } from './adapters/createAdapter.js';

const DEFAULT_NETWORK_IDS = ['tron_nile', 'polygon_amoy'];

function readNetworkIds(env) {
  if (!env.NETWORK_IDS) return DEFAULT_NETWORK_IDS;
  return env.NETWORK_IDS.split(',').map(s => s.trim()).filter(Boolean);
}

function readNumber(env, key, fallback) {
  const n = Number(env[key]);
  return Number.isFinite(n) ? n : fallback;
}

async function loadProjectsRegistry(env) {
  const url = env.PROJECTS_JSON_URL || 
    'https://raw.githubusercontent.com/classchain/ClassChain/Donation/frontend/data/Projects.json';
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load Projects.json: ${res.status}`);
  return await res.json();
}

async function runIndexer(env, options = {}) {
  if (!env.DB) throw new Error('D1 binding DB is missing');

  const registryJson = await loadProjectsRegistry(env);
  const runner = new IndexerRunner({
    projectRegistry: new ProjectRegistry(registryJson),
    networkResolver: new NetworkResolver(),
    treasuryRepository: new TreasuryRepository(env.DB),
    transferRepository: new TransferRepository(env.DB),
    syncStateRepository: new SyncStateRepository(env.DB),
    adapterFactory: createAdapter,
    networkIds: readNetworkIds(env),
  });

  return await runner.runOnce({
    scanFromBlock: readNumber(env, 'SCAN_FROM_BLOCK', 0),
    safeConfirmations: readNumber(env, 'SAFE_CONFIRMATIONS', 20),
    overlap: readNumber(env, 'OVERLAP', 10),
    ...options,
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          const summary = await runIndexer(env);
          console.log(JSON.stringify({ type: 'indexer.scheduled', summary }));
        } catch (e) {
          console.error(JSON.stringify({ type: 'indexer.scheduled.error', error: e.message }));
        }
      })()
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();

    // Health
    if (method === 'GET' && path === '/health') {
      return jsonResponse({ ok: true, service: 'classchain-indexer', networks: readNetworkIds(env) });
    }

    // Manual sync
    if (method === 'POST' && path === '/sync') {
      const secret = env.INDEXER_SYNC_SECRET;
      if (secret && request.headers.get('X-Indexer-Secret') !== secret) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      try {
        const summary = await runIndexer(env);
        return jsonResponse({ ok: true, summary });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    // === NEW API ENDPOINTS ===

    if (method === 'GET' && path === '/api/donors') {
      const projectId = url.searchParams.get('projectId');
      if (!projectId) return jsonResponse({ ok: false, error: 'projectId is required' }, 400);

      const rows = await env.DB.prepare(`
        SELECT donor, amount, amount_raw, tx_hash, timestamp
        FROM transfers
        WHERE project_id = ?
        ORDER BY block_number DESC, event_index DESC
      `).bind(projectId).all();

      return jsonResponse({ projectId, donors: rows.results });
    }

    if (method === 'GET' && path === '/api/transfers') {
      const projectId = url.searchParams.get('projectId');
      if (!projectId) return jsonResponse({ ok: false, error: 'projectId is required' }, 400);

      const rows = await env.DB.prepare(`
        SELECT donor, amount, amount_raw, tx_hash, block_number, event_index, timestamp
        FROM transfers
        WHERE project_id = ?
        ORDER BY block_number DESC, event_index DESC
      `).bind(projectId).all();

      return jsonResponse({ projectId, transfers: rows.results });
    }

    if (method === 'GET' && path === '/api/sync-status') {
      const rows = await env.DB.prepare(`
        SELECT t.project_id, t.network_id, t.address,
               s.last_scanned_block, s.last_finalized_block, s.status, s.error,
               (SELECT COUNT(*) FROM transfers tr WHERE tr.treasury_id = t.id) AS tx_count
        FROM treasuries t
        LEFT JOIN sync_state s ON s.treasury_id = t.id
        ORDER BY t.project_id, t.network_id
      `).all();

      return jsonResponse({ status: 'ok', treasuries: rows.results });
    }

    // Default 404
    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  },
};
