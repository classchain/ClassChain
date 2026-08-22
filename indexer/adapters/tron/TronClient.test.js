import assert from 'node:assert/strict';

import {
    TronClient
} from './TronClient.js';


// ============================================================
// Configuration
// ============================================================

const NETWORK_ID =
    'tron_nile';

const USDT =
    'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';

const TREASURY =
    'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp';

const TX_HASH =
    '1c2ede792050064d4156a8112b286e4daf314280834a47a323b157286b4a8156';

const TEST_BLOCK =
    69805989;


// ============================================================
// Client
// ============================================================

const client =
    new TronClient(
        NETWORK_ID
    );


// ============================================================
// Configuration test
// ============================================================

assert.equal(
    client.networkId,
    NETWORK_ID
);

assert.ok(
    client.rpcUrls.length > 0,
    'RPC URLs are missing'
);

console.log(
    'TronClient config test: PASS'
);


// ============================================================
// Current block / RPC test
// ============================================================

const nowBlock =
    await client.getNowBlock();

assert.ok(
    nowBlock,
    'getNowBlock returned no data'
);

assert.ok(
    nowBlock.block_header,
    'Block header is missing'
);

assert.ok(
    Number.isInteger(
        nowBlock.block_header
            .raw_data
            .number
    ),
    'Current block number is missing'
);

const latestBlock =
    nowBlock.block_header
        .raw_data
        .number;

assert.ok(
    latestBlock > 0,
    'Latest block must be greater than zero'
);

console.log(
    'TRON Nile RPC test: PASS'
);

console.log(
    'Latest block:',
    latestBlock
);


// ============================================================
// USDT transfer query
// ============================================================

const transferResult =
    await client.getTRC20Transfers(
        USDT,
        TREASURY,
        0,
        Date.now()
    );

assert.ok(
    transferResult,
    'Transfer result is missing'
);

assert.ok(
    Array.isArray(
        transferResult.data
    ),
    'Transfer data must be an array'
);

console.log(
    'TRON USDT transfer query: PASS'
);

console.log(
    'Transfers returned:',
    transferResult.data.length
);


// ============================================================
// Raw transfer
// ============================================================

if (
    transferResult.data.length > 0
) {

    console.log(
        '\nRAW TRANSFER:'
    );

    console.log(
        JSON.stringify(
            transferResult.data[0],
            null,
            2
        )
    );
}


// ============================================================
// Transaction info
// ============================================================

const transactionInfo =
    await client.getTransactionInfo(
        TX_HASH
    );

assert.equal(
    transactionInfo.id,
    TX_HASH
);

assert.ok(
    Number.isInteger(
        transactionInfo.blockNumber
    ),
    'Transaction blockNumber is missing'
);

assert.equal(
    transactionInfo.receipt?.result,
    'SUCCESS'
);

assert.ok(
    Array.isArray(
        transactionInfo.log
    ),
    'Transaction logs are missing'
);

console.log(
    '\nTRANSACTION INFO:'
);

console.log(
    JSON.stringify(
        transactionInfo,
        null,
        2
    )
);

console.log(
    'Transaction info test: PASS'
);

console.log(
    'Transaction block:',
    transactionInfo.blockNumber
);

console.log(
    'Event logs:',
    transactionInfo.log.length
);


// ============================================================
// Specific block query
// ============================================================

const queriedBlock =
    await client.getBlock(
        TEST_BLOCK
    );

assert.ok(
    queriedBlock,
    'Block response is missing'
);

assert.ok(
    queriedBlock.block_header,
    'Block header is missing'
);

assert.ok(
    queriedBlock.block_header.raw_data,
    'Block raw data is missing'
);

assert.equal(
    queriedBlock.block_header
        .raw_data
        .number,
    TEST_BLOCK
);

assert.ok(
    Number.isInteger(
        queriedBlock.block_header
            .raw_data
            .timestamp
    ),
    'Block timestamp is missing'
);

console.log(
    '\nTRON block query test: PASS'
);

console.log(
    'Block number:',
    queriedBlock.block_header
        .raw_data
        .number
);

console.log(
    'Block timestamp:',
    queriedBlock.block_header
        .raw_data
        .timestamp
);


// ============================================================
// Small block range test
// ============================================================

const rangeFrom =
    TEST_BLOCK;

const rangeTo =
    TEST_BLOCK + 1;

const blocks =
    await client.getBlocks(
        rangeFrom,
        rangeTo
    );

assert.equal(
    blocks.length,
    2
);

assert.equal(
    blocks[0]
        .block_header
        .raw_data
        .number,
    rangeFrom
);

assert.equal(
    blocks[1]
        .block_header
        .raw_data
        .number,
    rangeTo
);

console.log(
    'TRON block range test: PASS'
);

console.log(
    'Blocks returned:',
    blocks.length
);

// ============================================================
// Pagination unit test
// ============================================================

const paginationClient =
    new TronClient(
        NETWORK_ID
    );

const originalRequestMethod =
    paginationClient.request;

const pageOne = {
    data: Array.from(
        { length: 200 },
        (_, index) => ({
            transaction_id:
                `tx-page-1-${index}`
        })
    ),
    meta: {
        fingerprint:
            'fingerprint-page-2'
    }
};

const pageTwo = {
    data: Array.from(
        { length: 3 },
        (_, index) => ({
            transaction_id:
                `tx-page-2-${index}`
        })
    ),
    meta: {}
};

const requests = [];

paginationClient.request =
    async (
        path,
        options
    ) => {

        requests.push({
            path,
            options
        });

        if (
            requests.length === 1
        ) {
            return pageOne;
        }

        if (
            requests.length === 2
        ) {
            return pageTwo;
        }

        throw new Error(
            'Unexpected extra pagination request'
        );
    };

const paginatedResult =
    await paginationClient.getTRC20Transfers(
        USDT,
        TREASURY,
        0,
        Date.now()
    );

assert.equal(
    paginatedResult.data.length,
    203,
    'Pagination must return all records'
);

assert.equal(
    requests.length,
    2,
    'Pagination must make exactly two requests'
);

assert.ok(
    requests[0].path.includes(
        'limit=200'
    ),
    'First request must use limit=200'
);

assert.ok(
    requests[1].path.includes(
        'fingerprint=fingerprint-page-2'
    ),
    'Second request must use the pagination fingerprint'
);

assert.equal(
    paginatedResult.data[0].transaction_id,
    'tx-page-1-0'
);

assert.equal(
    paginatedResult.data[199].transaction_id,
    'tx-page-1-199'
);

assert.equal(
    paginatedResult.data[200].transaction_id,
    'tx-page-2-0'
);

assert.equal(
    paginatedResult.data[202].transaction_id,
    'tx-page-2-2'
);

paginationClient.request =
    originalRequestMethod;

console.log(
    'TRON pagination test: PASS'
);

// ============================================================
// Final
// ============================================================

console.log(
    '\nAll TronClient tests: PASS'
);
