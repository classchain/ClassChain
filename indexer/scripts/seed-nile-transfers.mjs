/**
 * Seed historical TRON Nile transfers from CSV, then park sync_state
 * near "now" so incremental sync does not rescan full history.
 *
 * Usage (repo root):
 *   node indexer/scripts/seed-nile-transfers.mjs [path/to.csv]
 *
 * Default CSV path:
 *   ./Nile_Funds.csv  (or pass absolute path)
 *
 * Env:
 *   PARK_BLOCK=70347000   # last_scanned_block after seed (default: max block in CSV)
 *   SAFE_GAP=50           # park at max(CSV block, PARK_BLOCK) style; see below
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';

import { getTokenAddress, getTokenDecimals } from '../../shared/network-config.js';
import { TransferIdentity } from '../core/dedup/TransferIdentity.js';
import { TreasuryRepository } from '../db/TreasuryRepository.js';
import { TransferRepository } from '../db/TransferRepository.js';
import { SyncStateRepository } from '../db/SyncStateRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const csvPath = path.resolve(
  process.argv[2] || path.join(repoRoot, 'Nile_Funds.csv')
);

const TOKEN_SYMBOL = 'USDT';
const DEFAULT_EVENT_INDEX = 0;

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV has no data rows');
  }

  const headers = splitCsvLine(lines[0]).map((h) =>
    h.trim().toLowerCase()
  );

  return lines.slice(1).map((line, i) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim();
    });
    row._line = i + 2;
    return row;
  });
}

/** Minimal CSV split (no embedded commas expected in this file). */
function splitCsvLine(line) {
  return line.split(',');
}

function toAmountRaw(amountStr, decimals) {
  const n = Number(amountStr);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid amount: ${amountStr}`);
  }
  // avoid float junk for common 6-decimal USDT values
  const raw = Math.round(n * 10 ** decimals);
  return String(raw);
}

function normalizeAmountDisplay(amountStr) {
  const n = Number(amountStr);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid amount: ${amountStr}`);
  }
  return String(n);
}

function parseOptionalDateToUnix(dateStr) {
  if (!dateStr) return null;
  // forms like "8/24/2026 07:04"
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / 1000);
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  console.log(`Loaded ${rows.length} rows from ${csvPath}`);

  const { env, dispose } = await getPlatformProxy({
    configPath: path.join(repoRoot, 'wrangler.jsonc'),
  });

  try {
    const db = env.DB;
    if (!db) throw new Error('D1 binding DB missing');

    const treasuryRepo = new TreasuryRepository(db);
    const transferRepo = new TransferRepository(db);
    const syncRepo = new SyncStateRepository(db);

    let inserted = 0;
    let skipped = 0;
    let maxBlockByTreasury = new Map(); // treasuryId -> max block

    for (const row of rows) {
      const projectId = row.project_id;
      const networkId = row.network_id;
      const address = row.treasury;
      const donor = row.donor;
      const txHash = row.tx_hash;
      const blockNumber = Number(row.block_number);
      const eventIndex =
        row['event_index(optional)'] === '' ||
        row['event_index(optional)'] == null
          ? DEFAULT_EVENT_INDEX
          : Number(row['event_index(optional)']);

      if (!projectId || !networkId || !address || !donor || !txHash) {
        throw new Error(`Line ${row._line}: missing required field`);
      }
      if (!Number.isInteger(blockNumber) || blockNumber < 0) {
        throw new Error(`Line ${row._line}: bad block_number`);
      }
      if (!Number.isInteger(eventIndex) || eventIndex < 0) {
        throw new Error(`Line ${row._line}: bad event_index`);
      }

      const tokenAddress = getTokenAddress(networkId, TOKEN_SYMBOL);
      const decimals = getTokenDecimals(networkId, TOKEN_SYMBOL);
      if (!tokenAddress) {
        throw new Error(`No USDT configured for ${networkId}`);
      }

      const amount = normalizeAmountDisplay(row.amount);
      const amountRaw = toAmountRaw(row.amount, decimals);
      const timestamp =
        parseOptionalDateToUnix(row['date(optional)']) ?? 0;

      const treasury = await treasuryRepo.upsert({
        projectId,
        networkId,
        address,
        active: true,
        createdAt: new Date().toISOString(),
      });

      if (!treasury?.id) {
        throw new Error(
          `Treasury upsert failed: ${projectId}/${networkId}/${address}`
        );
      }

      const result = await transferRepo.insert({
        treasuryId: treasury.id,
        projectId,
        networkId,
        token: TOKEN_SYMBOL,
        tokenAddress,
        donor,
        amountRaw,
        amount,
        txHash,
        blockNumber,
        eventIndex,
        timestamp,
      });

      if (result?.inserted) {
        inserted++;
      } else {
        skipped++;
      }

      const prev = maxBlockByTreasury.get(treasury.id) || 0;
      if (blockNumber > prev) {
        maxBlockByTreasury.set(treasury.id, blockNumber);
      }

      // ensure sync_state row exists
      await syncRepo.initialize(treasury.id, blockNumber);
    }

    /*
     * Park cursor so next SyncEngine run is incremental only.
     * Use max(CSV block, PARK_BLOCK env) per treasury.
     */
    const parkEnv = process.env.PARK_BLOCK
      ? Number(process.env.PARK_BLOCK)
      : null;

    for (const [treasuryId, maxBlock] of maxBlockByTreasury.entries()) {
      const parkAt =
        Number.isInteger(parkEnv) && parkEnv > maxBlock
          ? parkEnv
          : maxBlock;

      await syncRepo.markSuccess(treasuryId, parkAt, parkAt);
      console.log(
        `sync_state parked treasury_id=${treasuryId} at block ${parkAt}`
      );
    }

    console.log('\n=== SEED DONE ===');
    console.log({ rows: rows.length, inserted, skippedDupOrExisting: skipped });

    const check = await db
      .prepare(
        `
        SELECT project_id, network_id, COUNT(*) AS c, SUM(CAST(amount AS REAL)) AS total
        FROM transfers
        WHERE network_id = 'tron_nile'
        GROUP BY project_id, network_id
        ORDER BY project_id
      `
      )
      .all();

    console.log('totals:', check?.results || check);
  } finally {
    await dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});