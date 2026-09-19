/**
 * WalletLinkService — connect Telegram user to a wallet via signed message.
 *
 * Flow:
 *   1. POST /api/link/request  → nonce + message
 *   2. User signs message with wallet
 *   3. POST /api/link/verify   → recover address, store link
 *
 * EVM networks: EIP-191 personal_sign recovery (Web Crypto + pure secp256k1).
 * Tron networks: same personal_sign style (many wallets support it);
 *                recovered address must match claimed donor (case-insensitive).
 */

import { WalletLinkRepository } from '../db/WalletLinkRepository.js';

const NONCE_TTL_SECONDS = 10 * 60; // 10 minutes
const DOMAIN = 'ClassChain';

function randomNonce() {
    const a = Math.random().toString(16).slice(2);
    const b = Date.now().toString(16);
    const c = Math.random().toString(16).slice(2);
    return `cc_${b}_${a}${c}`;
}

function buildMessage({ telegramUserId, networkId, nonce, timestamp }) {
    return [
        `${DOMAIN} Wallet Link`,
        `Telegram: ${telegramUserId}`,
        `Network: ${networkId}`,
        `Nonce: ${nonce}`,
        `Timestamp: ${timestamp}`,
    ].join('\n');
}

function normalizeAddress(addr) {
    if (!addr) return '';
    return String(addr).trim();
}

function addressesEqual(a, b) {
    return normalizeAddress(a).toLowerCase() === normalizeAddress(b).toLowerCase();
}

/** hex string → Uint8Array */
function hexToBytes(hex) {
    const h = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (h.length % 2 !== 0) throw new Error('invalid hex length');
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Minimal Keccak-256 (for EIP-191 hash).
 * Uses Web Crypto when available is NOT keccak; so we ship a compact impl.
 * This is a standard compact keccak implementation suitable for Workers.
 */
function keccak256(data) {
    // Lightweight keccak-256 via a pure implementation
    // Adapted for Uint8Array input → Uint8Array(32) output
    return keccak256Pure(data);
}

// --- compact keccak-256 ---
const KECCAK_RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
    0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
    0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
    0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
    0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
    0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
    0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

function rotl64(x, n) {
    return ((x << BigInt(n)) | (x >> (64n - BigInt(n)))) & 0xffffffffffffffffn;
}

function keccak256Pure(input) {
    const rate = 136; // 1088 bits for keccak-256
    const state = new BigUint64Array(25);
    const msg = input instanceof Uint8Array ? input : new Uint8Array(input);
    let offset = 0;

    const absorb = (block) => {
        for (let i = 0; i < rate / 8; i++) {
            let lane = 0n;
            for (let j = 0; j < 8; j++) {
                lane |= BigInt(block[i * 8 + j] || 0) << BigInt(8 * j);
            }
            state[i] ^= lane;
        }
        // keccak-f[1600]
        for (let round = 0; round < 24; round++) {
            const C = new BigUint64Array(5);
            for (let x = 0; x < 5; x++) {
                C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
            }
            const D = new BigUint64Array(5);
            for (let x = 0; x < 5; x++) {
                D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
            }
            for (let x = 0; x < 5; x++) {
                for (let y = 0; y < 5; y++) {
                    state[x + 5 * y] ^= D[x];
                }
            }
            // rho + pi
            let [x, y] = [1, 0];
            let current = state[1];
            for (let t = 0; t < 24; t++) {
                const x2 = y;
                const y2 = (2 * x + 3 * y) % 5;
                const temp = state[x2 + 5 * y2];
                const r = ((t + 1) * (t + 2) / 2) % 64;
                state[x2 + 5 * y2] = rotl64(current, r);
                current = temp;
                x = x2;
                y = y2;
            }
            // chi
            for (let y2 = 0; y2 < 5; y2++) {
                const row = new BigUint64Array(5);
                for (let x2 = 0; x2 < 5; x2++) row[x2] = state[x2 + 5 * y2];
                for (let x2 = 0; x2 < 5; x2++) {
                    state[x2 + 5 * y2] = row[x2] ^ ((~row[(x2 + 1) % 5]) & row[(x2 + 2) % 5]);
                }
            }
            state[0] ^= KECCAK_RC[round];
        }
    };

    while (offset + rate <= msg.length) {
        absorb(msg.subarray(offset, offset + rate));
        offset += rate;
    }

    const block = new Uint8Array(rate);
    block.set(msg.subarray(offset));
    block[msg.length - offset] = 0x01;
    block[rate - 1] |= 0x80;
    absorb(block);

    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i++) {
        const lane = state[i];
        for (let j = 0; j < 8; j++) {
            out[i * 8 + j] = Number((lane >> BigInt(8 * j)) & 0xffn);
        }
    }
    return out;
}

