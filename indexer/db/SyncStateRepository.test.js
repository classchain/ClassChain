import assert from 'node:assert/strict';
import { SyncStateRepository } from './SyncStateRepository.js';

const calls = [];

const mockDb = {
    prepare(sql) {
        calls.push({ sql, bindings: [] });

        return {
            bind(...bindings) {
                calls[calls.length - 1].bindings = bindings;

                return {
                    async first() {
                        return {
                            treasury_id: 1,
                            status: 'PENDING'
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
    new SyncStateRepository(mockDb);


/*
 * get()
 */
const state =
    await repository.get(1);

assert.equal(
    state.treasury_id,
    1
);


/*
 * initialize()
 */
const initialized =
    await repository.initialize(
        1,
        12345
    );

assert.equal(
    initialized.status,
    'PENDING'
);


/*
 * markSuccess()
 */
await repository.markSuccess(
    1,
    20000,
    19950
);


/*
 * markFailed()
 */
await repository.markFailed(
    1,
    'RPC timeout'
);


/*
 * Basic SQL verification
 */
assert.ok(
    calls.length >= 4
);

assert.match(
    calls[0].sql,
    /SELECT/i
);

assert.match(
    calls[1].sql,
    /INSERT INTO sync_state/i
);

assert.match(
    calls[1].sql,
    /ON CONFLICT/i
);

const updateCalls =
    calls.filter(
        call =>
            /UPDATE sync_state/i.test(call.sql)
    );

assert.equal(
    updateCalls.length,
    2
);

assert.match(
    updateCalls[0].sql,
    /status = 'SUCCESS'/i
);

assert.match(
    updateCalls[1].sql,
    /status = 'FAILED'/i
);

console.log(
    'SyncStateRepository test: PASS'
);