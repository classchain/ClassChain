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

        const networks = shared.NETWORKS || {};
        const deployments = shared.DEPLOYMENTS || {};

        for (const networkId of Object.keys(networks)) {
            const network = networks[networkId];
            const deployment = deployments[networkId] || {};

            const explorerBase =
                network.explorerUrl ||
                network.explorer ||
                '';

            const tokens =
                deployment.tokens ||
                {};

            const usdt =
                tokens.USDT ||
                tokens.usdt ||
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

                status:
                    deployment.status || 'inactive',

                enabled:
                    deployment.enabled !== false &&
                    deployment.status === 'active',

                factoryAddress:
                    deployment.factoryAddress || null,

                usdtAddress:
                    usdt.address || null,

                tokenDecimals:
                    usdt.decimals != null
                        ? usdt.decimals
                        : 6,

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

                // buttonLabel intentionally omitted — UI uses DonateI18n (_t) so it stays multi-language
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
                api.NETWORKS[networkId];

            if (!network) {
                return null;
            }

            return network.usdtAddress || null;
        };


    api.getExplorerTxUrl =
        function (
            networkId,
            txHash
        ) {

            const network =
                api.NETWORKS[networkId];

            if (!network || !network.explorer) {
                return null;
            }

            return `${network.explorer}/tx/${txHash}`;
        };


    window.ClassChainNetworkConfig =
        api;

})();
