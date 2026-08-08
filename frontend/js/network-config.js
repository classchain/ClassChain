/**
 * frontend/js/network-config.js
 * Phase 1 — همگام با Admin/js/config/networks.js
 * CLC کاملاً حذف شده
 * فقط polygon_amoy (amoy) و tron_nile (tron) = active
 */
(function () {
  const NETWORKS = {
    // ---------- EVM ----------
    amoy: {
      id: 'amoy',
      adminId: 'polygon_amoy',
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
      rpc: 'https://rpc-amoy.polygon.technology',
      rpcFallbacks: [
        'https://polygon-amoy.gateway.tenderly.co',
        'https://80002.rpc.thirdweb.com'
      ],
      enabled: true,
      status: 'active'
    },

    polygon: {
      id: 'polygon',
      adminId: 'polygon_mainnet',
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
      adminId: 'ethereum_mainnet',
      name: 'Ethereum',
      type: 'EVM',
      wallet: 'metamask',
      walletName: 'MetaMask',
      buttonLabel: 'اتصال MetaMask و پرداخت',
      icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
      addressField: 'contractAddressEthereum',
      addressFields: ['contractAddressEthereum'],
      fundsKeys: ['ethereum', 'ethereum_mainnet', 'eth'],
      usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
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

    sepolia: {
      id: 'sepolia',
      adminId: 'ethereum_sepolia',
      name: 'Ethereum Sepolia',
      type: 'EVM',
      wallet: 'metamask',
      walletName: 'MetaMask',
      buttonLabel: 'اتصال MetaMask و پرداخت',
      icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
      addressField: 'contractAddressSepolia',
      addressFields: ['contractAddressSepolia'],
      fundsKeys: ['sepolia', 'ethereum_sepolia'],
      usdtAddress: '',
      tokenDecimals: 6,
      chainId: 11155111,
      explorer: 'https://sepolia.etherscan.io',
      rpc: 'https://rpc.sepolia.org',
      rpcFallbacks: [
        'https://ethereum-sepolia.publicnode.com',
        'https://rpc.ankr.com/eth_sepolia'
      ],
      enabled: true,
      status: 'pending'
    },

    bsc: {
      id: 'bsc',
      adminId: 'bsc_mainnet',
      name: 'BNB Smart Chain',
      type: 'EVM',
      wallet: 'metamask',
      walletName: 'MetaMask',
      buttonLabel: 'اتصال MetaMask و پرداخت',
      icon: 'https://cryptologos.cc/logos/binance-coin-bnb-logo.png',
      addressField: 'contractAddressBSC',
      addressFields: ['contractAddressBSC'],
      fundsKeys: ['bsc', 'bsc_mainnet', 'bnb'],
      usdtAddress: '0x55d398326f99059fF775485246999027B3197955',
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

    arbitrum: {
      id: 'arbitrum',
      adminId: 'arbitrum_mainnet',
      name: 'Arbitrum One',
      type: 'EVM',
      wallet: 'metamask',
      walletName: 'MetaMask',
      buttonLabel: 'اتصال MetaMask و پرداخت',
      icon: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png',
      addressField: 'contractAddressArbitrum',
      addressFields: ['contractAddressArbitrum'],
      fundsKeys: ['arbitrum', 'arbitrum_mainnet'],
      usdtAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb8',
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
      adminId: 'optimism_mainnet',
      name: 'Optimism',
      type: 'EVM',
      wallet: 'metamask',
      walletName: 'MetaMask',
      buttonLabel: 'اتصال MetaMask و پرداخت',
      icon: 'https://cryptologos.cc/logos/optimism-ethereum-op-logo.png',
      addressField: 'contractAddressOptimism',
      addressFields: ['contractAddressOptimism'],
      fundsKeys: ['optimism', 'optimism_mainnet'],
      usdtAddress: '0x94b008aA00579c13056B0a762ad3af54Ac829873',
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

    base: {
      id: 'base',
      adminId: 'base_mainnet',
      name: 'Base',
      type: 'EVM',
      wallet: 'metamask',
      walletName: 'MetaMask',
      buttonLabel: 'اتصال MetaMask و پرداخت',
      icon: 'https://cryptologos.cc/logos/base-logo.png',
      addressField: 'contractAddressBase',
      addressFields: ['contractAddressBase'],
      fundsKeys: ['base', 'base_mainnet'],
      usdtAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      tokenDecimals: 6,
      chainId: 8453,
      explorer: 'https://basescan.org',
      rpc: 'https://mainnet.base.org',
      rpcFallbacks: [
        'https://base.llamarpc.com',
        'https://rpc.ankr.com/base'
      ],
      enabled: true,
      status: 'pending'
    },

    avalanche: {
      id: 'avalanche',
      adminId: 'avalanche_mainnet',
      name: 'Avalanche',
      type: 'EVM',
      wallet: 'metamask',
      walletName: 'MetaMask',
      buttonLabel: 'اتصال MetaMask و پرداخت',
      icon: 'https://cryptologos.cc/logos/avalanche-avax-logo.png',
      addressField: 'contractAddressAvalanche',
      addressFields: ['contractAddressAvalanche'],
      fundsKeys: ['avalanche', 'avalanche_mainnet', 'avax'],
      usdtAddress: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
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

    // ---------- TVM ----------
    tron: {
      id: 'tron',
      adminId: 'tron_nile',
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

    tron_mainnet: {
      id: 'tron_mainnet',
      adminId: 'tron_mainnet',
      name: 'Tron Mainnet',
      type: 'TVM',
      wallet: 'tronlink',
      walletName: 'TronLink',
      buttonLabel: 'اتصال TronLink و پرداخت',
      icon: 'https://cryptologos.cc/logos/tron-trx-logo.png',
      addressField: 'contractAddressTronMainnet',
      addressFields: ['contractAddressTronMainnet'],
      fundsKeys: ['tron_mainnet'],
      usdtAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      tokenDecimals: 6,
      chainId: null,
      explorer: 'https://tronscan.org',
      fullHost: 'https://api.trongrid.io',
      enabled: true,
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
