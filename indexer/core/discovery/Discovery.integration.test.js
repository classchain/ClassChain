import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProjectRegistry } from './ProjectRegistry.js';
import { NetworkResolver } from './NetworkResolver.js';
import { DiscoveryService } from './DiscoveryService.js';


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
    projects &&
    typeof projects === 'object' &&
    Array.isArray(projects.features),
    'Projects.json must contain a features array'
);


const projectRegistry =
    new ProjectRegistry(projects);

const networkResolver =
    new NetworkResolver();

const discovery =
    new DiscoveryService(
        projectRegistry,
        networkResolver
    );


const registryTreasuries =
    projectRegistry.discoverTreasuries();


const result =
    discovery.discover();


/*
 * Discovery result contract
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
 * Every registry treasury must end up
 * either valid or invalid.
 *
 * Nothing may silently disappear.
 */

assert.equal(
    result.valid.length + result.invalid.length,
    registryTreasuries.length
);


/*
 * Current registry must contain
 * at least one treasury.
 */

assert.ok(
    registryTreasuries.length > 0,
    'No treasury found in Projects.json'
);


/*
 * Project 1004 is our real integration case.
 */

const project1004 =
    result.valid.filter(
        treasury =>
            treasury.projectId === '1004'
    );


assert.ok(
    project1004.length > 0,
    'Project 1004 was not discovered as a valid treasury'
);


/*
 * Every valid treasury must have
 * a valid active network and USDT configuration.
 */

for (const treasury of result.valid) {

    assert.ok(
        treasury.projectId,
        'Valid treasury has no projectId'
    );

    assert.ok(
        treasury.networkId,
        'Valid treasury has no networkId'
    );

    assert.ok(
        treasury.address,
        `Valid treasury has no address: ${treasury.projectId}/${treasury.networkId}`
    );


    assert.ok(
        treasury.network,
        `Missing network configuration: ${treasury.networkId}`
    );

    assert.equal(
        treasury.network.status,
        'active',
        `Inactive network discovered: ${treasury.networkId}`
    );


    assert.ok(
        treasury.token,
        `Missing token configuration: ${treasury.networkId}`
    );

    assert.equal(
        treasury.token.symbol,
        'USDT'
    );

    assert.ok(
        treasury.token.address,
        `Missing USDT address: ${treasury.networkId}`
    );

    assert.equal(
        treasury.token.decimals,
        6
    );
}


/*
 * Invalid configuration must be isolated.
 *
 * If invalid entries exist, they must carry
 * an explicit status and error.
 */

for (const treasury of result.invalid) {

    assert.equal(
        treasury.status,
        'INVALID_CONFIGURATION'
    );

    assert.ok(
        treasury.error,
        `Invalid treasury has no error: ${treasury.projectId}/${treasury.networkId}`
    );
}


console.log(
    'Discovery integration test: PASS'
);

console.log(
    `Projects loaded: ${projects.features.length}`
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
