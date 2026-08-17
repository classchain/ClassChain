import assert from 'node:assert/strict';

import { ProjectRegistry } from './ProjectRegistry.js';
import { DiscoveryService } from './DiscoveryService.js';


const projects = {

    features: [

        {
            attributes: {

                ProjectID: '1004',

                funds: {

                    polygon_amoy: {
                        address:
                            '0xe8d63212326a7a57A87AE1B032b4b4a4313137d5'
                    },

                    tron_nile: {
                        address:
                            'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp'
                    }

                }

            }
        },

        {
            attributes: {

                ProjectID: '1005',

                funds: {

                    polygon_amoy: {
                        address:
                            '0x06Fa75F560BDb98fBbf2C54ec3edeA01C1155b88'
                    }

                }

            }
        }

    ]

};


const projectRegistry =
    new ProjectRegistry(projects);


/*
 * Mock NetworkResolver
 *
 * DiscoveryService must not know how
 * networks or tokens are configured.
 */
const networkResolver = {

resolveTreasury(networkId) {

    if (networkId === 'broken_network') {

        throw new Error(
            'Network deployment is not active: broken_network'
        );
    }

    return {

        network: {

            id: networkId,

            status: 'active',

            factoryAddress:
                '0xFactory'

        },

        token: {

            symbol: 'USDT',

            address:
                `TOKEN_${networkId}`,

            decimals: 6

        }

    };
}

    
};


const service =
    new DiscoveryService(
        projectRegistry,
        networkResolver
    );


const result =
    service.discover();


/*
 * All valid treasuries must be discovered.
 */
assert.equal(
    result.valid.length,
    3
);


/*
 * No configuration errors.
 */
assert.equal(
    result.invalid.length,
    0
);


/*
 * Verify first treasury.
 */
assert.equal(
    result.valid[0].projectId,
    '1004'
);

assert.equal(
    result.valid[0].networkId,
    'polygon_amoy'
);

assert.equal(
    result.valid[0].token.symbol,
    'USDT'
);

assert.equal(
    result.valid[0].token.decimals,
    6
);


/*
 * Verify TRON treasury.
 */
assert.equal(
    result.valid[1].networkId,
    'tron_nile'
);


/*
 * Critical scalability test:
 *
 * Add a completely new project/network.
 * Discovery code must not change.
 */
 projects.features.push({

    attributes: {

        ProjectID: '2000',

        funds: {

            future_network: {

                address:
                    'FUTURE_TREASURY'

            }

        }

    }

});


const secondResult =
    service.discover();


assert.equal(
    secondResult.valid.length,
    4
);


assert.equal(
    secondResult.valid[3].projectId,
    '2000'
);

assert.equal(
    secondResult.valid[3].networkId,
    'future_network'
);


/*
 * Critical fault-isolation test:
 *
 * One invalid treasury must not stop
 * discovery of valid treasuries.
 */
projects.features.push({

    attributes: {

        ProjectID: '3000',

        funds: {

            broken_network: {

                address:
                    'BROKEN_TREASURY'

            }

        }

    }

});

const thirdResult =
    service.discover();


assert.equal(
    thirdResult.valid.length,
    4
);


assert.equal(
    thirdResult.invalid.length,
    1
);


assert.equal(
    thirdResult.invalid[0].projectId,
    '3000'
);


assert.equal(
    thirdResult.invalid[0].networkId,
    'broken_network'
);


assert.equal(
    thirdResult.invalid[0].status,
    'INVALID_CONFIGURATION'
);


console.log(
    'Discovery service contract test: PASS'
);
