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
// Find current block
// ------------------------------------------------------------

const latestBlock =
    await adapter.getLatestBlock();

assert.ok(
    Number.isInteger(latestBlock),
    'Latest block must be an integer'
);

console.log(
    'Latest block:',
    latestBlock
);


// ------------------------------------------------------------
// Direct TronGrid query
//
// We deliberately use a large historical window.
// The purpose is to determine how many records the
// current client actually receives from TronGrid.
//
// If this returns exactly 200, pagination is required.
// ------------------------------------------------------------

const result =
    await adapter.client.getTRC20Transfers(
        adapter.tokenAddress,
        TREASURY.address,
        0,
        Date.now()
    );

assert.ok(
    result,
    'TronGrid response is missing'
);

assert.ok(
    Array.isArray(result.data),
    'TronGrid data must be an array'
);

console.log(
    'Transfers returned by current TronClient:',
    result.data.length
);

console.log(
    'TronGrid total:',
    result.meta?.at || result.meta?.total || 'not provided'
);


// ------------------------------------------------------------
// Current implementation limit
// ------------------------------------------------------------

assert.ok(
    result.data.length <= 200,
    'Current TronClient returned more than its configured limit'
);


// ------------------------------------------------------------
// Diagnostic
// ------------------------------------------------------------

if (result.data.length === 200) {

    console.log(
        '\nWARNING: exactly 200 transfers returned.'
    );

    console.log(
        'Pagination must be implemented before production use.'
    );

} else {

    console.log(
        '\nCurrent query returned fewer than 200 transfers.'
    );
}


console.log(
    '\nTronAdapter pagination diagnostic: PASS'
);