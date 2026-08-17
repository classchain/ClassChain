import assert from 'node:assert/strict';

import { ProjectRegistry } from './ProjectRegistry.js';


const projects = [

    {
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
    },

    {
        ProjectID: '1005',

        funds: {

            polygon_amoy: {
                address:
                    '0x06Fa75F560BDb98fBbf2C54ec3edeA01C1155b88'
            }

        }
    }

];


const registry =
    new ProjectRegistry(projects);


const treasuries =
    registry.discoverTreasuries();


assert.equal(
    treasuries.length,
    3
);


assert.deepEqual(
    treasuries,
    [
        {
            projectId: '1004',
            networkId: 'polygon_amoy',
            address:
                '0xe8d63212326a7a57A87AE1B032b4b4a4313137d5',
            active: true,
            createdAt: null
        },

        {
            projectId: '1004',
            networkId: 'tron_nile',
            address:
                'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp',
            active: true,
            createdAt: null
        },

        {
            projectId: '1005',
            networkId: 'polygon_amoy',
            address:
                '0x06Fa75F560BDb98fBbf2C54ec3edeA01C1155b88',
            active: true,
            createdAt: null
        }
    ]
);


assert.equal(
    registry.getProject('1004').ProjectID,
    '1004'
);


assert.equal(
    registry.getProject('999999'),
    null
);


console.log(
    'Discovery contract test: PASS'
);
