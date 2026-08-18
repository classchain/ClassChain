import {
    getNetworkById,
    getRpcUrls
} from '../../../shared/network-config.js';


export class TronClient {

    constructor(networkId) {

        if (!networkId) {
            throw new Error(
                'TRON networkId is required'
            );
        }

        const network =
            getNetworkById(networkId);

        if (!network) {
            throw new Error(
                `Unknown network: ${networkId}`
            );
        }

        if (network.type !== 'TVM') {
            throw new Error(
                `Network is not TRON/TVM: ${networkId}`
            );
        }

        this.networkId = networkId;

        this.network = network;

        this.rpcUrls =
            getRpcUrls(networkId);

        if (!this.rpcUrls.length) {
            throw new Error(
                `No RPC endpoint configured for ${networkId}`
            );
        }
    }


    async request(
        path,
        options = {}
    ) {

        let lastError = null;

        for (const rpc of this.rpcUrls) {

            try {

                const response =
                    await fetch(
                        `${rpc}${path}`,
                        {
                            method:
                                options.method || 'GET',

                            headers: {
                                'Content-Type':
                                    'application/json',

                                ...(options.headers || {})
                            },

                            body:
                                options.body
                                    ? JSON.stringify(options.body)
                                    : undefined
                        }
                    );


                if (!response.ok) {

                    throw new Error(
                        `TRON RPC HTTP ${response.status}`
                    );
                }


                return await response.json();

            } catch (error) {

                lastError = error;
            }
        }


        throw new Error(
            `All RPC endpoints failed for ${this.networkId}: ` +
            `${lastError?.message || 'Unknown error'}`
        );
    }


    async getNowBlock() {

        return this.request(
            '/wallet/getnowblock',
            {
                method: 'POST'
            }
        );
    }
}
