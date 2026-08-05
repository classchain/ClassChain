// js/config/networks.js
// Phase 1 Refactor: Network Definition جدا از Deployment
// CLC کاملاً حذف شده — فقط USDT (و توکن‌های مجاز هر شبکه)

// ============================================
// Network Definition (مشخصات ثابت شبکه)
// ============================================
export const NETWORKS = {
  // ---------- EVM ----------
  polygon_amoy: {
    id: 'polygon_amoy',
    name: 'Polygon Amoy',
    type: 'EVM',
    chainId: 80002,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    rpcFallbacks: [
      'https://polygon-amoy.gateway.tenderly.co',
      'https://80002.rpc.thirdweb.com'
    ],
    explorerUrl: 'https://amoy.polygonscan.com',
    nativeToken: 'MATIC',
    isTestnet: true,
    color: '#8247E5',
    icon: '🟣'
  },

  polygon_mainnet: {
    id: 'polygon_mainnet',
    name: 'Polygon Mainnet',
    type: 'EVM',
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    rpcFallbacks: [
      'https://rpc.ankr.com/polygon',
      'https://polygon.llamarpc.com'
    ],
    explorerUrl: 'https://polygonscan.com',
    nativeToken: 'MATIC',
    isTestnet: false,
    color: '#8247E5',
    icon: '🟣'
  },

  ethereum_mainnet: {
    id: 'ethereum_mainnet',
    name: 'Ethereum',
    type: 'EVM',
    chainId: 1,
    rpcUrl: 'https://ethereum.publicnode.com',
    rpcFallbacks: [
      'https://rpc.ankr.com/eth',
      'https://eth.llamarpc.com'
    ],
    explorerUrl: 'https://etherscan.io',
    nativeToken: 'ETH',
    isTestnet: false,
    color: '#627EEA',
    icon: '🔷'
  },

  ethereum_sepolia: {
    id: 'ethereum_sepolia',
    name: 'Ethereum Sepolia',
    type: 'EVM',
    chainId: 11155111,
    rpcUrl: 'https://rpc.sepolia.org',
    rpcFallbacks: [
      'https://ethereum-sepolia.publicnode.com',
      'https://rpc.ankr.com/eth_sepolia'
    ],
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeToken: 'ETH',
    isTestnet: true,
    color: '#627EEA',
    icon: '🔷'
  },

  bsc_mainnet: {
    id: 'bsc_mainnet',
    name: 'BNB Smart Chain',
    type: 'EVM',
    chainId: 56,
    rpcUrl: 'https://bsc-dataseed.binance.org',
    rpcFallbacks: [
      'https://rpc.ankr.com/bsc',
      'https://bsc.publicnode.com'
    ],
    explorerUrl: 'https://bscscan.com',
    nativeToken: 'BNB',
    isTestnet: false,
    color: '#F0B90B',
    icon: '🟡'
  },

  bsc_testnet: {
    id: 'bsc_testnet',
    name: 'BNB Smart Chain Testnet',
    type: 'EVM',
    chainId: 97,
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    rpcFallbacks: [
      'https://bsc-testnet.publicnode.com'
    ],
    explorerUrl: 'https://testnet.bscscan.com',
    nativeToken: 'tBNB',
    isTestnet: true,
    color: '#F0B90B',
    icon: '🟡'
  },

  arbitrum_mainnet: {
    id: 'arbitrum_mainnet',
    name: 'Arbitrum One',
    type: 'EVM',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    rpcFallbacks: [
      'https://rpc.ankr.com/arbitrum',
      'https://arbitrum.llamarpc.com'
    ],
    explorerUrl: 'https://arbiscan.io',
    nativeToken: 'ETH',
    isTestnet: false,
    color: '#28A0F0',
    icon: '🔵'
  },

  optimism_mainnet: {
    id: 'optimism_mainnet',
    name: 'Optimism',
    type: 'EVM',
    chainId: 10,
    rpcUrl: 'https://mainnet.optimism.io',
    rpcFallbacks: [
      'https://rpc.ankr.com/optimism',
      'https://optimism.llamarpc.com'
    ],
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeToken: 'ETH',
    isTestnet: false,
    color: '#FF0420',
    icon: '🔴'
  },

  base_mainnet: {
    id: 'base_mainnet',
    name: 'Base',
    type: 'EVM',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    rpcFallbacks: [
      'https://base.llamarpc.com',
      'https://rpc.ankr.com/base'
    ],
    explorerUrl: 'https://basescan.org',
    nativeToken: 'ETH',
    isTestnet: false,
    color: '#0052FF',
    icon: '🔷'
  },

  avalanche_mainnet: {
    id: 'avalanche_mainnet',
    name: 'Avalanche C-Chain',
    type: 'EVM',
    chainId: 43114,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    rpcFallbacks: [
      'https://rpc.ankr.com/avalanche',
      'https://avalanche.public-rpc.com'
    ],
    explorerUrl: 'https://snowtrace.io',
    nativeToken: 'AVAX',
    isTestnet: false,
    color: '#E84142',
    icon: '🔺'
  },

  // ---------- TVM ----------
  tron_nile: {
    id: 'tron_nile',
    name: 'Tron Nile',
    type: 'TVM',
    chainId: 2,
    rpcUrl: 'https://nile.trongrid.io',
    explorerUrl: 'https://nile.tronscan.org',
    nativeToken: 'TRX',
    isTestnet: true,
    color: '#EF0027',
    icon: '🔴'
  },

  tron_mainnet: {
    id: 'tron_mainnet',
    name: 'Tron Mainnet',
    type: 'TVM',
    chainId: 1,
    rpcUrl: 'https://api.trongrid.io',
    explorerUrl: 'https://tronscan.org',
    nativeToken: 'TRX',
    isTestnet: false,
    color: '#EF0027',
    icon: '🔴'
  }
};

