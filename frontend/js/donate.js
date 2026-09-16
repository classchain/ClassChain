let selectedAmount = 0;
let selectedNetwork = null;
let currentContract = null;
let userAddress = null;
let web3 = null;
let projects = {};

function _t(key, vars, fallback) {
    try {
        if (window.DonateI18n && typeof window.DonateI18n.t === 'function') {
            const v = window.DonateI18n.t(key, vars);
            if (v && v !== key) return v;
        }
    } catch (e) {}
    return fallback != null ? fallback : key;
}
const networkConfig = window.ClassChainNetworkConfig || { NETWORKS: {}, getDonationNetworks: () => [] };
function getNetworks() {return networkConfig.NETWORKS || {};}

const walletManager = new window.ClassChainWalletManager();
const INDEXER_API =
  window.CLASSCHAIN_INDEXER_API ||
  'https://classchain-indexer.classchain.workers.dev';

// ==================== توابع کمکی ====================
function getTokenDecimals(network) {
    return getNetworks()[network]?.tokenDecimals || 6;
}

/**
 * آدرس خزانه پروژه برای یک شبکه
 *
 * Canonical data model:
 * project.funds[fundKey].address
 *
 * fundKey ها از net.fundsKey می‌آیند.
 * هیچ آدرسی hard-code نمی‌شود — کاملاً از Projects.json خوانده می‌شود.
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

    const isOpenPool =
        String(projects?.ProjectID) === 'GENERAL_POOL' ||
        Number(projects?.['targetAmount(USDT)'] || 0) <= 0;

    // استخراج عدد فعلی از متن (اولین عدد)
    const match = (progressTextEl.innerText || '0').match(/([\d.,]+)/);
    let currentRaised = match ? parseFloat(match[1].replace(/,/g, '')) : 0;
    if (isNaN(currentRaised)) currentRaised = 0;
    currentRaised += Number(donatedAmount) || 0;

    const fill = document.getElementById('progressFill');

    if (isOpenPool) {
        if (fill) {
            fill.style.width = '0%';
            fill.style.opacity = '0.35';
        }
        progressTextEl.innerText =
            _t('progress.openPool', { raised: currentRaised.toFixed(2) }, currentRaised.toFixed(2) + ' USDT raised in the general pool');
        return;
    }

    // Prefer project data over parsing localized progress text
    const target = Number(projects?.['targetAmount(USDT)']) || 100000;
    const percent = Math.min((currentRaised / target) * 100, 100);
    if (fill) {
        fill.style.width = percent + '%';
        fill.style.opacity = '1';
    }
    progressTextEl.innerText =
        _t('progress.template', {
            raised: currentRaised.toFixed(2),
            target: target.toLocaleString('en-US'),
            percent: percent.toFixed(1)
        }, currentRaised.toFixed(2) + ' USDT of ' + target + ' USDT (' + percent.toFixed(1) + '%)');
}

function handleTransactionError(err, approveTxHash, depositTxHash, net) {
    let errorMsg = _t('errors.title', null, 'Transaction error:') + '\n';
    if (err.code === 4001 || err.message?.includes("User denied") || err.message?.includes("denied")) {
        errorMsg += _t('errors.cancelled', null, 'You cancelled the transaction.');
    } else if (err.message?.includes("insufficient funds")) {
        errorMsg += _t('errors.insufficient', null, 'Insufficient wallet balance (gas or token).');
    } else if (err.message?.includes("execution reverted")) {
        errorMsg += _t('errors.reverted', null, 'Transaction reverted. The contract may not be active or the token may not be allowed.');
    } else {
        errorMsg += err.message || _t('errors.unknown', null, 'Unknown error');
    }
    if (approveTxHash && !depositTxHash) {
        errorMsg += '\n\n✅ ' + _t('errors.approved', null, 'Approve succeeded:') +
            '\n' + net.explorer + '/tx/' + approveTxHash +
            '\n❌ ' + _t('errors.depositFailed', null, 'but the deposit step failed.');
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
        connectBtn.textContent = _t('connectBtn.selectNetwork', null, 'Select a network first');
		connectBtn.disabled = true;
        return;
    }

    const isActive = net.status === 'active' && net.enabled;
    connectBtn.textContent = net.buttonLabel || _t('connectBtn.default', null, 'Connect wallet and pay');
    connectBtn.disabled = !termsConsent?.checked || !isActive || !currentContract;

    if (!isActive) {
        connectBtn.textContent = _t('connectBtn.inactive', { wallet: net.walletName || net.name }, (net.walletName || net.name) + ' not active yet');		
    } else if (!currentContract) {
        connectBtn.textContent = _t('connectBtn.notReady', { network: net.name }, net.name + ' treasury not set up yet');
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
                _t('project.notFound', null, 'Project not found');
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
                	_t('project.notFound', null, 'Project not found');
			}

            throw new Error(
                `پروژه ${projectId} پیدا نشد`
            );
        }

        projects =
            foundProject;

        const isGeneralPool =
            String(foundProject.ProjectID) === 'GENERAL_POOL';

        const titleEl =
            document.getElementById(
                'projectTitle'
            );

        if (titleEl) {
            if (isGeneralPool) {
                titleEl.innerText =
                    foundProject['نام پروژه'] ||
                    _t('pool.title', null, 'General Contribution Pool');
            } else {
                titleEl.innerText =
                    foundProject['نام پروژه'] ||
                    _t('project.noName', null, 'Unnamed project');
            }
        }

        const descEl =
            document.getElementById(
                'projectDesc'
            );

        if (descEl) {
            if (isGeneralPool) {
                descEl.innerText =
                    _t('pool.desc', null, 'Contribute to the general pool — after community voting, funds are allocated to selected projects');
            } else {
                descEl.innerText =
                    _t('project.meta', {
                        province: foundProject.استان || '',
                        region: foundProject.منطقه || '',
                        classes: foundProject['تعداد کلاس'] || 0
                    }, (foundProject.استان || '') + ' - ' + (foundProject.منطقه || '') + ' | ' + (foundProject['تعداد کلاس'] || 0) + ' classes');
            }
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
                        `${net.walletName || _t('network.wallet', null, 'Wallet')}` +
                        `${
                            isActive && hasFund
                                ? ''
                                : _t('network.inactiveSuffix', null, ' (inactive)')
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
                _t('project.error', null, 'Error loading project');
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
            _t('progress.reading', null, 'Reading balance from chain...');
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
                _t('progress.unavailable', null, 'Unable to read treasury balance.');
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

    const isOpenPool =
        projectTarget <= 0 ||
        String(projects?.ProjectID) === 'GENERAL_POOL';

    const percent =
        !isOpenPool && projectTarget > 0
            ? Math.min(
                (
                    totalRaised /
                    projectTarget
                ) * 100,
                100
            )
            : 0;

    if (fill) {
        // برای استخر عمومی نوار پیشرفت را پر نشان نده (هدف ثابت ندارد)
        fill.style.width = isOpenPool ? '0%' : (percent + '%');
        if (isOpenPool) {
            fill.style.opacity = '0.35';
        } else {
            fill.style.opacity = '1';
        }
    }

    if (text) {
        if (isOpenPool) {
            text.innerText =
                _t('progress.openPool', { raised: totalRaised.toFixed(2) }, totalRaised.toFixed(2) + ' USDT raised in the general pool');
        } else {
            text.innerText =
                _t('progress.template', {
                    raised: totalRaised.toFixed(2),
                    target: projectTarget.toLocaleString('en-US'),
                    percent: percent.toFixed(1)
                }, totalRaised.toFixed(2) + ' USDT of ' + projectTarget.toLocaleString('en-US') + ' USDT (' + percent.toFixed(1) + '%)');
        }
    }
}

// ==================== تابع ذخیره ایمیل ====================
function saveEmail() {
    const email = document.getElementById('donorEmail')?.value.trim();
    const consent = document.getElementById('consent')?.checked;

    if (!email || !consent) {
        alert(_t('email.invalid', null, 'Please enter a valid email and confirm consent'));
        return;
    }
    alert(_t('email.saved', null, 'Your email was saved!'));
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
        el.innerHTML = '<p>' + _t('donors.noId', null, 'Project ID is not specified.') + '</p>';
        return;
    }

    el.innerHTML = '<p>' + _t('donors.loading', null, 'Loading contributors...') + '</p>';

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
                '<p>' + _t('donors.empty', null, 'No contributions yet — you can be the first.') + '</p>';
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
                ? `<p style="opacity:.75;margin-top:8px;">${_t('donors.more', { count: list.length - 15 }, 'and ' + (list.length - 15) + ' more…')}</p>`
                : '';

        el.innerHTML = `
            <h3 style="margin:0 0 10px;">${_t('donors.title', { count: list.length }, 'Contributors (' + list.length + ')')}</h3>
            ${rows}
            ${more}
        `;
    } catch (e) {
        console.error('[Donate] Indexer donors failed:', e);
        el.innerHTML =
            '<p style="color:#e74c3c;">' + _t('donors.error', null, 'Failed to load contributors') + '</p>';
    }
}

// ==================== تابع اصلی Donate ====================

/**
 * بازیابی مبلغ/شبکه/تیک شرایط از query string
 * بعد از باز شدن صفحه داخل TronLink (storage مرورگر قبلی در دسترس نیست)
 */
function restoreDonateStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const amountParam = params.get('amount');
    const networkParam = params.get('network');
    const termsParam = params.get('terms');
    const resume = params.get('tron_resume') === '1';

    if (amountParam) {
        const n = parseFloat(amountParam);
        if (!isNaN(n) && n > 0) {
            selectedAmount = n;
            const customAmount = document.getElementById('customAmount');
            if (customAmount) customAmount.value = String(n);
        }
    }

    if (networkParam && getNetworks()[networkParam]) {
        const select = document.getElementById('networkSelect');
        if (select) {
            select.value = networkParam;
        }
        selectNetwork(networkParam);
    }

    if (termsParam === '1') {
        const termsConsent = document.getElementById('termsConsent');
        if (termsConsent) {
            termsConsent.checked = true;
        }
    }

    updateButtonState();

    return { resume, networkParam, amountParam };
}

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
                alert(_t('payment.selectNetworkAlert', null, 'Please select a network first'));
                return;
            }
            if (!currentContract) {
                alert(_t('payment.noTreasuryAlert', null, 'Smart treasury is not set up for this network yet'));
                return;
            }
            if (selectedAmount <= 0) {
                alert(_t('payment.invalidAmount', null, 'Please enter a valid amount'));
                return;
            }

            const net = getNetworks()[selectedNetwork];
            if (!net) {
                alert(_t('payment.invalidNetwork', null, 'Selected network is not valid'));
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
_t('payment.connecting', { wallet: net.walletName || 'wallet' }, 'Connecting to ' + (net.walletName || 'wallet') + '...');
                }

                if (txHash) {
                    txHash.innerHTML = '';
                }
                
                const termsEl = document.getElementById('termsConsent');
                connection = await walletManager.connect(net, {
                    amount: selectedAmount,
                    terms: !!(termsEl && termsEl.checked)
                });
                updateWalletInfo(connection);
            } catch (err) {
                if (successMsg) successMsg.style.display = 'none';
                alert(err.message || _t('payment.walletError', null, 'Wallet connection error'));
                return;
            }

			if (net.type === 'TVM') {

			    let approveTxHash = null;
			    let depositTxHash = null;
			    const walletLabel = net.walletName || 'TronLink';
			    const txHashEl = document.getElementById('txHash');

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

			    try {
			        const amount = Math.floor(
			            selectedAmount * (10 ** (net.tokenDecimals || 6))
			        );

			        if (paymentStatusTitle) {
			            paymentStatusTitle.textContent = _t('payment.waitingConfirm', null, 'Waiting for your confirmation');
			        }
			        if (txHashEl) {
			            txHashEl.innerHTML = `
			                <p><strong>${_t('payment.step1Title', null, 'Step 1 of 2 — Approve transfer')}</strong></p>
			                <p>${_t('payment.step1Body', { amount: selectedAmount }, 'To continue, your wallet must approve transferring ' + selectedAmount + ' USDT.')}</p>
			                <p>${_t('payment.confirmInWallet', { wallet: walletLabel }, 'Please confirm the request in ' + walletLabel + '.')}</p>
			            `;
			        }

			        // Approve — ارسال از WalletManager
			        const approveResult = await walletManager.sendTvmTransaction(
			            connection,
			            {
			                contractAddress: net.usdtAddress,
			                abi: null,
			                method: 'approve',
			                args: [currentContract, amount]
			            }
			        );
			        approveTxHash = approveResult.transactionHash;

			        if (paymentStatusTitle) {
			            paymentStatusTitle.textContent =
			                _t('payment.approved', null, 'Transfer approved');
			        }
			        if (txHashEl) {
			            txHashEl.innerHTML = `
			                <p style="color: green;">
			                    ${_t('payment.approveSuccess', { amount: selectedAmount }, '✓ Transfer of ' + selectedAmount + ' USDT approved successfully on the network.')}
			                </p>
			                <p>
			                    <strong>${_t('payment.step2Title', null, 'Step 2 of 2 — Record contribution')}</strong>
			                </p>
			                <p>
			                    ${_t('payment.step2Body', { amount: selectedAmount }, 'Now ' + selectedAmount + ' USDT will be transferred to the project treasury.')}
			                </p>
			                <p>
			                    ${_t('payment.confirmSecond', { wallet: walletLabel }, 'Please confirm the second transaction in ' + walletLabel + '.')}
			                </p>
			                <p>
			                    <a href="${net.explorer}/transaction/${approveTxHash}" target="_blank">
			                        ${_t('payment.viewApprove', null, 'View Approve')}
			                    </a>
			                </p>
			            `;
			        }

			        if (paymentStatusTitle) {
			            paymentStatusTitle.textContent =
_t('payment.waitingDeposit', null, 'Waiting for deposit confirmation...');
			        }

			        // Deposit — ارسال از WalletManager
			        const depositResult = await walletManager.sendTvmTransaction(
			            connection,
			            {
			                contractAddress: currentContract,
			                abi: fundDepositABI,
			                method: 'depositToken',
			                args: [net.usdtAddress, amount]
			            }
			        );
			        depositTxHash = depositResult.transactionHash;

			        if (paymentStatusTitle) {
			            paymentStatusTitle.textContent =
							_t('payment.success', null, 'Payment recorded successfully');
			        }
			        if (txHashEl) {
			            txHashEl.innerHTML = `
			                <p style="color: green; font-size: 1.15em;">
								${_t('payment.successBody', null, '🎉 Your contribution was recorded successfully!')}
			                </p>
			                <p>
			                    ${_t('payment.amountLabel', { amount: selectedAmount }, 'Amount: ' + selectedAmount + ' USDT')}
			                </p>
			                <p>
			                    <a href="${net.explorer}/transaction/${approveTxHash}" target="_blank">
			                        ${_t('payment.viewApprove', null, 'View Approve')}
			                    </a>
			                    |
			                    <a href="${net.explorer}/transaction/${depositTxHash}" target="_blank">
			                        ${_t('payment.viewDeposit', null, 'View Deposit')}
			                    </a>
			                </p>
			                <p>
								${_t('payment.thanks', null, 'ClassChain thanks you for your support! ❤️')}
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
			            loadProjectFinancials(projects?.['targetAmount(USDT)'] || 0);
			        }, 8000);

			    } catch (err) {
			        console.error('[Donate] TRON transaction error:', err);

			        let userMessage = _t('errors.title', null, 'Transaction error:') + '\n';
			        if (
			            err.code === 4001 ||
			            (err.message &&
			                (err.message.includes('لغو') ||
			                    err.message.includes('denied') ||
			                    err.message.includes('rejected')))
			        ) {
			            userMessage += _t('errors.cancelled', null, 'You cancelled the transaction.');
			        } else if (
			            err.message &&
			            err.message.includes('insufficient')
			        ) {
			            userMessage += _t('errors.insufficient', null, 'Insufficient wallet balance (gas or token).');
			        } else {
			            userMessage += '❌ ' + (err.message || _t('errors.unknown', null, 'Unknown error'));
			        }

			        if (approveTxHash && !depositTxHash) {
			            userMessage +=
			                '\n\n✅ ' + _t('errors.approved', null, 'Approve succeeded:') +
			                '\n' + net.explorer + '/transaction/' + approveTxHash +
			                '\n❌ ' + _t('errors.depositFailed', null, 'but the deposit step failed.');
			        }
			        if (approveTxHash && depositTxHash) {
			            userMessage +=
			                '\n\nApprove:\n' + net.explorer + '/transaction/' + approveTxHash +
			                '\n\nDeposit:\n' + net.explorer + '/transaction/' + depositTxHash +
			                '\n\n❌ ' + _t('errors.depositFailedOnChain', null, 'Deposit failed on the network.');
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
                    alert(_t('payment.insufficientBalance', { balance: balanceMain, amount: selectedAmount }, '⚠️ Insufficient balance!\n\nYour balance: ' + balanceMain + ' USDT\nRequested: ' + selectedAmount + ' USDT'));
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
                const walletLabel = net.walletName || _t('network.wallet', null, 'Wallet');

                if (paymentStatusTitle) {
                    paymentStatusTitle.textContent = _t('payment.waitingConfirm', null, 'Waiting for your confirmation');
                }
                if (txHashEl) {
                    txHashEl.innerHTML = `
                        <p><strong>${_t('payment.step1Title', null, 'Step 1 of 2 — Approve transfer')}</strong></p>
                        <p>${_t('payment.step1Body', { amount: selectedAmount }, 'To continue, your wallet must approve transferring ' + selectedAmount + ' USDT.')}</p>
                        <p>${_t('payment.confirmInWallet', { wallet: walletLabel }, 'Please confirm the request in ' + walletLabel + '.')}</p>
                    `;
                }

                // encode فقط — ارسال از WalletManager (injected و WC یکسان)
                const approveData = tokenContract.methods
                    .approve(currentContract, approveAmount)
                    .encodeABI();

                const approveResult = await walletManager.sendEvmTransaction(
                    connection,
                    {
                        to: net.usdtAddress,
                        data: approveData
                    }
                );
                approveTxHash = approveResult.transactionHash;
                
                if (paymentStatusTitle) {
                    paymentStatusTitle.textContent = _t('payment.approved', null, 'Transfer approved');
                }
                if (txHashEl) {
                    txHashEl.innerHTML = `
                        <p style="color: green;">
                            ${_t('payment.approveSuccess', { amount: selectedAmount }, '✓ Transfer of ' + selectedAmount + ' USDT approved successfully.')}
                        </p>
                        <p>
                            <strong>${_t('payment.step2Title', null, 'Step 2 of 2 — Record contribution')}</strong>
                        </p>
                        <p>
                            ${_t('payment.step2Body', { amount: selectedAmount }, 'Now ' + selectedAmount + ' USDT will be transferred to the project treasury.')}
                        </p>
                        <p>
                            ${_t('payment.confirmSecond', { wallet: walletLabel }, 'Please confirm the second transaction in ' + walletLabel + '.')}
                        </p>
                        <p>
                            <a href="${net.explorer}/tx/${approveTxHash}" target="_blank">
                                ${_t('payment.viewApprove', null, 'View Approve')}
                            </a>
                        </p>
                    `;
                }
                
                if (paymentStatusTitle) {
                    paymentStatusTitle.textContent = _t('payment.waitingDeposit', null, 'Waiting for deposit confirmation...');
                }

                if (txHashEl) {
                    txHashEl.innerHTML = `
                        <p>
                            <strong>${_t('payment.step2Title', null, 'Step 2 of 2 — Record contribution')}</strong>
                        </p>
                        <p>
                            ${_t('payment.confirmDeposit', null, 'Please confirm the deposit transaction in your wallet.')}
                        </p>
                    `;
                }

                const depositData = fundContract.methods
                    .depositToken(net.usdtAddress, amount)
                    .encodeABI();

                const depositResult = await walletManager.sendEvmTransaction(
                    connection,
                    {
                        to: currentContract,
                        data: depositData
                    }
                );
                depositTxHash = depositResult.transactionHash;

                if (!depositResult.status) {
                    const error = new Error(
                        _t('errors.depositReverted', null, 'Deposit transaction failed on the network and was reverted by the contract.')
                    );
                    error.txHash = depositTxHash;
                    throw error;
                }
                if (paymentStatusTitle) {
                    paymentStatusTitle.textContent = _t('payment.success', null, 'Payment recorded successfully');
                }
                if (txHashEl) {
                    txHashEl.innerHTML = `
                        <p style="color: green; font-size: 1.15em;">
                            ${_t('payment.successBody', null, '🎉 Your contribution was recorded successfully!')}
                        </p>
                        <p>
                            ${_t('payment.amountLabel', { amount: selectedAmount }, 'Amount: ' + selectedAmount + ' USDT')}
                        </p>
                        <p>
                            <a href="${net.explorer}/tx/${approveTxHash}" target="_blank">
                                ${_t('payment.viewApprove', null, 'View Approve')}
                            </a>
                            |
                            <a href="${net.explorer}/tx/${depositTxHash}" target="_blank">
                                ${_t('payment.viewDeposit', null, 'View Deposit')}
                            </a>
                        </p>
                        <p>${_t('payment.thanks', null, 'ClassChain thanks you for your support! ❤️')}</p>
                    `;
                }

                if (connectBtn) {
                    connectBtn.disabled = true;
                }

                optimisticProgressUpdate(selectedAmount);
                setTimeout(() => {
                    loadProjectFinancials(projects?.['targetAmount(USDT)'] || 0);
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

    // بازیابی state بعد از لود پروژه/شبکه‌ها (سناریوی TronLink in-app)
    const restored = restoreDonateStateFromUrl();
    console.log('[Donate] state from URL', restored);

    // اگر از deep link TronLink آمده‌ایم و کیف پول inject شده،
    // کاربر فقط یک‌بار دکمه را می‌زند — مبلغ/شبکه از قبل پر است.
    // (auto-click نمی‌کنیم تا کاربر کنترل داشته باشد؛ فقط UI آماده است)
    if (restored.resume) {
        const btn = document.getElementById('connectBtn');
        if (btn && !btn.disabled) {
            // اسکرول به دکمه برای دیده شدن
            try {
                btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (_) {}
        }
        // پاک کردن tron_resume از URL تا refresh دوباره resume نکند (اختیاری)
        try {
            const u = new URL(window.location.href);
            u.searchParams.delete('tron_resume');
            window.history.replaceState({}, '', u.toString());
        } catch (_) {}
    }
}
initializeDonatePage();
updateButtonState();
});

document.addEventListener('classchain:langchange', function () {
    try {
        if (!projects || !projects.ProjectID) return;
        const isPool = String(projects.ProjectID) === 'GENERAL_POOL';
        const titleEl = document.getElementById('projectTitle');
        const descEl = document.getElementById('projectDesc');
        if (titleEl) {
            titleEl.innerText = isPool
                ? (projects['نام پروژه'] || _t('pool.title', null, 'General Contribution Pool'))
                : (projects['نام پروژه'] || _t('project.noName', null, 'Unnamed project'));
        }
        if (descEl) {
            if (isPool) {
                descEl.innerText = _t('pool.desc', null, 'Contribute to the general pool — after community voting, funds are allocated to selected projects');
            } else {
                descEl.innerText = _t('project.meta', {
                    province: projects.استان || '',
                    region: projects.منطقه || '',
                    classes: projects['تعداد کلاس'] || 0
                }, (projects.استان || '') + ' - ' + (projects.منطقه || '') + ' | ' + (projects['تعداد کلاس'] || 0) + ' classes');
            }
        }
        if (typeof loadProjectFinancials === 'function') {
            loadProjectFinancials(Number(projects['targetAmount(USDT)']) || 0);
        }
        if (typeof loadDonorsFromIndexer === 'function') {
            loadDonorsFromIndexer(projects.ProjectID);
        }
        if (typeof updateButtonState === 'function') updateButtonState();
    } catch (e) {
        console.warn('[Donate] langchange refresh failed', e);
    }
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
