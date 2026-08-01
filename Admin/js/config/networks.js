// js/config/networks.js

export const NETWORKS = {
  polygon_amoy: {
    id: 'polygon_amoy',
    name: 'Polygon Amoy',
    chainId: 80002,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    factoryAddress: '0x83b1E4D6a3E494cCf86F50ef6934FFA1E23e421f',
    nativeToken: 'MATIC',
    explorerUrl: 'https://amoy.polygonscan.com',
    type: 'EVM',
    color: '#8247E5',
    icon: '🟣',
    isTestnet: true,
    status: 'active'   // ✅ فعال
  },
  polygon_mainnet: {
    id: 'polygon_mainnet',
    name: 'Polygon Mainnet',
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    factoryAddress: '0x83b1E4D6a3E494cCf86F50ef6934FFA1E23e421f',
    nativeToken: 'MATIC',
    explorerUrl: 'https://polygonscan.com',
    type: 'EVM',
    color: '#8247E5',
    icon: '🟣',
    isTestnet: false,
    status: 'active'
  },
  ethereum_sepolia: {
    id: 'ethereum_sepolia',
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_KEY',
    factoryAddress: '',
    nativeToken: 'ETH',
    explorerUrl: 'https://sepolia.etherscan.io',
    type: 'EVM',
    color: '#627EEA',
    icon: '🔷',
    isTestnet: true,
    status: 'pending'
  },
  tron_nile: {
    id: 'tron_nile',
    name: 'Tron Nile',
    chainId: 2,
    rpcUrl: 'https://nile.trongrid.io',
    factoryAddress: 'TSMHCv1iojP42jCLbbZFqyJ7RDGjijza4A',
    defaultUsdtAddress: '0xECa9bC828A3005B9a3b909f2cc5c2a54794DE05F',
    nativeToken: 'TRX',
    explorerUrl: 'https://nile.tronscan.org',
    type: 'TVM',
    color: '#EF0027',
    icon: '🔴',
    isTestnet: true,
    status: 'active'   // ✅ واقعاً فعال — قرارداد روی Nile دیپلوی شده
  }
};

// ============================================
// ✅ شبکه‌های فعال (برای نمایش در جدول و تب‌ها)
// ============================================
export const ACTIVE_NETWORKS = Object.values(NETWORKS).filter(n => 
  n.status === 'active' && n.factoryAddress && n.factoryAddress !== ''
);

// ============================================
// ABIهای قراردادها
// ============================================
export const FACTORY_ABI = [
  {
    "inputs": [
      {"internalType": "string","name": "projectId","type": "string"},
      {"internalType": "address","name": "singleOwner","type": "address"}
    ],
    "name": "createSingleOwnerFund",
    "outputs": [{"internalType": "address","name": "fundAddress","type": "address"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "string","name": "projectId","type": "string"},
      {"internalType": "address[]","name": "multisigOwners","type": "address[]"},
      {"internalType": "uint256","name": "requiredConfirmations","type": "uint256"}
    ],
    "name": "createMultisigFund",
    "outputs": [
      {"internalType": "address","name": "fundAddress","type": "address"},
      {"internalType": "address","name": "multisigAddress","type": "address"}
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string","name": "projectId","type": "string"}],
    "name": "getFundAddress",
    "outputs": [{"internalType": "address","name": "","type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
];

export const TRON_FACTORY_ABI = [
  {
    "inputs": [
      {"internalType": "address[]","name": "_defaultAllowedTokens","type": "address[]"}
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "string", "name": "projectId", "type": "string"},
      {"indexed": true, "internalType": "address", "name": "fundAddress", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "ownerOrMultisig", "type": "address"},
      {"indexed": false, "internalType": "bool", "name": "isMultisig", "type": "bool"},
      {"indexed": false, "internalType": "uint256", "name": "requiredConfirmations", "type": "uint256"}
    ],
    "name": "FundCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "previousOwner", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "newOwner", "type": "address"}
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "inputs": [
      {"internalType": "string","name": "projectId","type": "string"},
      {"internalType": "address","name": "singleOwner","type": "address"}
    ],
    "name": "createSingleOwnerFund",
    "outputs": [{"internalType": "address","name": "fundAddress","type": "address"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "string","name": "projectId","type": "string"},
      {"internalType": "address[]","name": "multisigOwners","type": "address[]"},
      {"internalType": "uint256","name": "requiredConfirmations","type": "uint256"}
    ],
    "name": "createMultisigFund",
    "outputs": [
      {"internalType": "address","name": "fundAddress","type": "address"},
      {"internalType": "address","name": "multisigAddress","type": "address"}
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string","name": "projectId","type": "string"}],
    "name": "getFundAddress",
    "outputs": [{"internalType": "address","name": "","type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string","name": "","type": "string"}],
    "name": "projectFunds",
    "outputs": [{"internalType": "address","name": "","type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "name": "defaultAllowedTokens",
    "outputs": [{"internalType": "address","name": "","type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "USDT_TOKEN",
    "outputs": [{"internalType": "address","name": "","type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address[]","name": "newTokens","type": "address[]"}],
    "name": "updateDefaultAllowedTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address","name": "","type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "newOwner","type": "address"}],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// ============================================
// توابع کمکی
// ============================================
export function getNetworkById(id) {
  return NETWORKS[id];
}

export function getExplorerUrl(networkId, address) {
  const network = NETWORKS[networkId];
  if (!network) return '#';
  return `${network.explorerUrl}/address/${address}`;
}

export function isValidAddress(address, networkId) {
  const network = NETWORKS[networkId];
  if (!network) return false;

  if (network.type === 'EVM') {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  } else if (network.type === 'TVM') {
    return /^T[a-zA-Z0-9]{33}$/.test(address);
  }
  return false;
}

export function toTronBase58(address) {
  if (!address || typeof address !== 'string') return address;

  // اگر قبلاً Base58 است
  if (/^T[a-zA-Z0-9]{33}$/.test(address)) {
    return address;
  }

  try {
    // TronWeb باید در دسترس باشد (از window.tronWeb)
    const tronWeb = window.tronWeb;
    if (!tronWeb || !tronWeb.address) {
      console.warn('TronWeb در دسترس نیست برای تبدیل آدرس');
      return address;
    }

    let hex = address;

    // اگر با 0x شروع شود → به فرمت Tron hex تبدیل کن (41 + 20 بایت)
    if (hex.startsWith('0x') || hex.startsWith('0X')) {
      hex = '41' + hex.slice(2).toLowerCase();
    }

    // اگر طول درست hex نباشد، سعی کن مستقیم fromHex کنی
    return tronWeb.address.fromHex(hex);
  } catch (e) {
    console.warn('خطا در تبدیل آدرس به Base58:', address, e);
    return address;
  }
}
