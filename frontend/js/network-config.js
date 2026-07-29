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
            usdtAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
            tokenDecimals: 6,
            chainId: 80002,
            explorer: 'https://amoy.polygonscan.com',
            enabled: true
        },
        CLC: {
            id: 'CLC',
            name: 'CLC ClassChain (تست‌نت)',
            type: 'EVM',
            wallet: 'metamask',
            walletName: 'MetaMask',
            buttonLabel: 'اتصال MetaMask و پرداخت',
            icon: 'https://cryptologos.cc/logos/polygon-matic-logo.png',
            addressField: 'contractAddress',
            usdtAddress: '0x39Af73d2736f6EC94778a38c0C7Ef800e58B13a7',
            tokenDecimals: 18,
            chainId: 80002,
            explorer: 'https://amoy.polygonscan.com',
            enabled: true
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
            usdtAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            tokenDecimals: 6,
            chainId: 137,
            explorer: 'https://polygonscan.com',
            enabled: true
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
            usdtAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
            tokenDecimals: 6,
            chainId: 1,
            explorer: 'https://etherscan.io',
            enabled: true
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
            usdtAddress: '0x55d398326f99059ff7754852469993b3197955e7',
            tokenDecimals: 6,
            chainId: 56,
            explorer: 'https://bscscan.com',
            enabled: true
        },
        tron: {
            id: 'tron',
            name: 'Tron (TRC-20)',
            type: 'TVM',
            wallet: 'tronlink',
            walletName: 'TronLink',
            buttonLabel: 'اتصال TronLink و پرداخت',
            icon: 'https://cryptologos.cc/logos/tron-trx-logo.png',
            addressField: 'contractAddressTron',
            usdtAddress: '0xECa9bC828A3005B9a3b909f2cc5c2a54794DE05F',
            tokenDecimals: 6,
            chainId: null,
            explorer: 'https://tronscan.org',
            enabled: true
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
            usdtAddress: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
            tokenDecimals: 6,
            chainId: 42161,
            explorer: 'https://arbiscan.io',
            enabled: true
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
            usdtAddress: '0x94b008aa00579c13056b0a762ad3af54ac829873',
            tokenDecimals: 6,
            chainId: 10,
            explorer: 'https://optimistic.etherscan.io',
            enabled: true
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
            usdtAddress: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',
            tokenDecimals: 6,
            chainId: 43114,
            explorer: 'https://snowtrace.io',
            enabled: true
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
            usdtAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            tokenDecimals: 6,
            chainId: null,
            explorer: 'https://solscan.io',
            enabled: false
        }
    };

    function getNetwork(id) {
        return NETWORKS[id] || null;
    }

    function getDonationNetworks() {
        return Object.values(NETWORKS);
    }

    window.ClassChainNetworkConfig = {
        NETWORKS,
        getNetwork,
        getDonationNetworks
    };
})();
