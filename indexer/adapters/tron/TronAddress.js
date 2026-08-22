import bs58 from 'bs58';
import crypto from 'node:crypto';


export function tronAddressToHex(address) {

    if (!address) {
        throw new Error(
            'TRON address is required'
        );
    }

    const decoded =
        Buffer.from(
            bs58.decode(address)
        );

    if (decoded.length !== 25) {
        throw new Error(
            'Invalid TRON address'
        );
    }

    // 21 bytes payload:
    // 41 + 20-byte address
    return decoded
        .subarray(0, 21)
        .toString('hex')
        .toLowerCase();
}


export function tronAddressToTopic(address) {

    const hex =
        tronAddressToHex(address);

    return hex
        .slice(-40)
        .padStart(64, '0')
        .toLowerCase();
}
export function tronHexToAddress(
    hexAddress
) {

    if (!hexAddress) {
        throw new Error(
            'TRON HEX address is required'
        );
    }

    let hex =
        String(hexAddress)
            .toLowerCase()
            .replace(/^0x/, '');

    if (hex.length === 64) {
        hex = hex.slice(-40);
    }

    if (hex.length !== 40) {
        throw new Error(
            'Invalid TRON HEX address'
        );
    }

    const payload =
        Buffer.from(
            `41${hex}`,
            'hex'
        );

    const hash1 =
        crypto
            .createHash('sha256')
            .update(payload)
            .digest();

    const hash2 =
        crypto
            .createHash('sha256')
            .update(hash1)
            .digest();

    const checksum =
        hash2.subarray(0, 4);

    return bs58.encode(
        Buffer.concat([
            payload,
            checksum
        ])
    );
}
