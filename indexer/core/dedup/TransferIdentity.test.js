import assert from 'node:assert/strict';
import { TransferIdentity } from './TransferIdentity.js';


const uid =
    TransferIdentity.create({
        networkId: 'tron_nile',
        txHash: 'ABC123',
        eventIndex: 0
    });

assert.equal(
    uid,
    'tron_nile:abc123:0'
);


assert.equal(
    TransferIdentity.create({
        networkId: 'polygon_amoy',
        txHash: '0xABC',
        eventIndex: 2
    }),
    'polygon_amoy:0xabc:2'
);


assert.throws(
    () =>
        TransferIdentity.create({
            txHash: 'abc',
            eventIndex: 0
        })
);


assert.throws(
    () =>
        TransferIdentity.create({
            networkId: 'tron_nile',
            eventIndex: 0
        })
);


assert.throws(
    () =>
        TransferIdentity.create({
            networkId: 'tron_nile',
            txHash: 'abc'
        })
);


console.log(
    'TransferIdentity test: PASS'
);