// ============================================
// Deployment (آدرس Factory + توکن‌ها + وضعیت)
// فقط polygon_amoy و tron_nile = active
// ============================================
export const DEPLOYMENTS = {
  polygon_amoy: {
    factoryAddress: '0x83b1E4D6a3E494cCf86F50ef6934FFA1E23e421f',
    tokens: {
      USDT: {
        address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
        decimals: 6
      }
    },
    status: 'active'
  },

  polygon_mainnet: {
    factoryAddress: '',
    tokens: {
      USDT: {
        address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        decimals: 6
      }
    },
    status: 'pending'
  },

  ethereum_mainnet: {
    factoryAddress: '',
    tokens: {
      USDT: {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6
      }
    },
    status: 'pending'
  },

  ethereum_sepolia: {
    factoryAddress: '',
    tokens: {
      USDT: {
        address: '',
        decimals: 6
      }
    },
    status: 'pending'
  },

  bsc_mainnet: {
    factoryAddress: '',
    tokens: {
      USDT: {
        address: '0x55d398326f99059fF775485246999027B3197955',
        decimals: 18
      }
    },
    status: 'pending'
  },

  bsc_testnet: {
    factoryAddress: '',
    tokens: {
      USDT: {
        address: '',
        decimals: 18
      }
    },
    status: 'pending'
  },

  arbitrum_mainnet: {
    factoryAddress: '',
    tokens: {
      USDT: {
        address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb8',
        decimals: 6
      }
    },
    status: 'pending'
  },

  optimism_mainnet: {
    factoryAddress: '',
    tokens: {
      USDT: {
        address: '0x94b008aA00579c13056B0a762ad3af54Ac829873',
        decimals: 6
      }
    },
    status: 'pending'
  },

  base_mainnet: {
    factoryAddress: '',
    tokens: {
      USDT: {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6
      }
    },
    status: 'pending'
  },

  avalanche_mainnet: {
    factoryAddress: '',
    tokens: {
      USDT: {
        address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
        decimals: 6
      }
    },
    status: 'pending'
  },

  tron_nile: {
    factoryAddress: 'TSMHCv1iojP42jCLbbZFqyJ7RDGjijza4A',
    tokens: {
      USDT: {
        address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
        decimals: 6
      }
    },
    status: 'active'
  },

  tron_mainnet: {
    factoryAddress: '',
    tokens: {
      USDT: {
        address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        decimals: 6
      }
    },
    status: 'pending'
  }
};

// ============================================
// شبکه‌های فعال (Definition + Deployment ادغام‌شده)
// ============================================
export const ACTIVE_NETWORKS = Object.keys(DEPLOYMENTS)
  .filter(id => {
    const dep = DEPLOYMENTS[id];
    return dep && dep.status === 'active' && dep.factoryAddress && dep.factoryAddress !== '';
  })
  .map(id => ({
    ...NETWORKS[id],
    ...DEPLOYMENTS[id]
  }));

