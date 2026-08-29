/**
 * Minimal JSON-RPC client for EVM networks.
 * Uses shared/network-config.js for RPC URLs.
 */

import {
  getNetworkById,
  getRpcUrls,
} from '../../../shared/network-config.js';

export class EvmClient {
  constructor(networkId) {
    if (!networkId) {
      throw new Error('EVM networkId is required');
    }

    const network = getNetworkById(networkId);
    if (!network) {
      throw new Error(`Unknown network: ${networkId}`);
    }
    if (network.type !== 'EVM') {
      throw new Error(`Network is not EVM: ${networkId}`);
    }

    this.networkId = networkId;
    this.network = network;
    this.rpcUrls = getRpcUrls(networkId);

    if (!this.rpcUrls.length) {
      throw new Error(`No RPC endpoint for ${networkId}`);
    }
  }

  async request(method, params = []) {
    let lastError = null;

    for (const rpc of this.rpcUrls) {
      try {
        const response = await fetch(rpc, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method,
            params,
          }),
        });

        if (!response.ok) {
          throw new Error(`RPC HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (payload.error) {
          throw new Error(
            payload.error.message || JSON.stringify(payload.error)
          );
        }

        return payload.result;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `All EVM RPCs failed for ${this.networkId}: ${
        lastError?.message || 'unknown'
      }`
    );
  }

  async getBlockNumber() {
    const hex = await this.request('eth_blockNumber');
    const n = Number.parseInt(hex, 16);
    if (!Number.isInteger(n)) {
      throw new Error('Invalid eth_blockNumber');
    }
    return n;
  }

  async getLogs({ fromBlock, toBlock, address, topics }) {
    return this.request('eth_getLogs', [
      {
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock: '0x' + toBlock.toString(16),
        address,
        topics,
      },
    ]);
  }
}
