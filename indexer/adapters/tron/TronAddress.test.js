import assert from 'node:assert/strict';

import {
    tronAddressToHex,
    tronAddressToTopic
} from './TronAddress.js';


const treasury =
    'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp';


const hex =
    tronAddressToHex(treasury);


assert.equal(
    hex.length,
    42
);

assert.equal(
    hex.slice(0, 2),
    '41'
);


const topic =
    tronAddressToTopic(treasury);


assert.equal(
    topic.length,
    64
);


assert.equal(
    topic.slice(-40),
    hex.slice(-40)
);


console.log(
    'TRON address conversion test: PASS'
);

console.log(
    'Hex:',
    hex
);

console.log(
    'Topic:',
    topic
);