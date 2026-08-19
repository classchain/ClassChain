import assert from 'node:assert/strict';

import { TronAdapter } from './TronAdapter.js';


const NETWORK_ID =
    'tron_nile';

const TREASURY = {
    id:
        'TREASURY_1004',

    projectId:
        '1004',

    networkId:
        NETWORK_ID,

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
// Real historical block range
//
// Known real USDT transfer:
// block 69805989
//
// We intentionally scan a small range around it.
// ------------------------------------------------------------

const fromBlock =
    69805980;

const toBlock =
    69805989;


const transfers =
    await adapter.getTransfers(
        TREASURY,
        fromBlock,
        toBlock
    );


assert.ok(
    Array.isArray(transfers),
    'Transfers must be an array'
);


console.log(
    'Transfers returned:',
    transfers.length
);


// ------------------------------------------------------------
// Validate normalized records
// ------------------------------------------------------------

for (const transfer of transfers) {

    assert.equal(
        transfer.networkId,
        NETWORK_ID
    );

    assert.equal(
        transfer.projectId,
        TREASURY.projectId
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
            transfer.blockNumber
        ),
        'blockNumber must be an integer'
    );

    assert.ok(
        transfer.blockNumber >= fromBlock &&
        transfer.blockNumber <= toBlock,
        'Transfer block is outside requested range'
    );

    assert.ok(
        Number.isInteger(
            transfer.eventIndex
        ),
        'eventIndex must be an integer'
    );

    assert.ok(
        Number.isInteger(
            transfer.timestamp
        ),
        'Timestamp must be an integer'
    );
}


// ------------------------------------------------------------
// Verify the known real transfer
// ------------------------------------------------------------

const knownTx =
    '1c2ede792050064d4156a8112b286e4daf314280834a47a323b157286b4a8156';


const knownTransfer =
    transfers.find(
        transfer =>
            transfer.txHash === knownTx
    );


assert.ok(
    knownTransfer,
    'Known TRON USDT transfer was not found'
);


assert.equal(
    knownTransfer.blockNumber,
    69805989
);


assert.equal(
    knownTransfer.eventIndex,
    0
);


assert.equal(
    knownTransfer.donor,
    'TY7XrUK9LbRq4CWcLwCUiLVW9Noju2EiD1'
);


assert.equal(
    knownTransfer.treasury,
    TREASURY.address
);


assert.equal(
    knownTransfer.amountRaw,
    '5000000'
);


assert.equal(
    knownTransfer.amount,
    5
);


assert.equal(
    knownTransfer.token,
    'USDT'
);


// ------------------------------------------------------------
// Display sample
// ------------------------------------------------------------

console.log(
    '\nKnown normalized transfer:'
);

console.log(
    JSON.stringify(
        knownTransfer,
        null,
        2
    )
);


console.log(
    '\nTronAdapter integration test: PASS'
);
