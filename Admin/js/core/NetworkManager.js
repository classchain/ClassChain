// js/core/NetworkManager.js
import { NETWORKS, getNetworkById } from '../config/networks.js';

export class NetworkManager {
  constructor() {
    this.currentNetworkId = null;
    this.connection = null;
    this.isConnected = false;
  }

  async connectNetwork(networkId) {
    const network = getNetworkById(networkId);
    if (!network) {
      throw new Error(`شبکه ${networkId} یافت نشد`);
    }

    this.currentNetworkId = networkId;

    if (network.type === 'EVM') {
      return await this._connectEVM(network);
    } else if (network.type === 'TVM') {
      return await this._connectTVM(network);
    }

    throw new Error(`نوع شبکه ${network.type} پشتیبانی نمی‌شود`);
  }

  async _connectEVM(network) {
    // بررسی وجود MetaMask
    if (!window.ethereum) {
      throw new Error('لطفاً MetaMask را نصب کنید');
    }

    try {
      // تغییر شبکه
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${network.chainId.toString(16)}` }]
      });

      // درخواست حساب
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      // ایجاد Web3
      const web3 = new Web3(window.ethereum);
      const accounts = await web3.eth.getAccounts();

      this.connection = {
        web3,
        account: accounts[0],
        provider: window.ethereum,
        network
      };
      
      this.isConnected = true;
      return this.connection;

    } catch (error) {
      if (error.code === 4902) {
        // شبکه وجود ندارد - پیشنهاد اضافه کردن
        await this._addEVMNetwork(network);
        return await this._connectEVM(network);
      }
      throw error;
    }
  }

  async _addEVMNetwork(network) {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: `0x${network.chainId.toString(16)}`,
        chainName: network.name,
        rpcUrls: [network.rpcUrl],
        nativeCurrency: {
          name: network.nativeToken,
          symbol: network.nativeToken,
          decimals: 18
        },
        blockExplorerUrls: [network.explorerUrl]
      }]
    });
  }

  async _connectTVM(network) {
    // بررسی وجود TronLink
    if (!window.tronWeb) {
      throw new Error('لطفاً TronLink را نصب کنید');
    }

    try {
      await window.tronWeb.request({ method: 'tron_requestAccounts' });
      
      this.connection = {
        tronWeb: window.tronWeb,
        account: window.tronWeb.defaultAddress.base58,
        network
      };
      
      this.isConnected = true;
      return this.connection;

    } catch (error) {
      throw new Error('خطا در اتصال به TronLink: ' + error.message);
    }
  }

  async switchNetwork(networkId) {
    if (this.connection) {
      // قطع اتصال قبلی
      this.isConnected = false;
      this.connection = null;
    }
    return await this.connectNetwork(networkId);
  }

  getCurrentNetwork() {
    return this.currentNetworkId ? getNetworkById(this.currentNetworkId) : null;
  }

  getConnection() {
    if (!this.isConnected || !this.connection) {
      throw new Error('اتصال برقرار نیست');
    }
    return this.connection;
  }

  isEVM() {
    const network = this.getCurrentNetwork();
    return network && network.type === 'EVM';
  }

  isTVM() {
    const network = this.getCurrentNetwork();
    return network && network.type === 'TVM';
  }

  disconnect() {
    this.isConnected = false;
    this.connection = null;
    this.currentNetworkId = null;
  }
}
