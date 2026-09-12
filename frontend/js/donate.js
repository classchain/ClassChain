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
                // TRON smart-contract execution result
                if (info.receipt?.result === 'SUCCESS') {
                    return {
                        success: true,
                        info
                    };
                }

                // Failed execution
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

/**
 * آدرس خزانه پروژه برای یک شبکه
 *
 * Canonical data model:
 * project.funds[fundKey].address
 *
 * fundKey ها از net.fundsKeys می‌آیند.
 */
function getProjectFundAddress(
    project,
    net
) {

    if (
        !project ||
        !net
    ) {
        return null;
    }

    const funds =
        project.funds;

    if (
        !funds ||
        typeof funds !== 'object'
    ) {
        return null;
    }

    const key =
        net.fundsKey;

    if (!key) {
        return null;
    }

    const fund =
        funds[key];

    if (
        !fund ||
        typeof fund !== 'object'
    ) {
        return null;
    }

    const address =
        fund.address;

    if (
        !address ||
        address === 'null' ||
        String(address).trim() === ''
    ) {
        return null;
    }

    return String(
        address
    ).trim();
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

// ==================== انتخاب شبکه ====================
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

// ==================== بارگذاری اطلاعات پایه پروژه ====================

async function loadProjectData() {

    const urlParams =
        new URLSearchParams(window.location.search);

    const projectId =
        urlParams.get('project');

    if (!projectId) {

        const title =
            document.getElementById('projectTitle');

        if (title) {
            title.innerText =
                'پروژه یافت نشد';
        }

        throw new Error(
            'شناسه پروژه در URL وجود ندارد'
        );
    }

    try {

        const response =
            await fetch('data/Projects.json');

        if (!response.ok) {

            throw new Error(
                'فایل Projects.json پیدا نشد'
            );
        }

        const data =
            await response.json();

        let foundProject = null;

        if (
            data.features &&
            Array.isArray(data.features)
        ) {

            for (
                const feature of data.features
            ) {

                if (
                    feature.attributes &&
                    String(
                        feature.attributes.ProjectID
                    ) === String(projectId)
                ) {

                    foundProject =
                        feature.attributes;

                    break;
                }
            }
        }

        if (!foundProject) {

            const title =
                document.getElementById(
                    'projectTitle'
                );

            if (title) {
                title.innerText =
                    'پروژه یافت نشد';
            }

            throw new Error(
                `پروژه ${projectId} پیدا نشد`
            );
        }

        projects =
            foundProject;

        const titleEl =
            document.getElementById(
                'projectTitle'
            );

        if (titleEl) {

            titleEl.innerText =
                foundProject['نام پروژه'] ||
                'پروژه بدون نام';
        }

        const descEl =
            document.getElementById(
                'projectDesc'
            );

        if (descEl) {

            descEl.innerText =
                `${foundProject.استان || ''} - ` +
                `${foundProject.منطقه || ''} | ` +
                `${foundProject['تعداد کلاس'] || 0} کلاس`;
        }

        const target =
            Number(
                foundProject[
                    'targetAmount(USDT)'
                ]
            ) || 0;

        const select =
            document.getElementById(
                'networkSelect'
            );

        if (select) {

            select.innerHTML = '';

            const donationNetworks =
                networkConfig
                    .getDonationNetworks();

            donationNetworks.forEach(
                net => {

                    const opt =
                        document.createElement(
                            'option'
                        );

                    opt.value =
                        net.id;

                    const hasFund =
                        projectHasFundOnNetwork(
                            foundProject,
                            net
                        );

                    const isActive =
                        net.status === 'active' &&
                        net.enabled;

                    opt.textContent =
                        `${net.name} — ` +
                        `${net.walletName || 'کیف پول'}` +
                        `${
                            isActive && hasFund
                                ? ''
                                : ' (غیرفعال)'
                        }`;

                    opt.disabled =
                        !isActive ||
                        !hasFund;

                    select.appendChild(
                        opt
                    );
                }
            );

			const preferred =
    			[
        			'polygon_amoy',
        			'tron_nile'
   			 	].find(
        			id => {

           				 const net =
                		getNetworks()[id];

            			if (!net) {
                			return false;
            			}

           				return (
                			net.status === 'active' &&
                			net.enabled &&
                			projectHasFundOnNetwork(
                    			foundProject,
                    			net
                			)
            			);
        			}
    			);

            const firstEnabled =
                Array.from(
                    select.options
                ).find(
                    option =>
                        !option.disabled
                );

            const Network =
                preferred ||
                firstEnabled?.value ||
                null;

            if (Network) {

                select.value =
                    Network;

                selectNetwork(
                    Network
                );

            } else {

                selectedNetwork =
                    null;

                currentContract =
                    null;

                updateButtonState();
            }
        }

        return {
            project: foundProject,
            target: target
        };

    } catch (error) {

        console.error(
            '[Donate] خطا در بارگذاری اطلاعات پروژه:',
            error
        );

        const title =
            document.getElementById(
                'projectTitle'
            );

        if (title) {

            title.innerText =
                'خطا در بارگذاری پروژه';
        }

        throw error;
    }
}

// ==================== بارگذاری وضعیت مالی پروژه ====================

async function loadProjectFinancials(
    target = null
) {

    const fill =
        document.getElementById(
            'progressFill'
        );

    const text =
        document.getElementById(
            'progressText'
        );

    if (text) {

        text.innerText =
            'در حال خواندن موجودی از زنجیره...';
    }

    let totalRaised = 0;

    try {

        if (
            window.ClassChainRaisedReader &&
            projects
        ) {

            const result =
                await window
                    .ClassChainRaisedReader
                    .getProjectRaisedUSDT(
                        projects
                    );

            totalRaised =
                Number(
                    result?.total
                ) || 0;

            console.log(
                '[Donate] موجودی خزانه‌ها:',
                result?.breakdown
            );
        }

    } catch (error) {

        console.error(
            '[Donate] خطا در خواندن موجودی خزانه:',
            error
        );

        if (text) {

            text.innerText =
                'خواندن موجودی خزانه امکان‌پذیر نیست.';
        }

        return;
    }

    const projectTarget =
        target !== null
            ? Number(target) || 0
            : Number(
                projects?.[
                    'targetAmount(USDT)'
                ]
            ) || 0;

    const percent =
        projectTarget > 0
            ? Math.min(
                (
                    totalRaised /
                    projectTarget
                ) * 100,
                100
            )
            : 0;

    if (fill) {

        fill.style.width =
            percent + '%';
    }

    if (text) {

        text.innerText =
            `${totalRaised.toFixed(2)} USDT ` +
            `از ` +
            `${projectTarget.toLocaleString('fa-IR')} USDT ` +
            `جمع شده ` +
            `(${percent.toFixed(1)}%)`;
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

// ==================== مشارکت‌کنندگان از Indexer API ====================
function shortDonorAddr(addr) {
    if (!addr || typeof addr !== 'string') return '—';
    if (addr.length < 12) return addr;
    return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function aggregateIndexerDonors(rows) {
    const map = new Map();
    for (const row of rows || []) {
        const key = String(row.donor || '').toLowerCase();
        if (!key) continue;
        const amount = Number(row.amount) || 0;
        const prev = map.get(key);
        if (!prev) {
            map.set(key, { donor: row.donor, total: amount, count: 1 });
        } else {
            prev.total += amount;
            prev.count += 1;
        }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
}

async function loadDonorsFromIndexer(projectId) {
    const el = document.getElementById('donorsList');
    if (!el) return;

    const id = String(projectId || projects?.ProjectID || '').trim();
    if (!id) {
        el.innerHTML = '<p>شناسه پروژه مشخص نیست.</p>';
        return;
    }

    el.innerHTML = '<p>در حال بارگذاری مشارکت‌کنندگان...</p>';

    try {
        const res = await fetch(
            `${INDEXER_API}/api/donors?projectId=${encodeURIComponent(id)}`,
            { headers: { Accept: 'application/json' } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const list = aggregateIndexerDonors(data.donors || []);

        if (!list.length) {
            el.innerHTML =
                '<p>هنوز مشارکتی ثبت نشده — شما می‌توانید اولین نفر باشید.</p>';
            return;
        }

        const rows = list
            .slice(0, 15)
            .map(
                (d) => `
            <div class="donor-row" style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:0.92em;">
                <span title="${d.donor}">${shortDonorAddr(d.donor)}</span>
                <span><strong>${d.total.toFixed(2)}</strong> USDT</span>
            </div>`
            )
            .join('');

        const more =
            list.length > 15
                ? `<p style="opacity:.75;margin-top:8px;">و ${list.length - 15} مورد دیگر…</p>`
                : '';

        el.innerHTML = `
            <h3 style="margin:0 0 10px;">مشارکت‌کنندگان (${list.length})</h3>
            ${rows}
            ${more}
        `;
    } catch (e) {
        console.error('[Donate] Indexer donors failed:', e);
        el.innerHTML =
            '<p style="color:#e74c3c;">خطا در خواندن مشارکت‌کنندگان</p>';
    }
}

// ==================== تابع اصلی Donate ====================
document.addEventListener('DOMContentLoaded', function() {

    const customAmount = document.getElementById('customAmount');
    if (customAmount) {
        customAmount.oninput = (e) => {
            selectedAmount = parseFloat(e.target.value) || 0;
        };
    }

    const termsConsent = document.getElementById('termsConsent');
    if (termsConsent) {
        termsConsent.addEventListener('change', updateButtonState);
    }

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

            const net = getNetworks()[selectedNetwork];
            if (!net) {
                alert("شبکه انتخاب شده معتبر نیست");
                return;
            }

            let connection = null;
            const txHash = document.getElementById('txHash');
            const successMsg = document.getElementById('successMessage');
            const paymentStatusTitle = document.getElementById('paymentStatusTitle');
            try {
                if (successMsg) {
                    successMsg.style.display = 'block';
                }

                if (paymentStatusTitle) {
                    paymentStatusTitle.textContent =
                        `در حال اتصال به ${net.walletName || 'کیف پول'}...`;
                }

                if (txHash) {
                    txHash.innerHTML = '';
                }
                
                connection = await walletManager.connect(net);
                updateWalletInfo(connection);
            } catch (err) {
                if (successMsg) successMsg.style.display = 'none';
                alert(err.message || 'خطا در اتصال کیف پول');
                return;
            }

if (net.type === 'TVM') {

    const fundDepositABI = [{
        inputs: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" }
        ],
        name: "depositToken",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    }];

    let approveTxHash = null;
    let depositTxHash = null;

    try {
        const tronWeb = connection.tronWeb;

        const amount = Math.floor(
            selectedAmount * (10 ** net.tokenDecimals)
        );

        if (paymentStatusTitle) {
            paymentStatusTitle.textContent = 'در انتظار تأیید شما';
        }

        if (txHash) {
            txHash.innerHTML = `
                <p>
                    <strong>مرحله ۱ از ۲ — اجازه انتقال کمک</strong>
                </p>
                <p>
                    برای ادامه، کیف پول شما باید اجازه انتقال
                    <strong>${selectedAmount} USDT</strong>
                    را صادر کند.
                </p>
                <p>
                    لطفاً درخواست را در TronLink تأیید کنید.
                </p>
            `;
        }

        const usdtContract =
            await tronWeb.contract().at(net.usdtAddress);

        const approveTx =
            await usdtContract
                .approve(currentContract, amount)
                .send();

        approveTxHash = approveTx;

        if (paymentStatusTitle) {
            paymentStatusTitle.textContent =
                'در حال تأیید Approve در شبکه...';
        }

        const approveResult =
            await waitForTronTransaction(
                tronWeb,
                approveTxHash
            );

        if (!approveResult.success) {
            throw new Error(
                approveResult.error ||
                'تراکنش Approve در شبکه ناموفق بود.'
            );
        }

        if (txHash) {
            txHash.innerHTML = `
                <p style="color: green;">
                    ✓ اجازه انتقال ${selectedAmount} USDT
                    با موفقیت در شبکه تأیید شد.
                </p>

                <p>
                    <strong>مرحله ۲ از ۲ — ثبت کمک</strong>
                </p>

                <p>
                    اکنون مبلغ ${selectedAmount} USDT
                    به خزانه پروژه منتقل می‌شود.
                </p>

                <p>
                    لطفاً تراکنش دوم را در TronLink تأیید کنید.
                </p>

                <p>
                    <a
                        href="${net.explorer}/transaction/${approveTxHash}"
                        target="_blank"
                    >
                        مشاهده Approve
                    </a>
                </p>
            `;
        }

        if (paymentStatusTitle) {
            paymentStatusTitle.textContent =
                'در حال ثبت کمک در شبکه...';
        }

        const fundContract =
            await tronWeb.contract(
                fundDepositABI,
                currentContract
            );

        const depositTx =
            await fundContract
                .depositToken(
                    net.usdtAddress,
                    amount
                )
                .send();

        depositTxHash = depositTx;

        if (paymentStatusTitle) {
            paymentStatusTitle.textContent =
                'در حال تأیید واریز در شبکه...';
        }

        if (txHash) {
            txHash.innerHTML = `
                <p>
                    <strong>مرحله ۲ از ۲ — تأیید واریز</strong>
                </p>

                <p>
                    تراکنش ارسال شد.
                </p>

                <p>
                    در حال انتظار برای تأیید نهایی شبکه...
                </p>

                <p>
                    <a
                        href="${net.explorer}/transaction/${depositTxHash}"
                        target="_blank"
                    >
                        مشاهده تراکنش Deposit
                    </a>
                </p>
            `;
        }

        const depositResult =
            await waitForTronTransaction(
                tronWeb,
                depositTxHash
            );

        if (!depositResult.success) {
            throw new Error(
                depositResult.error ||
                'تراکنش Deposit در شبکه ناموفق بود.'
            );
        }

        if (paymentStatusTitle) {
            paymentStatusTitle.textContent =
                'پرداخت با موفقیت ثبت شد';
        }

        if (txHash) {
            txHash.innerHTML = `
                <p style="color: green; font-size: 1.15em;">
                    🎉 کمک شما با موفقیت در شبکه ثبت شد! ❤️
                </p>

                <p>
                    مبلغ:
                    <strong>${selectedAmount} USDT</strong>
                </p>

                <p>
                    <a
                        href="${net.explorer}/transaction/${approveTxHash}"
                        target="_blank"
                    >
                        مشاهده Approve
                    </a>
                    |
                    <a
                        href="${net.explorer}/transaction/${depositTxHash}"
                        target="_blank"
                    >
                        مشاهده Deposit
                    </a>
                </p>

                <p>
                    ClassChain از حمایت شما سپاسگزار است! ❤️
                </p>
            `;
        }

        if (successMsg) {
            successMsg.style.display = 'block';
        }

        if (connectBtn) {
            connectBtn.style.display = 'none';
        }

        optimisticProgressUpdate(selectedAmount);

        setTimeout(() => {
            const t =
                projects?.['targetAmount(USDT)'] || 100000;

            loadProgress(t);
        }, 8000);

    } catch (err) {

        console.error(
            'خطا در تراکنش TRON:',
            err
        );

        let userMessage =
            'خطا در تراکنش:\\n';

        if (err.code === 4001) {
            userMessage +=
                '❌ شما تراکنش را لغو کردید.';
        }
        else if (
            err.message &&
            err.message.includes('insufficient funds')
        ) {
            userMessage +=
                '❌ موجودی کیف پول کافی نیست.';
        }
        else {
            userMessage +=
                `❌ ${err.message || 'خطای نامشخص'}`;
        }

        if (approveTxHash && !depositTxHash) {
            userMessage +=
                `\n\n` +
                `✅ Approve موفق بود:\n` +
                `${net.explorer}/transaction/${approveTxHash}` +
                `\n❌ اما مرحله Deposit انجام نشد.`;
        }

        if (approveTxHash && depositTxHash) {
            userMessage +=
                `\n\n` +
                `Approve:\n` +
                `${net.explorer}/transaction/${approveTxHash}` +
                `\n\nDeposit:\n` +
                `${net.explorer}/transaction/${depositTxHash}` +
                `\n\n❌ Deposit در شبکه ناموفق بود.`;
        }

        if (successMsg) {
            successMsg.style.display = 'none';
        }

        if (connectBtn) {
            connectBtn.style.display = 'block';
            connectBtn.disabled = false;
        }

        alert(userMessage);
    }

    return;
}

            let approveTxHash = null;
            let depositTxHash = null;

            try {
                web3 = connection.web3;
                userAddress = connection.account;

                const decimals = getTokenDecimals(selectedNetwork);
                const amount = web3.utils.toBN(String(Math.floor(selectedAmount * (10 ** decimals))));

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

                const approveAmount = amount;
                const txHashEl = document.getElementById('txHash');
				
                if (paymentStatusTitle) {
                    paymentStatusTitle.textContent = 'در انتظار تأیید شما';
                }
                if (txHashEl) {
                    txHashEl.innerHTML = `
                        <p><strong>مرحله ۱ از ۲ — اجازه انتقال کمک</strong></p>
                        <p>
                            برای ادامه، کیف پول شما باید اجازه انتقال
                            <strong>${selectedAmount} USDT</strong>
                            برای این کمک را صادر کند.
                        </p>
                        <p>لطفاً درخواست را در MetaMask تأیید کنید.</p>
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
                
                if (paymentStatusTitle) {
                    paymentStatusTitle.textContent = 'اجازه انتقال صادر شد';
                }
                if (txHashEl) {
                    txHashEl.innerHTML = `
                        <p style="color: green;">
                            ✓ اجازه انتقال ${selectedAmount} USDT صادر شد.
                        </p>
                        <p>
                            <strong>مرحله ۲ از ۲ — ثبت کمک</strong>
                        </p>
                        <p>
                            اکنون مبلغ ${selectedAmount} USDT به خزانه پروژه منتقل می‌شود.
                        </p>
                        <p>
                            لطفاً تراکنش دوم را در MetaMask تأیید کنید.
                        </p>
                        <p>
                            <a href="${net.explorer}/tx/${approveTxHash}" target="_blank">
                                مشاهده تراکنش اجازه انتقال
                            </a>
                        </p>
                    `;
                }
                
                if (paymentStatusTitle) {
                    paymentStatusTitle.textContent = 'در حال ثبت کمک در شبکه...';
                }

                if (txHashEl) {
                    txHashEl.innerHTML = `
                        <p>
                            <strong>مرحله ۲ از ۲ — ثبت کمک</strong>
                        </p>
                        <p>
                            تراکنش شما ارسال شد.
                        </p>
                        <p>
                            در حال انتظار برای ثبت آن در شبکه...
                        </p>
                    `;
                }
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
				if (!depositTx || depositTx.status !== true) {
    				const error = new Error(
        				'تراکنش Deposit در شبکه ناموفق شد و قرارداد آن را Revert کرد.'
    				);
    				error.txHash = depositTxHash;
    				throw error;
				}
                if (paymentStatusTitle) {
                    paymentStatusTitle.textContent = 'پرداخت با موفقیت ثبت شد';
                }
                if (txHashEl) {
                    txHashEl.innerHTML = `
                        <p style="color: green; font-size: 1.15em;">
                            🎉 کمک شما با موفقیت ثبت شد!
                        </p>
                        <p>
                            مبلغ کمک:
                            <strong>${selectedAmount} USDT</strong>
                        </p>
                        <p>
                            <a href="${net.explorer}/tx/${approveTxHash}" target="_blank">
                                مشاهده اجازه انتقال
                            </a>
                            |
                            <a href="${net.explorer}/tx/${depositTxHash}" target="_blank">
                                مشاهده تراکنش کمک
                            </a>
                        </p>
                        <p>ClassChain از حمایت شما سپاسگزار است! ❤️</p>
                    `;
                }

                if (connectBtn) {
                    connectBtn.disabled = true;
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

// ==================== بارگذاری اولیه ====================

async function initializeDonatePage() {
    await networkConfig.ready;

    let projectData;

    try {

        projectData =
            await loadProjectData();

    } catch (error) {

        console.error(
            '[Donate] Initialization failed:',
            error
        );

        updateButtonState();

        return;
    }

    const financialTask =
        loadProjectFinancials(
            projectData.target
        );

    const donorsTask = loadDonorsFromIndexer(
        projectData.project?.ProjectID || projects?.ProjectID
    );

    await Promise.allSettled([
        financialTask,
        donorsTask,
    ]);
}
initializeDonatePage();
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
