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

        // ==================== EVM TX LAYER (مقیاس‌پذیر) ====================
        /**
         * تبدیل مقدار به hex سازگار با کیف‌پول‌ها
         */
        toHex(value) {
            if (value == null) return undefined;
            if (typeof value === 'string') {
                if (value.startsWith('0x') || value.startsWith('0X')) {
                    return value.toLowerCase();
                }
                // decimal string
                try {
                    return '0x' + BigInt(value).toString(16);
                } catch (_) {
                    return value;
                }
            }
            if (typeof value === 'number') {
                return '0x' + Math.floor(value).toString(16);
            }
            if (typeof value === 'bigint') {
                return '0x' + value.toString(16);
            }
            // BN / BigNumber از web3
            if (typeof value.toString === 'function') {
                try {
                    return '0x' + BigInt(value.toString(10)).toString(16);
                } catch (_) {
                    return '0x' + BigInt(value.toString()).toString(16);
                }
            }
            return undefined;
        }

        /**
         * تشخیص پشتیبانی EIP-1559 از خود زنجیره (نه از نام شبکه)
         */
        async detectEip1559(web3) {
            try {
                const block = await web3.eth.getBlock('latest');
                return !!(block && block.baseFeePerGas != null);
            } catch (_) {
                return false;
            }
        }

        /**
         * ساخت آبجکت تراکنش
         *
         * feeMode:
         *  - 'none'    → فقط from/to/data/value/(gas) — کیف‌پول fee را پر می‌کند
         *                (الگوی صحیح و مقیاس‌پذیر برای WalletConnect + MetaMask/Trust)
         *  - 'eip1559' → maxFeePerGas + maxPriorityFeePerGas
         *  - 'legacy'  → gasPrice
         *  - 'auto'    → تشخیص از زنجیره (فقط برای injected)
         *
         * type را force نمی‌کنیم.
         * فیلدهای EIP-1559 و legacy را هرگز مخلوط نمی‌کنیم.
         */
        async buildEvmTxRequest(
            web3,
            { from, to, data, value = '0x0' },
            { feeMode = 'none' } = {}
        ) {
            const tx = {
                from,
                to,
                data,
                value: this.toHex(value) || '0x0'
            };

            // gas limit اختیاری
            try {
                const estimated = await web3.eth.estimateGas({
                    from,
                    to,
                    data,
                    value: tx.value
                });
                tx.gas = this.toHex(Math.floor(Number(estimated) * 1.25));
            } catch (e) {
                console.warn(
                    '[WalletManager] estimateGas failed; wallet will estimate',
                    e
                );
            }

            let mode = feeMode;
            if (mode === 'auto') {
                mode = (await this.detectEip1559(web3)) ? 'eip1559' : 'legacy';
            }

            if (mode === 'eip1559') {
                try {
                    const feeHistory = await web3.eth.getFeeHistory(
                        5,
                        'latest',
                        [25, 50, 75]
                    );
                    const bases = feeHistory.baseFeePerGas || [];
                    const base = BigInt(
                        bases[bases.length - 1] || bases[0] || 0
                    );
                    const rewards = feeHistory.reward || [];
                    let tipSum = 0n;
                    let tipCount = 0;
                    for (const row of rewards) {
                        const tipVal = row[1] != null ? row[1] : row[0];
                        if (tipVal != null) {
                            tipSum += BigInt(tipVal);
                            tipCount += 1;
                        }
                    }
                    const tip =
                        tipCount > 0
                            ? tipSum / BigInt(tipCount)
                            : 1500000000n;
                    const maxPriorityFeePerGas = tip;
                    const maxFeePerGas = base * 2n + maxPriorityFeePerGas;
                    tx.maxPriorityFeePerGas = this.toHex(maxPriorityFeePerGas);
                    tx.maxFeePerGas = this.toHex(maxFeePerGas);
                } catch (e) {
                    console.warn(
                        '[WalletManager] feeHistory failed; omitting fee fields',
                        e
                    );
                }
            } else if (mode === 'legacy') {
                try {
                    const gasPrice = await web3.eth.getGasPrice();
                    tx.gasPrice = this.toHex(gasPrice);
                } catch (e) {
                    console.warn(
                        '[WalletManager] getGasPrice failed; omitting gasPrice',
                        e
                    );
                }
            }
            // mode === 'none' → بدون فیلد fee

            return tx;
        }

        isUserRejectedError(err) {
            return (
                err?.code === 4001 ||
                (err?.message &&
                    (err.message.includes('User rejected') ||
                        err.message.includes('User denied') ||
                        err.message.includes('rejected') ||
                        err.message.includes('لغو')))
            );
        }

        isEip1559MismatchError(err) {
            const msg = String(err?.message || err || '');
            return (
                msg.includes('EIP-1559') ||
                msg.includes('EIP1559') ||
                msg.includes('maxFeePerGas') ||
                msg.includes('maxPriorityFeePerGas') ||
                msg.includes('does not support EIP-1559')
            );
        }

        /**
         * انتظار برای receipt از RPC عمومی (نه session کیف‌پول)
         */
        async waitForReceipt(web3, txHash, { timeoutMs = 180000, intervalMs = 2500 } = {}) {
            const started = Date.now();
            while (Date.now() - started < timeoutMs) {
                try {
                    const receipt = await web3.eth.getTransactionReceipt(txHash);
                    if (receipt) {
                        return receipt;
                    }
                } catch (e) {
                    console.warn('[WalletManager] getTransactionReceipt:', e);
                }
                await new Promise((r) => setTimeout(r, intervalMs));
            }
            throw new Error(
                `تأیید تراکنش در زمان مقرر انجام نشد. هش: ${txHash}`
            );
        }

        /**
         * اطمینان از هم‌خوانی chainId قبل از ارسال
         */
        async ensureEvmChain(connection) {
            const { provider, web3, network } = connection;
            if (!network?.chainId || !provider) return;

            let current = null;
            try {
                current = Number(
                    provider.chainId ||
                        (await provider.request({ method: 'eth_chainId' })) ||
                        (await web3.eth.getChainId())
                );
            } catch (_) {
                try {
                    current = Number(await web3.eth.getChainId());
                } catch (__) {}
            }

            if (current != null && current !== Number(network.chainId)) {
                console.warn(
                    '[WalletManager] chain mismatch, switching',
                    current,
                    '→',
                    network.chainId
                );
                await this.switchEVMNetwork(network, provider);
            }
        }

        /**
         * ارسال یک بار با feeMode مشخص
         */
        async requestSendTransaction(provider, tx) {
            return provider.request({
                method: 'eth_sendTransaction',
                params: [tx]
            });
        }

        /**
         * API واحد ارسال تراکنش EVM
         *
         * WalletConnect: همیشه ابتدا بدون فیلد fee (minimal).
         * MetaMask روی موبایل اگر dapp فیلد EIP-1559 بفرستد ولی
         * تعریف شبکه داخل کیف‌پول ناقص باشد، خطای
         * "does not support EIP-1559" می‌دهد — حتی روی Amoy.
         * Trust معمولاً سخت‌گیر نیست؛ برای همین فقط MetaMask می‌ترکید.
         *
         * injected: auto (تشخیص از زنجیره)، با fallback به none.
         */
        async sendEvmTransaction(connection, { to, data, value = '0x0' }) {
            if (!connection || connection.type !== 'EVM') {
                throw new Error('اتصال EVM برقرار نیست');
            }

            const { provider, web3, account } = connection;
            if (!provider || !web3 || !account) {
                throw new Error('provider یا حساب نامعتبر است');
            }

            await this.ensureEvmChain(connection);

            // مسیر اصلی برای همه کیف‌پول‌های موبایل از WC: minimal
            // injected هم با minimal سازگار است؛ fee را کیف‌پول پر می‌کند
            const primaryMode =
                connection.via === 'walletconnect' ? 'none' : 'auto';

            const tryModes =
                primaryMode === 'none'
                    ? ['none']
                    : ['auto', 'none', 'legacy'];

            let lastError = null;
            let txHash = null;

            for (const feeMode of tryModes) {
                const tx = await this.buildEvmTxRequest(
                    web3,
                    { from: account, to, data, value },
                    { feeMode }
                );

                console.log('[WalletManager] eth_sendTransaction attempt', {
                    via: connection.via,
                    feeMode,
                    to: tx.to,
                    hasGas: !!tx.gas,
                    hasMaxFee: !!tx.maxFeePerGas,
                    hasGasPrice: !!tx.gasPrice
                });

                try {
                    txHash = await this.requestSendTransaction(provider, tx);
                    lastError = null;
                    break;
                } catch (err) {
                    lastError = err;
                    console.warn(
                        '[WalletManager] send attempt failed',
                        feeMode,
                        err?.message || err
                    );

                    if (this.isUserRejectedError(err)) {
                        throw new Error('تراکنش توسط کاربر لغو شد');
                    }

                    // mismatch EIP-1559 → سراغ mode بعدی
                    if (
                        this.isEip1559MismatchError(err) &&
                        feeMode !== 'none'
                    ) {
                        continue;
                    }

                    // خطای دیگر روی WC: یک بار با none retry
                    if (
                        connection.via === 'walletconnect' &&
                        feeMode !== 'none'
                    ) {
                        continue;
                    }

                    // آخرین mode یا خطای غیرقابل retry
                    if (feeMode === tryModes[tryModes.length - 1]) {
                        throw err;
                    }
                }
            }

            if (lastError && !txHash) {
                throw lastError;
            }

            if (!txHash) {
                throw new Error('هش تراکنش از کیف‌پول دریافت نشد');
            }

            const receipt = await this.waitForReceipt(web3, txHash);
            return {
                transactionHash: txHash,
                status:
                    receipt.status === true ||
                    receipt.status === 1 ||
                    receipt.status === '0x1',
                receipt
            };
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
