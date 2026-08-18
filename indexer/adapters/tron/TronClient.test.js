import assert from 'node:assert/strict';
import { TronClient } from './TronClient.js';


const client =
    new TronClient('tron_nile');


assert.equal(
    client.networkId,
    'tron_nile'
);


assert.equal(
    client.network.type,
    'TVM'
);


assert.equal(
    client.network.rpcUrl,
    'https://nile.trongrid.io'
);


assert.equal(
    client.rpcUrls[0],
    'https://nile.trongrid.io'
);


assert.throws(
    () =>
        new TronClient('unknown_network'),
    /Unknown network/
);


console.log(
    'TronClient config test: PASS'
);


// ----------------------------------------
// Real TRON Nile RPC test
// ----------------------------------------

const block =
    await client.getNowBlock();


assert.ok(
    block?.blockID,
    'TRON Nile did not return a valid block'
);


assert.ok(
    block?.block_header?.raw_data?.number !== undefined,
    'TRON Nile block number is missing'
);


console.log(
    'TRON Nile RPC test: PASS'
);


console.log(
    'Latest block:',
    block.block_header.raw_data.number
);
