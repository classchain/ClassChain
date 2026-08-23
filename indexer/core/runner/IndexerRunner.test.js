import assert from 'node:assert/strict';

import { ProjectRegistry } from '../discovery/ProjectRegistry.js';
import { IndexerRunner } from './IndexerRunner.js';


const projects = {
    features: [
        {
            attributes: {
                ProjectID: '1004',
                funds: {
                    tron_nile: {
                        address:
                            'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp'
                    },
                    polygon_amoy: {
                        address:
                            '0xe8d63212326a7a57A87AE1B032b4b4a4313137d5'
                    }
                }
            }
        },
        {
            attributes: {
                ProjectID: '9999',
                funds: {
                    broken_network: {
                        address:
                            'BROKEN_TREASURY'
                    }
                }
            }
        }
    ]
};


const calls = {
    upserted: [],
    synced: []
};


const networkResolver = {
    resolveTreasury(networkId) {

        if (networkId === 'broken_network') {
            throw new Error(
                'Unknown network: broken_network'
            );
        }

        return {
            network: {
                id: networkId,
                status: 'active'
            },
            token: {
                symbol: 'USDT',
                address: `TOKEN_${networkId}`,
                decimals: 6
            }
        };
    }
};


const treasuryRepository = {
    async upsert(treasury) {
        calls.upserted.push(
            treasury
        );

        return {
            id:
                `db_${treasury.projectId}_${treasury.networkId}`,
            project_id:
                treasury.projectId,
            network_id:
                treasury.networkId,
            address:
                treasury.address,
            active:
                treasury.active ? 1 : 0
        };
    }
};


const transferRepository = {
    async insert() {
        return {
            inserted: true
        };
    }
};


const syncStateRepository = {
    async get() {
        return {
            scan_from_block: 100,
            last_scanned_block: 100
        };
    },

    async initialize() {
        throw new Error(
            'initialize() should not be called'
        );
    },

    async markSuccess() {},

    async markFailed() {}
};


const adapters = {
    tron_nile: {
        async getLatestBlock() {
            return 140;
        },

        async getTransfers(
            treasury,
            fromBlock,
            toBlock
        ) {
            calls.synced.push({
                treasury,
                fromBlock,
                toBlock
            });

            return [
                {
                    token: 'USDT',
                    tokenAddress: 'TOKEN_tron_nile',
                    donor: 'TDONOR',
                    amountRaw: '1000000',
                    amount: 1,
                    txHash: 'ABC',
                    blockNumber: 120,
                    eventIndex: 0,
                    timestamp: 1700000000
                }
            ];
        }
    }
};


const runner =
    new IndexerRunner({
        projectRegistry:
            new ProjectRegistry(projects),
        networkResolver,
        treasuryRepository,
        transferRepository,
        syncStateRepository,
        adapters,
        networkIds: [
            'tron_nile'
        ]
    });


const summary =
    await runner.runOnce({
        safeConfirmations: 20,
        overlap: 10
    });


assert.equal(
    summary.discovered,
    3
);

assert.equal(
    summary.valid,
    2
);

assert.equal(
    summary.invalid,
    1
);

assert.equal(
    summary.synced,
    1
);

assert.equal(
    summary.skipped,
    1
);

assert.equal(
    summary.failed,
    0
);

assert.equal(
    summary.transfers,
    1
);

assert.equal(
    summary.inserted,
    1
);

assert.equal(
    calls.upserted.length,
    1
);

assert.equal(
    calls.upserted[0].networkId,
    'tron_nile'
);

assert.equal(
    calls.synced.length,
    1
);

assert.equal(
    calls.synced[0].treasury.id,
    'db_1004_tron_nile'
);

assert.equal(
    calls.synced[0].fromBlock,
    91
);

assert.equal(
    calls.synced[0].toBlock,
    120
);

assert.equal(
    summary.results[1].status,
    'SKIPPED_NETWORK'
);

assert.equal(
    summary.invalidTreasuries[0].status,
    'INVALID_CONFIGURATION'
);

console.log(
    'IndexerRunner test: PASS'
);
