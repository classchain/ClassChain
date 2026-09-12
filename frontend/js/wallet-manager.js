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

        async connect(network, options = {}) {
            if (!network || !network.enabled) {
                throw new Error('این شبکه هنوز برای پرداخت فعال نیست');
            }

            if (network.type === 'EVM') {
                return this.connectEVM(network);
            }

            if (network.type === 'TVM') {
                return this.connectTVM(network, options);
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

        /**
         * لیست RPCهای ترجیحی برای هر chainId
         * اولویت با network-config است؛ این فقط پشتیبان پایدار است.
         */
        getPreferredRpcUrls(network) {
            const chainId = Number(network?.chainId);
            const fromConfig = [];
            if (network?.rpcUrl) fromConfig.push(network.rpcUrl);
            if (Array.isArray(network?.rpcFallbacks)) {
                fromConfig.push(...network.rpcFallbacks);
            }

            // RPCهای پایدار شناخته‌شده (testnet/mainnetهای رایج)
            const known = {
                80002: [
                    'https://rpc-amoy.polygon.technology',
                    'https://polygon-amoy-bor-rpc.publicnode.com',
                    'https://80002.rpc.thirdweb.com'
                ],
                137: [
                    'https://polygon-rpc.com',
                    'https://polygon-bor-rpc.publicnode.com',
                    'https://rpc.ankr.com/polygon'
                ],
                1: [
                    'https://ethereum-rpc.publicnode.com',
                    'https://cloudflare-eth.com'
                ]
            };

            const extra = known[chainId] || [];
            const seen = new Set();
            const out = [];
            for (const u of [...fromConfig, ...extra]) {
                if (!u || seen.has(u)) continue;
                // drpc و endpointهای ناپایدار را به انتها ببر
                seen.add(u);
                out.push(u);
            }
            // drpc را آخر بگذار اگر جایی هست
            out.sort((a, b) => {
                const score = (u) =>
                    /drpc\.org/i.test(u) ? 1 : 0;
                return score(a) - score(b);
            });
            return out;
        }

        async switchEVMNetwork(network, provider) {
            const target = provider || window.ethereum;
            if (!target || !network?.chainId) return;

            const chainIdHex = `0x${Number(network.chainId).toString(16)}`;
            const rpcUrls = this.getPreferredRpcUrls(network);
            const explorer = network.explorerUrl || network.explorer;

            const addParams = {
                chainId: chainIdHex,
                chainName: network.name || `Chain ${network.chainId}`,
                nativeCurrency: {
                    name: network.nativeToken || 'ETH',
                    symbol: network.nativeToken || 'ETH',
                    decimals: 18
                },
                rpcUrls: rpcUrls.length ? rpcUrls : ['https://rpc-amoy.polygon.technology'],
                blockExplorerUrls: explorer ? [explorer] : undefined
            };

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
                            params: [addParams]
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

        /**
         * تلاش برای به‌روزرسانی RPC شبکه داخل کیف‌پول
         * (اگر از قبل اضافه شده باشد، بعضی کیف‌پول‌ها نادیده می‌گیرند)
         */
        async tryRefreshWalletRpc(connection) {
            const { provider, network } = connection || {};
            if (!provider || !network?.chainId) return;
            if (typeof provider.request !== 'function') return;

            const chainIdHex = `0x${Number(network.chainId).toString(16)}`;
            const rpcUrls = this.getPreferredRpcUrls(network);
            const explorer = network.explorerUrl || network.explorer;

            try {
                await provider.request({
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
                            rpcUrls,
                            blockExplorerUrls: explorer ? [explorer] : undefined
                        }
                    ]
                });
            } catch (_) {
                // عمداً نادیده — همه کیف‌پول‌ها اجازه update نمی‌دهند
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
            { feeMode = 'none', network = null } = {}
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
                    tx.gasPrice = await this.fetchGasPriceWithFallbacks(
                        web3,
                        network
                    );
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

        isRpcEndpointError(err) {
            const msg = String(err?.message || err || '');
            return (
                msg.includes('RPC endpoint') ||
                msg.includes('too many errors') ||
                msg.includes('eth_gasPrice') ||
                msg.includes('eth_estimateGas') ||
                msg.includes('rate limit') ||
                msg.includes('429') ||
                msg.includes('timeout') ||
                msg.includes('Failed to fetch') ||
                msg.includes('network error')
            );
        }

        /**
         * گرفتن gasPrice از RPCهای شبکه با fallback
         * وابستگی به RPC داخل MetaMask را کم می‌کند.
         */
        async fetchGasPriceWithFallbacks(web3, network) {
            try {
                const gp = await web3.eth.getGasPrice();
                if (gp) return this.toHex(gp);
            } catch (e) {
                console.warn('[WalletManager] primary getGasPrice failed', e);
            }

            const urls = this.getPreferredRpcUrls(network || {});

            for (const url of urls) {
                if (!url) continue;
                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'eth_gasPrice',
                            params: []
                        })
                    });
                    const json = await res.json();
                    if (json?.result) {
                        return json.result.startsWith('0x')
                            ? json.result
                            : this.toHex(json.result);
                    }
                } catch (e) {
                    console.warn('[WalletManager] fallback gasPrice RPC failed', url, e);
                }
            }

            // آخرین پناه: مقدار معقول برای testnet/mainnet
            return this.toHex(30_000_000_000); // 30 gwei
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

            // تلاش برای RPC بهتر داخل کیف‌پول (اگر پشتیبانی کند)
            try {
                await this.tryRefreshWalletRpc(connection);
            } catch (_) {}

            await this.ensureEvmChain(connection);

            /**
             * استراتژی fee (مقیاس‌پذیر برای کیف‌پول‌های مختلف):
             *
             * WalletConnect + MetaMask:
             *  - اگر fee نفرستیم، MetaMask از RPC داخلی خودش eth_gasPrice می‌زند.
             *    روی شبکه‌های custom/testnet (مثل Amoy) آن RPC اغلب خراب/rate-limit است
             *    → خطای "RPC endpoint returned too many errors".
             *  - اگر EIP-1559 بفرستیم، MetaMask گاهی می‌گوید شبکه 1559 را support نمی‌کند
             *    (تعریف ناقص شبکه داخل کیف‌پول).
             *  - پس برای WC اول legacy gasPrice را خودمان از RPCهای network-config می‌گیریم.
             *
             * injected (مرورگر دسکتاپ / in-app): auto (تشخیص از زنجیره).
             */
            const tryModes =
                connection.via === 'walletconnect'
                    ? ['legacy', 'none']
                    : ['auto', 'legacy', 'none'];

            let lastError = null;
            let txHash = null;

            for (const feeMode of tryModes) {
                const tx = await this.buildEvmTxRequest(
                    web3,
                    { from: account, to, data, value },
                    { feeMode, network: connection.network }
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

                    // برای هر mismatch یا RPC خراب، mode بعدی را امتحان کن
                    if (
                        this.isEip1559MismatchError(err) ||
                        this.isRpcEndpointError(err)
                    ) {
                        continue;
                    }

                    // سایر خطاها هم تا آخرین mode retry
                    if (feeMode !== tryModes[tryModes.length - 1]) {
                        continue;
                    }

                    throw err;
                }
            }

            if (lastError && !txHash) {
                if (this.isRpcEndpointError(lastError)) {
                    const rpcHint =
                        this.getPreferredRpcUrls(connection.network || {})[0] ||
                        'https://rpc-amoy.polygon.technology';
                    throw new Error(
                        'RPC شبکه داخل کیف‌پول در دسترس نیست.\n\n' +
                            'این خطا از MetaMask است نه از سایت.\n' +
                            'مسیر رفع:\n' +
                            'MetaMask → Settings → Networks → Amoy → RPC URL\n' +
                            'این آدرس را بگذارید:\n' +
                            rpcHint +
                            '\n\nبعد دوباره پرداخت را امتحان کنید.'
                    );
                }
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

        // ==================== TVM ====================
        isInTronLinkBrowser() {
            const ua = navigator.userAgent || '';
            if (/TronLink/i.test(ua)) return true;
            try {
                if (window.tronWeb && window.tronWeb.ready) return true;
            } catch (_) {}
            return false;
        }

        /**
         * ساخت URL با state فرم تا داخل TronLink دوباره پر نشود.
         * Chrome/Samsung و in-app TronLink storage مشترک ندارند؛
         * فقط query string قابل اتکا است.
         */
        buildTronLinkReturnUrl(extraParams = {}) {
            const url = new URL(window.location.href);
            Object.entries(extraParams).forEach(([k, v]) => {
                if (v === undefined || v === null || v === '') {
                    url.searchParams.delete(k);
                } else {
                    url.searchParams.set(k, String(v));
                }
            });
            // داخل TronLink بعد از لود، جریان پرداخت را ادامه بده
            url.searchParams.set('tron_resume', '1');
            return url.toString();
        }

        openInTronLink(returnUrl) {
            const targetUrl = returnUrl || window.location.href;
            const param = {
                url: targetUrl,
                action: 'open',
                protocol: 'TronLink',
                version: '1.0'
            };
            const encoded = encodeURIComponent(JSON.stringify(param));
            window.location.href = `tronlinkoutside://pull.activity?param=${encoded}`;
        }

        /**
         * اتصال TVM
         * - اگر injected باشد → مستقیم
         * - موبایل بدون injected → deep link با state در URL
         */
        async connectTVM(network, options = {}) {
            if (!window.tronWeb && !window.tron) {
                if (this.isMobile()) {
                    const returnUrl =
                        options.returnUrl ||
                        this.buildTronLinkReturnUrl({
                            network: network?.id || '',
                            amount: options.amount || '',
                            terms: options.terms ? '1' : ''
                        });
                    this.openInTronLink(returnUrl);
                    throw new Error(
                        'در حال باز کردن صفحه داخل TronLink...\n' +
                            'بعد از باز شدن، اگر فرم خالی بود یک‌بار دکمه پرداخت را بزنید؛\n' +
                            'مبلغ و شبکه از روی لینک بازیابی می‌شوند.'
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


        /**
         * انتظار برای نتیجه تراکنش TRON از شبکه
         */
        async waitForTronTransaction(tronWeb, txId, options = {}) {
            const timeoutMs = options.timeoutMs || 120000;
            const intervalMs = options.intervalMs || 3000;
            const startedAt = Date.now();

            while (Date.now() - startedAt < timeoutMs) {
                try {
                    const info = await tronWeb.trx.getTransactionInfo(txId);

                    if (info && info.id) {
                        if (info.receipt?.result === 'SUCCESS') {
                            return { success: true, info, transactionHash: txId };
                        }

                        if (
                            info.receipt?.result === 'FAILED' ||
                            info.result === 'FAILED' ||
                            info.resMessage
                        ) {
                            return {
                                success: false,
                                info,
                                transactionHash: txId,
                                error:
                                    info.resMessage ||
                                    'Transaction execution failed'
                            };
                        }
                    }
                } catch (e) {
                    console.warn('[WalletManager] wait TRON tx:', e);
                }

                await new Promise((resolve) => setTimeout(resolve, intervalMs));
            }

            throw new Error(
                'زمان انتظار برای تأیید تراکنش در شبکه TRON به پایان رسید.'
            );
        }

        /**
         * API واحد ارسال تراکنش TVM (هم‌تراز sendEvmTransaction)
         *
         * donate فقط ABI/method/args را می‌دهد؛
         * اتصال، send و wait اینجا انجام می‌شود.
         *
         * @param {object} connection - خروجی connectTVM
         * @param {object} spec
         * @param {string} spec.contractAddress
         * @param {Array|null} spec.abi - اگر null، از ABI داخلی قرارداد استفاده می‌شود
         * @param {string} spec.method - نام متد مثل approve / depositToken
         * @param {Array} spec.args
         * @param {object} [spec.sendOptions] - گزینه‌های tronWeb .send()
         */
        async sendTvmTransaction(
            connection,
            { contractAddress, abi = null, method, args = [], sendOptions = {} }
        ) {
            if (!connection || connection.type !== 'TVM') {
                throw new Error('اتصال TVM برقرار نیست');
            }

            const tronWeb = connection.tronWeb;
            if (!tronWeb) {
                throw new Error('tronWeb در دسترس نیست');
            }
            if (!contractAddress) {
                throw new Error('آدرس قرارداد مشخص نیست');
            }
            if (!method) {
                throw new Error('نام متد قرارداد مشخص نیست');
            }

            let contract;
            try {
                if (abi && Array.isArray(abi) && abi.length) {
                    contract = await tronWeb.contract(abi, contractAddress);
                } else {
                    contract = await tronWeb.contract().at(contractAddress);
                }
            } catch (e) {
                console.error('[WalletManager] load TRON contract failed', e);
                throw new Error(
                    'بارگذاری قرارداد TRON ناموفق بود: ' +
                        (e?.message || String(e))
                );
            }

            if (!contract[method] || typeof contract[method] !== 'function') {
                throw new Error(`متد ${method} روی قرارداد یافت نشد`);
            }

            console.log('[WalletManager] TRON send', {
                via: connection.via,
                method,
                contractAddress,
                argsPreview: args.map((a) =>
                    typeof a === 'string' && a.length > 12
                        ? a.slice(0, 10) + '…'
                        : a
                )
            });

            let txId;
            try {
                txId = await contract[method](...args).send(sendOptions);
            } catch (err) {
                if (
                    err?.code === 4001 ||
                    (err?.message &&
                        (err.message.includes('User rejected') ||
                            err.message.includes('User denied') ||
                            err.message.includes('Confirmation declined') ||
                            err.message.includes('cancel')))
                ) {
                    throw new Error('تراکنش توسط کاربر لغو شد');
                }
                throw err;
            }

            if (!txId) {
                throw new Error('شناسه تراکنش TRON از کیف‌پول دریافت نشد');
            }

            // بعضی نسخه‌ها object برمی‌گردانند
            if (typeof txId === 'object') {
                txId = txId.txid || txId.transaction?.txID || txId;
            }

            const result = await this.waitForTronTransaction(tronWeb, txId);

            if (!result.success) {
                const error = new Error(
                    result.error || 'تراکنش TRON در شبکه ناموفق بود.'
                );
                error.txHash = txId;
                throw error;
            }

            return {
                transactionHash: txId,
                status: true,
                info: result.info
            };
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
