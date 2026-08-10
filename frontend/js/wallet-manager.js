(function () {
    class WalletManager {
        constructor() {
            this.connection = null;
        }

        // تشخیص موبایل
        isMobile() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        }

        // ساخت Deep Link برای MetaMask
        openInMetaMask() {
            const currentUrl = window.location.href;
            // حذف https:// از اول (طبق مستندات MetaMask)
            const dappUrl = currentUrl.replace(/^https?:\/\//, '');
            const deepLink = `https://link.metamask.io/dapp/${dappUrl}`;
            window.location.href = deepLink;
        }

        // ساخت Deep Link برای TronLink
        openInTronLink() {
            const param = {
                url: window.location.href,
                action: "open",
                protocol: "TronLink",
                version: "1.0"
            };
            const encoded = encodeURIComponent(JSON.stringify(param));
            // native deep link
            window.location.href = `tronlinkoutside://pull.activity?param=${encoded}`;
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
            // اگر در موبایل هستیم و MetaMask inject نشده
            if (typeof window.ethereum === 'undefined') {
                if (this.isMobile()) {
                    // باز کردن صفحه داخل مرورگر MetaMask
                    this.openInMetaMask();
                    // کاربر از اپ خارج می‌شود، پس خطا می‌دهیم تا جریان متوقف شود
                    throw new Error('در حال باز کردن صفحه داخل MetaMask... لطفاً چند ثانیه صبر کنید و دوباره تلاش کنید.');
                }
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
                // اگر شبکه وجود نداشت، می‌توانیم بعداً addEthereumChain اضافه کنیم
                throw new Error(`شبکه کیف پول با ${network.name} هماهنگ نیست. لطفاً شبکه را تغییر دهید.`);
            }
        }

        async connectTVM(network) {
            // اگر در موبایل هستیم و TronLink inject نشده
            if (!window.tronWeb && !window.tron) {
                if (this.isMobile()) {
                    this.openInTronLink();
                    throw new Error('در حال باز کردن صفحه داخل TronLink... لطفاً چند ثانیه صبر کنید و دوباره تلاش کنید.');
                }
                throw new Error('لطفاً TronLink را نصب و فعال کنید');
            }

            // پشتیبانی از هر دو حالت قدیمی و جدید TronLink
            const tronProvider = window.tron || window.tronWeb;
            let tronWeb = window.tronWeb;

            // اگر فقط window.tron وجود دارد
            if (window.tron && window.tron.tronWeb) {
                tronWeb = window.tron.tronWeb;
            }

            // درخواست دسترسی (نسخه‌های جدید)
            if (tronProvider && typeof tronProvider.request === 'function') {
                try {
                    await tronProvider.request({ method: 'tron_requestAccounts' });
                } catch (e) {
                    // بعضی نسخه‌ها این متد را ندارند
                }
            } else if (tronWeb && typeof tronWeb.request === 'function') {
                await tronWeb.request({ method: 'tron_requestAccounts' });
            }

            const account = tronWeb?.defaultAddress?.base58;
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
