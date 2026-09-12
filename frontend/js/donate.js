let selectedAmount = 0;
let selectedNetwork = null;
let currentContract = null;
let userAddress = null;
let web3 = null;
let projects = {};

const networkConfig = window.ClassChainNetworkConfig || { NETWORKS: {}, getDonationNetworks: () => [] };
function getNetworks() {return networkConfig.NETWORKS || {};}
const walletManager = new window.ClassChainWalletManager();
const INDEXER_API =
  window.CLASSCHAIN_INDEXER_API ||
  'https://classchain-indexer.classchain.workers.dev';

// ==================== توابع کمکی ====================
async function waitForTronTransaction(tronWeb, txId, options = {}) {
    const timeoutMs = options.timeoutMs || 120000;
    const intervalMs = options.intervalMs || 3000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const info = await tronWeb.trx.getTransactionInfo(txId);

            if (info && info.id) {
                if (info.receipt?.result === 'SUCCESS') {
                    return { success: true, info };
                }
                if (
                    info.receipt?.result === 'FAILED' ||
                    info.result === 'FAILED' ||
                    info.resMessage
                ) {
                    return {
                        success: false,
                        info,
                        error: info.resMessage || 'Transaction execution failed'
                    };
                }
            }
        } catch (e) {
            console.warn('در انتظار نتیجه تراکنش TRON:', e);
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('زمان انتظار برای تأیید تراکنش در شبکه TRON به پایان رسید.');
}

function getTokenDecimals(network) {
    return getNetworks()[network]?.tokenDecimals || 6;
}

async function buildTxOptions(web3Instance, from, gasEstimate, multiplier = 1.25) {
    const gas = Math.floor(Number(gasEstimate) * multiplier);
    let gasPrice;
    try {
        gasPrice = await web3Instance.eth.getGasPrice();
    } catch (e) {
        console.warn('[Donate] getGasPrice failed, using fallback', e);
        gasPrice = web3Instance.utils.toWei('30', 'gwei');
    }
    return {
        from,
        gas,
        gasPrice,
        type: '0x0'
    };
}

function getProjectFundAddress(project, net) {
    if (!project || !net) return null;
    const funds = project.funds;
    if (!funds || typeof funds !== 'object') return null;
    const key = net.fundsKey;
    if (!key) return null;
    const fund = funds[key];
    if (!fund || typeof fund !== 'object') return null;
    const address = fund.address;
    if (!address || address === 'null' || String(address).trim() === '') return null;
    return String(address).trim();
}

function projectHasFundOnNetwork(project, net) {
    return Boolean(getProjectFundAddress(project, net));
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
    } else if (err.message?.includes("EIP-1559") || err.message?.includes("eip-1559")) {
        errorMsg += "نوع تراکنش با شبکه هماهنگ نیست. صفحه را رفرش کنید و دوباره تلاش کنید.";
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
    const net = getNetworks()[selectedNetwork];
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

function selectNetwork(network) {
    selectedNetwork = network;
    const net = getNetworks()[network];
    if (!net) return;
    currentContract = getProjectFundAddress(projects, net);
    const qrSection = document.getElementById('qrSection');
    if (qrSection) {
        qrSection.style.display = net.type === 'TVM' ? 'block' : 'none';
    }
    updateButtonState();
    console.log(`✅ شبکه انتخاب شد: ${net.name}`);
    console.log(`👛 کیف پول مورد نیاز: ${net.walletName || net.wallet}`);
    console.log(`📝 آدرس قرارداد: ${currentContract || 'تعریف نشده'}`);
}
