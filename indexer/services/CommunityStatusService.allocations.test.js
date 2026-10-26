import assert from 'node:assert/strict';
import { AllocationRepository } from '../db/AllocationRepository.js';
import { CommunityStatusService } from './CommunityStatusService.js';

const queries = [];
const db = {
  prepare(sql) {
    return {
      sql,
      bind() { return this; },
      async all() {
        queries.push(sql);
        if (sql.includes('SELECT DISTINCT network_id FROM')) {
          return { results: [{ network_id: 'polygon_amoy' }] };
        }
        return { results: [] };
      },
      async first() {
        queries.push(sql);
        if (sql.includes('SELECT COALESCE(SUM(CAST(amount_raw AS INTEGER)), 0) AS total')) {
          return { total: '0' };
        }
        return null;
      },
    };
  },
};

const service = new CommunityStatusService(db);
service.balanceRepo.get = async () => ({
  total_contributed: '1000000',
  total_allocated: '1000000',
  unallocated: '0',
});
service.linkRepo.getByDonor = async () => null;

await service.statusByDonor('donor-A');
const networkQuery = queries.find((sql) => sql.includes('SELECT DISTINCT network_id FROM'));
assert.match(networkQuery, /allocation_status = 'COMMITTED'/);

const detailQuery = queries.find((sql) => sql.includes('FROM allocations') && sql.includes('GROUP BY project_id'));
assert.match(detailQuery, /allocation_status = 'COMMITTED'/);

await service.listProjectMembers('960');
const membersQuery = queries.find((sql) => sql.includes('FROM allocations a'));
assert.match(membersQuery, /a\.allocation_status = 'COMMITTED'/);

await new AllocationRepository(db).sumByProject('960');
const totalQuery = queries.find((sql) => sql.includes('SELECT COALESCE(SUM(CAST(amount_raw AS INTEGER)), 0) AS total'));
assert.match(totalQuery, /allocation_status = 'COMMITTED'/);

console.log('Community allocation summary tests passed');
