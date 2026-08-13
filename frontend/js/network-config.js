/**
 * ClassChain Frontend Network Adapter
 *
 * Source of Truth:
 * ../../shared/network-config.js
 */

(function () {

    const api = {

        status: 'loading',

        error: null,

        NETWORKS: {},

        DEPLOYMENTS: {},

        ready: null

    };


    function buildNetworks(shared) {

        api.NETWORKS = {};

        api.DEPLOYMENTS =
            shared.DEPLOYMENTS;


        for (
            const networkId of
            Object.keys(
                shared.NETWORKS
            )
        ) {

            const network =
                shared.NETWORKS[
                    networkId
                ];

            const deployment =
                shared.DEPLOYMENTS[
                    networkId
                ] || {};

            const usdt =
                deployment.tokens?.USDT ||
                {};


            api.NETWORKS[networkId] = {

                id:
                    network.id,

                name:
                    network.name,

                type:
                    network.type,

                chainId:
                    network.chainId,

                rpcUrl:
                    network.rpcUrl,

                rpcFallbacks:
                    network.rpcFallbacks || [],

                explorerUrl:
                    network.explorerUrl,

                nativeToken:
                    network.nativeToken,

                isTestnet:
                    network.isTestnet,

                color:
                    network.color,

                icon:
                    network.icon,


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

                enabled:
                    deployment.status ===
                    'active',


                /*
                 * فقط یک Canonical key
                 */
                fundsKey:
                    networkId,


                /*
                 * Compatibility موقت.
                 *
                 * بعد از انتقال همه Consumerها
                 * حذف خواهد شد.
                 */
                fundsKeys: [
                    networkId
                ],


                /*
                 * UI metadata
                 * متعلق به Frontend است.
                 */

                wallet:
                    network.type === 'EVM'
                        ? 'metamask'
                        : 'tronlink',

                walletName:
                    network.type === 'EVM'
                        ? 'MetaMask'
                        : 'TronLink',

                buttonLabel:
                    network.type === 'EVM'
                        ? 'اتصال MetaMask و پرداخت'
                        : 'اتصال TronLink و پرداخت'
            };
        }
    }


    api.ready =
        import(
            '../../shared/network-config.js'
        )
        .then(
            shared => {

                buildNetworks(
                    shared
                );

                api.status =
                    'ready';

                return api;
            }
        )
        .catch(
            error => {

                api.status =
                    'error';

                api.error =
                    error;

                console.error(
                    '[NetworkConfig] Failed:',
                    error
                );

                throw error;
            }
        );


    api.getNetwork =
        function (id) {

            return (
                api.NETWORKS[id] ||
                null
            );
        };


    api.getActiveNetworks =
        function () {

            return Object.values(
                api.NETWORKS
            )
            .filter(
                network =>
                    network.status ===
                    'active'
            );
        };


    api.getReadNetworks =
        function () {

            return Object.values(
                api.NETWORKS
            )
            .filter(
                network =>
                    network.status === 'active' &&
                    network.enabled &&
                    network.usdtAddress &&
                    network.rpcUrl
            );
        };


    api.getDonationNetworks =
        function () {

            return Object.values(
                api.NETWORKS
            );
        };


    api.getTokenAddress =
        function (
            networkId,
            symbol = 'USDT'
        ) {

            const network =
                api.NETWORKS[
                    networkId
                ];

            if (
                symbol !== 'USDT'
            ) {
                return null;
            }

            return (
                network?.usdtAddress ||
                null
            );
        };


    api.getTokenDecimals =
        function (
            networkId,
            symbol = 'USDT'
        ) {

            const network =
                api.NETWORKS[
                    networkId
                ];

            if (
                symbol !== 'USDT'
            ) {
                return 18;
            }

            return (
                network?.tokenDecimals ??
                18
            );
        };


    api.getRpcUrls =
        function (
            networkId
        ) {

            const network =
                api.NETWORKS[
                    networkId
                ];

            if (!network) {
                return [];
            }

            return [
                network.rpcUrl,
                ...(network.rpcFallbacks || [])
            ]
            .filter(Boolean);
        };


    api.getFullNetwork =
        function (
            networkId
        ) {

            const network =
                api.NETWORKS[
                    networkId
                ];

            return network
                ? { ...network }
                : null;
        };


    window.ClassChainNetworkConfig =
        api;

})();
