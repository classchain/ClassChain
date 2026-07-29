let selectedAmount = 0;
let selectedNetwork = null;
let currentContract = null;
let userAddress = null;
let web3 = null;
let projects = {};

const networks = {
    amoy: {
        name: "Polygon Amoy (تست‌نت)",
        icon: "https://cryptologos.cc/logos/polygon-matic-logo.png",
        addressField: "contractAddress",
        usdtAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
        chainId: 80002,
        explorer: "https://amoy.polygonscan.com",
    },
    CLC: {
        name: "CLC ClassChain (تست‌نت)",
        icon: "https://cryptologos.cc/logos/polygon-matic-logo.png",
        addressField: "contractAddress",
        usdtAddress: "0x39Af73d2736f6EC94778a38c0C7Ef800e58B13a7",
        chainId: 80002,
        explorer: "https://amoy.polygonscan.com",
    },
    polygon: {
        name: "Polygon Mainnet",
        icon: "https://cryptologos.cc/logos/polygon-matic-logo.png",
        addressField: "contractAddressMainnet",
        usdtAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        chainId: 137,
        explorer: "https://polygonscan.com",
    },
    ethereum: {
        name: "Ethereum",
        icon: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
        addressField: "contractAddressEthereum",
        usdtAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        chainId: 1,
        explorer: "https://etherscan.io",
    },
    bsc: {
        name: "Binance Smart Chain",
        icon: "https://cryptologos.cc/logos/binance-coin-bnb-logo.png",
        addressField: "contractAddressBSC",
        usdtAddress: "0x55d398326f99059ff7754852469993b3197955e7",
        chainId: 56,
        explorer: "https://bscscan.com",
    },
    tron: {
        name: "Tron (TRC-20)",
        icon: "https://cryptologos.cc/logos/tron-trx-logo.png",
        addressField: "contractAddressTron",
        usdtAddress: "0xECa9bC828A3005B9a3b909f2cc5c2a54794DE05F",
        chainId: null,
        explorer: "https://tronscan.org",
    },
    arbitrum: {
        name: "Arbitrum One",
        icon: "https://cryptologos.cc/logos/arbitrum-arb-logo.png",
        addressField: "contractAddressArbitrum",
        usdtAddress: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        chainId: 42161,
        explorer: "https://arbiscan.io",
    },
    optimism: {
        name: "Optimism",
        icon: "https://cryptologos.cc/logos/optimism-ethereum-op-logo.png",
        addressField: "contractAddressOptimism",
        usdtAddress: "0x94b008aa00579c13056b0a762ad3af54ac829873",
        chainId: 10,
        explorer: "https://optimistic.etherscan.io",
    },
    avalanche: {
        name: "Avalanche",
        icon: "https://cryptologos.cc/logos/avalanche-avax-logo.png",
        addressField: "contractAddressAvalanche",
        usdtAddress: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
        chainId: 43114,
        explorer: "https://snowtrace.io",
    },
    solana: {
        name: "Solana",
        icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
        addressField: "contractAddressSolana",
        usdtAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        chainId: null,
        explorer: "https://solscan.io",
    }
};

// ==================== توابع کمکی ====================

function getTokenDecimals(network) {
    const decimalsMap = {
        'amoy': 6, 'CLC': 18, 'polygon': 6, 'ethereum': 6,
        'bsc': 6, 'arbitrum': 6, 'optimism': 6, 'avalanche': 6,
        'solana': 6, 'tron': 6
    };
    return decimalsMap[network] || 6;
}

function optimisticProgressUpdate(donatedAmount) {
    const progressTextEl = document.getElementById('progressText');
    if (!progressTextEl) return;
    let currentText = progressTextEl.innerText || "0";
    let currentRaised = parseFloat(currentText) || 0;
    currentRaised += donatedAmount;
    const targetMatch = currentText.match(/از ([\d,]+)/);
    const target = targetMatch ? parseFloat(targetMatch[1].replace(/,/g, '')) : 100000;
    const percent = Math.min((currentRaised / target) * 100, 100);
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = percent + '%';
    document.getElementById('progressText').innerText = 
        `${currentRaised.toFixed(2)} USDT از ${target.toLocaleString('fa-IR')} USDT جمع شده (${percent.toFixed(1)}%)`;
}

