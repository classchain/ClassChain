/**
 * One-shot sync for Project 1004 / TRON Nile
 *
 * Usage (from repo root):
 *   npx wrangler d1 migrations apply classchain-indexer --local
 *   node indexer/scripts/sync-once-1004.mjs
 *
 * Optional env:
 *   SCAN_FROM_BLOCK=51000000   # avoid full history on Nile
 *   SAFE_CONFIRMATIONS=20
 *   OVERLAP=10
 *
 * Requires wrangler + D1 binding name "DB" (see wrangler.jsonc).
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

const PROJECT_ID = '1004';
const NETWORK_ID = 'tron_nile';
const EXPECTED_TREASURY =
    'TF8oUKp9G9yrzxmj9Dk9MKw9hpnRrLJGRp';

const SCAN_FROM_BLOCK = Number(
    process.env.SCAN_FROM_BLOCK || 0
);

const SAFE_CONFIRMATIONS = Number(
    process.env.SAFE_CONFIRMATIONS || 20
);

const OVERLAP = Number(
    process.env.OVERLAP || 10
);


function loadProjects1004Only() {

    const projectsPath = path.join(
        repoRoot,
        'frontend/data/Projects.json'
    );

    if (!fs.existsSync(projectsPath)) {
        throw new Error(
            `Projects.json not found: ${projectsPath}`
        );
    }

    const registry = JSON.parse(
        fs.readFileSync(projectsPath, 'utf8')
    );

    if (!Array.isArray(registry?.features)) {
        throw new Error(
            'Projects.json must contain features[]'
        );
    }

    const features = registry.features.filter(
        (feature) =>
            String(feature?.attributes?.ProjectID) ===
            PROJECT_ID
    );

    if (features.length === 0) {
        throw new Error(
            `Project ${PROJECT_ID} not found in Projects.json`
        );
    }

    const fund =
        features[0]?.attributes?.funds?.[NETWORK_ID];

    if (!fund?.address) {
        throw new Error(
            `Project ${PROJECT_ID} has no funds.${NETWORK_ID}`
        );
    }

    if (fund.address !== EXPECTED_TREASURY) {
        console.warn(
            `[warn] Expected treasury ${EXPECTED_TREASURY}, ` +
            `found ${fund.address}`
        );
    }

    return {
        ...registry,
        features
    };
}


async function assertResult(db) {

    const treasury = await db
        .prepare(`
            SELECT *
            FROM treasuries
            WHERE project_id = ?
              AND network_id = ?
            LIMIT 1
        `)
        .bind(PROJECT_ID, NETWORK_ID)
        .first();

    if (!treasury) {
        throw new Error(
            'Treasury row was not created'
        );
    }

    const transfers = await db
        .prepare(`
            SELECT donor, amount, amount_raw, tx_hash, transfer_uid
            FROM transfers
            WHERE project_id = ?
              AND network_id = ?
            ORDER BY block_number ASC, event_index ASC
        `)
        .bind(PROJECT_ID, NETWORK_ID)
        .all();

    const rows = transfers?.results || [];

    const dup = await db
        .prepare(`
            SELECT transfer_uid, COUNT(*) AS c
            FROM transfers
            WHERE project_id = ?
              AND network_id = ?
            GROUP BY transfer_uid
            HAVING c > 1
        `)
        .bind(PROJECT_ID, NETWORK_ID)
        .all();

    const state = await db
        .prepare(`
            SELECT *
            FROM sync_state
            WHERE treasury_id = ?
        `)
        .bind(treasury.id)
        .first();

    console.log('\n=== VERIFY ===');
    console.log('treasury:', {
        id: treasury.id,
        address: treasury.address,
        active: treasury.active
    });
    console.log('transfers count:', rows.length);
    console.log('transfers sample:', rows.slice(0, 5));
    console.log('duplicates:', dup?.results || []);
    console.log('sync_state:', state);

    if ((dup?.results || []).length > 0) {
        throw new Error('Duplicate transfer_uid detected');
    }

    if (!state || state.status !== 'SUCCESS') {
        throw new Error(
            `sync_state not SUCCESS: ${state?.status} ${state?.error || ''}`
        );
    }

    /*
     * Soft check for the known 10 USDT case.
     * amount is stored as normalized string from adapter.
     */
    const ten = rows.filter(
        (r) =>
            String(r.amount) === '10' ||
            String(r.amount_raw) === '10000000'
    );

    if (ten.length === 0 && rows.length === 0) {
        console.warn(
            '[warn] No transfers indexed. Check SCAN_FROM_BLOCK and on-chain history.'
        );
    } else if (ten.length > 0) {
        console.log(
            `[ok] Found ${ten.length} transfer(s) matching ~10 USDT`
        );
    }
}


async function main() {

    const registryJson = loadProjects1004Only();

    const { env, dispose } = await getPlatformProxy({
        configPath: path.join(repoRoot, 'wrangler.jsonc')
    });

    try {
        const db = env.DB;

        if (!db) {
            throw new Error(
                'D1 binding DB is missing. Check wrangler.jsonc'
            );
        }

        const runner = new IndexerRunner({
            projectRegistry: new ProjectRegistry(
                registryJson
            ),
            networkResolver: new NetworkResolver(),
            treasuryRepository: new TreasuryRepository(db),
            transferRepository: new TransferRepository(db),
            syncStateRepository: new SyncStateRepository(db),
            adapterFactory: createAdapter,
            networkIds: [NETWORK_ID]
        });

        console.log(
            `Running one-shot sync for project ${PROJECT_ID} / ${NETWORK_ID}`
        );
        console.log({
            SCAN_FROM_BLOCK,
            SAFE_CONFIRMATIONS,
            OVERLAP
        });

        const summary = await runner.runOnce({
            scanFromBlock: SCAN_FROM_BLOCK,
            safeConfirmations: SAFE_CONFIRMATIONS,
            overlap: OVERLAP
        });

        console.log('\n=== RUN SUMMARY ===');
        console.log(
            JSON.stringify(summary, null, 2)
        );

        await assertResult(db);

        /*
         * Second pass: must not insert duplicates
         */
        console.log('\n=== RE-RUN (dedup check) ===');
        const summary2 = await runner.runOnce({
            scanFromBlock: SCAN_FROM_BLOCK,
            safeConfirmations: SAFE_CONFIRMATIONS,
            overlap: OVERLAP
        });
        console.log(
            JSON.stringify(
                {
                    inserted: summary2.inserted,
                    transfers: summary2.transfers,
                    synced: summary2.synced,
                    failed: summary2.failed
                },
                null,
                2
            )
        );

        if (summary2.inserted > 0) {
            console.warn(
                '[warn] Second run inserted rows; overlap/dedup may need review'
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
