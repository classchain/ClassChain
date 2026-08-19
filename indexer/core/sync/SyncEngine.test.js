import assert from 'node:assert/strict';

import { SyncEngine } from './SyncEngine.js';


const calls = {
    inserted: [],
    success: [],
    failed: []
};


const treasury = {
    id: 'TREASURY_1004',
    projectId: '1004',
    networkId: 'tron_nile',
    address:
        'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp'
};


const transfers = [
    {
        network: 'tron_nile',

        projectId: '1004',

        treasury:
            treasury.address,

        donor:
            'TY7XrUK9LbRq4CWcLwCUiLVW9Noju2EiD1',

        token: 'USDT',

        tokenAddress:
            'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',

        amountRaw:
            '5000000',

        amount: 5,

        txHash:
            '1c2ede792050064d4156a8112b286e4daf314280834a47a323b157286b4a8156',

        blockNumber:
            69805989,

        eventIndex:
            0,

        timestamp:
            1785929067
    }
];


function makeSyncStateRepository(state) {

    return {

        async get() {

            return state;
        },


        async initialize() {

            throw new Error(
                'initialize() should not be called in this test'
            );
        },


        async markSuccess(
            treasuryId,
            lastScannedBlock,
            lastFinalizedBlock
        ) {

            calls.success.push({
                treasuryId,
                lastScannedBlock,
                lastFinalizedBlock
            });
        },


        async markFailed(
            treasuryId,
            error
        ) {

            calls.failed.push({
                treasuryId,
                error
            });
        }
    };
}


function makeTransferRepository() {

    return {

        async insert(transfer) {

            calls.inserted.push(
                transfer
            );

            return {
                inserted: true,
                transfer
            };
        }
    };
}


/*
 * ============================================================
 * TEST 1
 * UP_TO_DATE
 *
 * latest block = 69805989
 * confirmations = 20
 *
 * finalized = 69805969
 *
 * last scanned = 69805980
 *
 * Therefore:
 *
 * fromBlock = 69805971
 * toBlock   = 69805969
 *
 * There is nothing new to scan.
 * ============================================================
 */

