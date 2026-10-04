/**
 * Extended HTTP routes for ClassChain Indexer Worker
 * voting, wallet link, community, disburse, telegram
 *
 * Allocation lifecycle:
 *   allocate = plan FIFO + pending disburse (round stays CLOSED)
 *   executed = on-chain done → maybe finalize round to ALLOCATED + telegram
 */
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

/**
 * @returns {Promise<Response|null>} Response if handled, null to fall through
 */
export async function handleExtendedRoutes(ctx) {
  const {
    request,
    env,
    path,
    method,
    url,
    jsonResponse,
    requireAdmin,
    readJsonBody,
    loadProjectsRegistry,
  } = ctx;

    if (method === 'GET' && path === '/api/contributor') {
      const donor = url.searchParams.get('donor');
      const networkId = url.searchParams.get('network_id');
      if (!donor || !networkId) {
        return jsonResponse({ ok: false, error: 'donor and network_id are required' }, 400);
      }

      const ledger = new ContributionLedgerService(env.DB);
      const data = await ledger.getContributor(donor, networkId);
      return jsonResponse({ ok: true, contributor: data });
    }

    if (method === 'GET' && path === '/api/queue') {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
      const networkId = url.searchParams.get('network_id') || null;

      const ledger = new ContributionLedgerService(env.DB);
      const queue = await ledger.getQueue(limit, networkId);
      return jsonResponse({ ok: true, queue });
    }

    if (method === 'GET' && path === '/api/contributors') {
      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
      const networkId = url.searchParams.get('network_id') || null;

      const ledger = new ContributionLedgerService(env.DB);
      const contributors = await ledger.listContributors(networkId, limit);
      return jsonResponse({ ok: true, contributors });
    }

    if (method === 'GET' && path === '/api/voting/rounds') {
      const voting = new VotingService(env.DB);
      const rounds = await voting.listRounds(50);
      return jsonResponse({ ok: true, rounds });
    }

    const roundMatch = path.match(/^\/api\/voting\/rounds\/(\d+)$/);
    if (method === 'GET' && roundMatch) {
      const voting = new VotingService(env.DB);
      const round = await voting.getRound(Number(roundMatch[1]));
      if (!round) return jsonResponse({ ok: false, error: 'not_found' }, 404);
      return jsonResponse({ ok: true, round });
    }

    if (method === 'POST' && path === '/api/voting/rounds') {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const voting = new VotingService(env.DB, {
          loadProjects: () => loadProjectsRegistry(env),
        });
        const round = await voting.openRound({
          title: body.title,
          candidateProjects: body.candidate_projects || body.candidateProjects,
        });
        return jsonResponse({ ok: true, round });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    const voteMatch = path.match(/^\/api\/voting\/rounds\/(\d+)\/vote$/);
    if (method === 'POST' && voteMatch) {
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const voting = new VotingService(env.DB);
        const result = await voting.castVote({
          roundId: Number(voteMatch[1]),
          donor: body.donor,
          projectId: body.project_id || body.projectId,
          telegramUserId: body.telegram_user_id || body.telegramUserId || null,
        });
        return jsonResponse({ ok: true, ...result });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    const closeMatch = path.match(/^\/api\/voting\/rounds\/(\d+)\/close$/);
    if (method === 'POST' && closeMatch) {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const voting = new VotingService(env.DB, {
          loadProjects: () => loadProjectsRegistry(env),
        });
        const round = await voting.closeRound({
          roundId: Number(closeMatch[1]),
          selectedProjectId: body.selected_project_id || body.selectedProjectId,
          resultTally: body.result_tally || body.resultTally || [],
        });
        return jsonResponse({ ok: true, round });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    const allocateMatch = path.match(/^\/api\/voting\/rounds\/(\d+)\/allocate$/);
    if (method === 'POST' && allocateMatch) {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      try {
        const voting = new VotingService(env.DB, {
          loadProjects: () => loadProjectsRegistry(env),
        });
        const amountOverride = body?.required_amount_raw || body?.requiredAmountRaw || null;
        const result = await voting.allocateRound(Number(allocateMatch[1]), {
          requiredAmountRaw: amountOverride,
        });
        let disbursement = null;
        try {
          const disb = new DisbursementService(env.DB, {
            loadProjects: () => loadProjectsRegistry(env),
          });
          disbursement = await disb.prepareFromBatch(
            result.allocation_batch_id,
            result.project_id
          );
        } catch (de) {
          disbursement = { ok: false, error: de.message };
        }
        return jsonResponse({
          ok: true,
          ...result,
          disbursement,
          telegram: null,
          message: 'Allocation planned. Round remains CLOSED until on-chain disburse is EXECUTED.',
        });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/api/allocate') {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const engine = new AllocationEngine(env.DB);
        const projectId = body.project_id || body.projectId;
        const result = await engine.allocate({
          projectId,
          requiredAmountRaw: body.required_amount_raw || body.requiredAmountRaw,
          networkId: body.network_id || body.networkId || null,
        });
        let disbursement = null;
        try {
          const disb = new DisbursementService(env.DB, {
            loadProjects: () => loadProjectsRegistry(env),
          });
          disbursement = await disb.prepareFromBatch(
            result.allocation_batch_id,
            projectId
          );
        } catch (de) {
          disbursement = { ok: false, error: de.message };
        }
        return jsonResponse({ ...result, disbursement, telegram: null });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/api/link/request') {
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const svc = new WalletLinkService(env.DB);
        const data = await svc.requestLink({
          telegramUserId: body.telegram_user_id || body.telegramUserId,
          networkId: body.network_id || body.networkId,
        });
        return jsonResponse({ ok: true, ...data });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/api/link/verify') {
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const svc = new WalletLinkService(env.DB);
        const data = await svc.verifyLink({
          telegramUserId: body.telegram_user_id || body.telegramUserId,
          networkId: body.network_id || body.networkId,
          donor: body.donor,
          signature: body.signature,
          message: body.message,
          nonce: body.nonce,
        });
        return jsonResponse(data);
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'GET' && path === '/api/link/status') {
      const telegramUserId = url.searchParams.get('telegram_user_id');
      if (!telegramUserId) {
        return jsonResponse({ ok: false, error: 'telegram_user_id is required' }, 400);
      }
      try {
        const svc = new WalletLinkService(env.DB);
        const data = await svc.getStatus(telegramUserId);
        return jsonResponse({ ok: true, ...data });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/api/link/unlink') {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const svc = new WalletLinkService(env.DB);
        await svc.unlink({
          telegramUserId: body.telegram_user_id || body.telegramUserId,
          networkId: body.network_id || body.networkId,
          donor: body.donor || null,
        });
        return jsonResponse({ ok: true });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'GET' && path === '/api/community/status') {
      const telegramUserId = url.searchParams.get('telegram_user_id');
      const donor = url.searchParams.get('donor');
      const networkId = url.searchParams.get('network_id') || null;

      if (!telegramUserId && !donor) {
        return jsonResponse({
          ok: false,
          error: 'telegram_user_id or donor is required',
        }, 400);
      }

      try {
        const svc = new CommunityStatusService(env.DB);
        const data = telegramUserId
          ? await svc.statusByTelegram(telegramUserId)
          : await svc.statusByDonor(donor, networkId);
        return jsonResponse({ ok: true, ...data });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'GET' && path === '/api/community/members') {
      const type = url.searchParams.get('type') || 'contributor';
      const projectId = url.searchParams.get('project_id') || null;
      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);

      try {
        const svc = new CommunityStatusService(env.DB);
        if (type === 'project' && projectId) {
          const members = await svc.listProjectMembers(projectId, limit);
          return jsonResponse({ ok: true, type, project_id: projectId, members });
        }
        const members = await svc.listContributorMembers(limit);
        return jsonResponse({ ok: true, type: 'contributor', members });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'GET' && path === '/api/disburse/pending') {
      try {
        const svc = new DisbursementService(env.DB, {
          loadProjects: () => loadProjectsRegistry(env),
        });
        const rows = await svc.listPending();
        return jsonResponse({ ok: true, pending: rows });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    const disburseIdMatch = path.match(/^\/api\/disburse\/(\d+)$/);
    if (method === 'GET' && disburseIdMatch) {
      try {
        const svc = new DisbursementService(env.DB, {
          loadProjects: () => loadProjectsRegistry(env),
        });
        const row = await svc.get(Number(disburseIdMatch[1]));
        if (!row) return jsonResponse({ ok: false, error: 'not_found' }, 404);
        return jsonResponse({ ok: true, disbursement: row });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    const approveMatch = path.match(/^\/api\/disburse\/(\d+)\/approve$/);
    if (method === 'POST' && approveMatch) {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      const approver = body.approver || body.wallet || body.address;
      if (!approver) {
        return jsonResponse({ ok: false, error: 'approver wallet address is required (from connected wallet)' }, 400);
      }
      try {
        const svc = new DisbursementService(env.DB, {
          loadProjects: () => loadProjectsRegistry(env),
        });
        const current = await svc.get(Number(approveMatch[1]));
        if (!current) return jsonResponse({ ok: false, error: 'not_found' }, 404);
        const registry = await loadProjectsRegistry(env);
        const general = (registry?.features || [])
          .map((f) => f?.attributes)
          .find((a) => a && String(a.ProjectID) === 'GENERAL_POOL');
        const fund = general?.funds?.[current.network_id];
        const owners = (fund?.owners || []).map((o) => String(o).toLowerCase());
        const addr = String(approver).toLowerCase();
        if (owners.length && !owners.includes(addr)) {
          return jsonResponse({
            ok: false,
            error: `wallet ${approver} is not a GENERAL_POOL owner on ${current.network_id}`,
          }, 403);
        }
        const row = await svc.approve(Number(approveMatch[1]), String(approver));
        return jsonResponse({ ok: true, disbursement: row });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    const executedMatch = path.match(/^\/api\/disburse\/(\d+)\/executed$/);
    if (method === 'POST' && executedMatch) {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const svc = new DisbursementService(env.DB, {
          loadProjects: () => loadProjectsRegistry(env),
        });
        const result = await svc.markExecuted(
          Number(executedMatch[1]),
          body.tx_hash || body.txHash || body.execute_tx_hash || null
        );
        const row = result?.disbursement || result;
        const round_finalize = result?.round_finalize || null;

        let telegram = null;
        if (round_finalize?.finalized && round_finalize.round) {
          try {
            const batchId = round_finalize.allocation_batch_id || row.allocation_batch_id;
            const projectId = round_finalize.round.selected_project_id || row.project_id;
            const engine = new AllocationEngine(env.DB);
            const slices = await engine.allocationRepo.listByBatch(batchId);
            const unique = [...new Set((slices || []).map((s) => s.donor).filter(Boolean))];
            if (unique.length) {
              const sync = new TelegramSyncService(env.DB, env);
              telegram = await sync.onAllocated({ projectId, donors: unique });
            }
          } catch (te) {
            telegram = { ok: false, error: te.message };
          }
        }

        return jsonResponse({
          ok: true,
          disbursement: row,
          round_finalize,
          telegram,
        });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/api/disburse/prepare') {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const svc = new DisbursementService(env.DB, {
          loadProjects: () => loadProjectsRegistry(env),
        });
        const row = await svc.prepareFromBatch(
          body.allocation_batch_id || body.allocationBatchId,
          body.project_id || body.projectId
        );
        return jsonResponse({ ok: true, disbursement: row });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/telegram/webhook') {
      try {
        const body = await readJsonBody(request);
        if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
        const handler = new TelegramBotHandler(env.DB, env);
        const result = await handler.handleUpdate(body);
        return jsonResponse({ ok: true, ...result });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    if (method === 'POST' && path === '/api/telegram/sync-general') {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      try {
        const sync = new TelegramSyncService(env.DB, env);
        const result = await sync.syncGeneral();
        return jsonResponse({ ok: true, ...result });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    if (method === 'POST' && path === '/api/telegram/groups') {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const repo = new TelegramGroupRepository(env.DB);
        const row = await repo.upsert({
          kind: body.kind || 'GENERAL',
          projectId: body.project_id || body.projectId || null,
          chatId: body.chat_id || body.chatId,
          title: body.title || null,
          active: body.active !== false,
        });
        return jsonResponse({ ok: true, group: row });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'GET' && path === '/api/telegram/groups') {
      try {
        const repo = new TelegramGroupRepository(env.DB);
        const groups = await repo.listAll();
        return jsonResponse({ ok: true, groups });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

  return null;
}
