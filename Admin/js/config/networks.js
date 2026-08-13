/**
 * Admin Network Configuration Adapter
 *
 * Source of Truth:
 * ../../shared/network-config.js
 */

import {

    NETWORKS,
    DEPLOYMENTS,

    getNetworkById,
    getDeployment,
    getFullNetwork,

    getTokenAddress,
    getTokenDecimals,

    getRpcUrls,

    getActiveNetworks

} from '../../../shared/network-config.js';


export {

    NETWORKS,
    DEPLOYMENTS,

    getNetworkById,
    getDeployment,
    getFullNetwork,

    getTokenAddress,
    getTokenDecimals,

    getRpcUrls,

    getActiveNetworks

};


/*
 * Compatibility helpers used by Admin.
 */

export function getExplorerUrl(
    networkId,
    address
) {

    const network =
        getNetworkById(
            networkId
        );

    if (
        !network ||
        !address
    ) {
        return '#';
    }

    return (
        `${network.explorerUrl}/address/${address}`
    );
}


export function isValidAddress(
    address,
    networkId
) {

    const network =
        getNetworkById(
            networkId
        );

    if (
        !network ||
        !address
    ) {
        return false;
    }


    if (
        network.type ===
        'EVM'
    ) {

        return /^0x[a-fA-F0-9]{40}$/
            .test(address);
    }


    if (
        network.type ===
        'TVM'
    ) {

        return /^T[a-zA-Z0-9]{33}$/
            .test(address);
    }


    return false;
}


/*
 * Existing Admin code expects ACTIVE_NETWORKS
 * as an array.
 */

export const ACTIVE_NETWORKS =
    getActiveNetworks();