// ============================================
// ABI — EVM Factory
// ============================================
export const FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'string', name: 'projectId', type: 'string' },
      { internalType: 'address', name: 'singleOwner', type: 'address' }
    ],
    name: 'createSingleOwnerFund',
    outputs: [{ internalType: 'address', name: 'fundAddress', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'string', name: 'projectId', type: 'string' },
      { internalType: 'address[]', name: 'multisigOwners', type: 'address[]' },
      { internalType: 'uint256', name: 'requiredConfirmations', type: 'uint256' }
    ],
    name: 'createMultisigFund',
    outputs: [
      { internalType: 'address', name: 'fundAddress', type: 'address' },
      { internalType: 'address', name: 'multisigAddress', type: 'address' }
    ],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'string', name: 'projectId', type: 'string' }],
    name: 'getFundAddress',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
];

// ============================================
// ABI — Tron Factory
// ============================================
export const TRON_FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'address[]', name: '_defaultAllowedTokens', type: 'address[]' }
    ],
    stateMutability: 'nonpayable',
    type: 'constructor'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'string', name: 'projectId', type: 'string' },
      { indexed: true, internalType: 'address', name: 'fundAddress', type: 'address' },
      { indexed: true, internalType: 'address', name: 'ownerOrMultisig', type: 'address' },
      { indexed: false, internalType: 'bool', name: 'isMultisig', type: 'bool' },
      { indexed: false, internalType: 'uint256', name: 'requiredConfirmations', type: 'uint256' }
    ],
    name: 'FundCreated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'previousOwner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'newOwner', type: 'address' }
    ],
    name: 'OwnershipTransferred',
    type: 'event'
  },
  {
    inputs: [
      { internalType: 'string', name: 'projectId', type: 'string' },
      { internalType: 'address', name: 'singleOwner', type: 'address' }
    ],
    name: 'createSingleOwnerFund',
    outputs: [{ internalType: 'address', name: 'fundAddress', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'string', name: 'projectId', type: 'string' },
      { internalType: 'address[]', name: 'multisigOwners', type: 'address[]' },
      { internalType: 'uint256', name: 'requiredConfirmations', type: 'uint256' }
    ],
    name: 'createMultisigFund',
    outputs: [
      { internalType: 'address', name: 'fundAddress', type: 'address' },
      { internalType: 'address', name: 'multisigAddress', type: 'address' }
    ],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'string', name: 'projectId', type: 'string' }],
    name: 'getFundAddress',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'string', name: '', type: 'string' }],
    name: 'projectFunds',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'defaultAllowedTokens',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'USDT_TOKEN',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address[]', name: 'newTokens', type: 'address[]' }],
    name: 'updateDefaultAllowedTokens',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

// ============================================
// Helper functions
// ============================================
export function getNetworkById(id) {
  return NETWORKS[id] || null;
}

export function getDeployment(id) {
  return DEPLOYMENTS[id] || null;
}

/** شبکه کامل = Definition + Deployment */
export function getFullNetwork(id) {
  const network = NETWORKS[id];
  if (!network) return null;
  const deployment = DEPLOYMENTS[id] || {};
  return { ...network, ...deployment };
}

export function getTokenAddress(networkId, symbol = 'USDT') {
  const dep = DEPLOYMENTS[networkId];
  return dep?.tokens?.[symbol]?.address || null;
}

export function getTokenDecimals(networkId, symbol = 'USDT') {
  const dep = DEPLOYMENTS[networkId];
  return dep?.tokens?.[symbol]?.decimals ?? 18;
}

export function getExplorerUrl(networkId, address) {
  const network = NETWORKS[networkId];
  if (!network || !address) return '#';
  return `${network.explorerUrl}/address/${address}`;
}

export function isValidAddress(address, networkId) {
  const network = NETWORKS[networkId];
  if (!network || !address) return false;

  if (network.type === 'EVM') {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  if (network.type === 'TVM') {
    return /^T[a-zA-Z0-9]{33}$/.test(address);
  }
  return false;
}

export function toTronBase58(address) {
  if (!address || typeof address !== 'string') return address;
  if (/^T[a-zA-Z0-9]{33}$/.test(address)) return address;

  try {
    const tronWeb = window.tronWeb;
    if (!tronWeb?.address) {
      console.warn('TronWeb در دسترس نیست برای تبدیل آدرس');
      return address;
    }

    let hex = address;
    if (hex.startsWith('0x') || hex.startsWith('0X')) {
      hex = '41' + hex.slice(2).toLowerCase();
    }
    return tronWeb.address.fromHex(hex);
  } catch (e) {
    console.warn('خطا در تبدیل آدرس به Base58:', address, e);
    return address;
  }
}
