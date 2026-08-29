import { getFullNetwork } from '../../shared/network-config.js';
import { TronAdapter } from './tron/TronAdapter.js';
import { EvmAdapter } from './evm/EvmAdapter.js';

export async function createAdapter(networkId) {
  if (!networkId || typeof networkId !== 'string') {
    throw new Error('networkId is required');
  }

  const network = getFullNetwork(networkId);
  if (!network) {
    return null;
  }

  if (network.type === 'TVM' || networkId.startsWith('tron_')) {
    return new TronAdapter(networkId);
  }

  if (network.type === 'EVM') {
    return new EvmAdapter(networkId);
  }

  return null;
}
