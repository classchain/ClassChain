/**
 * ClassChain Indexer — Cloudflare Worker + HTTP API
 * Phase 0 / 1 / 2 / 3 / 4 / 5
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
import { TelegramBotHandler } from './services/TelegramBotHandler.js';
import { TelegramSyncService } from './services/TelegramSyncService.js';
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
    'https://raw.githubusercontent.com/classchain/ClassChain/Mobile/frontend/data/Projects.json';
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
    ...options,
  });
}

async function syncTelegramAfterAllocation(env, result) {
  if (!env.TELEGRAM_BOT_TOKEN || !result?.slices?.length) return null;
  try {
    const sync = new TelegramSyncService(env.DB, env);
    return await sync.onAllocated({
      projectId: result.project_id,
      donors: result.slices,
    });
  } catch (e) {
    console.error(JSON.stringify({ type: 'telegram.allocation_sync.error', error: e.message }));
    return { ok: false, error: e.message };
  }
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
  try { return await request.json(); } catch { return null; }
}

function validTelegramWebhook(request, env) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true;
  return request.headers.get('X-Telegram-Bot-Api-Secret-Token') === secret;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const summary = await runIndexer(env);
        console.log(JSON.stringify({ type: 'indexer.scheduled', summary }));
      } catch (e) {
        console.error(JSON.stringify({ type: 'indexer.scheduled.error', error: e.message }));
      }

      // Reconcile General after the indexer has refreshed contribution balances.
      // Errors here must not break the financial indexer cron.
      if (env.TELEGRAM_BOT_TOKEN) {
        try {
          const sync = new TelegramSyncService(env.DB, env);
          const summary = await sync.syncGeneral();
          console.log(JSON.stringify({ type: 'telegram.general.sync', summary }));
        } catch (e) {
          console.error(JSON.stringify({ type: 'telegram.general.sync.error', error: e.message }));
        }
      }
    })());
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    if (method === 'GET' && path === '/health') {
      return jsonResponse({ ok: true, service: 'classchain-indexer', phase: 5, networks: readNetworkIds(env) });
    }

    if (method === 'POST' && path === '/telegram/webhook') {
      if (!validTelegramWebhook(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      try {
        const update = await readJsonBody(request);
        if (!update) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
        const handler = new TelegramBotHandler(env.DB, env);
        return jsonResponse(await handler.handleUpdate(update));
      } catch (e) {
        console.error(JSON.stringify({ type: 'telegram.webhook.error', error: e.message }));
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    if (method === 'GET' && path === '/api/telegram/groups') {
      try {
        const repo = new TelegramGroupRepository(env.DB);
        return jsonResponse({ ok: true, groups: await repo.listActive() });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    if (method === 'POST' && path === '/api/telegram/groups') {
      if (!requireAdmin(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      const body = await readJsonBody(request);
      if (!body?.kind || !body?.chat_id) return jsonResponse({ ok: false, error: 'kind and chat_id are required' }, 400);
      if (!['GENERAL', 'PROJECT'].includes(String(body.kind).toUpperCase())) {
        return jsonResponse({ ok: false, error: 'kind must be GENERAL or PROJECT' }, 400);
      }
      if (String(body.kind).toUpperCase() === 'PROJECT' && !body.project_id) {
        return jsonResponse({ ok: false, error: 'project_id is required for PROJECT group' }, 400);
      }
      try {
        const repo = new TelegramGroupRepository(env.DB);
        const group = await repo.upsertGroup({
          kind: String(body.kind).toUpperCase(),
          projectId: body.project_id || null,
          chatId: String(body.chat_id),
          title: body.title || null,
          inviteLink: body.invite_link || null,
        });
        return jsonResponse({ ok: true, group });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/api/telegram/sync-general') {
      if (!requireAdmin(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      try {
        const sync = new TelegramSyncService(env.DB, env);
        return jsonResponse({ ok: true, summary: await sync.syncGeneral() });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    if (method === 'POST' && path === '/sync') {
      if (!requireAdmin(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      try {
        const projectId = url.searchParams.get('projectId') || undefined;
        return jsonResponse({ ok: true, summary: await runIndexer(env, projectId ? { projectId } : {}) });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    if (method === 'GET' && path === '/api/donors') {
      const projectId = url.searchParams.get('projectId');
      if (!projectId) return jsonResponse({ ok: false, error: 'projectId is required' }, 400);
      const rows = await env.DB.prepare(`SELECT donor, amount, amount_raw, tx_hash, timestamp FROM transfers WHERE project_id = ? ORDER BY block_number DESC, event_index DESC`).bind(projectId).all();
      return jsonResponse({ projectId, donors: rows.results });
    }

    if (method === 'GET' && path === '/api/transfers') {
      const projectId = url.searchParams.get('projectId');
      if (!projectId) return jsonResponse({ ok: false, error: 'projectId is required' }, 400);
      const rows = await env.DB.prepare(`SELECT donor, amount, amount_raw, tx_hash, block_number, event_index, timestamp FROM transfers WHERE project_id = ? ORDER BY block_number DESC, event_index DESC`).bind(projectId).all();
      return jsonResponse({ projectId, transfers: rows.results });
    }

    if (method === 'GET' && path === '/api/sync-status') {
      const rows = await env.DB.prepare(`SELECT t.project_id, t.network_id, t.address, s.last_scanned_block, s.last_finalized_block, s.status, s.error, (SELECT COUNT(*) FROM transfers tr WHERE tr.treasury_id = t.id) AS tx_count FROM treasuries t LEFT JOIN sync_state s ON s.treasury_id = t.id ORDER BY t.project_id, t.network_id`).all();
      return jsonResponse({ status: 'ok', treasuries: rows.results });
    }

    if (method === 'GET' && path === '/api/contributor') {
      const donor = url.searchParams.get('donor');
      const networkId = url.searchParams.get('network_id');
      if (!donor || !networkId) return jsonResponse({ ok: false, error: 'donor and network_id are required' }, 400);
      return jsonResponse({ ok: true, contributor: await new ContributionLedgerService(env.DB).getContributor(donor, networkId) });
    }

    if (method === 'GET' && path === '/api/queue') {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
      const networkId = url.searchParams.get('network_id') || null;
      return jsonResponse({ ok: true, queue: await new ContributionLedgerService(env.DB).getQueue(limit, networkId) });
    }

    if (method === 'GET' && path === '/api/contributors') {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
      const networkId = url.searchParams.get('network_id') || null;
      return jsonResponse({ ok: true, contributors: await new ContributionLedgerService(env.DB).listContributors(networkId, limit) });
    }

    if (method === 'GET' && path === '/api/voting/rounds') {
      return jsonResponse({ ok: true, rounds: await new VotingService(env.DB).listRounds(50) });
    }

    const roundMatch = path.match(/^\/api\/voting\/rounds\/(\d+)$/);
    if (method === 'GET' && roundMatch) {
      const round = await new VotingService(env.DB).getRound(Number(roundMatch[1]));
      return round ? jsonResponse({ ok: true, round }) : jsonResponse({ ok: false, error: 'not_found' }, 404);
    }

    if (method === 'POST' && path === '/api/voting/rounds') {
      if (!requireAdmin(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const round = await new VotingService(env.DB, { loadProjects: () => loadProjectsRegistry(env) }).openRound({ title: body.title, candidateProjects: body.candidate_projects || body.candidateProjects });
        return jsonResponse({ ok: true, round });
      } catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    const voteMatch = path.match(/^\/api\/voting\/rounds\/(\d+)\/vote$/);
    if (method === 'POST' && voteMatch) {
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const result = await new VotingService(env.DB).castVote({ roundId: Number(voteMatch[1]), donor: body.donor, projectId: body.project_id || body.projectId, telegramUserId: body.telegram_user_id || body.telegramUserId || null });
        return jsonResponse({ ok: true, ...result });
      } catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    const closeMatch = path.match(/^\/api\/voting\/rounds\/(\d+)\/close$/);
    if (method === 'POST' && closeMatch) {
      if (!requireAdmin(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const round = await new VotingService(env.DB, { loadProjects: () => loadProjectsRegistry(env) }).closeRound({ roundId: Number(closeMatch[1]), selectedProjectId: body.selected_project_id || body.selectedProjectId, resultTally: body.result_tally || body.resultTally || [] });
        return jsonResponse({ ok: true, round });
      } catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    const allocateMatch = path.match(/^\/api\/voting\/rounds\/(\d+)\/allocate$/);
    if (method === 'POST' && allocateMatch) {
      if (!requireAdmin(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      try {
        const voting = new VotingService(env.DB, { loadProjects: () => loadProjectsRegistry(env) });
        const result = await voting.allocateRound(Number(allocateMatch[1]));
        let disbursement = null;
        try {
          disbursement = await new DisbursementService(env.DB, { loadProjects: () => loadProjectsRegistry(env) }).prepareFromBatch(result.allocation_batch_id, result.project_id);
        } catch (de) { disbursement = { ok: false, error: de.message }; }
        const telegram = await syncTelegramAfterAllocation(env, result);
        return jsonResponse({ ok: true, ...result, disbursement, telegram });
      } catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    if (method === 'POST' && path === '/api/allocate') {
      if (!requireAdmin(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const projectId = body.project_id || body.projectId;
        const result = await new AllocationEngine(env.DB).allocate({ projectId, requiredAmountRaw: body.required_amount_raw || body.requiredAmountRaw, networkId: body.network_id || body.networkId || null });
        let disbursement = null;
        try { disbursement = await new DisbursementService(env.DB, { loadProjects: () => loadProjectsRegistry(env) }).prepareFromBatch(result.allocation_batch_id, projectId); }
        catch (de) { disbursement = { ok: false, error: de.message }; }
        const telegram = await syncTelegramAfterAllocation(env, result);
        return jsonResponse({ ...result, disbursement, telegram });
      } catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    if (method === 'POST' && path === '/api/link/request') {
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try { return jsonResponse({ ok: true, ...(await new WalletLinkService(env.DB).requestLink({ telegramUserId: body.telegram_user_id || body.telegramUserId, networkId: body.network_id || body.networkId })) }); }
      catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    if (method === 'POST' && path === '/api/link/verify') {
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try { return jsonResponse(await new WalletLinkService(env.DB).verifyLink({ telegramUserId: body.telegram_user_id || body.telegramUserId, networkId: body.network_id || body.networkId, donor: body.donor, signature: body.signature, message: body.message, nonce: body.nonce })); }
      catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    if (method === 'GET' && path === '/api/link/status') {
      const telegramUserId = url.searchParams.get('telegram_user_id');
      if (!telegramUserId) return jsonResponse({ ok: false, error: 'telegram_user_id is required' }, 400);
      try { return jsonResponse({ ok: true, ...(await new WalletLinkService(env.DB).getStatus(telegramUserId)) }); }
      catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    if (method === 'POST' && path === '/api/link/unlink') {
      if (!requireAdmin(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try { await new WalletLinkService(env.DB).unlink({ telegramUserId: body.telegram_user_id || body.telegramUserId, networkId: body.network_id || body.networkId, donor: body.donor || null }); return jsonResponse({ ok: true }); }
      catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    if (method === 'GET' && path === '/api/community/status') {
      const telegramUserId = url.searchParams.get('telegram_user_id');
      const donor = url.searchParams.get('donor');
      const networkId = url.searchParams.get('network_id') || null;
      if (!telegramUserId && !donor) return jsonResponse({ ok: false, error: 'telegram_user_id or donor is required' }, 400);
      try {
        const svc = new CommunityStatusService(env.DB);
        const data = telegramUserId ? await svc.statusByTelegram(telegramUserId) : await svc.statusByDonor(donor, networkId);
        return jsonResponse({ ok: true, ...data });
      } catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    if (method === 'GET' && path === '/api/community/members') {
      const type = url.searchParams.get('type');
      const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 1000);
      try {
        const svc = new CommunityStatusService(env.DB);
        if (type === 'contributor') return jsonResponse({ ok: true, type, members: await svc.listContributorMembers(limit) });
        if (type === 'project') {
          const projectId = url.searchParams.get('project_id');
          if (!projectId) return jsonResponse({ ok: false, error: 'project_id is required' }, 400);
          return jsonResponse({ ok: true, type, project_id: projectId, members: await svc.listProjectMembers(projectId, limit) });
        }
        return jsonResponse({ ok: false, error: 'type must be contributor or project' }, 400);
      } catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    if (method === 'GET' && path === '/api/disburse/pending') {
      const networkId = url.searchParams.get('network_id') || null;
      const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
      const rows = await new DisbursementService(env.DB, { loadProjects: () => loadProjectsRegistry(env) }).listPending(networkId, limit);
      return jsonResponse({ ok: true, pending: rows });
    }

    const disburseGet = path.match(/^\/api\/disburse\/(\d+)$/);
    if (method === 'GET' && disburseGet) {
      const row = await new DisbursementService(env.DB).get(Number(disburseGet[1]));
      return row ? jsonResponse({ ok: true, disbursement: row }) : jsonResponse({ ok: false, error: 'not_found' }, 404);
    }

    const disburseApprove = path.match(/^\/api\/disburse\/(\d+)\/approve$/);
    if (method === 'POST' && disburseApprove) {
      const body = await readJsonBody(request);
      if (!body?.approver) return jsonResponse({ ok: false, error: 'approver is required' }, 400);
      try { return jsonResponse({ ok: true, disbursement: await new DisbursementService(env.DB).approve(Number(disburseApprove[1]), body.approver) }); }
      catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    const disburseExecuted = path.match(/^\/api\/disburse\/(\d+)\/executed$/);
    if (method === 'POST' && disburseExecuted) {
      if (!requireAdmin(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      const body = await readJsonBody(request);
      const txHash = body?.execute_tx_hash || body?.executeTxHash;
      if (!txHash) return jsonResponse({ ok: false, error: 'execute_tx_hash is required' }, 400);
      try { return jsonResponse({ ok: true, disbursement: await new DisbursementService(env.DB).markExecuted(Number(disburseExecuted[1]), txHash, body.onchain_tx_index ?? body.onchainTxIndex ?? null) }); }
      catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    if (method === 'POST' && path === '/api/disburse/prepare') {
      if (!requireAdmin(request, env)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try { return jsonResponse(await new DisbursementService(env.DB, { loadProjects: () => loadProjectsRegistry(env) }).prepareFromBatch(body.allocation_batch_id || body.allocationBatchId, body.project_id || body.projectId)); }
      catch (e) { return jsonResponse({ ok: false, error: e.message }, 400); }
    }

    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  },
};
