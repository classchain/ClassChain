import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProjectRegistry } from './ProjectRegistry.js';
import { NetworkResolver } from './NetworkResolver.js';
import { DiscoveryService } from './DiscoveryService.js';


/*
 * Resolve repository root from this file:
 *
 * indexer/
 *   core/
 *     discovery/
 *       Discovery.integration.test.js
 *
 * frontend/
 *   data/
 *     Projects.json
 */

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const projectsPath =
    path.resolve(
        __dirname,
        '../../../frontend/data/Projects.json'
    );


assert.ok(
    fs.existsSync(projectsPath),
    `Projects.json not found: ${projectsPath}`
);


const projects =
    JSON.parse(
        fs.readFileSync(
            projectsPath,
            'utf8'
        )
    );


assert.ok(
    Array.isArray(projects),
    'Projects.json must contain an array'
);


/*
 * Real ClassChain components.
 *
 * No mock.
 * No duplicated network configuration.
 */
const projectRegistry =
    new ProjectRegistry(projects);

const networkResolver =
    new NetworkResolver();

const discovery =
    new DiscoveryService(
        projectRegistry,
        networkResolver
);


const result =
    discovery.discover();


/*
 * Discovery must return both collections.
 */
assert.ok(
    Array.isArray(result.valid),
    'Discovery result.valid must be an array'
);

assert.ok(
    Array.isArray(result.invalid),
    'Discovery result.invalid must be an array'
);


/*
 * There must be at least one discovered treasury
 * in the current real registry.
 */
assert.ok(
    result.valid.length > 0,
    'No valid treasury discovered from Projects.json'
);


/*
 * Project 1004 is our current integration case.
 */
const project1004 =
    result.valid.filter(
        treasury =>
            treasury.projectId === '1004'
    );


assert.ok(
    project1004.length > 0,
    'Project 1004 was not discovered'
);


/*
 * Every valid treasury must have
 * a resolved active network.
 */
for (const treasury of result.valid) {

    assert.ok(
        treasury.network,
        `Missing network for ${treasury.projectId}/${treasury.networkId}`
    );

    assert.equal(
        treasury.network.status,
        'active',
        `Inactive network discovered: ${treasury.networkId}`
    );


    assert.ok(
        treasury.network.factoryAddress,
        `Missing factory for ${treasury.networkId}`
    );


    /*
     * Current ClassChain treasury policy:
     * only USDT is indexed.
     */
    assert.ok(
        treasury.token,
        `Missing token configuration for ${treasury.networkId}`
    );

    assert.equal(
        treasury.token.symbol,
        'USDT'
    );


    assert.ok(
        treasury.token.address,
        `Missing USDT address for ${treasury.networkId}`
    );


    assert.equal(
        treasury.token.decimals,
        6
    );


    assert.ok(
        treasury.address,
        `Missing treasury address for ${treasury.projectId}/${treasury.networkId}`
    );
}


/*
 * Scalability invariant:
 *
 * The number of discovered treasuries must come
 * from Projects.json, not from a hard-coded list.
 */
const registryTreasuries =
    projectRegistry.discoverTreasuries();


assert.equal(
    result.valid.length + result.invalid.length,
    registryTreasuries.length
);


/*
 * Print useful integration information.
 */
console.log(
    'Discovery integration test: PASS'
);

console.log(
    `Projects loaded: ${projects.length}`
);

console.log(
    `Treasuries discovered: ${registryTreasuries.length}`
);

console.log(
    `Valid treasuries: ${result.valid.length}`
);

console.log(
    `Invalid treasuries: ${result.invalid.length}`
);

console.log(
    'Project 1004 treasuries:'
);

for (const treasury of project1004) {

    console.log(
        `  ${treasury.networkId} -> ${treasury.address}`
    );
}
