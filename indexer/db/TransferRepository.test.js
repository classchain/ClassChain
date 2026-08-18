import assert from 'node:assert/strict';
import { TransferRepository } from './TransferRepository.js';


const calls = [];


const mockDb = {

    prepare(sql) {

        calls.push({
            sql,
            bindings: []
        });

        return {

            bind(...bindings) {

                calls[calls.length - 1].bindings =
                    bindings;

                return {

                    async run() {

                        return {
                            meta: {
                                changes: 1
                            }
                        };
                    }
                };
            }
        };
    }
};


const repository =
    new TransferRepository(mockDb);


const result =
    await repository.insert({

        treasuryId: 1,

        projectId: '1004',

        networkId: 'tron_nile',

        token: 'USDT',

        tokenAddress:
            'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj',

        donor:
            'TDonorAddress',

        amountRaw:
            '10000000',

        amount:
            '10',

        txHash:
            'ABC123',

        blockNumber:
            123456,

        eventIndex:
            0,

        timestamp:
            1700000000
    });


assert.equal(
    result.inserted,
    true
);


assert.equal(
    result.transferUid,
    'tron_nile:abc123:0'
);


assert.equal(
    calls.length,
    1
);


assert.match(
    calls[0].sql,
    /INSERT INTO transfers/i
);


assert.match(
    calls[0].sql,
    /ON CONFLICT\s*\(transfer_uid\)/i
);


assert.match(
    calls[0].sql,
    /DO NOTHING/i
);


/*
 * Verify the generated UID is actually
 * passed to the SQL statement.
 */

assert.ok(
    calls[0].bindings.includes(
        'tron_nile:abc123:0'
    )
);


console.log(
    'TransferRepository test: PASS'
);