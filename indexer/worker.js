/**
 * ClassChain Indexer — Cloudflare Worker + HTTP API
 * Phase 0 / Phase 1 / Phase 2 / Phase 3 / Phase 4
 *
 * Phase 1:
 *   GET  /api/contributor?donor=...&network_id=...
 *   GET  /api/queue?limit=50&network_id=...
 *   GET  /api/contributors?network_id=...&limit=100
 *
 * Phase 2:
 *   GET  /api/voting/rounds
 *   GET  /api/voting/rounds/:id
 *   POST /api/voting/rounds              (admin)
 *   POST /api/voting/rounds/:id/vote
 *   POST /api/voting/rounds/:id/close    (admin)
 *   POST /api/voting/rounds/:id/allocate (admin)
 *   POST /api/allocate                   (admin, direct FIFO without round)
 *
 * Phase 3:
 *   POST /api/link/request
 *   POST /api/link/verify
 *   GET  /api/link/status?telegram_user_id=...
 *   POST /api/link/unlink                (admin)
 *   GET  /api/community/status?telegram_user_id=... | donor=&network_id=
 *   GET  /api/community/members?type=contributor|project&project_id=
 *
 * Phase 4:
 *   GET  /api/disburse/pending
 *   GET  /api/disburse/:id
 *   POST /api/disburse/:id/approve
 *   POST /api/disburse/:id/executed      (admin)
 *   POST /api/disburse/prepare           (admin)
 *
 * Phase 5:
 *   POST /telegram/webhook
 *   POST /api/telegram/sync-general      (admin)
 *   POST /api/telegram/groups            (admin)
 *   GET  /api/telegram/groups
 *
 * Sync filter:
 *   POST /sync?projectId=GENERAL_POOL
 *
 * Reliability (fix/nile-indexer-reliability):
 *   POST /api/sync/rewind   (admin) — body: { projectId, networkId?, toBlock }
 *   POST /sync then re-indexes from rewound cursor
 */

import { ProjectRegistry } from './core/discovery/ProjectRegistry.js';
import { NetworkResolver } from './core/discovery/NetworkResolver.js';
import { IndexerRunner } from './core/runner/IndexerRunner.js';
import { TreasuryRepository } from './db/TreasuryRepository.js';
import { TransferRepository } from './db/TransferRepository.js';
import { SyncStateRepository } from './db/SyncStateRepository.js';
import { ContributionLedgerService } from './services/ContributionLedgerService.js';
import { VotingService } from './services/VotingService.js';
import { AllocationEngine } from './services/AllocationEngine.js';
import { WalletLinkService } from './services/WalletLinkService.js';
import { CommunityStatusService } from './services/CommunityStatusService.js';
import { DisbursementService } from './services/DisbursementService.js';
import { TelegramSyncService } from './services/TelegramSyncService.js';
import { TelegramBotHandler } from './services/TelegramBotHandler.js';
import { TelegramBotClient } from './services/TelegramBotClient.js';
import { TelegramGroupRepository } from './db/TelegramGroupRepository.js';
import { createAdapter } from './adapters/createAdapter.js';

const DEFAULT_NETWORK_IDS = ['polygon_amoy', 'tron_nile'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Indexer-Secret',
  'Access-Control-Max-Age': '86400',
};

function readNetworkIds(env) {
  if (!env.NETWORK_IDS) return DEFAULT_NETWORK_IDS;
  return env.NETWORK_IDS.split(',').map(s => s.trim()).filter(Boolean);
}

function readNumber(env, key, fallback) {
  const n = Number(env[key]);
  return Number.isFinite(n) ? n : fallback;
}

function requireAdmin(request, env) {
  const secret = env.INDEXER_SYNC_SECRET;
  if (!secret) return true;
  return request.headers.get('X-Indexer-Secret') === secret;
}

