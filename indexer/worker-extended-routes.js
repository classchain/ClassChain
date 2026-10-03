/**
 * Extended HTTP routes for ClassChain Indexer Worker
 * Extracted from worker.js — voting, wallet link, community, disburse, telegram
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

