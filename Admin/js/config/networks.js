/**
 * Admin Network Configuration Adapter
 *
 * Source of Truth:
 * ../../../shared/network-config.js
 */

import {
    NETWORKS,
    DEPLOYMENTS,

    FACTORY_ABI,
    TRON_FACTORY_ABI,

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

    FACTORY_ABI,
    TRON_FACTORY_ABI,

    getNetworkById,
    getDeployment,
    getFullNetwork,

    getTokenAddress,
    getTokenDecimals,

    getRpcUrls,
    getActiveNetworks
};


export const ACTIVE_NETWORKS =
    getActiveNetworks();


export function getExplorerUrl(
    networkId,
    address
) {

    const network =
        getNetworkById(networkId);

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
        getNetworkById(networkId);

    if (
        !network ||
        !address
    ) {
        return false;
    }

    if (
        network.type === 'EVM'
    ) {

        return /^0x[a-fA-F0-9]{40}$/
            .test(address);
    }

    if (
        network.type === 'TVM'
    ) {

        return /^T[a-zA-Z0-9]{33}$/
            .test(address);
    }

    return false;
}


export function toTronBase58(
    address
) {

    if (
        !address ||
        typeof address !== 'string'
    ) {
        return address;
    }

    if (
        /^T[a-zA-Z0-9]{33}$/
            .test(address)
    ) {
        return address;
    }

    try {

        const tronWeb =
            window.tronWeb;

        if (
            !tronWeb?.address
        ) {

            console.warn(
                'TronWeb در دسترس نیست.'
            );

            return address;
        }

        let hex =
            address;

        if (
            hex.startsWith('0x') ||
            hex.startsWith('0X')
        ) {

            hex =
                '41' +
                hex
                    .slice(2)
                    .toLowerCase();
        }

        return tronWeb.address.fromHex(
            hex
        );

    } catch (error) {

        console.warn(
            'خطا در تبدیل آدرس Tron:',
            address,
            error
        );

        return address;
    }
}
