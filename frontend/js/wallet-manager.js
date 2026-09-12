(function () {
    const WC_PROJECT_ID = 'd107a68716b924622b16e8190105acf0';

    class WalletManager {
        constructor() {
            this.connection = null;
            this.wcProvider = null;
        }

        isMobile() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
            );
        }

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
        
        shouldUseInjectedEvm() {
            if (typeof window.ethereum === 'undefined') {
                return false;
            }
        
            // Desktop: injected provider مجاز است
            if (!this.isMobile()) {
                return true;
            }
        
            // Mobile: فقط داخل مرورگر خود کیف پول
            // از injected provider استفاده کن.
            return this.isInAppWalletBrowser();
        }
        /**
         * همه شبکه‌های EVM فعال را از network-config می‌خواند
         * تا با اضافه شدن شبکه جدید، WalletConnect خودکار پشتیبانی کند.
         */
        getAllEnabledEvmNetworks() {
            const cfg = window.ClassChainNetworkConfig;
            const networks =
                (cfg && cfg.NETWORKS) ||
                {};

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

            // مطمئن شو شبکه فعلی هم در لیست باشد
            if (
                preferredNetwork &&
                preferredNetwork.type === 'EVM' &&
                preferredNetwork.chainId &&
                !all.some((n) => n.chainId === preferredNetwork.chainId)
            ) {
                all.push(preferredNetwork);
            }

            const optionalChains = all.map((n) => Number(n.chainId));
            const rpcMap = {};

            all.forEach((n) => {
                rpcMap[String(n.chainId)] = n.rpcUrl;
            });

            // حداقل یک chain برای init لازم است
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
            if (window.EthereumProvider) {
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
            // برخی باندل‌های UMD
            if (
                window['@walletconnect/ethereum-provider'] &&
                window['@walletconnect/ethereum-provider'].EthereumProvider
            ) {
                return window['@walletconnect/ethereum-provider']
                    .EthereumProvider;
            }
            return null;
        }

        async initWalletConnect(network) {
            if (this.wcProvider) {
                return this.wcProvider;
            }

            const EthereumProvider = this.resolveEthereumProviderCtor();
            if (!EthereumProvider || typeof EthereumProvider.init !== 'function') {
                throw new Error(
                    'کتابخانه WalletConnect بارگذاری نشده است. صفحه را رفرش کنید.'
                );
            }

            const { optionalChains, rpcMap } =
                this.buildWalletConnectMaps(network);

            if (!optionalChains.length) {
                throw new Error('هیچ شبکه EVM فعالی برای WalletConnect یافت نشد');
            }

            this.wcProvider = await EthereumProvider.init({
                projectId: WC_PROJECT_ID,
                metadata: {
                    name: 'ClassChain',
                    description:
                        'پلتفرم شفاف مدرسه‌سازی با بلاکچین | Transparent school-building platform',
                    url: window.location.origin,
                    icons: [
                        window.location.origin + '/favicon.ico',
                        'https://avatars.githubusercontent.com/u/classchain'
                    ]
                },
                showQrModal: true,
                optionalChains,
                rpcMap,
                methods: [
                    'eth_sendTransaction',
                    'eth_signTransaction',
                    'eth_sign',
                    'personal_sign',
                    'eth_signTypedData',
                    'eth_signTypedData_v4',
                    'wallet_switchEthereumChain',
                    'wallet_addEthereumChain',
                    'eth_accounts',
                    'eth_requestAccounts',
                    'eth_chainId'
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
        
            const currentChainId = Number(
                await web3.eth.getChainId()
            );
        
            if (
                network.chainId &&
                currentChainId !== Number(network.chainId)
            ) {
                await this.switchEVMNetwork(
                    network,
                    window.ethereum
                );
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
            try {
                const provider =
                    await this.initWalletConnect(network);
        
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
                    provider.chainId ||
                    await web3.eth.getChainId()
                );
        
                if (
                    network.chainId &&
                    currentChainId !== Number(network.chainId)
                ) {
                    await this.switchEVMNetwork(
                        network,
                        provider
                    );
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
        
            } catch (err) {
                console.error(
                    '[WalletManager] WalletConnect error:',
                    err
                );
        
                if (
                    err?.code === 4001 ||
                    (
                        err?.message &&
                        (
                            err.message.includes('User rejected') ||
                            err.message.includes('User denied') ||
                            err.message.includes('rejected')
                        )
                    )
                ) {
                    throw new Error('اتصال توسط کاربر لغو شد');
                }
        
                throw new Error(
                    err?.message ||
                    'خطا در اتصال با WalletConnect'
                );
            }
        }

        async connectEVM(network) {
            // Desktop یا In-App Wallet Browser:
            // از provider تزریق‌شده استفاده کن.
            if (this.shouldUseInjectedEvm()) {
                return this.connectWithInjected(network);
            }
        
            // Chrome/Safari/Samsung Browser موبایل:
            // حتی اگر window.ethereum وجود داشته باشد،
            // مستقیماً eth_requestAccounts را صدا نزن.
            return this.connectWithWalletConnect(network);
        }

        async switchEVMNetwork(network, provider) {
            const target = provider || window.ethereum;
            if (!target || !network?.chainId) return;

            const chainIdHex = `0x${Number(network.chainId).toString(16)}`;

            try {
                await target.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: chainIdHex }]
                });
            } catch (error) {
                // 4902 = chain not added
                if (error?.code === 4902 || error?.code === -32603) {
                    try {
                        await target.request({
                            method: 'wallet_addEthereumChain',
                            params: [
                                {
                                    chainId: chainIdHex,
                                    chainName: network.name || `Chain ${network.chainId}`,
                                    nativeCurrency: {
                                        name: network.nativeToken || 'ETH',
                                        symbol: network.nativeToken || 'ETH',
                                        decimals: 18
                                    },
                                    rpcUrls: [network.rpcUrl].filter(Boolean),
                                    blockExplorerUrls: network.explorerUrl
                                        ? [network.explorerUrl]
                                        : undefined
                                }
                            ]
                        });
                    } catch (addErr) {
                        throw new Error(
                            `افزودن شبکه ${network.name} ناموفق بود. لطفاً شبکه را دستی اضافه کنید.`
                        );
                    }
                } else {
                    throw new Error(
                        `شبکه کیف پول با ${network.name} هماهنگ نیست. لطفاً شبکه را تغییر دهید.`
                    );
                }
            }
        }

        // ==================== TVM (بدون تغییر رفتار قبلی) ====================
        openInTronLink() {
            const param = {
                url: window.location.href,
                action: 'open',
                protocol: 'TronLink',
                version: '1.0'
            };
            const encoded = encodeURIComponent(JSON.stringify(param));
            window.location.href = `tronlinkoutside://pull.activity?param=${encoded}`;
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

            const tronProvider = window.tron || window.tronWeb;
            let tronWeb = window.tronWeb;

            if (window.tron && window.tron.tronWeb) {
                tronWeb = window.tron.tronWeb;
            }

            if (tronProvider && typeof tronProvider.request === 'function') {
                try {
                    await tronProvider.request({
                        method: 'tron_requestAccounts'
                    });
                } catch (e) {
                    // بعضی نسخه‌ها این متد را ندارند
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
