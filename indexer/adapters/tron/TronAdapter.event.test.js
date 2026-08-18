import assert from 'node:assert/strict';

import { TronAdapter } from './TronAdapter.js';


const adapter =
    new TronAdapter('tron_nile');


const txHash =
    '1c2ede792050064d4156a8112b286e4daf314280834a47a323b157286b4a8156';


const txInfo =
    await adapter.client.getTransactionInfo(
        txHash
    );


const event =
    adapter._findTransferEvent(
        txInfo,
        adapter.tokenAddress,
        'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp'
    );


assert.ok(
    event,
    'USDT Transfer event was not found'
);


assert.equal(
    event.index,
    0
);


assert.equal(
    event.log.topics[0].toLowerCase(),
    'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
);


console.log(
    'TRON USDT Transfer event test: PASS'
);

console.log(
    'Event index:',
    event.index
);

console.log(
    'Event data:',
    JSON.stringify(
        event.log,
        null,
        2
    )
);