function handleTransactionError(err, approveTxHash, depositTxHash, net) {
    let errorMsg = "خطا در ارسال تراکنش:\n";
    if (err.code === 4001 || err.message?.includes("User denied") || err.message?.includes("denied")) {
        errorMsg += "تراکنش توسط شما لغو شد.";
    } else if (err.message?.includes("insufficient funds")) {
        errorMsg += "موجودی کیف پول (گس یا توکن) کافی نیست.";
    } else if (err.message?.includes("execution reverted")) {
        errorMsg += "تراکنش برگشت خورد. ممکن است قرارداد هنوز فعال نشده یا توکن مجاز نباشد.";
    } else {
        errorMsg += err.message || "خطای نامشخص";
    }
    if (approveTxHash && !depositTxHash) {
        errorMsg += `\n\n✅ Approve موفق بود:\n${net.explorer}/tx/${approveTxHash}\n❌ اما مرحله واریز (Deposit) شکست خورد.`;
    }
    alert(errorMsg);
    const btn = document.getElementById('connectBtn');
    if (btn) btn.style.display = 'block';
    const msg = document.getElementById('successMessage');
    if (msg) msg.style.display = 'none';
}

function updateButtonState() {
    const termsConsent = document.getElementById('termsConsent');
    const connectBtn = document.getElementById('connectBtn');
    if (termsConsent && connectBtn) {
        connectBtn.disabled = !termsConsent.checked;
    }
}

// ==================== انتخاب شبکه ====================
function selectNetwork(network) {
    selectedNetwork = network;
    const net = networks[network];
    if (!net) return;

    if (network === 'tron') {
        currentContract = projects.contractAddressTron || null;
    } else {
        currentContract = projects[net.addressField] || projects.contractAddress || null;
    }
    
    const qrSection = document.getElementById('qrSection');
    if (qrSection) {
        qrSection.style.display = network === 'tron' ? 'block' : 'none';
    }
    
    console.log(`✅ شبکه انتخاب شد: ${net.name}`);
    console.log(`📝 آدرس قرارداد: ${currentContract}`);
}

// ==================== تابع بارگذاری پروژه ====================
async function loadProject() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');

    if (!projectId) {
        const title = document.getElementById('projectTitle');
        if (title) title.innerText = "پروژه یافت نشد";
        return;
    }

    try {
        const response = await fetch('data/Projects.json');
        if (!response.ok) {
            throw new Error('فایل Projects.json پیدا نشد');
        }
        const data = await response.json();

        let foundProject = null;
        if (data.features && Array.isArray(data.features)) {
            data.features.forEach(feature => {
                if (feature.attributes && feature.attributes.ProjectID === projectId) {
                    foundProject = feature.attributes;
                }
            });
        }

        if (!foundProject) {
            const title = document.getElementById('projectTitle');
            if (title) title.innerText = "پروژه یافت نشد";
            return;
        }

        projects = foundProject;
        
        // نمایش نام پروژه
        const titleEl = document.getElementById('projectTitle');
        if (titleEl) titleEl.innerText = foundProject["نام پروژه"] || "پروژه بدون نام";
        
        const descEl = document.getElementById('projectDesc');
        if (descEl) {
            descEl.innerText = `${foundProject.استان || ''} - ${foundProject.منطقه || ''} | ${foundProject["تعداد کلاس"] || 0} کلاس`;
        }

        const target = foundProject["targetAmount(USDT)"] || 0;

        // پر کردن منوی شبکه
        const select = document.getElementById('networkSelect');
        if (select) {
            select.innerHTML = '';
            Object.keys(networks).forEach(key => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = networks[key].name;
                select.appendChild(opt);
            });

            // انتخاب پیش‌فرض
            if (select.options.length > 0) {
                select.value = 'polygon';
                selectNetwork('polygon');
            }
        }

        loadProgress(target);
        loadDonors();

    } catch (e) {
        console.error("خطا در لود پروژه:", e);
        const title = document.getElementById('projectTitle');
        if (title) title.innerText = "خطا در بارگذاری پروژه";
    }
}

// ==================== تابع بارگذاری کمک‌کنندگان ====================
async function loadDonors() {
    console.log('📋 بارگذاری لیست کمک‌کنندگان...');
    // در آینده از قرارداد می‌خوانیم
    const donorsList = document.getElementById('donorsList');
    if (donorsList) {
        donorsList.innerHTML = '<p style="color: #94a3b8; text-align: center;">هنوز کمک‌کننده‌ای ثبت نشده است</p>';
    }
}

