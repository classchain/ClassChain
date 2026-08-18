import assert from 'node:assert/strict';

import { TronAdapter } from './TronAdapter.js';


const NETWORK_ID =
    'tron_nile';

const TREASURY = {
    projectId: '1004',
    address:
        'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp'
};


const adapter =
    new TronAdapter(NETWORK_ID);


// ------------------------------------------------------------
// Latest block
// ------------------------------------------------------------

const latestBlock =
    await adapter.getLatestBlock();

assert.ok(
    Number.isInteger(latestBlock),
    'Latest block must be an integer'
);

assert.ok(
    latestBlock > 0,
    'Latest block must be greater than zero'
);

console.log(
    'Latest block:',
    latestBlock
);


// ------------------------------------------------------------
// Transfer query
// ------------------------------------------------------------

const transfers =
    await adapter.getTransfers(
        TREASURY,
        0,
        Date.now()
    );


assert.ok(
    Array.isArray(transfers),
    'Transfers must be an array'
);


console.log(
    'Normalized transfers:',
    transfers.length
);


// ------------------------------------------------------------
// Validate normalized records
// ------------------------------------------------------------

for (const transfer of transfers) {

    assert.equal(
        transfer.network,
        NETWORK_ID
    );

    assert.equal(
        transfer.treasury,
        TREASURY.address
    );

    assert.ok(
        transfer.donor,
        'Donor is missing'
    );

    assert.equal(
        transfer.token,
        'USDT'
    );

    assert.ok(
        transfer.tokenAddress,
        'Token address is missing'
    );

    assert.ok(
        /^\d+$/.test(
            String(transfer.amountRaw)
        ),
        'amountRaw must be an integer string'
    );

    assert.ok(
        transfer.amount >= 0,
        'amount must be non-negative'
    );

    assert.ok(
        transfer.txHash,
        'Transaction hash is missing'
    );

    assert.ok(
        Number.isInteger(
            transfer.timestamp
        ),
        'Timestamp must be an integer'
    );
}


// ------------------------------------------------------------
// Display sample
// ------------------------------------------------------------

if (transfers.length > 0) {

    console.log(
        '\nFirst normalized transfer:'
    );

    console.log(
        JSON.stringify(
            transfers[0],
            null,
            2
        )
    );
}


console.log(
    '\nTronAdapter integration test: PASS'
);