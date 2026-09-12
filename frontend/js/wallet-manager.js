(function () {
    const WC_PROJECT_ID = 'd107a68716b924622b16e8190105acf0';

    class WalletManager {
        constructor() {
            this.connection = null;
            this.wcProvider = null;
        }

        isMobile() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent || ''
            );
        }

        /**
         * آیا داخل in-app browser کیف پول هستیم؟
         * فقط در این حالت injected provider روی موبایل قابل اعتماد است.
         */
        isInAppWalletBrowser() {
            const ua = navigator.userAgent || '';
            if (/MetaMaskMobile/i.test(ua)) return true;
            if (/Trust\//i.test(ua) || /TrustWallet/i.test(ua)) return true;
            if (/CoinbaseWallet/i.test(ua) || /CBWallet/i.test(ua)) return true;
            if (/imToken/i.test(ua)) return true;
            if (/TokenPocket/i.test(ua)) return true;
            if (/Rainbow/i.test(ua)) return true;
            try {
                if (
                    window.ethereum &&
                    window.ethereum.isMetaMask &&
                    /MetaMask/i.test(ua) &&
                    !/Chrome|CriOS|Firefox|Safari|EdgiOS|EdgA/i.test(ua)
                ) {
                    return true;
                }
            } catch (_) {}
            return false;
        }

        /**
         * روی Chrome/Safari موبایل، حتی اگر window.ethereum باشد
         * اغلب eth_requestAccounts برای همیشه hang می‌شود.
         * فقط وقتی injected استفاده کن که in-app wallet باشیم یا دسکتاپ.
         */
        shouldUseInjectedEvm() {
            if (typeof window.ethereum === 'undefined') {
                return false;
            }
            if (!this.isMobile()) {
                return true;
            }
            return this.isInAppWalletBrowser();
        }

        getAllEnabledEvmNetworks() {
            const cfg = window.ClassChainNetworkConfig;
            const networks = (cfg && cfg.NETWORKS) || {};

            return Object.values(networks).filter(
                (n) =>
                    n &&
                    n.type === 'EVM' &&
                    n.enabled &&
                    n.chainId &&
                    n.rpcUrl
            );
        }

        buildWalletConnectMaps(preferredNetwork) {
            const all = this.getAllEnabledEvmNetworks();

            if (
                preferredNetwork &&
                preferredNetwork.type === 'EVM' &&
                preferredNetwork.chainId &&
                !all.some((n) => Number(n.chainId) === Number(preferredNetwork.chainId))
            ) {
                all.push(preferredNetwork);
            }

            const optionalChains = all.map((n) => Number(n.chainId));
            const rpcMap = {};

            all.forEach((n) => {
                rpcMap[String(n.chainId)] = n.rpcUrl;
            });

            if (optionalChains.length === 0 && preferredNetwork?.chainId) {
                optionalChains.push(Number(preferredNetwork.chainId));
                if (preferredNetwork.rpcUrl) {
                    rpcMap[String(preferredNetwork.chainId)] =
                        preferredNetwork.rpcUrl;
                }
            }

            return { optionalChains, rpcMap };
        }

        resolveEthereumProviderCtor() {
            const scoped = window['@walletconnect/ethereum-provider'];
            if (scoped && scoped.EthereumProvider) {
                return scoped.EthereumProvider;
            }
            if (scoped && typeof scoped.init === 'function') {
                return scoped;
            }
            if (window.EthereumProvider && typeof window.EthereumProvider.init === 'function') {
                return window.EthereumProvider;
            }
            if (
                window.WalletConnectEthereumProvider &&
                window.WalletConnectEthereumProvider.EthereumProvider
            ) {
                return window.WalletConnectEthereumProvider.EthereumProvider;
            }
            if (
                window.WalletConnectEthereumProvider &&
                typeof window.WalletConnectEthereumProvider.init === 'function'
            ) {
                return window.WalletConnectEthereumProvider;
            }
            return null;
        }

        async initWalletConnect(network) {
            if (this.wcProvider) {
                return this.wcProvider;
            }

            const EthereumProvider = this.resolveEthereumProviderCtor();
            if (!EthereumProvider || typeof EthereumProvider.init !== 'function') {
                console.error(
                    '[WalletManager] WC global keys:',
                    Object.keys(window).filter(
                        (k) =>
                            k.toLowerCase().includes('wallet') ||
                            k.toLowerCase().includes('ethereum') ||
                            k.includes('@walletconnect')
                    )
                );
                throw new Error(
                    'کتابخانه WalletConnect بارگذاری نشده است. صفحه را کامل رفرش کنید و دوباره تلاش کنید.'
                );
            }

            const { optionalChains, rpcMap } =
                this.buildWalletConnectMaps(network);

            if (!optionalChains.length) {
                throw new Error('هیچ شبکه EVM فعالی برای WalletConnect یافت نشد');
            }

            console.log('[WalletManager] WC init', {
                optionalChains,
                rpcMap,
                projectId: WC_PROJECT_ID
            });

            this.wcProvider = await EthereumProvider.init({
                projectId: WC_PROJECT_ID,
                metadata: {
                    name: 'ClassChain',
                    description:
                        'پلتفرم شفاف مدرسه‌سازی با بلاکچین | Transparent school-building platform',
                    url: window.location.origin,
                    icons: [
                        window.location.origin + '/favicon.ico'
                    ]
                },
                showQrModal: true,
                optionalChains: optionalChains,
                rpcMap,
                methods: [
                    'eth_sendTransaction',
                    'eth_signTransaction',
                    'eth_sign',
                    'personal_sign',
                    'eth_signTypedData',
                    'eth_signTypedData_v4',
                    'wallet_switchEthereumChain',
                    'wallet_addEthereumChain'
                ],
                events: [
                    'chainChanged',
                    'accountsChanged',
                    'connect',
                    'disconnect'
                ]
            });

            return this.wcProvider;
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

            throw new Error(
                `کیف پول ${network.walletName || network.wallet} هنوز پشتیبانی نمی‌شود`
            );
        }

        async connectWithInjected(network) {
            await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            const web3 = new Web3(window.ethereum);
            const accounts = await web3.eth.getAccounts();

            if (!accounts || accounts.length === 0) {
                throw new Error('هیچ حسابی در کیف پول یافت نشد');
            }

            const currentChainId = Number(await web3.eth.getChainId());
            if (network.chainId && currentChainId !== Number(network.chainId)) {
                await this.switchEVMNetwork(network, window.ethereum);
            }

            this.connection = {
                type: 'EVM',
                account: accounts[0],
                provider: window.ethereum,
                web3,
                network,
                via: 'injected'
            };

            return this.connection;
        }

        async connectWithWalletConnect(network) {
            const provider = await this.initWalletConnect(network);

            console.log('[WalletManager] Opening WalletConnect modal...');
            await provider.connect();

            let accounts = [];
            try {
                accounts = provider.accounts || [];
            } catch (_) {}

            if (!accounts.length) {
                accounts = await provider.request({
                    method: 'eth_requestAccounts'
                });
            }

            if (!accounts || accounts.length === 0) {
                throw new Error(
                    'هیچ حسابی از طریق WalletConnect دریافت نشد'
                );
            }

            const web3 = new Web3(provider);

            const currentChainId = Number(
                provider.chainId || (await web3.eth.getChainId())
            );
            if (network.chainId && currentChainId !== Number(network.chainId)) {
                try {
                    await this.switchEVMNetwork(network, provider);
                } catch (switchErr) {
                    console.warn('[WalletManager] switch after WC:', switchErr);
                }
            }

            this.connection = {
                type: 'EVM',
                account: accounts[0],
                provider,
                web3,
                network,
                via: 'walletconnect'
            };

            return this.connection;
        }

        async connectEVM(network) {
            const useInjected = this.shouldUseInjectedEvm();

            console.log('[WalletManager] connectEVM', {
                isMobile: this.isMobile(),
                isInApp: this.isInAppWalletBrowser(),
                hasEthereum: typeof window.ethereum !== 'undefined',
                useInjected
            });

            if (useInjected) {
                try {
                    return await this.connectWithInjected(network);
                } catch (err) {
                    if (!this.isMobile()) {
                        throw err;
                    }
                    console.warn(
                        '[WalletManager] Injected failed on mobile, fallback to WC',
                        err
                    );
                }
            }

            try {
                return await this.connectWithWalletConnect(network);
            } catch (err) {
                console.error('[WalletManager] WalletConnect error:', err);

                if (
                    err?.code === 4001 ||
                    (err?.message &&
                        (err.message.includes('User rejected') ||
                            err.message.includes('User denied') ||
                            err.message.includes('rejected') ||
                            err.message.includes('denied')))
                ) {
                    throw new Error('اتصال توسط کاربر لغو شد');
                }

                const msg = err?.message || String(err);
                if (
                    msg.includes('WalletConnect') ||
                    msg.includes('بارگذاری')
                ) {
                    throw new Error(msg);
                }

                throw new Error(
                    'خطا در اتصال WalletConnect: ' + msg
                );
            }
        }

        async switchEVMNetwork(network, provider) {
            const chainIdHex = '0x' + Number(network.chainId).toString(16);
            const eth = provider || window.ethereum;

            try {
                await eth.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: chainIdHex }]
                });
            } catch (switchError) {
                if (
                    switchError.code === 4902 ||
                    switchError.code === -32603 ||
                    (switchError.message &&
                        switchError.message.includes('Unrecognized chain'))
                ) {
                    await eth.request({
                        method: 'wallet_addEthereumChain',
                        params: [
                            {
                                chainId: chainIdHex,
                                chainName: network.name,
                                rpcUrls: [network.rpcUrl],
                                nativeCurrency: network.nativeCurrency || {
                                    name: 'ETH',
                                    symbol: 'ETH',
                                    decimals: 18
                                },
                                blockExplorerUrls: network.explorer
                                    ? [network.explorer]
                                    : []
                            }
                        ]
                    });
                } else {
                    throw switchError;
                }
            }
        }

        openInTronLink() {
            const param = {
                url: window.location.href,
                action: 'open',
                protocol: 'TronLink',
                version: '1.0'
            };
            const encoded = encodeURIComponent(JSON.stringify(param));
            window.location.href =
                'tronlinkoutside://pull.activity?param=' + encoded;
        }

        async connectTVM(network) {
            if (!window.tronWeb && !window.tron) {
                if (this.isMobile()) {
                    this.openInTronLink();
                    throw new Error(
                        'در حال باز کردن صفحه داخل TronLink... لطفاً چند ثانیه صبر کنید و دوباره تلاش کنید.'
                    );
                }
                throw new Error('لطفاً TronLink را نصب و فعال کنید');
            }

            let tronWeb = window.tronWeb;

            if (window.tron && window.tron.tronWeb) {
                tronWeb = window.tron.tronWeb;
            }

            const tronProvider = window.tron || window.tronWeb;

            if (tronProvider && typeof tronProvider.request === 'function') {
                try {
                    await tronProvider.request({
                        method: 'tron_requestAccounts'
                    });
                } catch (e) {
                }
            } else if (tronWeb && typeof tronWeb.request === 'function') {
                await tronWeb.request({ method: 'tron_requestAccounts' });
            }

            const account = tronWeb?.defaultAddress?.base58;
            if (!account) {
                throw new Error(
                    'TronLink قفل است یا هیچ حسابی انتخاب نشده است'
                );
            }

            this.connection = {
                type: 'TVM',
                account,
                provider: tronWeb,
                tronWeb,
                network,
                via: 'injected'
            };

            return this.connection;
        }

        async disconnect() {
            if (this.wcProvider) {
                try {
                    await this.wcProvider.disconnect();
                } catch (e) {
                    console.warn('[WalletManager] WC disconnect:', e);
                }
                this.wcProvider = null;
            }
            this.connection = null;
        }
    }

    window.ClassChainWalletManager = WalletManager;
})();
