/**
 * ClassChain Indexer
 *
 * Adapter factory
 *
 * Core must not import chain-specific adapters directly.
 * Adding a family = extend this factory only.
 */

import { getFullNetwork } from '../../shared/network-config.js';
import { TronAdapter } from './tron/TronAdapter.js';


/**
 * @param {string} networkId
 * @returns {Promise<object|null>}
 */
export async function createAdapter(networkId) {

    if (!networkId || typeof networkId !== 'string') {
        throw new Error('networkId is required');
    }

    const network = getFullNetwork(networkId);

    if (!network) {
        return null;
    }

    /*
     * TRON / TVM
     */
    if (
        network.type === 'TVM' ||
        networkId.startsWith('tron_')
    ) {
        return new TronAdapter(networkId);
    }

    /*
     * EVM (Polygon Amoy, …) — intentionally not wired yet
     */
    if (network.type === 'EVM') {
        return null;
    }

    return null;
}
