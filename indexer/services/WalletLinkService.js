/**
 * WalletLinkService — connect Telegram user to a wallet via signed message.
 *
 * Flow:
 *   1. POST /api/link/request  → nonce + message
 *   2. User signs message with wallet (personal_sign)
 *   3. POST /api/link/verify   → recover address, store link
 *
 * EVM: EIP-191 personal_sign recovery via @noble/curves/secp256k1
 * Tron: same recovery path when donor is 0x-hex; base58 donors require
 *        a valid recoverable signature (key possession) then store claimed address.
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { WalletLinkRepository } from '../db/WalletLinkRepository.js';

const NONCE_TTL_SECONDS = 10 * 60;
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
    return String(addr || '').trim();
}

function addressesEqual(a, b) {
    const na = normalizeAddress(a);
    const nb = normalizeAddress(b);
    if (!na || !nb) return false;
    if (na.startsWith('0x') && nb.startsWith('0x')) {
        return na.toLowerCase() === nb.toLowerCase();
    }
    return na === nb;
}

function hexToBytes(hex) {
    const h = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (h.length % 2) throw new Error('invalid hex');
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Minimal keccak256 for address recovery (Ethereum). */
function keccak256(data) {
    // Use noble hashes if available via global path; inline via secp utils not available.
    // Prefer dynamic: Workers bundler resolves @noble/hashes
    throw new Error('keccak256 must be imported — see module init');
}
