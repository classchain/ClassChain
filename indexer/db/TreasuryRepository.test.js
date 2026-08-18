import assert from 'node:assert/strict';
import { TreasuryRepository } from './TreasuryRepository.js';


const calls = [];


const mockDb = {

    prepare(sql) {

        calls.push({
            sql,
            bindings: []
        });

        return {

            bind(...bindings) {

                calls[calls.length - 1].bindings =
                    bindings;

                return {

                    async first() {

                        return {
                            id: 1,
                            project_id: '1004',
                            network_id: 'tron_nile',
                            address: 'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp',
                            active: 1
                        };
                    },

                    async run() {

                        return {
                            success: true
                        };
                    }
                };
            }
        };
    }
};


const repository =
    new TreasuryRepository(mockDb);


/*
 * findByIdentity
 */

const existing =
    await repository.findByIdentity(
        '1004',
        'tron_nile',
        'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp'
    );


assert.equal(
    existing.id,
    1
);

assert.equal(
    existing.project_id,
    '1004'
);


/*
 * upsert
 */

const treasury =
    await repository.upsert({

        projectId: '1004',

        networkId: 'tron_nile',

        address:
            'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp',

        active: true

    });


assert.equal(
    treasury.project_id,
    '1004'
);

assert.equal(
    treasury.network_id,
    'tron_nile'
);


/*
 * Verify SQL was actually prepared.
 */

assert.ok(
    calls.length >= 2
);


assert.match(
    calls[0].sql,
    /SELECT/i
);

assert.match(
    calls[1].sql,
    /INSERT INTO treasuries/i
);

assert.match(
    calls[1].sql,
    /ON CONFLICT/i
);


console.log(
    'TreasuryRepository test: PASS'
);
