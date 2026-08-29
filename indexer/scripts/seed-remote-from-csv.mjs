/**
 * Seed Old-Doners.csv into REMOTE D1 via wrangler CLI.
 *
 * Usage (repo root, with CLOUDFLARE_API_TOKEN set):
 *   node indexer/scripts/seed-remote-from-csv.mjs ./Old-Doners.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  getTokenAddress,
  getTokenDecimals,
} from '../../shared/network-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const csvPath = path.resolve(process.argv[2] || path.join(repoRoot, 'Old-Doners.csv'));

function sh(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function remoteSql(sql) {
  const out = sh('npx', [
    'wrangler',
    'd1',
    'execute',
    'classchain-indexer',
    '--remote',
    '--json',
    '--command',
    sql,
  ]);
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

function splitCsvLine(line) {
  return line.split(',').map((s) => s.trim());
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line, i) => {
    const cols = splitCsvLine(line);
    const row = { _line: i + 2 };
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    return row;
  });
}

function normAddr(networkId, address) {
  if (networkId.startsWith('tron')) return address.trim();
  return address.trim().toLowerCase();
}

function amountRaw(amountStr, decimals) {
  const n = Number(amountStr);
  if (!Number.isFinite(n)) throw new Error(`bad amount ${amountStr}`);
  return String(Math.round(n * 10 ** decimals));
}

function quote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function transferUid(networkId, txHash, eventIndex) {
  const h = networkId.startsWith('tron')
    ? String(txHash).trim().toLowerCase()
    : String(txHash).trim().toLowerCase();
  return `${networkId}:${h}:${eventIndex}`;
}

// --- load CSV
if (!fs.existsSync(csvPath)) {
  console.error('CSV not found:', csvPath);
  process.exit(1);
}
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
console.log('CSV rows:', rows.length);

// --- load remote treasuries
const tRes = remoteSql(`
  SELECT id, project_id, network_id, address FROM treasuries
`);
const results =
  tRes?.[0]?.results ||
  tRes?.results ||
  (Array.isArray(tRes) ? tRes.find((x) => x.results)?.results : null) ||
  [];

if (!results.length) {
  console.error('No treasuries on remote. Raw:', JSON.stringify(tRes).slice(0, 500));
  process.exit(1);
}

const byKey = new Map();
for (const t of results) {
  const key = `${t.project_id}|${t.network_id}|${normAddr(t.network_id, t.address)}`;
  byKey.set(key, t);
}
console.log('Remote treasuries:', results.length);

let inserted = 0;
let skipped = 0;
const maxBlock = new Map(); // treasuryId -> block

for (const row of rows) {
  const projectId = row.project_id;
  const networkId = row.network_id;
  const address = normAddr(networkId, row.treasury);
  const key = `${projectId}|${networkId}|${address}`;
  const treasury = byKey.get(key);

  if (!treasury) {
    console.warn(`SKIP line ${row._line}: no treasury for ${key}`);
    skipped++;
    continue;
  }

  const decimals = getTokenDecimals(networkId, 'USDT');
  const tokenAddress = getTokenAddress(networkId, 'USDT');
  const eventIndex =
    row['event_index(optional)'] === '' || row['event_index(optional)'] == null
      ? 0
      : Number(row['event_index(optional)']);
  const blockNumber = Number(row.block_number);
  const txHash = String(row.tx_hash).trim();
  const uid = transferUid(networkId, txHash, eventIndex);
  const raw = amountRaw(row.amount, decimals);
  const amount = String(Number(row.amount));

  const sql = `
    INSERT OR IGNORE INTO transfers (
      treasury_id, project_id, network_id, token, token_address,
      donor, amount_raw, amount, tx_hash, block_number, event_index,
      timestamp, transfer_uid, created_at
    ) VALUES (
      ${treasury.id},
      ${quote(projectId)},
      ${quote(networkId)},
      'USDT',
      ${quote(tokenAddress)},
      ${quote(row.donor)},
      ${quote(raw)},
      ${quote(amount)},
      ${quote(txHash.toLowerCase())},
      ${blockNumber},
      ${eventIndex},
      0,
      ${quote(uid)},
      datetime('now')
    );
  `;

  remoteSql(sql);
  inserted++;

  const prev = maxBlock.get(treasury.id) || 0;
  if (blockNumber > prev) maxBlock.set(treasury.id, blockNumber);
}

console.log('Insert attempts:', inserted, 'skipped rows:', skipped);

// park sync_state near tip-ish: use max csv block per treasury (user should later bump to chain tip)
for (const [treasuryId, block] of maxBlock.entries()) {
  remoteSql(`
    INSERT INTO sync_state (
      treasury_id, scan_from_block, last_scanned_block, last_finalized_block,
      last_sync_at, status, error
    ) VALUES (
      ${treasuryId}, ${block}, ${block}, ${block}, datetime('now'), 'SUCCESS', NULL
    )
    ON CONFLICT(treasury_id) DO UPDATE SET
      scan_from_block = excluded.scan_from_block,
      last_scanned_block = excluded.last_scanned_block,
      last_finalized_block = excluded.last_finalized_block,
      last_sync_at = excluded.last_sync_at,
      status = 'SUCCESS',
      error = NULL;
  `);
  console.log('parked treasury', treasuryId, 'at', block);
}

const check = remoteSql(`
  SELECT network_id, project_id, COUNT(*) AS tx,
         ROUND(SUM(CAST(amount AS REAL)), 2) AS total
  FROM transfers
  GROUP BY network_id, project_id
  ORDER BY network_id, project_id;
`);
console.log('totals:', JSON.stringify(check, null, 2).slice(0, 2000));
console.log('DONE');
