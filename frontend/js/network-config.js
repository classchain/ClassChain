/**
 * ClassChain Frontend Network Adapter
 *
 * Source of Truth:
 * ../../shared/network-config.js
 */

import {

    NETWORKS as SHARED_NETWORKS,
    DEPLOYMENTS,

    getNetworkById,
    getDeployment,
    getFullNetwork,

    getTokenAddress,
    getTokenDecimals,

    getRpcUrls

} from '../../shared/network-config.js';


const NETWORKS = {};


for (
    const networkId of
    Object.keys(SHARED_NETWORKS)
) {

    const network =
        SHARED_NETWORKS[
            networkId
        ];

    const deployment =
        DEPLOYMENTS[
            networkId
        ] || {};

    const usdt =
        deployment.tokens?.USDT ||
        {};


    NETWORKS[networkId] = {

        /*
         * Canonical
         */

        id:
            network.id,

        name:
            network.name,

        type:
            network.type,

        chainId:
            network.chainId,


        /*
         * RPC
         */

        rpcUrl:
            network.rpcUrl,

        rpcFallbacks:
            network.rpcFallbacks || [],


        /*
         * Compatibility
         */

        rpc:
            network.rpcUrl,

        fullHost:
            network.type === 'TVM'
                ? network.rpcUrl
                : null,


        /*
         * Explorer
         */

        explorerUrl:
            network.explorerUrl,


        /*
         * Deployment
         */

        factoryAddress:
            deployment.factoryAddress ||
            '',

        usdtAddress:
            usdt.address ||
            '',

        tokenDecimals:
            usdt.decimals ??
            6,

        status:
            deployment.status ||
            'pending',


        /*
         * Canonical fund key
         */

        fundsKey:
            networkId,


        /*
         * Compatibility موقت
         *
         * بعداً حذف می‌شود.
         */

        fundsKeys: [
            networkId
        ]
    };
}


export const ClassChainNetworkConfig = {

    NETWORKS,

    DEPLOYMENTS,


    getNetwork:

        getNetworkById,


    getDeployment,


    getFullNetwork,


    getTokenAddress,


    getTokenDecimals,


    getRpcUrls
};


/*
 * Compatibility با کد فعلی Frontend
 */

window.ClassChainNetworkConfig =
    ClassChainNetworkConfig;
