import assert from 'node:assert/strict';

import { SyncEngine } from './SyncEngine.js';


const calls = [];


const treasuryRepository = {};

const transferRepository = {};

const syncStateRepository = {

    async get() {
        return {
            treasury_id: 'TREASURY_1004',
            scan_from_block: 69800000,
            last_scanned_block: 69805980,
            last_finalized_block: 69805960,
            status: 'SUCCESS'
        };
    },

    async initialize() {
        throw new Error(
            'initialize() should not be called'
        );
    },

    async markSuccess(
        treasuryId,
        lastScannedBlock,
        lastFinalizedBlock
    ) {

        calls.push({
            treasuryId,
            lastScannedBlock,
            lastFinalizedBlock
        });
    }
};


const adapter = {

    async getLatestBlock() {

        return 69805989;
    }
};


const engine =
    new SyncEngine({

        treasuryRepository,

        transferRepository,

        syncStateRepository,

        adapters: {
            tron_nile:
                adapter
        }
    });


const result =
    await engine.syncTreasury({

        id:
            'TREASURY_1004',

        projectId:
            '1004',

        networkId:
            'tron_nile',

        address:
            'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp'
    });


assert.equal(
    result.treasuryId,
    'TREASURY_1004'
);

assert.equal(
    result.fromBlock,
    69805971
);

assert.equal(
    result.toBlock,
    69805969
);

assert.equal(
    result.status,
    'UP_TO_DATE'
);

console.log(
    'SyncEngine block-range test: PASS'
);