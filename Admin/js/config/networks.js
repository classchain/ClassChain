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
    status: 'active'
  },
    polygon_mainnet: {
    id: 'polygon_mainnet',
    name: 'Polygon Mainnet',
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    factoryAddress: '0x...', // 🔴 نیاز به آدرس
    nativeToken: 'MATIC',
    explorerUrl: 'https://polygonscan.com',
    type: 'EVM',
    color: '#8247E5',
    icon: '🟣',
    isTestnet: false,
    status: 'pending' // تا زمان Deploy
  },
  ethereum_sepolia: {
    id: 'ethereum_sepolia',
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_KEY',
    factoryAddress: '0x...', // آدرس Factory در Sepolia
    nativeToken: 'ETH',
    explorerUrl: 'https://sepolia.etherscan.io',
    type: 'EVM',
    color: '#627EEA',
    icon: '🔷',
    isTestnet: true,
    status: 'pending' // هنوز Deploy نشده
  },
  tron_nile: {
    id: 'tron_nile',
    name: 'Tron Nile',
    chainId: 2,
    rpcUrl: 'https://nile.trongrid.io',
    factoryAddress: 'T...', // آدرس Factory در Nile
    nativeToken: 'TRX',
    explorerUrl: 'https://nile.tronscan.org',
    type: 'TVM',
    color: '#EF0027',
    icon: '🔴',
    isTestnet: true,
    status: 'pending' // هنوز Deploy نشده
};

// شبکه‌های فعال برای نمایش
export const ACTIVE_NETWORKS = Object.values(NETWORKS).filter(n => n.status === 'active');

// ABIهای قراردادها
export const FACTORY_ABI = [
  // ABI کامل SchoolFundFactory
  {
    "inputs": [{"internalType": "string","name": "projectId","type": "string"},{"internalType": "address","name": "singleOwner","type": "address"}],
    "name": "createSingleOwnerFund",
    "outputs": [{"internalType": "address","name": "fundAddress","type": "address"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string","name": "projectId","type": "string"},{"internalType": "address[]","name": "multisigOwners","type": "address[]"},{"internalType": "uint256","name": "requiredConfirmations","type": "uint256"}],
    "name": "createMultisigFund",
    "outputs": [{"internalType": "address","name": "fundAddress","type": "address"},{"internalType": "address","name": "multisigAddress","type": "address"}],
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
  // ABI مشابه برای Tron
  // (همان ساختار اما با آدرس‌های Tron)
];

// توابع کمکی
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
