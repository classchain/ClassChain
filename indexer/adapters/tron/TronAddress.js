import bs58 from 'bs58';


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