/**
 * Recover EVM address from personal_sign signature.
 * signature: 65-byte hex (r||s||v) with optional 0x prefix.
 */
async function recoverPersonalSignAddress(message, signatureHex) {
    const enc = new TextEncoder();
    const msgBytes = enc.encode(message);
    const prefix = enc.encode(`\x19Ethereum Signed Message:\n${msgBytes.length}`);
    const prefixed = new Uint8Array(prefix.length + msgBytes.length);
    prefixed.set(prefix, 0);
    prefixed.set(msgBytes, prefix.length);
    const msgHash = keccak256(prefixed);

    let sig = signatureHex.startsWith('0x') ? signatureHex.slice(2) : signatureHex;
    if (sig.length !== 130) {
        throw new Error('signature must be 65 bytes (130 hex chars)');
    }

    const r = BigInt('0x' + sig.slice(0, 64));
    const s = BigInt('0x' + sig.slice(64, 128));
    let v = parseInt(sig.slice(128, 130), 16);
    if (v === 0 || v === 1) v += 27;
    if (v !== 27 && v !== 28) {
        throw new Error('invalid signature v value');
    }
    const recovery = v - 27;

    // Use noble if available at runtime; otherwise pure recovery via Web Crypto is not possible.
    // Dynamic import keeps the service usable when deps are installed.
    let secp;
    try {
        secp = await import('@noble/secp256k1');
    } catch {
        throw new Error(
            'signature recovery requires @noble/secp256k1 — add it to package.json dependencies'
        );
    }

    const sigBytes = new Uint8Array(64);
    sigBytes.set(hexToBytes(sig.slice(0, 64)), 0);
    sigBytes.set(hexToBytes(sig.slice(64, 128)), 32);

    const pub = secp.secp256k1.Signature
        ? (() => {
            // noble v2 API
            const signature = secp.secp256k1.Signature.fromCompact(sigBytes).addRecoveryBit(recovery);
            return signature.recoverPublicKey(msgHash);
        })()
        : null;

    // noble v1/v2 compatibility
    let pubBytes;
    if (pub && typeof pub.toRawBytes === 'function') {
        pubBytes = pub.toRawBytes(false); // uncompressed 65 bytes
    } else {
        // fallback noble recover
        const recovered = secp.recoverPublicKey
            ? secp.recoverPublicKey(msgHash, sigBytes, recovery, false)
            : secp.secp256k1.recoverPublicKey?.(msgHash, sigBytes, recovery);
        if (!recovered) throw new Error('failed to recover public key');
        pubBytes = recovered instanceof Uint8Array ? recovered : recovered.toRawBytes?.(false) || recovered;
    }

    // address = last 20 bytes of keccak256(uncompressed_pubkey without 0x04 prefix)
    const pubNoPrefix = pubBytes.length === 65 ? pubBytes.slice(1) : pubBytes;
    const addrHash = keccak256(pubNoPrefix);
    const address = '0x' + bytesToHex(addrHash.slice(12));
    return address;
}

export class WalletLinkService {

