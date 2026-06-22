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

        console.log(`🔄 در حال اتصال به ${network.name}...`);
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

            if (!accounts || accounts.length === 0) {
                throw new Error('هیچ حسابی در MetaMask یافت نشد');
            }

            this.connection = {
                web3,
                account: accounts[0],
                provider: window.ethereum,
                network
            };
            
            this.isConnected = true;
            console.log(`✅ متصل به ${network.name}`, this.connection.account);
            return this.connection;

        } catch (error) {
            console.error('خطا در اتصال EVM:', error);
            
            if (error.code === 4902) {
                // شبکه وجود ندارد - پیشنهاد اضافه کردن
                await this._addEVMNetwork(network);
                return await this._connectEVM(network);
            }
            
            if (error.code === 4001) {
                throw new Error('کاربر درخواست اتصال را رد کرد');
            }
            
            throw error;
        }
    }

    async _addEVMNetwork(network) {
        try {
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
        } catch (error) {
            console.error('خطا در اضافه کردن شبکه:', error);
            throw new Error(`امکان اضافه کردن شبکه ${network.name} وجود ندارد`);
        }
    }

    async _connectTVM(network) {
        // بررسی وجود TronLink
        if (!window.tronWeb) {
            throw new Error('لطفاً TronLink را نصب کنید');
        }

        try {
            await window.tronWeb.request({ method: 'tron_requestAccounts' });
            
            const account = window.tronWeb.defaultAddress?.base58;
            if (!account) {
                throw new Error('هیچ حسابی در TronLink یافت نشد');
            }

            this.connection = {
                tronWeb: window.tronWeb,
                account: account,
                network
            };
            
            this.isConnected = true;
            console.log(`✅ متصل به ${network.name}`, account);
            return this.connection;

        } catch (error) {
            console.error('خطا در اتصال TVM:', error);
            throw new Error('خطا در اتصال به TronLink: ' + error.message);
        }
    }

    async switchNetwork(networkId) {
        if (this.connection) {
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
        console.log('🔌 اتصال قطع شد');
    }
}
