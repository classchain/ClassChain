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
