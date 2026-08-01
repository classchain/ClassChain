let selectedAmount = 0;
let selectedNetwork = null;
let currentContract = null;
let userAddress = null;
let web3 = null;
let projects = {};

const networkConfig = window.ClassChainNetworkConfig || { NETWORKS: {}, getDonationNetworks: () => [] };
const networks = networkConfig.NETWORKS;
const walletManager = new window.ClassChainWalletManager();

// ==================== توابع کمکی ====================

function getTokenDecimals(network) {
    return networks[network]?.tokenDecimals || 6;
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
    const net = networks[selectedNetwork];

    if (!connectBtn) return;

    if (!net) {
        connectBtn.textContent = 'ابتدا شبکه را انتخاب کنید';
        connectBtn.disabled = true;
        return;
    }

    connectBtn.textContent = net.buttonLabel || 'اتصال کیف پول و پرداخت';
    connectBtn.disabled = !termsConsent?.checked || !net.enabled || !currentContract;

    if (!net.enabled) {
        connectBtn.textContent = `${net.walletName || net.name} هنوز فعال نیست`;
    } else if (!currentContract) {
        connectBtn.textContent = `خزانه ${net.name} هنوز راه‌اندازی نشده`;
    }
}

function updateWalletInfo(connection) {
    const walletInfo = document.getElementById('walletInfo');
    const userAddressEl = document.getElementById('userAddress');

    if (!walletInfo || !userAddressEl || !connection?.account) return;

    userAddress = connection.account;
    userAddressEl.innerText = `${connection.network.walletName}: ${connection.account}`;
    walletInfo.style.display = 'block';
}

// ==================== انتخاب شبکه ====================
function selectNetwork(network) {
    selectedNetwork = network;
    const net = networks[network];
    if (!net) return;

    currentContract = projects[net.addressField] || null;
    if (net.type === 'EVM') {
        currentContract = currentContract || projects.contractAddress || null;
    }

    const qrSection = document.getElementById('qrSection');
    if (qrSection) {
        qrSection.style.display = net.type === 'TVM' ? 'block' : 'none';
    }

    const infiniteApprove = document.getElementById('infiniteApprove')?.closest('.infinite-approve');
    if (infiniteApprove) {
        infiniteApprove.style.display = net.enabled ? 'block' : 'none';
    }

    updateButtonState();

    console.log(`✅ شبکه انتخاب شد: ${net.name}`);
    console.log(`👛 کیف پول مورد نیاز: ${net.walletName || net.wallet}`);
    console.log(`📝 آدرس قرارداد: ${currentContract || 'تعریف نشده'}`);
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
            networkConfig.getDonationNetworks().forEach(net => {
                const opt = document.createElement('option');
                opt.value = net.id;
                const hasContract = Boolean(foundProject[net.addressField] || (net.type === 'EVM' && foundProject.contractAddress));
                opt.textContent = `${net.name} — ${net.walletName || 'کیف پول'}${net.enabled && hasContract ? '' : ' (غیرفعال)'}`;
                opt.disabled = !net.enabled || !hasContract;
                select.appendChild(opt);
            });

            // انتخاب پیش‌فرض: اول Polygon Amoy اگر خزانه دارد، وگرنه اولین شبکه فعال پروژه
            const preferred = ['amoy', 'polygon', 'tron'].find(id => {
                const net = networks[id];
                if (!net) return false;
                return net.enabled && (foundProject[net.addressField] || (net.type === 'EVM' && foundProject.contractAddress));
            });
            const firstEnabled = Array.from(select.options).find(option => !option.disabled)?.value;
            const initialNetwork = preferred || firstEnabled;

            if (initialNetwork) {
                select.value = initialNetwork;
                selectNetwork(initialNetwork);
            } else {
                selectedNetwork = null;
                currentContract = null;
                updateButtonState();
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
    const donorsList = document.getElementById('donorsList');
    if (!donorsList) return;

    // اگر progress از قبل موجودی نشان داده، پیام خالی نگذار
    const progressText = document.getElementById('progressText')?.innerText || '';
    const match = progressText.match(/([\d.]+)\s*USDT/);
    const raised = match ? parseFloat(match[1]) : 0;

    if (raised > 0) {
        donorsList.innerHTML = '';
        return;
    }

    donorsList.innerHTML = '<p style="color: #94a3b8; text-align: center;">هنوز کمک‌کننده‌ای ثبت نشده است</p>';
}

// ==================== تابع پیشرفت ====================
async function loadProgress(target = 100000) {
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');

    if (text) {
        text.innerText = 'در حال خواندن موجودی از زنجیره...';
    }

    let totalRaised = 0;
    try {
        if (window.ClassChainRaisedReader && projects) {
            const result = await window.ClassChainRaisedReader.getProjectRaisedUSDT(projects);
            totalRaised = result.total || 0;
            console.log('موجودی خزانه‌ها:', result.breakdown);
        }
    } catch (e) {
        console.error('خطا در خواندن raised:', e);
    }

    const percent = target > 0 ? Math.min((totalRaised / target) * 100, 100) : 0;

    if (fill) fill.style.width = percent + '%';
    if (text) {
        text.innerText =
            `${totalRaised.toFixed(2)} USDT از ${Number(target).toLocaleString('fa-IR')} USDT جمع شده (${percent.toFixed(1)}%)`;
    }
    const donorsList = document.getElementById('donorsList');
    if (donorsList && totalRaised > 0) {
        const t = (donorsList.textContent || '').trim();
        if (t.includes('هنوز کمک') || t.includes('اولین')) {
            donorsList.innerHTML = '';
        }
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

            let connection = null;
            const txHash = document.getElementById('txHash');
            const successMsg = document.getElementById('successMessage');
            try {
                if (successMsg) successMsg.style.display = 'block';
                if (txHash) {
                    txHash.innerHTML = `<p><strong>در حال اتصال به ${net.walletName || 'کیف پول'}...</strong></p>`;
                }
                connection = await walletManager.connect(net);
                updateWalletInfo(connection);
            } catch (err) {
                if (successMsg) successMsg.style.display = 'none';
                alert(err.message || 'خطا در اتصال کیف پول');
                return;
            }

            const isInfinite = document.getElementById('infiniteApprove')?.checked || false;

            /* =========================
               شاخه TRON
               ========================= */
            if (net.type === 'TVM') {
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
                const tronWeb = connection.tronWeb;
                const amount = Math.floor(selectedAmount * (10 ** net.tokenDecimals));

                // ====================== مرحله ۱: Approve ======================
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
                setTimeout(() => {
                    const t = projects?.['targetAmount(USDT)'] || 100000;
                    loadProgress(t);
                }, 8000);
                  
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
            let approveTxHash = null;
            let depositTxHash = null;

            try {
                web3 = connection.web3;
                userAddress = connection.account;

                const decimals = getTokenDecimals(selectedNetwork);
                const amount = web3.utils.toBN(String(Math.floor(selectedAmount * (10 ** decimals))));

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
                setTimeout(() => {
                    const t = projects?.['targetAmount(USDT)'] || 100000;
                    loadProgress(t);
                }, 8000);

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