{

    calls.inserted.length = 0;
    calls.success.length = 0;
    calls.failed.length = 0;


    let adapterCalled = false;


    const syncStateRepository =
        makeSyncStateRepository({

            treasury_id:
                treasury.id,

            scan_from_block:
                69800000,

            last_scanned_block:
                69805980,

            last_finalized_block:
                69805960,

            status:
                'SUCCESS'
        });


    const adapter = {

        async getLatestBlock() {

            return 69805989;
        },


        async getTransfers() {

            adapterCalled = true;

            throw new Error(
                'getTransfers() must not be called'
            );
        }
    };


    const engine =
        new SyncEngine({

            treasuryRepository: {},

            transferRepository:
                makeTransferRepository(),

            syncStateRepository,

            adapters: {

                tron_nile:
                    adapter
            }
        });


    const result =
        await engine.syncTreasury(

            treasury,

            {
                safeConfirmations: 20,
                overlap: 10
            }
        );


    assert.equal(
        result.treasuryId,
        treasury.id
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


    assert.equal(
        adapterCalled,
        false
    );


    assert.equal(
        calls.inserted.length,
        0
    );


    assert.equal(
        calls.success.length,
        0
    );


    assert.equal(
        calls.failed.length,
        0
    );


    console.log(
        'SyncEngine UP_TO_DATE test: PASS'
    );
}


/*
 * ============================================================
 * TEST 2
 * FULL SUCCESS FLOW
 *
 * Adapter
 *    ↓
 * getTransfers()
 *    ↓
 * TransferRepository.insert()
 *    ↓
 * SyncStateRepository.markSuccess()
 * ============================================================
 */

{

    calls.inserted.length = 0;
    calls.success.length = 0;
    calls.failed.length = 0;


    const syncStateRepository =
        makeSyncStateRepository({

            treasury_id:
                treasury.id,

            scan_from_block:
                69805900,

            last_scanned_block:
                69805950,

            last_finalized_block:
                69805940,

            status:
                'SUCCESS'
        });


    const transferRepository =
        makeTransferRepository();


    let adapterCalled = false;


    const adapter = {

        async getLatestBlock() {

            return 69805989;
        },


        async getTransfers(

            receivedTreasury,

            fromBlock,

            toBlock

        ) {

            adapterCalled = true;


            assert.equal(
                receivedTreasury.id,
                treasury.id
            );


            assert.equal(
                fromBlock,
                69805941
            );


            assert.equal(
                toBlock,
                69805969
            );


            return transfers;
        }
    };


    const engine =
        new SyncEngine({

            treasuryRepository: {},

            transferRepository,

            syncStateRepository,

            adapters: {

                tron_nile:
                    adapter
            }
        });


    const result =
        await engine.syncTreasury(

            treasury,

            {
                safeConfirmations: 20,
                overlap: 10
            }
        );


    assert.equal(
        adapterCalled,
        true
    );


    assert.equal(
        result.status,
        'SUCCESS'
    );


    assert.equal(
        result.fromBlock,
        69805941
    );


    assert.equal(
        result.toBlock,
        69805969
    );


    assert.equal(
        result.transfers,
        1
    );


    assert.equal(
        result.inserted,
        1
    );


    /*
     * TransferRepository
     */

    assert.equal(
        calls.inserted.length,
        1
    );


    const inserted =
        calls.inserted[0];


    assert.equal(
        inserted.treasuryId,
        treasury.id
    );


    assert.equal(
        inserted.projectId,
        treasury.projectId
    );


    assert.equal(
        inserted.networkId,
        treasury.networkId
    );


    assert.equal(
        inserted.txHash,
        transfers[0].txHash
    );


    assert.equal(
        inserted.eventIndex,
        0
    );


    assert.equal(
        inserted.amount,
        5
    );


    /*
     * SyncStateRepository
     */

    assert.equal(
        calls.success.length,
        1
    );


    assert.deepEqual(
        calls.success[0],
        {

            treasuryId:
                treasury.id,

            lastScannedBlock:
                69805969,

            lastFinalizedBlock:
                69805969
        }
    );


    assert.equal(
        calls.failed.length,
        0
    );


    console.log(
        'SyncEngine SUCCESS flow test: PASS'
    );
}


/*
 * ============================================================
 * TEST 3
 * FAILURE
 *
 * TransferRepository fails.
 *
 * Therefore:
 *
 * markSuccess() must NOT execute.
 *
 * markFailed() MUST execute.
 * ============================================================
 */

{

    calls.inserted.length = 0;
    calls.success.length = 0;
    calls.failed.length = 0;


    const syncStateRepository =
        makeSyncStateRepository({

            treasury_id:
                treasury.id,

            scan_from_block:
                69805900,

            last_scanned_block:
                69805950,

            last_finalized_block:
                69805940,

            status:
                'SUCCESS'
        });


    const transferRepository = {

        async insert() {

            throw new Error(
                'D1 insert failed'
            );
        }
    };


    const adapter = {

        async getLatestBlock() {

            return 69805989;
        },


        async getTransfers() {

            return transfers;
        }
    };


    const engine =
        new SyncEngine({

            treasuryRepository: {},

            transferRepository,

            syncStateRepository,

            adapters: {

                tron_nile:
                    adapter
            }
        });


    await assert.rejects(

        engine.syncTreasury(
            treasury,
            {
                safeConfirmations: 20,
                overlap: 10
            }
        ),

        /D1 insert failed/
    );


    /*
     * SUCCESS must never be recorded.
     */

    assert.equal(
        calls.success.length,
        0
    );


    /*
     * FAILURE must be recorded.
     */

    assert.equal(
        calls.failed.length,
        1
    );


    assert.equal(
        calls.failed[0].treasuryId,
        treasury.id
    );


    assert.equal(
        calls.failed[0].error,
        'D1 insert failed'
    );


    console.log(
        'SyncEngine FAILURE test: PASS'
    );
}


console.log(
    'All SyncEngine tests: PASS'
);
