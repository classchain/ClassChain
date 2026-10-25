import assert from 'node:assert/strict';
import { AllocationRepository } from './AllocationRepository.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeDb({ slices, queues, balances, beforeBatch = null }) {
  const state = {
    slices: clone(slices),
    queues: clone(queues),
    balances: clone(balances),
  };
  let batchCalls = 0;

  const db = {
    state,
    get batchCalls() { return batchCalls; },
    prepare(sql) {
      let params = [];
      return {
        sql,
        bind(...values) {
          params = values;
          this.params = params;
          return this;
        },
        async all() {
          if (sql.includes('SELECT * FROM allocations')) {
            return {
              results: state.slices
                .filter((row) => row.allocation_batch_id === params[0])
                .sort((a, b) => a.id - b.id)
                .map((row) => ({ ...row })),
            };
          }
          throw new Error('Unexpected .all() SQL in test: ' + sql);
        },
        async first() {
          if (sql.includes('SELECT remaining_raw, donor, network_id FROM allocation_queue')) {
            const row = state.queues.find((item) => Number(item.id) === Number(params[0]));
            return row ? { ...row } : null;
          }
          if (sql.includes('SELECT unallocated, total_allocated FROM contribution_balances')) {
            const row = state.balances.find(
              (item) => item.donor === params[0] && item.network_id === params[1]
            );
            return row ? { ...row } : null;
          }
          throw new Error('Unexpected .first() SQL in test: ' + sql);
        },
      };
    },
    async batch(statements) {
      batchCalls += 1;
      if (beforeBatch) await beforeBatch(state);
      const snapshot = clone(state);
      let previousChanges = 0;
      const results = [];

      try {
        for (const statement of statements) {
          const { sql, params: values } = statement;
          let changes = 0;

          if (sql.includes('UPDATE allocation_queue')) {
            const [expectedRemaining, nextRemaining, expectedForStatus, nextStatus, id] = values;
            const row = state.queues.find((item) => Number(item.id) === Number(id));
            if (row) {
              if (String(row.remaining_raw) !== String(expectedRemaining) ||
                  String(row.remaining_raw) !== String(expectedForStatus)) {
                throw new Error('NOT NULL constraint failed: allocation_queue.remaining_raw');
              }
              row.remaining_raw = String(nextRemaining);
              row.status = String(nextStatus);
              changes = 1;
            }
          } else if (
            sql.includes('UPDATE contribution_balances') &&
            sql.includes('CASE')
          ) {
            const [expectedUnallocated, expectedAllocated, nextUnallocated,
              expectedUnallocatedAgain, expectedAllocatedAgain, nextAllocated,
              updatedAt, donor, networkId] = values;
            const row = state.balances.find(
              (item) => item.donor === donor && item.network_id === networkId
            );
            if (row) {
              if (String(row.unallocated) !== String(expectedUnallocated) ||
                  String(row.total_allocated) !== String(expectedAllocated) ||
                  String(row.unallocated) !== String(expectedUnallocatedAgain) ||
                  String(row.total_allocated) !== String(expectedAllocatedAgain)) {
                throw new Error('NOT NULL constraint failed: contribution_balances.unallocated');
              }
              row.unallocated = String(nextUnallocated);
              row.total_allocated = String(nextAllocated);
              row.updated_at = updatedAt;
              changes = 1;
            }
          } else if (sql.includes('SET allocation_status = CASE WHEN changes() = 1')) {
            const [anchorId] = values;
            const row = state.slices.find((item) => Number(item.id) === Number(anchorId));
            if (row) {
              if (previousChanges !== 1) {
                throw new Error('NOT NULL constraint failed: allocations.allocation_status');
              }
              changes = 1;
            }
          } else if (sql.includes('SET allocation_status = CASE') && sql.includes("THEN 'COMMITTED'")) {
            const [batchId, id] = values;
            const row = state.slices.find((item) => Number(item.id) === Number(id));
            if (row) {
              if (row.allocation_status !== 'PLANNED' || row.allocation_batch_id !== batchId) {
                throw new Error('NOT NULL constraint failed: allocations.allocation_status');
              }
              row.allocation_status = 'COMMITTED';
              changes = 1;
            }
          } else {
            throw new Error('Unexpected batch SQL in test: ' + sql);
          }

          previousChanges = changes;
          results.push({ meta: { changes } });
        }
      } catch (error) {
        state.slices = snapshot.slices;
        state.queues = snapshot.queues;
        state.balances = snapshot.balances;
        throw error;
      }

      return results;
    },
  };

  return db;
}

