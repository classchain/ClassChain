/**
 * ClassChain Indexer — Cloudflare Worker
 *
 * - scheduled: periodic Nile sync
 * - fetch: manual trigger + health
 *
 * Projects.json is loaded from PROJECTS_JSON_URL (env)
 * so the Worker does not depend on GitHub Pages runtime.
 */

import { ProjectRegistry } from './core/discovery/ProjectRegistry.js';
import { NetworkResolver } from './core/discovery/NetworkResolver.js';
import { IndexerRunner } from './core/runner/IndexerRunner.js';
import { TreasuryRepository } from './db/TreasuryRepository.js';
import { TransferRepository } from './db/TransferRepository.js';
import { SyncStateRepository } from './db/SyncStateRepository.js';
import { createAdapter } from './adapters/createAdapter.js';

const DEFAULT_NETWORK_IDS = ['tron_nile'];

async function loadProjectsRegistry(env) {
  const url =
    env.PROJECTS_JSON_URL ||
    'https://raw.githubusercontent.com/classchain/ClassChain/Donation/frontend/data/Projects.json';

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load Projects.json: HTTP ${response.status} (${url})`
    );
  }

  const registry = await response.json();

  if (!registry || !Array.isArray(registry.features)) {
    throw new Error('Projects.json must contain features[]');
  }

  return registry;
}

function readNetworkIds(env) {
  if (!env.NETWORK_IDS || typeof env.NETWORK_IDS !== 'string') {
    return DEFAULT_NETWORK_IDS;
  }

  return env.NETWORK_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function readNumber(env, key, fallback) {
  const n = Number(env[key]);
  return Number.isFinite(n) ? n : fallback;
}

async function runIndexer(env, options = {}) {
  if (!env.DB) {
    throw new Error('D1 binding DB is missing');
  }

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

  const summary = await runner.runOnce({
    scanFromBlock: readNumber(env, 'SCAN_FROM_BLOCK', 0),
    safeConfirmations: readNumber(env, 'SAFE_CONFIRMATIONS', 20),
    overlap: readNumber(env, 'OVERLAP', 10),
    ...options,
  });

  return summary;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export default {
  /**
   * Cron entry
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          const summary = await runIndexer(env);
          console.log(
            JSON.stringify({
              type: 'indexer.scheduled',
              cron: event.cron,
              scheduledTime: event.scheduledTime,
              summary,
            })
          );
        } catch (error) {
          console.error(
            JSON.stringify({
              type: 'indexer.scheduled.error',
              message:
                error instanceof Error ? error.message : String(error),
            })
          );
          throw error;
        }
      })()
    );
  },

  /**
   * Manual ops:
   *   GET  /health
   *   POST /sync   (optional header X-Indexer-Secret)
   */
    async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'GET' && path === '/health') {
        return jsonResponse({
        ok: true,
        service: 'classchain-indexer',
        networks: readNetworkIds(env),
        });
    }

    if (method === 'POST' && path === '/sync') {
        const required = env.INDEXER_SYNC_SECRET;
        if (required) {
        const provided = request.headers.get('X-Indexer-Secret');
        if (provided !== required) {
            return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
        }
        }

        try {
        const summary = await runIndexer(env);
        return jsonResponse({ ok: true, summary });
        } catch (error) {
        return jsonResponse(
            {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            },
            500
        );
        }
    }

    // optional debug
    if (method === 'GET' && path === '/debug') {
        return jsonResponse({
        method,
        path,
        url: url.toString(),
        });
    }

    return jsonResponse(
        {
        ok: false,
        error: 'not_found',
        method,
        path,
        routes: ['GET /health', 'POST /sync'],
        },
        404
    );
    },
};