/**
 * ClassChain Indexer
 *
 * Network Resolver
 *
 * Uses the existing ClassChain shared configuration.
 *
 * IMPORTANT:
 * No network configuration is defined here.
 */

import {
    getFullNetwork,
    getTokenAddress,
    getTokenDecimals
} from '../../../shared/network-config.js';


export class NetworkResolver {

    resolve(networkId) {

        const network =
            getFullNetwork(networkId);

        if (!network) {

            throw new Error(
                `Unknown network: ${networkId}`
            );
        }

        return network;
    }


    resolveToken(
        networkId,
        symbol = 'USDT'
    ) {

        const tokenAddress =
            getTokenAddress(
                networkId,
                symbol
            );

        const decimals =
            getTokenDecimals(
                networkId,
                symbol
            );


        if (!tokenAddress) {

            throw new Error(
                `Token ${symbol} is not configured for network ${networkId}`
            );
        }


        if (
            decimals === undefined ||
            decimals === null
        ) {

            throw new Error(
                `Decimals for ${symbol} are not configured for network ${networkId}`
            );
        }


        return {

            symbol,

            address:
                tokenAddress,

            decimals

        };
    }
}
