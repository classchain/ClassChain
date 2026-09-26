/**
 * WalletLinkService — request / verify Telegram ↔ wallet links.
 * EVM: recovers address from personal_sign via @noble/secp256k1 + keccak.
 * Tron: signature verification is best-effort; donor must match linked address format.
 */

import { WalletLinkRepository } from '../db/WalletLinkRepository.js';

function randomNonce(bytes = 16) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isEvmNetwork(networkId) {
    const id = String(networkId || '').toLowerCase();
    return id.includes('polygon') || id.includes('eth') || id.includes('amoy') || id.startsWith('evm');
}

function isTronNetwork(networkId) {
    const id = String(networkId || '').toLowerCase();
    return id.includes('tron') || id.includes('nile');
}

function normalizeEvmAddress(addr) {
    if (!addr || typeof addr !== 'string') return null;
    const a = addr.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return null;
    return a.toLowerCase();
}

/** Minimal keccak256 for Ethereum personal_sign recovery (uses Web Crypto when available is not enough — use noble if present). */
async function recoverEvmAddress(message, signature) {
    // Dynamic import so worker still loads if package missing during early deploy
    const { secp256k1 } = await import('@noble/secp256k1');
    const { keccak_256 } = await import('@noble/hashes/sha3.js');

    const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
    const msgHash = keccak_256(new TextEncoder().encode(prefix + message));

    let sig = signature.startsWith('0x') ? signature.slice(2) : signature;
    if (sig.length !== 130) throw new Error('invalid signature length');
    const r = sig.slice(0, 64);
    const s = sig.slice(64, 128);
    let v = parseInt(sig.slice(128, 130), 16);
    if (v >= 27) v -= 27;
    if (v !== 0 && v !== 1) throw new Error('invalid signature v');

    const sigBytes = new Uint8Array(64);
    for (let i = 0; i < 32; i++) {
        sigBytes[i] = parseInt(r.slice(i * 2, i * 2 + 2), 16);
        sigBytes[32 + i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    }

    const pub = secp256k1.Signature.fromCompact(sigBytes)
        .addRecoveryBit(v)
        .recoverPublicKey(msgHash)
        .toRawBytes(false);
    const hash = keccak_256(pub.slice(1));
    const addr = '0x' + [...hash.slice(12)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return addr.toLowerCase();
}

export class WalletLinkService {

    constructor(db) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
        this.repo = new WalletLinkRepository(db);
        this.nonceTtlSec = 10 * 60;
    }

    async requestLink({ telegramUserId, networkId }) {
        if (!telegramUserId) throw new Error('telegram_user_id is required');
        if (!networkId) throw new Error('network_id is required');

        const nonce = randomNonce(16);
        const expiresAt = Math.floor(Date.now() / 1000) + this.nonceTtlSec;
        await this.repo.createNonce({
            nonce,
            telegramUserId: String(telegramUserId),
            networkId: String(networkId),
            expiresAt,
        });

        const message =
            `ClassChain wallet link\n` +
            `telegram_user_id: ${telegramUserId}\n` +
            `network_id: ${networkId}\n` +
            `nonce: ${nonce}\n` +
            `expires_at: ${expiresAt}`;

        return { nonce, message, expires_at: expiresAt, network_id: networkId };
    }

    async verifyLink({ telegramUserId, networkId, donor, signature, message, nonce }) {
        if (!telegramUserId || !networkId || !donor || !signature || !message) {
            throw new Error('telegram_user_id, network_id, donor, signature, message are required');
        }

        const nonceRow = nonce
            ? await this.repo.getNonce(nonce)
            : null;

        // Prefer explicit nonce param; else parse from message
        let nonceValue = nonce;
        if (!nonceValue) {
            const m = String(message).match(/nonce:\s*([a-f0-9]+)/i);
            nonceValue = m ? m[1] : null;
        }
        const row = nonceValue ? await this.repo.getNonce(nonceValue) : nonceRow;
        if (!row) throw new Error('nonce not found');
        if (row.used) throw new Error('nonce already used');
        if (Number(row.expires_at) < Math.floor(Date.now() / 1000)) {
            throw new Error('nonce expired');
        }
        if (String(row.telegram_user_id) !== String(telegramUserId)) {
            throw new Error('nonce telegram mismatch');
        }
        if (String(row.network_id) !== String(networkId)) {
            throw new Error('nonce network mismatch');
        }

        let recovered = null;
        let normalizedDonor = String(donor).trim();

        if (isEvmNetwork(networkId)) {
            normalizedDonor = normalizeEvmAddress(normalizedDonor);
            if (!normalizedDonor) throw new Error('invalid EVM donor address');
            recovered = await recoverEvmAddress(message, signature);
            if (recovered !== normalizedDonor) {
                throw new Error(`signature recovers ${recovered}, expected ${normalizedDonor}`);
            }
        } else if (isTronNetwork(networkId)) {
            // Tron: accept base58 donor; full sig verify can be added later
            if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizedDonor)) {
                throw new Error('invalid Tron donor address');
            }
            recovered = normalizedDonor;
        } else {
            throw new Error(`unsupported network_id: ${networkId}`);
        }

        await this.repo.markNonceUsed(nonceValue);
        const link = await this.repo.upsertLink({
            telegramUserId: String(telegramUserId),
            donor: normalizedDonor,
            networkId: String(networkId),
            signature,
            verifiedAt: Math.floor(Date.now() / 1000),
        });

        return { ok: true, link, recovered_address: recovered };
    }

    async getStatus(telegramUserId) {
        const links = await this.repo.listByTelegram(String(telegramUserId));
        return { telegram_user_id: String(telegramUserId), links };
    }

    async unlink({ telegramUserId, networkId, donor = null }) {
        return this.repo.deleteLink({
            telegramUserId: String(telegramUserId),
            networkId: String(networkId),
            donor,
        });
    }
}
