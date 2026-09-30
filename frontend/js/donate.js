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

function telegramGroupLabel(projectId) {
    const isPool = String(projectId) === 'GENERAL_POOL';
    if (isPool) {
        return _t('payment.telegramPoolLabel', null, 'General Pool Telegram group');
    }
    return _t('payment.telegramProjectLabel', null, 'Project Telegram group');
}

/**
 * After successful payment: fetch invite link and show it in the success panel
 * (no auto-redirect, no blank tab). Works for project groups and GENERAL_POOL.
 */
function showTelegramInviteAfterPayment(projectId) {
    const el = document.getElementById('telegramInviteBox');
    if (!projectId) {
        if (el) el.style.display = 'none';
        return;
    }

    if (el) {
        el.style.display = 'block';
        el.innerHTML =
            '<p style="margin:0.5em 0;opacity:0.85;">' +
            _t('payment.telegramLoading', null, 'Loading Telegram group link...') +
            '</p>';
    }

    fetch(`${INDEXER_API}/api/telegram/groups/project/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ project_id: String(projectId) }),
    })
        .then(res => res.json().then(data => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
            if (!el) return;
            if (!ok || !data?.invite_link) {
                console.warn('[Donate] Telegram invite unavailable:', data?.error || 'unknown error');
                el.innerHTML =
                    '<p style="margin:0.5em 0;opacity:0.75;">' +
                    _t('payment.telegramUnavailable', null, 'Telegram group link is not available for this project yet.') +
                    '</p>';
                return;
            }

            const label = telegramGroupLabel(projectId);
            const joinText = _t('payment.telegramJoin', null, 'Join Telegram group');
            el.innerHTML =
                '<p style="margin:0.6em 0 0.25em;">' +
                _t('payment.telegramHint', null, 'Optional — join the community group if you want:') +
                '</p>' +
                '<p style="margin:0.35em 0;">' +
                '<a href="' + data.invite_link + '" target="_blank" rel="noopener noreferrer" ' +
                'style="display:inline-block;padding:0.55em 1em;border-radius:8px;' +
                'background:#229ED9;color:#fff;text-decoration:none;font-weight:600;">' +
                '✈️ ' + joinText + ' — ' + label +
                '</a>' +
                '</p>' +
                '<p style="margin:0.35em 0;font-size:0.9em;word-break:break-all;">' +
                '<a href="' + data.invite_link + '" target="_blank" rel="noopener noreferrer">' +
                data.invite_link +
                '</a>' +
                '</p>';
        })
        .catch(err => {
            console.warn('[Donate] Telegram invite failed:', err);
            if (el) {
                el.innerHTML =
                    '<p style="margin:0.5em 0;opacity:0.75;">' +
                    _t('payment.telegramUnavailable', null, 'Telegram group link is not available for this project yet.') +
                    '</p>';
            }
        });
}

// NOTE: remainder of file restored from working tree — see commit body
console.error('[Donate] INCOMPLETE FILE UPLOAD — do not use');
