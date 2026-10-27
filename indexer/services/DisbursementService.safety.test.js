import assert from 'node:assert/strict';
import { DisbursementService } from './DisbursementService.js';
import { getTokenAddress } from '../../shared/network-config.js';

function makeDb(initialRow) {
  const row = { ...initialRow };
  const approvals = [];

  return {
    row,
    approvals,
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() {
          if (sql.includes('SELECT * FROM disbursements WHERE id = ?')) {
            return Number(params[0]) === row.id ? { ...row } : null;
          }
          if (sql.includes('SELECT COUNT(*) AS c FROM disbursement_approvals')) {
            return { c: approvals.length };
          }
          return null;
        },
        async all() {
          if (sql.includes('SELECT * FROM disbursement_approvals')) {
            return { results: approvals.map((item) => ({ ...item })) };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes("SET status = 'PROCESSING'")) {
            const [error, updatedAt, id] = params;
            if (Number(id) !== row.id || row.status !== 'PENDING_APPROVAL' || row.required_signatures > 1) {
              return { meta: { changes: 0 } };
            }
            row.status = 'PROCESSING';
            row.error = error;
            row.updated_at = updatedAt;
            return { meta: { changes: 1 } };
          }
          if (sql.includes("SET status = 'PENDING_APPROVAL'")) {
            const [updatedAt, id, marker] = params;
            if (Number(id) !== row.id || row.status !== 'PROCESSING' || row.error !== marker) {
              return { meta: { changes: 0 } };
            }
            row.status = 'PENDING_APPROVAL';
            row.error = null;
            row.updated_at = updatedAt;
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO disbursement_approvals')) {
            const [disbursementId, approver, approvedAt, onchainTxIndex, onchainTxHash] = params;
            if (!approvals.some((a) => a.disbursement_id === disbursementId && a.approver === approver)) {
              approvals.push({ disbursement_id: disbursementId, approver, approved_at: approvedAt,
                onchain_tx_index: onchainTxIndex, onchain_tx_hash: onchainTxHash });
            }
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE disbursements')) {
            if (sql.includes('confirmations_count')) row.confirmations_count = params[0];
            else if (sql.includes('status = ?')) {
              row.status = params[0];
              row.updated_at = params[1];
              if (sql.includes('error = ?')) row.error = params[params.length - 2];
            }
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };
}

const registry = {
  features: [{
    attributes: {
      ProjectID: 'GENERAL_POOL',
      funds: { polygon_amoy: { owners: ['0xAbCd000000000000000000000000000000000001'] } },
    },
  }],
};

const db = makeDb({
  id: 41,
  network_id: 'polygon_amoy',
  required_signatures: 1,
  status: 'PENDING_APPROVAL',
  error: null,
  project_id: '1004',
  allocation_batch_id: 'batch-41',
  from_address: '0x0000000000000000000000000000000000000001',
  to_address: '0x0000000000000000000000000000000000000002',
  amount_raw: '1000000',
});
const service = new DisbursementService(db, { loadProjects: async () => registry });

await assert.rejects(
  () => service.claimSingleSignature(41, '0x0000000000000000000000000000000000000003'),
  /not a GENERAL_POOL owner/
);
assert.equal(db.row.status, 'PENDING_APPROVAL');

const results = await Promise.allSettled([
  service.claimSingleSignature(41, '0xAbCd000000000000000000000000000000000001'),
  service.claimSingleSignature(41, '0xAbCd000000000000000000000000000000000001'),
]);
assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'only one concurrent claim may win');
assert.equal(db.row.status, 'PROCESSING');

await assert.rejects(
  () => service.releaseSingleSignatureClaim(41, '0x0000000000000000000000000000000000000003'),
  /cannot be released/
);
await service.releaseSingleSignatureClaim(41, '0xabcdef0000000000000000000000000000000001').catch((error) => {
  // EVM addresses are normalized to lowercase when the claim is stored.
  if (!/cannot be released/.test(error.message)) throw error;
});
const claimant = db.row.error?.replace('single_sig_claim:', '');
assert.ok(claimant, 'claim should retain the claimant while PROCESSING');
await service.releaseSingleSignatureClaim(41, claimant);
assert.equal(db.row.status, 'PENDING_APPROVAL');
assert.equal(db.row.error, null);

const verifyDb = makeDb({
  id: 42,
  network_id: 'polygon_amoy',
  required_signatures: 1,
  status: 'APPROVED',
  error: null,
  project_id: '1004',
  allocation_batch_id: 'batch-42',
  from_address: '0x0000000000000000000000000000000000000001',
  to_address: '0x0000000000000000000000000000000000000002',
  amount_raw: '1000000',
});
const verifier = new DisbursementService(verifyDb, { loadProjects: async () => registry });
const tokenAddress = getTokenAddress('polygon_amoy', 'USDT').toLowerCase();
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicAddress = (address) => '0x' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const validReceipt = {
  status: '0x1',
  logs: [{
    address: tokenAddress,
    topics: [
      transferTopic,
      topicAddress(verifyDb.row.from_address),
      topicAddress(verifyDb.row.to_address),
    ],
    data: '0x' + BigInt(verifyDb.row.amount_raw).toString(16).padStart(64, '0'),
  }],
};
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: validReceipt }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  assert.equal(await verifier._verifyOnChainTransfer(verifyDb.row, '0xvalidhash'), true);

  globalThis.fetch = async () => new Response(JSON.stringify({
    jsonrpc: '2.0', id: 1, result: { status: '0x1', logs: [] },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await assert.rejects(
    () => verifier._verifyOnChainTransfer(verifyDb.row, '0xunrelatedhash'),
    /no matching USDT Transfer/
  );
} finally {
  globalThis.fetch = originalFetch;
}


/* TRON partial-D1-approval recovery regression */
const tronRecoveryHash = '571702ea880dde2ae4a07dd06a9cfdac2ea348a8cdc81668fe08ee8811575ae4';
function makeRecoveryService(id, networkId, approvals, verify) {
  const recoveryDb = makeDb({
    id,
    network_id: networkId,
    required_signatures: 2,
    status: 'PENDING_APPROVAL',
    error: null,
    project_id: '8207',
    allocation_batch_id: 'batch-recovery-' + id,
    from_address: networkId === 'tron_nile'
      ? 'TNpH6AyKJRLip6NEp6wjaTw3FbbduFD1hJ'
      : '0x0000000000000000000000000000000000000001',
    to_address: networkId === 'tron_nile'
      ? 'TSeX2tcCV5jwLwoxRpoMjDex2AboA6LKVa'
      : '0x0000000000000000000000000000000000000002',
    amount_raw: '17000000',
    execute_tx_hash: null,
    onchain_tx_index: null,
  });
  recoveryDb.approvals.push(...approvals.map((approval, index) => ({
    id: index + 1,
    disbursement_id: id,
    ...approval,
  })));
  const recoveryService = new DisbursementService(recoveryDb, { loadProjects: async () => registry });
  let ledgerCommits = 0;
  recoveryService.repo.setStatus = async (_id, status, extra = {}) => {
    Object.assign(recoveryDb.row, {
      status,
      ...(extra.executeTxHash !== undefined ? { execute_tx_hash: extra.executeTxHash } : {}),
      ...(extra.onchainTxIndex !== undefined ? { onchain_tx_index: extra.onchainTxIndex } : {}),
      ...(extra.executedAt !== undefined ? { executed_at: extra.executedAt } : {}),
      ...(extra.error !== undefined ? { error: extra.error } : {}),
    });
    return { ...recoveryDb.row };
  };
  recoveryService.allocationEngine.commitNetwork = async ({ allocationBatchId, networkId: committedNetwork }) => {
    ledgerCommits++;
    assert.equal(allocationBatchId, 'batch-recovery-' + id);
    assert.equal(committedNetwork, networkId);
    return { ok: true };
  };
  recoveryService.allocationRepo.listByBatch = async () => [{
    id: 1,
    network_id: networkId,
    amount_raw: '17000000',
    allocation_status: 'COMMITTED',
  }];
  recoveryService._verifyOnChainTransfer = verify;
  return { recoveryDb, recoveryService, getLedgerCommits: () => ledgerCommits };
}
const firstChainApproval = {
  approver: 'TY7XrUK9LbRq4CWcLwCUiLVW9Noju2EiD1',
  approved_at: 1,
  onchain_tx_index: 6,
  onchain_tx_hash: tronRecoveryHash,
};
const tronRecovery = makeRecoveryService(
  43,
  'tron_nile',
  [firstChainApproval],
  async (_row, hash) => { assert.equal(hash, tronRecoveryHash); return true; }
);
const tronResult = await tronRecovery.recoveryService.markExecuted(43, tronRecoveryHash, 6);
assert.equal(tronResult.disbursement.status, 'EXECUTED',
  'a verified TRON transfer must recover when one D1 approval was not recorded');
assert.equal(tronRecovery.getLedgerCommits(), 1,
  'a recovered TRON transfer must commit its network FIFO ledger');

const evmRecovery = makeRecoveryService(
  44,
  'polygon_amoy',
  [{ ...firstChainApproval, onchain_tx_index: 6 }],
  async () => true
);
await assert.rejects(
  () => evmRecovery.recoveryService.markExecuted(44, tronRecoveryHash, 6),
  /cannot mark executed before required approvals are recorded/
);
assert.equal(evmRecovery.recoveryDb.row.status, 'PENDING_APPROVAL',
  'the existing EVM approval-count guard must remain in place');

const tronUnverified = makeRecoveryService(
  45,
  'tron_nile',
  [firstChainApproval],
  async () => { throw new Error('TRON receipt has no matching USDT Transfer for this disbursement'); }
);
await assert.rejects(
  () => tronUnverified.recoveryService.markExecuted(45, tronRecoveryHash, 6),
  /no matching USDT Transfer/
);
assert.equal(tronUnverified.recoveryDb.row.status, 'PENDING_APPROVAL',
  'an unverified TRON receipt must never mark a disbursement executed');
assert.equal(tronUnverified.getLedgerCommits(), 0,
  'an unverified TRON receipt must never commit FIFO');

console.log('Disbursement safety tests passed');
