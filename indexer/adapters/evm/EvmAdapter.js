/**
 * EVM adapter — Polygon Amoy (and other EVM later).
 *
 * Contract with SyncEngine:
 *   getLatestBlock()
 *   getTransfers(treasury, fromBlock, toBlock) -> normalized transfers[]
 */

import {
  getTokenAddress,
  getTokenDecimals,
} from '../../../shared/network-config.js';
import { EvmClient } from './EvmClient.js';

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** eth_getLogs range chunk — public RPCs often limit window size */
const LOG_CHUNK = 2_000;

function normalizeAddress(addr) {
  if (!addr || typeof addr !== 'string') {
    throw new Error('address is required');
  }
  const a = addr.trim().toLowerCase();
  if (!a.startsWith('0x') || a.length !== 42) {
    throw new Error(`Invalid EVM address: ${addr}`);
  }
  return a;
}

/** topic for indexed address (32-byte padded) */
function addressToTopic(addr) {
  return '0x' + normalizeAddress(addr).slice(2).padStart(64, '0');
}

function topicToAddress(topic) {
  if (!topic || typeof topic !== 'string') return null;
  return '0x' + topic.slice(-40).toLowerCase();
}

function hexToBigInt(hex) {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

export class EvmAdapter {
  constructor(networkId) {
    if (!networkId) {
      throw new Error('EVM networkId is required');
    }

    this.networkId = networkId;
    this.client = new EvmClient(networkId);

    this.tokenAddress = getTokenAddress(networkId, 'USDT');
    this.tokenDecimals = getTokenDecimals(networkId, 'USDT');

    if (!this.tokenAddress) {
      throw new Error(`USDT not configured for ${networkId}`);
    }

    this.tokenAddress = normalizeAddress(this.tokenAddress);
  }

  async getLatestBlock() {
    return this.client.getBlockNumber();
  }

  async getTransfers(treasury, fromBlock, toBlock) {
    if (!treasury?.id) throw new Error('Treasury id is required');
    if (!treasury?.projectId) throw new Error('Treasury projectId is required');
    if (!treasury?.address) throw new Error('Treasury address is required');

    if (
      !Number.isInteger(fromBlock) ||
      !Number.isInteger(toBlock) ||
      fromBlock < 0 ||
      toBlock < fromBlock
    ) {
      throw new Error('Invalid EVM block range');
    }

    const treasuryAddress = normalizeAddress(treasury.address);
    const toTopic = addressToTopic(treasuryAddress);

    const transfers = [];

    for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK) {
      const end = Math.min(start + LOG_CHUNK - 1, toBlock);

      const logs = await this.client.getLogs({
        fromBlock: start,
        toBlock: end,
        address: this.tokenAddress,
        topics: [
          TRANSFER_TOPIC,
          null, // any from
          toTopic, // only to treasury
        ],
      });

      for (const log of logs || []) {
        const normalized = this._normalizeLog(log, treasury, treasuryAddress);
        if (normalized) {
          transfers.push(normalized);
        }
      }
    }

    return transfers;
  }

  _normalizeLog(log, treasury, treasuryAddress) {
    const txHash = log.transactionHash;
    const blockNumber = Number.parseInt(log.blockNumber, 16);
    const eventIndex = Number.parseInt(log.logIndex, 16);

    if (!txHash || !Number.isInteger(blockNumber) || !Number.isInteger(eventIndex)) {
      return null;
    }

    const from = topicToAddress(log.topics?.[1]);
    const to = topicToAddress(log.topics?.[2]);

    if (!from || !to || to !== treasuryAddress) {
      return null;
    }

    const raw = hexToBigInt(log.data);
    const amountRaw = raw.toString();
    const divisor = 10n ** BigInt(this.tokenDecimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    const amount =
      frac === 0n
        ? whole.toString()
        : `${whole}.${frac.toString().padStart(this.tokenDecimals, '0').replace(/0+$/, '')}`;

    return {
      token: 'USDT',
      tokenAddress: this.tokenAddress,
      donor: from,
      amountRaw,
      amount,
      txHash: txHash.toLowerCase(),
      blockNumber,
      eventIndex,
      timestamp: 0, // optional later via eth_getBlockByNumber
    };
  }
}
