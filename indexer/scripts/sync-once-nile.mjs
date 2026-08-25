/**
 * One-shot incremental sync for ALL TRON Nile treasuries.
 *
 * Usage (repo root):
 *   node indexer/scripts/sync-once-nile.mjs
 *
 * Optional env:
 *   SAFE_CONFIRMATIONS=3
 *   OVERLAP=5
 *   SCAN_FROM_BLOCK=70346521
 *     → only applied when a treasury has no sync_state yet
 *
 * Requires:
 *   - wrangler.jsonc D1 binding DB
 *   - indexer/adapters/createAdapter.js
 *   - prior seed + parked sync_state (recommended)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';

import { ProjectRegistry } from '../core/discovery/ProjectRegistry.js';
import { NetworkResolver } from '../core/discovery/NetworkResolver.js';
import { IndexerRunner } from '../core/runner/IndexerRunner.js';
import { TreasuryRepository } from '../db/TreasuryRepository.js';
import { TransferRepository } from '../db/TransferRepository.js';
import { SyncStateRepository } from '../db/SyncStateRepository.js';
import { createAdapter } from '../adapters/createAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const NETWORK_ID = 'tron_nile';

const SCAN_FROM_BLOCK = Number(process.env.SCAN_FROM_BLOCK || 0);
const SAFE_CONFIRMATIONS = Number(process.env.SAFE_CONFIRMATIONS || 20);
const OVERLAP = Number(process.env.OVERLAP || 10);

function loadProjects() {
  const projectsPath = path.join(
    repoRoot,
    'frontend/data/Projects.json'
  );

  if (!fs.existsSync(projectsPath)) {
    throw new Error(`Projects.json not found: ${projectsPath}`);
  }

  const registry = JSON.parse(
    fs.readFileSync(projectsPath, 'utf8')
  );

  if (!Array.isArray(registry?.features)) {
    throw new Error('Projects.json must contain features[]');
  }

  return registry;
}

async function verifyNile(db) {
  const treasuries = await db
    .prepare(
      `
      SELECT
        t.id,
        t.project_id,
        t.address,
        t.active,
        s.last_scanned_block,
        s.last_finalized_block,
        s.status,
        s.error,
        (
          SELECT COUNT(*)
          FROM transfers tr
          WHERE tr.treasury_id = t.id
        ) AS tx_count,
        (
          SELECT COALESCE(SUM(CAST(tr.amount AS REAL)), 0)
          FROM transfers tr
          WHERE tr.treasury_id = t.id
        ) AS total_amount
      FROM treasuries t
      LEFT JOIN sync_state s
        ON s.treasury_id = t.id
      WHERE t.network_id = ?
      ORDER BY t.project_id
    `
    )
    .bind(NETWORK_ID)
    .all();

  const rows = treasuries?.results || [];

  console.log('\n=== VERIFY NILE ===');
  for (const row of rows) {
    console.log({
      project_id: row.project_id,
      address: row.address,
      tx_count: row.tx_count,
      total_amount: row.total_amount,
      last_scanned_block: row.last_scanned_block,
      status: row.status,
      error: row.error,
    });
  }

  const dups = await db
    .prepare(
      `
      SELECT transfer_uid, COUNT(*) AS c
      FROM transfers
      WHERE network_id = ?
      GROUP BY transfer_uid
      HAVING c > 1
    `
    )
    .bind(NETWORK_ID)
    .all();

  const dupRows = dups?.results || [];
  if (dupRows.length > 0) {
    console.error('duplicates:', dupRows);
    throw new Error('Duplicate transfer_uid detected on tron_nile');
  }

  console.log('[ok] no duplicate transfer_uid on tron_nile');
  return rows;
}

async function main() {
  const registryJson = loadProjects();

  const { env, dispose } = await getPlatformProxy({
    configPath: path.join(repoRoot, 'wrangler.jsonc'),
  });

  try {
    const db = env.DB;
    if (!db) {
      throw new Error('D1 binding DB is missing. Check wrangler.jsonc');
    }

    const runner = new IndexerRunner({
      projectRegistry: new ProjectRegistry(registryJson),
      networkResolver: new NetworkResolver(),
      treasuryRepository: new TreasuryRepository(db),
      transferRepository: new TransferRepository(db),
      syncStateRepository: new SyncStateRepository(db),
      adapterFactory: createAdapter,
      networkIds: [NETWORK_ID],
    });

    console.log(`Running one-shot Nile sync for network ${NETWORK_ID}`);
    console.log({ SCAN_FROM_BLOCK, SAFE_CONFIRMATIONS, OVERLAP });

    const summary = await runner.runOnce({
      scanFromBlock: SCAN_FROM_BLOCK,
      safeConfirmations: SAFE_CONFIRMATIONS,
      overlap: OVERLAP,
    });

    console.log('\n=== RUN SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));

    if (summary.failed > 0) {
      throw new Error(`Sync finished with failed=${summary.failed}`);
    }

    await verifyNile(db);

    console.log('\n=== RE-RUN (dedup check) ===');
    const summary2 = await runner.runOnce({
      scanFromBlock: SCAN_FROM_BLOCK,
      safeConfirmations: SAFE_CONFIRMATIONS,
      overlap: OVERLAP,
    });

    console.log(
      JSON.stringify(
        {
          inserted: summary2.inserted,
          transfers: summary2.transfers,
          synced: summary2.synced,
          skipped: summary2.skipped,
          failed: summary2.failed,
        },
        null,
        2
      )
    );

    if (summary2.failed > 0) {
      throw new Error(`Re-run failed=${summary2.failed}`);
    }

    if (summary2.inserted > 0) {
      console.warn(
        '[warn] Second run inserted rows; check overlap/finality'
      );
    } else {
      console.log('[ok] Second run inserted=0 (dedup OK)');
    }
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});