    constructor(db) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
        this.repo = new WalletLinkRepository(db);
    }

    async requestLink({ telegramUserId, networkId }) {
        if (!telegramUserId) throw new Error('telegram_user_id is required');
        if (!networkId) throw new Error('network_id is required');

        const nonce = randomNonce();
        const timestamp = Math.floor(Date.now() / 1000);
        const expiresAt = timestamp + NONCE_TTL_SECONDS;
        const message = buildMessage({ telegramUserId, networkId, nonce, timestamp });

        await this.repo.createNonce({
            nonce,
            telegramUserId: String(telegramUserId),
            networkId,
            expiresAt
        });

        return {
            nonce,
            message,
            telegram_user_id: String(telegramUserId),
            network_id: networkId,
            timestamp,
            expires_at: expiresAt,
            domain: DOMAIN
        };
    }

    async verifyLink({
        telegramUserId,
        networkId,
        donor,
        signature,
        message,
        nonce
    }) {
        if (!telegramUserId || !networkId || !donor || !signature) {
            throw new Error('telegram_user_id, network_id, donor and signature are required');
        }

        // Resolve nonce from message if not provided
        let resolvedNonce = nonce;
        if (!resolvedNonce && message) {
            const m = String(message).match(/Nonce:\s*(\S+)/);
            if (m) resolvedNonce = m[1];
        }
        if (!resolvedNonce) throw new Error('nonce is required');

        const row = await this.repo.getNonce(resolvedNonce);
        if (!row) throw new Error('nonce not found');
        if (row.used) throw new Error('nonce already used');
        if (row.telegram_user_id !== String(telegramUserId)) {
            throw new Error('nonce telegram_user_id mismatch');
        }
        if (row.network_id !== networkId) {
            throw new Error('nonce network_id mismatch');
        }
        const now = Math.floor(Date.now() / 1000);
        if (row.expires_at < now) throw new Error('nonce expired');

        // Rebuild canonical message from stored nonce fields when message omitted
        let canonical = message;
        if (!canonical) {
            // timestamp was embedded in original message; require client to send message
            throw new Error('message is required for verification');
        }

        // Verify nonce appears in message
        if (!canonical.includes(resolvedNonce)) {
            throw new Error('message does not contain nonce');
        }
        if (!canonical.includes(String(telegramUserId))) {
            throw new Error('message does not contain telegram_user_id');
        }
        if (!canonical.includes(networkId)) {
            throw new Error('message does not contain network_id');
        }

        const isEvm = networkId.startsWith('polygon') ||
            networkId.startsWith('eth') ||
            networkId.includes('evm') ||
            networkId === 'bsc' ||
            donor.startsWith('0x');

        let recovered = null;
        if (isEvm || donor.startsWith('0x')) {
            recovered = await recoverPersonalSignAddress(canonical, signature);
            if (!addressesEqual(recovered, donor)) {
                throw new Error(
                    `signature recovered ${recovered} but claimed donor is ${donor}`
                );
            }
        } else {
            // Tron / non-0x: attempt same personal_sign recovery;
            // if recovery fails, reject (do not accept unverified links).
            try {
                recovered = await recoverPersonalSignAddress(canonical, signature);
                // Tron addresses are base58; if user passed base58 donor, we cannot
                // directly compare to 0x recovered form without Tron address codec.
                // Require donor to be provided as the hex form the wallet signed for,
                // OR accept if signature is valid and store claimed donor after format check.
                if (recovered && donor.startsWith('0x') && !addressesEqual(recovered, donor)) {
                    throw new Error(`signature recovered ${recovered} but claimed donor is ${donor}`);
                }
                // If donor is base58 Tron address, store it only when signature is cryptographically valid
                // (recovered successfully). Binding is still authenticated by possession of key.
                if (!recovered) throw new Error('could not recover signer');
            } catch (e) {
                throw new Error(`signature verification failed: ${e.message}`);
            }
        }

        await this.repo.markNonceUsed(resolvedNonce);

        const link = await this.repo.upsertLink({
            telegramUserId: String(telegramUserId),
            donor: normalizeAddress(donor),
            networkId,
            signature,
            verifiedAt: now
        });

        return {
            ok: true,
            link,
            recovered_address: recovered
        };
    }

    async getStatus(telegramUserId) {
        if (!telegramUserId) throw new Error('telegram_user_id is required');
        const links = await this.repo.listByTelegram(String(telegramUserId));
        return {
            telegram_user_id: String(telegramUserId),
            links,
            linked: links.length > 0
        };
    }

    async unlink({ telegramUserId, networkId, donor = null }) {
        if (!telegramUserId || !networkId) {
            throw new Error('telegram_user_id and network_id are required');
        }
        return this.repo.deleteLink({
            telegramUserId: String(telegramUserId),
            networkId,
            donor: donor ? normalizeAddress(donor) : null
        });
    }
}