function slice({ id, amount, donor = 'donor-A', networkId = 'polygon_amoy',
  queueId = 1, batchId = 'batch-1', status = 'PLANNED' }) {
  return {
    id,
    queue_entry_id: queueId,
    project_id: 'project-1',
    donor,
    network_id: networkId,
    amount_raw: String(amount),
    allocation_batch_id: batchId,
    allocated_at: 100,
    allocation_status: status,
  };
}

function commonData({ slices, remaining, unallocated, totalAllocated = '0',
  queueDonor = 'donor-A', queueNetwork = 'polygon_amoy', beforeBatch = null }) {
  return makeDb({
    slices,
    queues: [{
      id: 1,
      donor: queueDonor,
      network_id: queueNetwork,
      remaining_raw: String(remaining),
      status: 'OPEN',
    }],
    balances: [{
      donor: 'donor-A',
      network_id: 'polygon_amoy',
      unallocated: String(unallocated),
      total_allocated: String(totalAllocated),
      updated_at: '2026-01-01T00:00:00.000Z',
    }],
    beforeBatch,
  });
}

// BigInt arithmetic, queue aggregation, and balance aggregation must remain exact
// even above Number.MAX_SAFE_INTEGER.
{
  const amountA = '9007199254740993';
  const amountB = '7';
  const total = '9007199254741000';
  const db = commonData({
    slices: [slice({ id: 10, amount: amountA }), slice({ id: 11, amount: amountB })],
    remaining: total,
    unallocated: total,
    totalAllocated: '10',
  });
  const repo = new AllocationRepository(db);
  const result = await repo.commitNetwork('batch-1', 'polygon_amoy');

  assert.equal(result.ok, true);
  assert.equal(result.committed_slices, 2);
  assert.equal(result.committed_amount_raw, total);
  assert.equal(db.state.queues[0].remaining_raw, '0');
  assert.equal(db.state.queues[0].status, 'FULL');
  assert.equal(db.state.balances[0].unallocated, '0');
  assert.equal(db.state.balances[0].total_allocated, '9007199254741010');
  assert.deepEqual(db.state.slices.map((row) => row.allocation_status), ['COMMITTED', 'COMMITTED']);
}

// A queue row must belong to the same donor/network as its planned allocation.
{
  const db = commonData({
    slices: [slice({ id: 20, amount: '5', donor: 'donor-A', networkId: 'polygon_amoy' })],
    remaining: '10',
    unallocated: '10',
    queueDonor: 'different-donor',
  });
  const repo = new AllocationRepository(db);
  await assert.rejects(
    () => repo.commitNetwork('batch-1', 'polygon_amoy'),
    /donor\/network does not match/
  );
  assert.equal(db.batchCalls, 0, 'invalid queue ownership must fail before any writes');
}

// A stale row discovered during the atomic batch must roll back earlier queue writes.
{
  let changed = false;
  const db = commonData({
    slices: [slice({ id: 30, amount: '4' })],
    remaining: '10',
    unallocated: '10',
    beforeBatch: async (state) => {
      if (!changed) {
        state.balances[0].unallocated = '9';
        changed = true;
      }
    },
  });
  const repo = new AllocationRepository(db);
  await assert.rejects(
    () => repo.commitNetwork('batch-1', 'polygon_amoy'),
    /NOT NULL constraint failed/
  );
  assert.equal(db.state.queues[0].remaining_raw, '10', 'queue write must roll back on stale balance');
  assert.equal(db.state.balances[0].unallocated, '9', 'concurrent balance change remains untouched');
  assert.equal(db.state.slices[0].allocation_status, 'PLANNED');
}

// Insufficient balance is detected before the D1 batch is started.
{
  const db = commonData({
    slices: [slice({ id: 40, amount: '11' })],
    remaining: '20',
    unallocated: '10',
  });
  const repo = new AllocationRepository(db);
  await assert.rejects(
    () => repo.commitNetwork('batch-1', 'polygon_amoy'),
    /Cannot commit 11.*unallocated 10/
  );
  assert.equal(db.batchCalls, 0);
}

console.log('AllocationRepository atomic commit tests passed');
