(function () {
    class WalletManager {
        constructor() {
            this.connection = null;
        }

        async connect(network) {
            if (!network || !network.enabled) {
                throw new Error('این شبکه هنوز برای پرداخت فعال نیست');
            }

            if (network.type === 'EVM') {
                return this.connectEVM(network);
            }

            if (network.type === 'TVM') {
                return this.connectTVM(network);
            }

            throw new Error(`کیف پول ${network.walletName || network.wallet} هنوز پشتیبانی نمی‌شود`);
        }

        async connectEVM(network) {
            if (typeof window.ethereum === 'undefined') {
                throw new Error('لطفاً MetaMask یا کیف پول سازگار با EVM را نصب کنید');
            }

            await window.ethereum.request({ method: 'eth_requestAccounts' });
            const web3 = new Web3(window.ethereum);
            const accounts = await web3.eth.getAccounts();

            if (!accounts || accounts.length === 0) {
                throw new Error('هیچ حسابی در MetaMask یافت نشد');
            }

            const currentChainId = Number(await web3.eth.getChainId());
            if (network.chainId && currentChainId !== network.chainId) {
                await this.switchEVMNetwork(network);
            }

            this.connection = {
                type: 'EVM',
                account: accounts[0],
                provider: window.ethereum,
                web3,
                network
            };

            return this.connection;
        }

        async switchEVMNetwork(network) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: `0x${network.chainId.toString(16)}` }]
                });
            } catch (error) {
                throw new Error(`شبکه کیف پول با ${network.name} هماهنگ نیست. لطفاً شبکه را تغییر دهید.`);
            }
        }

        async connectTVM(network) {
            const tronWeb = window.tronWeb;
            if (!tronWeb) {
                throw new Error('لطفاً TronLink را نصب و فعال کنید');
            }

            if (typeof tronWeb.request === 'function') {
                await tronWeb.request({ method: 'tron_requestAccounts' });
            }

            const account = tronWeb.defaultAddress?.base58;
            if (!account) {
                throw new Error('TronLink قفل است یا هیچ حسابی انتخاب نشده است');
            }

            this.connection = {
                type: 'TVM',
                account,
                provider: tronWeb,
                tronWeb,
                network
            };

            return this.connection;
        }

        disconnect() {
            this.connection = null;
        }
    }

    window.ClassChainWalletManager = WalletManager;
})();