// ==================== تابع پیشرفت ====================
async function loadProgress(target = 100000) {
    const totalRaised = 0; // در آینده از on-chain بخوانید
    const percent = Math.min((totalRaised / target) * 100, 100);

    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = percent + '%';
    
    const text = document.getElementById('progressText');
    if (text) {
        text.innerText = `${totalRaised.toFixed(2)} USDT از ${target.toLocaleString('fa-IR')} USDT جمع شده (${percent.toFixed(1)}%)`;
    }
}

// ==================== تابع ذخیره ایمیل ====================
function saveEmail() {
    const email = document.getElementById('donorEmail')?.value.trim();
    const consent = document.getElementById('consent')?.checked;
    
    if (!email || !consent) {
        alert("لطفاً ایمیل معتبر وارد کنید و تأیید را بزنید");
        return;
    }
    alert("✅ ایمیل شما ثبت شد! آپدیت‌های پروژه برایتان ارسال خواهد شد ❤️");
}

// ==================== تابع بررسی Tron ====================
function isTronReady() {
    return window.tronWeb && window.tronWeb.defaultAddress && window.tronWeb.defaultAddress.base58;
}

// ==================== تابع اصلی Donate ====================
document.addEventListener('DOMContentLoaded', function() {
    
    // تنظیم رویداد مقدار سفارشی
    const customAmount = document.getElementById('customAmount');
    if (customAmount) {
        customAmount.oninput = (e) => {
            selectedAmount = parseFloat(e.target.value) || 0;
        };
    }
    
    // تنظیم رویداد تیک تایید
    const termsConsent = document.getElementById('termsConsent');
    if (termsConsent) {
        termsConsent.addEventListener('change', updateButtonState);
    }
    
    // دکمه donate
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.onclick = async () => {
            if (!selectedNetwork) {
                alert("لطفاً ابتدا یک شبکه از منو انتخاب کنید");
                return;
            }
            if (!currentContract) {
                alert("خزانه هوشمند برای این شبکه هنوز راه‌اندازی نشده");
                return;
            }
            if (selectedAmount <= 0) {
                alert("لطفاً مقدار معتبر وارد کنید");
                return;
            }
            
            const net = networks[selectedNetwork];
            if (!net) {
                alert("شبکه انتخاب شده معتبر نیست");
                return;
            }
            
            const isInfinite = document.getElementById('infiniteApprove')?.checked || false;
            
            /* =========================
               شاخه TRON
               ========================= */
            if (selectedNetwork === 'tron') {
              if (!isTronReady()) {
                alert("لطفاً TronLink را نصب و فعال کنید");
                return;
              }

              const fundDepositABI = [{
                "inputs": [
                  { "name": "token", "type": "address" },
                  { "name": "amount", "type": "uint256" }
                ],
                "name": "depositToken",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
              }];

              let approveTxHash = null;

              try {
                const tronWeb = window.tronWeb;
                const userAddr = tronWeb.defaultAddress.base58;
                const amount = Math.floor(selectedAmount * 1_000_000); // فرض: ۶ دسیمال تتر ترون

                // ====================== مرحله ۱: Approve ======================
                const txHash = document.getElementById('txHash');
                if (txHash) {
                  txHash.innerHTML = `
                    <p><strong>مرحله ۱ از ۲:</strong> تأیید برداشت (Approve)</p>
                    <p>در حال ارسال تراکنش به TronLink...</p>
                  `;
                }

                const usdtContract = await tronWeb.contract().at(net.usdtAddress);
                const approveTx = await usdtContract.approve(currentContract, amount).send();
                approveTxHash = approveTx;

                if (txHash) {
                  txHash.innerHTML = `
                    <p style="color: green;">✅ مرحله ۱ موفق: Approve ثبت شد!</p>
                    <p><a href="${net.explorer}/transaction/${approveTxHash}" target="_blank">مشاهده Approve</a></p>
                    <hr>
                    <p><strong>مرحله ۲ از ۲:</strong> واریز به خزانه (Deposit)</p>
                    <p>در حال ارسال تراکنش دوم به TronLink...</p>
                  `;
                }

                // ====================== مرحله ۲: Deposit ======================
                const fundContract = await tronWeb.contract(fundDepositABI, currentContract);
                const tx = await fundContract.depositToken(net.usdtAddress, amount).send();

                if (txHash) {
                  txHash.innerHTML = `
                    <p style="color: green; font-size: 1.15em;">🎉 کمک شما با موفقیت ثبت شد! ❤️</p>
                    <p>مبلغ: <strong>${selectedAmount} USDT</strong></p>
                    <p><a href="${net.explorer}/transaction/${approveTxHash}" target="_blank">مشاهده Approve</a> |
                       <a href="${net.explorer}/transaction/${tx}" target="_blank">مشاهده Deposit</a></p>
                    <p>ممنون از حمایت شما! ❤️</p>
                  `;
                }

                const successMsg = document.getElementById('successMessage');
                if (successMsg) successMsg.style.display = 'block';
                if (connectBtn) connectBtn.style.display = 'none';

                optimisticProgressUpdate(selectedAmount);

              } catch (err) {
                let userMessage = 'خطا در تراکنش:\n';
                if (err.code === 4001) userMessage += '❌ شما تراکنش را لغو کردید.';
                else if (err.message && err.message.includes('insufficient funds')) userMessage += '❌ موجودی کیف پول کافی نیست.';
                else userMessage += err.message || 'خطای نامشخص';

                if (approveTxHash) {
                  userMessage += `\n\n✅ Approve موفق بود:\n${net.explorer}/transaction/${approveTxHash}\n❌ اما مرحله واریز (Deposit) شکست خورد.`;
                }
                alert(userMessage);
              }
              return;
            }
            
            /* =========================
               شاخه EVM
               ========================= */
            if (typeof window.ethereum === 'undefined') {
                alert("لطفاً MetaMask یا کیف پول سازگار نصب کنید");
                return;
            }
            
            let approveTxHash = null;
            let depositTxHash = null;
            
            try {
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                web3 = new Web3(window.ethereum);
                const accounts = await web3.eth.getAccounts();
                userAddress = accounts[0];

                // ====================== مدیریت شبکه ======================
                const currentChainId = await web3.eth.getChainId();
                if (currentChainId !== net.chainId) {
                    const txHash = document.getElementById('txHash');
                    if (txHash) {
                        txHash.innerHTML = `<p><strong>در حال تغییر شبکه به ${net.name}...</strong></p>`;
                    }
                    const successMsg = document.getElementById('successMessage');
                    if (successMsg) successMsg.style.display = 'block';
                    if (connectBtn) connectBtn.style.display = 'none';

                    try {
                        await window.ethereum.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: '0x' + net.chainId.toString(16) }]
                        });
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    } catch (switchError) {
                        if (connectBtn) connectBtn.style.display = 'block';
                        if (successMsg) successMsg.style.display = 'none';
                        alert(`❌ شبکه کیف پول شما با شبکه انتخابی مطابقت ندارد.\n\nشبکه انتخابی: ${net.name}\nلطفاً دستی سوئیچ کنید.`);
                        return;
                    }
                }
                
                const decimals = getTokenDecimals(selectedNetwork);
                const amount = web3.utils.toBN(selectedAmount * (10 ** decimals));
                
                // ====================== بررسی موجودی ======================
                const balanceABI = [{ 
                    "constant": true, 
                    "inputs": [{"name": "_owner", "type": "address"}], 
                    "name": "balanceOf", 
                    "outputs": [{"name": "balance", "type": "uint256"}], 
                    "type": "function" 
                }];
                
                const tokenForBalance = new web3.eth.Contract(balanceABI, net.usdtAddress);
                const userBalance = await tokenForBalance.methods.balanceOf(userAddress).call();
                
                if (web3.utils.toBN(userBalance).lt(amount)) {
                    const balanceMain = (Number(userBalance) / (10 ** decimals)).toFixed(2);
                    alert(`⚠️ موجودی کافی نیست!\n\nموجودی شما: ${balanceMain} USDT\nمبلغ درخواستی: ${selectedAmount} USDT`);
                    return;
                }
                
                // ====================== ABI ======================
                const tokenABI = [
                    { 
                        "inputs": [
                            {"name": "spender", "type": "address"},
                            {"name": "amount", "type": "uint256"}
                        ], 
                        "name": "approve", 
                        "outputs": [{"name": "", "type": "bool"}], 
                        "type": "function" 
                    },
                    { 
                        "constant": true, 
                        "inputs": [{"name": "_owner", "type": "address"}], 
                        "name": "balanceOf", 
                        "outputs": [{"name": "balance", "type": "uint256"}], 
                        "type": "function" 
                    }
                ];
                
                const fundABI = [{ 
                    "inputs": [
                        {"name": "token", "type": "address"},
                        {"name": "amount", "type": "uint256"}
                    ], 
                    "name": "depositToken", 
                    "outputs": [], 
                    "stateMutability": "nonpayable", 
                    "type": "function" 
                }];

                const tokenContract = new web3.eth.Contract(tokenABI, net.usdtAddress);
                const fundContract = new web3.eth.Contract(fundABI, currentContract);
                
                // ====================== مرحله ۱: Approve ======================
                const approveAmount = isInfinite 
                    ? web3.utils.toBN('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
                    : amount;
                
                const successMsg = document.getElementById('successMessage');
                if (successMsg) successMsg.style.display = 'block';
                if (connectBtn) connectBtn.style.display = 'none';
                
                const txHash = document.getElementById('txHash');
                if (txHash) {
                    txHash.innerHTML = `
                        <p><strong>مرحله ۱ از ۲:</strong> ${isInfinite ? 'اجازه دائمی برداشت' : 'تأیید برداشت'} (Approve)</p>
                        <p>در حال ارسال تراکنش به متامسک...</p>
                    `;
                }

                const approveGas = await tokenContract.methods
                    .approve(currentContract, approveAmount)
                    .estimateGas({ from: userAddress });
                    
                const approveTx = await tokenContract.methods
                    .approve(currentContract, approveAmount)
                    .send({ 
                        from: userAddress,
                        gas: Math.floor(approveGas * 1.25)
                    });

                approveTxHash = approveTx.transactionHash;

                if (txHash) {
                    txHash.innerHTML = `
                        <p style="color: green;">✅ مرحله ۱ موفق: ${isInfinite ? 'اجازه دائمی' : 'اجازه برداشت'} صادر شد!</p>
                        <p><a href="${net.explorer}/tx/${approveTxHash}" target="_blank">مشاهده Approve</a></p>
                        <hr>
                        <p><strong>مرحله ۲ از ۲:</strong> واریز به خزانه (Deposit)</p>
                        <p>در حال ارسال تراکنش دوم به متامسک...</p>
                    `;
                }
                
                // ====================== مرحله ۲: Deposit ======================
                const depositGas = await fundContract.methods
                    .depositToken(net.usdtAddress, amount)
                    .estimateGas({ from: userAddress });

                const depositTx = await fundContract.methods
                    .depositToken(net.usdtAddress, amount)
                    .send({ 
                        from: userAddress,
                        gas: Math.floor(depositGas * 1.3)
                    });

                depositTxHash = depositTx.transactionHash;

                // ====================== موفقیت ======================
                if (txHash) {
                    txHash.innerHTML = `
                        <p style="color: green; font-size: 1.15em;">🎉 کمک شما با موفقیت ثبت شد! ❤️</p>
                        <p>مبلغ: <strong>${selectedAmount} USDT</strong></p>
                        ${isInfinite ? '<p style="color:#10b981">✅ اجازه دائمی فعال شد</p>' : ''}
                        <p><a href="${net.explorer}/tx/${approveTxHash}" target="_blank">مشاهده Approve</a> | 
                           <a href="${net.explorer}/tx/${depositTxHash}" target="_blank">مشاهده Deposit</a></p>
                        <p>ممنون از حمایت شما! ❤️</p>
                    `;
                }
                
                optimisticProgressUpdate(selectedAmount);
                
            } catch (err) {
                console.error("خطا در تراکنش:", err);
                handleTransactionError(err, approveTxHash, depositTxHash, net);
            }
        };
    }
    
    // بارگذاری اولیه
    loadProject();
    updateButtonState();
});

// ==================== فعال‌سازی particles ====================
if (typeof particlesJS !== 'undefined') {
    particlesJS("particles-js", {
        "particles": {
            "number": { "value": 100 },
            "color": { "value": ["#4cc9f0", "#8b5cf6", "#7209b7"] },
            "shape": { "type": "circle" },
            "opacity": { "value": 0.6, "random": true },
            "size": { "value": 3, "random": true },
            "line_linked": {
                "enable": true,
                "distance": 140,
                "color": "#6366f1",
                "opacity": 0.3,
                "width": 1
            },
            "move": { "enable": true, "speed": 1.5 }
        },
        "interactivity": {
            "events": { "onhover": { "enable": true, "mode": "repulse" } }
        }
    });
}
