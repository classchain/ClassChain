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
            shared.DEPLOYMENTS || {};


        for (
            const networkId of
            Object.keys(
                shared.NETWORKS || {}
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
                deployment.tokens?.usdt ||
                {};

            const explorerBase =
                network.explorerUrl ||
                network.explorer ||
                '';


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

                // Compatibility alias for older consumers (dashboard / manage-fund)
                rpc:
                    network.rpcUrl,

                rpcFallbacks:
                    network.rpcFallbacks || [],

                explorerUrl:
                    explorerBase,

                /*
                 * Alias used by donate.js templates
                 * (net.explorer / tx links).
                 */
                explorer:
                    explorerBase,

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
                    null,

                usdtAddress:
                    usdt.address ||
                    null,

                tokenDecimals:
                    usdt.decimals != null
                        ? usdt.decimals
                        : 6,

                status:
                    deployment.status ||
                    'pending',

                enabled:
                    deployment.enabled !== false &&
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
                        : 'TronLink'

                // buttonLabel intentionally omitted —
                // donate UI uses DonateI18n (_t) so it stays multi-language
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


    /**
     * شبکه‌های active.
     * مورد استفاده داشبورد و manage-fund.
     */
    api.getActiveNetworks =
        function () {

            return Object.values(
                api.NETWORKS
            )
            .filter(
                network =>
                    network.status ===
                    'active' &&
                    network.enabled &&
                    network.factoryAddress
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


    /**
     * Absolute explorer URL for a transaction hash.
     * EVM:  {explorer}/tx/{hash}
     * TVM:  {explorer}/#/transaction/{hash}
     */
    api.getTxUrl =
        function (networkId, txHash) {

            const network =
                api.NETWORKS[networkId];

            if (!network || !txHash) {
                return null;
            }

            const base =
                (network.explorerUrl || network.explorer || '')
                    .replace(/\/$/, '');

            if (!base) {
                return null;
            }

            if (network.type === 'TVM') {
                return `${base}/#/transaction/${txHash}`;
            }

            return `${base}/tx/${txHash}`;
        };


    api.getExplorerTxUrl =
        function (
            networkId,
            txHash
        ) {

            return api.getTxUrl(
                networkId,
                txHash
            );
        };


    window.ClassChainNetworkConfig =
        api;

})();