async function loadProjectsRegistry(env) {
  const url = env.PROJECTS_JSON_URL ||
    'https://raw.githubusercontent.com/classchain/ClassChain/admin/frontend/data/Projects.json';
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load Projects.json: ${res.status}`);
  return await res.json();
}

async function runIndexer(env, options = {}) {
  if (!env.DB) throw new Error('D1 binding DB is missing');

  const ledger = new ContributionLedgerService(env.DB);

  const registryJson = await loadProjectsRegistry(env);
  const runner = new IndexerRunner({
    projectRegistry: new ProjectRegistry(registryJson),
    networkResolver: new NetworkResolver(),
    treasuryRepository: new TreasuryRepository(env.DB),
    transferRepository: new TransferRepository(env.DB, ledger),
    syncStateRepository: new SyncStateRepository(env.DB),
    adapterFactory: createAdapter,
    networkIds: readNetworkIds(env),
  });

  return await runner.runOnce({
    scanFromBlock: readNumber(env, 'SCAN_FROM_BLOCK', 0),
    safeConfirmations: readNumber(env, 'SAFE_CONFIRMATIONS', 20),
    overlap: readNumber(env, 'OVERLAP', 10),
    maxRunMs: readNumber(env, 'INDEXER_MAX_RUN_MS', 45_000),
    maxTransactionInfoPerRun: Math.max(
      1,
      Math.floor(readNumber(env, 'INDEXER_MAX_TRON_TXINFO_PER_RUN', 25))
    ),
    ...options,
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
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

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (method === 'GET' && path === '/health') {
      return jsonResponse({
        ok: true,
        service: 'classchain-indexer',
        phase: 5,
        networks: readNetworkIds(env),
      });
    }

    if (method === 'POST' && path === '/sync') {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      try {
        const projectId = url.searchParams.get('projectId') || undefined;
        const summary = await runIndexer(env, projectId ? { projectId } : {});
        return jsonResponse({ ok: true, summary });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    if (method === 'POST' && path === '/api/sync/rewind') {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);

      const projectId = body.projectId || body.project_id;
      if (!projectId) {
        return jsonResponse({ ok: false, error: 'projectId is required' }, 400);
      }

      const networkId = body.networkId || body.network_id || null;
      const toBlockRaw = body.toBlock ?? body.to_block;
      const toBlock = toBlockRaw === undefined || toBlockRaw === null
        ? 0
        : Number(toBlockRaw);

      if (!Number.isInteger(toBlock) || toBlock < 0) {
        return jsonResponse({ ok: false, error: 'toBlock must be a non-negative integer' }, 400);
      }

      try {
        let query = `
          SELECT t.id, t.project_id, t.network_id, t.address,
                 s.last_scanned_block AS previous_scanned
          FROM treasuries t
          LEFT JOIN sync_state s ON s.treasury_id = t.id
          WHERE t.project_id = ?
        `;
        const binds = [String(projectId)];
        if (networkId) {
          query += ` AND t.network_id = ?`;
          binds.push(String(networkId));
        }

        const found = await env.DB.prepare(query).bind(...binds).all();
        const rows = found?.results || [];
        if (!rows.length) {
          return jsonResponse({
            ok: false,
            error: 'no_treasuries',
            projectId,
            networkId,
          }, 404);
        }

        const syncState = new SyncStateRepository(env.DB);
        const rewound = [];

        for (const row of rows) {
          if (!row.id) continue;
          let state = await syncState.get(row.id);
          if (!state) {
            state = await syncState.initialize(row.id, toBlock);
          }
          const updated = await syncState.rewind(row.id, toBlock);
          rewound.push({
            treasuryId: row.id,
            projectId: row.project_id,
            networkId: row.network_id,
            address: row.address,
            previousScanned: row.previous_scanned ?? null,
            last_scanned_block: updated?.last_scanned_block ?? toBlock,
            status: updated?.status ?? 'PENDING',
          });
        }

        return jsonResponse({
          ok: true,
          projectId: String(projectId),
          networkId,
          toBlock,
          rewound,
          next: 'POST /sync?projectId=' + encodeURIComponent(String(projectId)),
        });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    if (method === 'GET' && path === '/api/donors') {
      const projectId = url.searchParams.get('projectId');
      if (!projectId) return jsonResponse({ ok: false, error: 'projectId is required' }, 400);

      const rows = await env.DB.prepare(`
        SELECT donor, amount, amount_raw, tx_hash, timestamp, network_id, block_number
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

    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  },
};
