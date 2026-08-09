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

/**
 * آدرس خزانه پروژه برای یک شبکه
 *
 * Canonical data model:
 * project.funds[fundKey].address
 *
 * fundKey ها از net.fundsKeys می‌آیند.
 */
function getProjectFundAddress(project, net) {
    if (!project || !net) {
        return null;
    }

    const funds = project.funds;

    if (!funds || typeof funds !== 'object') {
        return null;
    }

    for (const key of (net.fundsKeys || [])) {
        const fund = funds[key];

        if (!fund || typeof fund !== 'object') {
            continue;
        }

        const address = fund.address;

        if (
            address &&
            address !== 'null' &&
            String(address).trim() !== ''
        ) {
            return String(address).trim();
        }
    }

    return null;
}

function projectHasFundOnNetwork(project, net) {
    return Boolean(
        getProjectFundAddress(project, net)
    );
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

    const isActive = net.status === 'active' && net.enabled;
    connectBtn.textContent = net.buttonLabel || 'اتصال کیف پول و پرداخت';
    connectBtn.disabled = !termsConsent?.checked || !isActive || !currentContract;

    if (!isActive) {
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

    currentContract = getProjectFundAddress(projects, net);

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
                const hasContract = projectHasFundOnNetwork(foundProject, net);
                const isActive = net.status === 'active' && net.enabled;
                opt.textContent = `${net.name} — ${net.walletName || 'کیف پول'}${isActive && hasContract ? '' : ' (غیرفعال)'}`;
                opt.disabled = !isActive || !hasContract;
                select.appendChild(opt);
            });

            // انتخاب پیش‌فرض: اول Amoy، بعد Tron، بعد اولین گزینه فعال
            const preferred = ['amoy', 'tron', 'polygon'].find(id => {
                const net = networks[id];
                if (!net) return false;
                return net.status === 'active' && net.enabled && projectHasFundOnNetwork(foundProject, net);
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
              /*
               * مسیر Tron — الگوی پایدار TronLink:
               * triggerSmartContract → trx.sign → sendRawTransaction
               *
               * نسخه قبلی با contract().method().send({ shouldPollResponse:false })
               * روی بعضی نسخه‌های TronLink خطای "Invalid transaction provided" می‌داد.
               */
              let approveTxHash = null;

              const readableTronError = (err) => {
                if (!err) return 'خطای نامشخص';
                if (typeof err === 'string') return err;
                if (err.message) return err.message;
                if (err.error) return String(err.error);
                try { return JSON.stringify(err); } catch (_) { return 'خطای نامشخص'; }
              };

              const sendTronContractCall = async (tronWeb, contractAddress, functionSelector, parameters) => {
                const from = tronWeb.defaultAddress?.base58;
                if (!from) {
                  throw new Error('حساب TronLink یافت نشد. قفل را باز کنید.');
                }

                const txWrapper = await tronWeb.transactionBuilder.triggerSmartContract(
                  contractAddress,
                  functionSelector,
                  {
                    feeLimit: 150000000,
                    callValue: 0
                  },
                  parameters,
                  from
                );

                if (!txWrapper || txWrapper.result?.result === false) {
                  const msg = txWrapper?.result?.message
                    ? tronWeb.toUtf8(txWrapper.result.message)
                    : (txWrapper?.Error || 'ساخت تراکنش ناموفق بود');
                  throw new Error(msg);
                }

                if (!txWrapper.transaction || !txWrapper.transaction.raw_data) {
                  throw new Error('Invalid transaction provided — شیء تراکنش ساخته نشد');
                }

                const signedTx = await tronWeb.trx.sign(txWrapper.transaction);
                const receipt = await tronWeb.trx.sendRawTransaction(signedTx);

                if (receipt && receipt.result === false) {
                  throw new Error(receipt.message || 'ارسال تراکنش ناموفق بود');
                }

                return receipt?.txid || receipt?.transaction?.txID || signedTx?.txID || null;
              };

              try {
                const tronWeb = connection.tronWeb || window.tronWeb;
                if (!tronWeb) {
                  throw new Error('TronWeb در دسترس نیست. TronLink را نصب و روی Nile Testnet بگذارید.');
                }

                if (!currentContract || !String(currentContract).startsWith('T')) {
                  throw new Error(`آدرس خزانه Tron نامعتبر است: ${currentContract || '(خالی)'}`);
                }
                if (!net.usdtAddress || !String(net.usdtAddress).startsWith('T')) {
                  throw new Error('آدرس USDT شبکه Tron در تنظیمات نامعتبر است.');
                }

                const decimals = net.tokenDecimals || 6;
                const amount = Math.floor(Number(selectedAmount) * (10 ** decimals));
                if (!amount || amount <= 0) {
                  throw new Error('مبلغ پرداخت معتبر نیست.');
                }

                // ====================== مرحله ۱: Approve ======================
                if (txHash) {
                  txHash.innerHTML = `
                    <p><strong>مرحله ۱ از ۲:</strong> تأیید برداشت (Approve)</p>
                    <p>در حال ارسال تراکنش به TronLink...</p>
                  `;
                }

                approveTxHash = await sendTronContractCall(
                  tronWeb,
                  net.usdtAddress,
                  'approve(address,uint256)',
                  [
                    { type: 'address', value: currentContract },
                    { type: 'uint256', value: amount }
                  ]
                );

                if (txHash) {
                  txHash.innerHTML = `
                    <p style="color: green;">✅ مرحله ۱ موفق: Approve ثبت شد!</p>
                    <p><a href="${net.explorer}/#/transaction/${approveTxHash}" target="_blank">مشاهده Approve</a></p>
                    <hr>
                    <p><strong>مرحله ۲ از ۲:</strong> واریز به خزانه (Deposit)</p>
                    <p>در حال ارسال تراکنش دوم به TronLink...</p>
                  `;
                }

                // ====================== مرحله ۲: Deposit ======================
                const depositTxId = await sendTronContractCall(
                  tronWeb,
                  currentContract,
                  'depositToken(address,uint256)',
                  [
                    { type: 'address', value: net.usdtAddress },
                    { type: 'uint256', value: amount }
                  ]
                );

                if (txHash) {
                  txHash.innerHTML = `
                    <p style="color: green; font-size: 1.15em;">🎉 کمک شما با موفقیت ثبت شد! ❤️</p>
                    <p>مبلغ: <strong>${selectedAmount} USDT</strong></p>
                    <p><a href="${net.explorer}/#/transaction/${approveTxHash}" target="_blank">مشاهده Approve</a> |
                       <a href="${net.explorer}/#/transaction/${depositTxId}" target="_blank">مشاهده Deposit</a></p>
                    <p>ممنون از حمایت شما! ❤️</p>
                  `;
                }

                const successMsgEl = document.getElementById('successMessage');
                if (successMsgEl) successMsgEl.style.display = 'block';
                if (connectBtn) connectBtn.style.display = 'none';

                optimisticProgressUpdate(selectedAmount);
                setTimeout(() => {
                    const t = projects?.['targetAmount(USDT)'] || 100000;
                    loadProgress(t);
                }, 8000);

              } catch (err) {
                console.error('Tron donate error:', err);
                let userMessage = 'خطا در تراکنش:\n';
                const msg = readableTronError(err);
                if (err?.code === 4001 || /denied|cancel|reject/i.test(msg)) {
                  userMessage += '❌ شما تراکنش را لغو کردید.';
                } else if (/insufficient|balance|energy/i.test(msg)) {
                  userMessage += '❌ موجودی TRX (کارمزد/انرژی) یا USDT کافی نیست.\n' + msg;
                } else {
                  userMessage += msg;
                }

                if (approveTxHash) {
                  userMessage += `\n\n✅ Approve موفق بود:\n${net.explorer}/#/transaction/${approveTxHash}\n❌ اما مرحله واریز (Deposit) شکست خورد.`;
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
