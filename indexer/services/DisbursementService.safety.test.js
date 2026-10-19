import assert from 'node:assert/strict';
import { DisbursementService } from './DisbursementService.js';

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

console.log('Disbursement safety tests passed');
