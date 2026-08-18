export class TransferIdentity {

    static create({
        networkId,
        txHash,
        eventIndex
    }) {

        if (!networkId) {
            throw new Error('networkId is required');
        }

        if (!txHash) {
            throw new Error('txHash is required');
        }

        if (
            eventIndex === undefined ||
            eventIndex === null
        ) {
            throw new Error('eventIndex is required');
        }

        return [
            String(networkId).trim(),
            String(txHash).trim().toLowerCase(),
            String(eventIndex)
        ].join(':');
    }
}
