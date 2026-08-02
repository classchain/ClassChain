(function () {
    const NETWORKS = {
        amoy: {
            id: 'amoy',
            name: 'Polygon Amoy (تست‌نت)',
            type: 'EVM',
            wallet: 'metamask',
            walletName: 'MetaMask',
            buttonLabel: 'اتصال MetaMask و پرداخت',
            icon: 'https://cryptologos.cc/logos/polygon-matic-logo.png',
            addressField: 'contractAddress',
            addressFields: ['contractAddress'],
            fundsKeys: ['polygon_amoy', 'amoy'],
            usdtAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
            tokenDecimals: 6,
            chainId: 80002,
            explorer: 'https://amoy.polygonscan.com',
            rpc: 'https://80002.rpc.thirdweb.com',
            rpcFallbacks: [
                'https://polygon-amoy.gateway.tenderly.co',
                'https://rpc-amoy.polygon.technology'
            ],
            enabled: true,
            status: 'active'
        },

        CLC: {
            id: 'CLC',
            name: 'CLC ClassChain (تست‌نت)',
            type: 'EVM',
            wallet: 'metamask',
            walletName: 'MetaMask',
            buttonLabel: 'اتصال MetaMask و پرداخت',
            icon: 'https://cryptologos.cc/logos/polygon-matic-logo.png',
            addressField: 'contractAddressCLC',
            addressFields: ['contractAddressCLC'],
            fundsKeys: ['clc', 'CLC'],
            usdtAddress: '0x39Af73d2736f6EC94778a38c0C7Ef800e58B13a7',
            tokenDecimals: 18,
            chainId: 80002,
            explorer: 'https://amoy.polygonscan.com',
            rpc: 'https://80002.rpc.thirdweb.com',
            rpcFallbacks: [
                'https://polygon-amoy.gateway.tenderly.co',
                'https://rpc-amoy.polygon.technology'
            ],
            enabled: true,
            status: 'pending'
        },

        polygon: {
            id: 'polygon',
            name: 'Polygon Mainnet',
            type: 'EVM',
            wallet: 'metamask',
            walletName: 'MetaMask',
            buttonLabel: 'اتصال MetaMask و پرداخت',
            icon: 'https://cryptologos.cc/logos/polygon-matic-logo.png',
            addressField: 'contractAddressMainnet',
            addressFields: ['contractAddressMainnet'],
            fundsKeys: ['polygon', 'polygon_mainnet'],
            usdtAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            tokenDecimals: 6,
            chainId: 137,
            explorer: 'https://polygonscan.com',
            rpc: 'https://polygon-rpc.com',
            rpcFallbacks: [
                'https://rpc.ankr.com/polygon',
                'https://polygon.llamarpc.com'
            ],
            enabled: true,
            status: 'pending'
        },

        ethereum: {
            id: 'ethereum',
            name: 'Ethereum',
            type: 'EVM',
            wallet: 'metamask',
            walletName: 'MetaMask',
            buttonLabel: 'اتصال MetaMask و پرداخت',
            icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
            addressField: 'contractAddressEthereum',
            addressFields: ['contractAddressEthereum'],
            fundsKeys: ['ethereum', 'eth'],
            usdtAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
            tokenDecimals: 6,
            chainId: 1,
            explorer: 'https://etherscan.io',
            rpc: 'https://ethereum.publicnode.com',
            rpcFallbacks: [
                'https://rpc.ankr.com/eth',
                'https://eth.llamarpc.com'
            ],
            enabled: true,
            status: 'pending'
        },

        bsc: {
            id: 'bsc',
            name: 'Binance Smart Chain',
            type: 'EVM',
            wallet: 'metamask',
            walletName: 'MetaMask',
            buttonLabel: 'اتصال MetaMask و پرداخت',
            icon: 'https://cryptologos.cc/logos/binance-coin-bnb-logo.png',
            addressField: 'contractAddressBSC',
            addressFields: ['contractAddressBSC'],
            fundsKeys: ['bsc', 'bnb'],
            usdtAddress: '0x55d398326f99059ff7754852469993b3197955e7',
            tokenDecimals: 18,
            chainId: 56,
            explorer: 'https://bscscan.com',
            rpc: 'https://bsc-dataseed.binance.org',
            rpcFallbacks: [
                'https://rpc.ankr.com/bsc',
                'https://bsc.publicnode.com'
            ],
            enabled: true,
            status: 'pending'
        },

        tron: {
            id: 'tron',
            name: 'Tron Nile (تست‌نت)',
            type: 'TVM',
            wallet: 'tronlink',
            walletName: 'TronLink',
            buttonLabel: 'اتصال TronLink و پرداخت',
            icon: 'https://cryptologos.cc/logos/tron-trx-logo.png',
            addressField: 'contractAddressTron',
            addressFields: ['contractAddressTron'],
            fundsKeys: ['tron_nile', 'tron'],
            usdtAddress: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
            tokenDecimals: 6,
            chainId: null,
            explorer: 'https://nile.tronscan.org',
            fullHost: 'https://nile.trongrid.io',
            enabled: true,
            status: 'active'
        },

        arbitrum: {
            id: 'arbitrum',
            name: 'Arbitrum One',
            type: 'EVM',
            wallet: 'metamask',
            walletName: 'MetaMask',
            buttonLabel: 'اتصال MetaMask و پرداخت',
            icon: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png',
            addressField: 'contractAddressArbitrum',
            addressFields: ['contractAddressArbitrum'],
            fundsKeys: ['arbitrum'],
            usdtAddress: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
            tokenDecimals: 6,
            chainId: 42161,
            explorer: 'https://arbiscan.io',
            rpc: 'https://arb1.arbitrum.io/rpc',
            rpcFallbacks: [
                'https://rpc.ankr.com/arbitrum',
                'https://arbitrum.llamarpc.com'
            ],
            enabled: true,
            status: 'pending'
        },

        optimism: {
            id: 'optimism',
            name: 'Optimism',
            type: 'EVM',
            wallet: 'metamask',
            walletName: 'MetaMask',
            buttonLabel: 'اتصال MetaMask و پرداخت',
            icon: 'https://cryptologos.cc/logos/optimism-ethereum-op-logo.png',
            addressField: 'contractAddressOptimism',
            addressFields: ['contractAddressOptimism'],
            fundsKeys: ['optimism'],
            usdtAddress: '0x94b008aa00579c13056b0a762ad3af54ac829873',
            tokenDecimals: 6,
            chainId: 10,
            explorer: 'https://optimistic.etherscan.io',
            rpc: 'https://mainnet.optimism.io',
            rpcFallbacks: [
                'https://rpc.ankr.com/optimism',
                'https://optimism.llamarpc.com'
            ],
            enabled: true,
            status: 'pending'
        },

        avalanche: {
            id: 'avalanche',
            name: 'Avalanche',
            type: 'EVM',
            wallet: 'metamask',
            walletName: 'MetaMask',
            buttonLabel: 'اتصال MetaMask و پرداخت',
            icon: 'https://cryptologos.cc/logos/avalanche-avax-logo.png',
            addressField: 'contractAddressAvalanche',
            addressFields: ['contractAddressAvalanche'],
            fundsKeys: ['avalanche', 'avax'],
            usdtAddress: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',
            tokenDecimals: 6,
            chainId: 43114,
            explorer: 'https://snowtrace.io',
            rpc: 'https://api.avax.network/ext/bc/C/rpc',
            rpcFallbacks: [
                'https://rpc.ankr.com/avalanche',
                'https://avalanche.public-rpc.com'
            ],
            enabled: true,
            status: 'pending'
        },

        solana: {
            id: 'solana',
            name: 'Solana (به‌زودی)',
            type: 'SVM',
            wallet: 'phantom',
            walletName: 'Phantom',
            buttonLabel: 'پرداخت Solana هنوز فعال نیست',
            icon: 'https://cryptologos.cc/logos/solana-sol-logo.png',
            addressField: 'contractAddressSolana',
            addressFields: ['contractAddressSolana'],
            fundsKeys: ['solana'],
            usdtAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            tokenDecimals: 6,
            chainId: null,
            explorer: 'https://solscan.io',
            rpc: null,
            enabled: false,
            status: 'pending'
        }
    };

    function getNetwork(id) {
        return NETWORKS[id] || null;
    }

    function getDonationNetworks() {
        return Object.values(NETWORKS);
    }

    function getActiveNetworks() {
        return Object.values(NETWORKS).filter(n => n.status === 'active');
    }

    function getReadNetworks() {
        return Object.values(NETWORKS).filter(n =>
            n.status === 'active' &&
            (
                (n.type === 'EVM' && n.rpc) ||
                (n.type === 'TVM' && n.fullHost)
            )
        );
    }

    function getNetworkByFundsKey(key) {
        if (!key) return null;
        const k = String(key).toLowerCase();
        return Object.values(NETWORKS).find(n =>
            (n.fundsKeys || []).some(fk => fk.toLowerCase() === k)
        ) || null;
    }

    window.ClassChainNetworkConfig = {
        NETWORKS,
        getNetwork,
        getDonationNetworks,
        getActiveNetworks,
        getReadNetworks,
        getNetworkByFundsKey
    };
})();
