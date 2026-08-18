import assert from 'node:assert/strict';
import { TronAdapter } from './TronAdapter.js';


const config = {
    networkId: 'tron_nile'
};


const adapter =
    new TronAdapter(config);


assert.equal(
    adapter.config.networkId,
    'tron_nile'
);


await assert.rejects(
    () => adapter.getLatestBlock(),
    /not implemented/
);


await assert.rejects(
    () =>
        adapter.getTransfers(
            {
                projectId: '1004',
                address:
                    'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp'
            },
            100,
            200
        ),
    /not implemented/
);


console.log(
    'TronAdapter interface test: PASS'
);
