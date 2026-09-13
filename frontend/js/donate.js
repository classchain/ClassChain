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

function getTokenDecimals(network) {
    return getNetworks()[network]?.tokenDecimals || 6;
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

function t(key, vars) {
    try {
        if (window.DonateI18n && typeof window.DonateI18n.t === 'function') {
            return window.DonateI18n.t(key, vars);
        }
    } catch (e) {}
    return key;
}

function tProgress(raised, target, percent) {
    var locale = document.documentElement.lang === 'en' ? 'en-US' : (document.documentElement.lang === 'ar' ? 'ar-EG' : 'fa-IR');
    return t('progress.raised', {
        raised: Number(raised).toFixed(2),
        target: Number(target).toLocaleString(locale),
        percent: Number(percent).toFixed(1)
    });
}

function optimisticProgressUpdate(donatedAmount) {
    const progressTextEl = document.getElementById('progressText');
    if (!progressTextEl) return;
    let currentText = progressTextEl.innerText || '0';
    let currentRaised = parseFloat(currentText) || 0;
    currentRaised += donatedAmount;
    const targetMatch = currentText.match(/([\d,]+)\s*USDT/);
    const target = targetMatch ? parseFloat(targetMatch[1].replace(/,/g, '')) : 100000;
    const percent = Math.min((currentRaised / target) * 100, 100);
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = percent + '%';
    progressTextEl.innerText = tProgress(currentRaised, target, percent);
}

function handleTransactionError(err, approveTxHash, depositTxHash, net) {
    let errorMsg = t('err.txPrefix') + '\n';
    if (err.code === 4001 || err.message?.includes('User denied') || err.message?.includes('denied')) {
        errorMsg += t('err.userDenied');
    } else if (err.message?.includes('insufficient funds')) {
        errorMsg += t('err.insufficientFunds');
    } else if (err.message?.includes('execution reverted')) {
        errorMsg += t('err.reverted');
    } else {
        errorMsg += err.message || t('err.unknown');
    }
    if (approveTxHash && !depositTxHash) {
        errorMsg += '\n\n' + t('err.approveOkDepositFail', { url: (net && net.explorer ? net.explorer : '') + '/tx/' + approveTxHash });
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
        connectBtn.textContent = t('btn.selectNetworkFirst');
        connectBtn.disabled = true;
        return;
    }
    const isActive = net.status === 'active' && net.enabled;
    connectBtn.textContent = net.buttonLabel || t('btn.connectPay');
    connectBtn.disabled = !termsConsent?.checked || !isActive || !currentContract;
    if (!isActive) {
        connectBtn.textContent = t('btn.networkInactive', { name: net.walletName || net.name });
    } else if (!currentContract) {
        connectBtn.textContent = t('btn.treasuryNotReady', { name: net.name });
    }
}

function updateWalletInfo(connection) {
    const walletInfo = document.getElementById('walletInfo');
    const userAddressEl = document.getElementById('userAddress');
    if (!walletInfo || !userAddressEl || !connection?.account) return;
    userAddress = connection.account;
    userAddressEl.innerText = (connection.network.walletName || '') + ': ' + connection.account;
    walletInfo.style.display = 'block';
}

function selectNetwork(network) {
    selectedNetwork = network;
    const net = getNetworks()[network];
    if (!net) return;
    currentContract = getProjectFundAddress(projects, net);
    const qrSection = document.getElementById('qrSection');
    if (qrSection) qrSection.style.display = net.type === 'TVM' ? 'block' : 'none';
    updateButtonState();
}

async function loadProjectData() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    if (!projectId) {
        const title = document.getElementById('projectTitle');
        if (title) title.innerText = t('project.notFound');
        throw new Error('Missing project id');
    }
    try {
        const response = await fetch('data/Projects.json');
        if (!response.ok) throw new Error('Projects.json missing');
        const data = await response.json();
        let foundProject = null;
        if (data.features && Array.isArray(data.features)) {
            for (const feature of data.features) {
                if (feature.attributes && String(feature.attributes.ProjectID) === String(projectId)) {
                    foundProject = feature.attributes;
                    break;
                }
            }
        }
        if (!foundProject) {
            const title = document.getElementById('projectTitle');
            if (title) title.innerText = t('project.notFound');
            throw new Error('Project not found');
        }
        projects = foundProject;
        const titleEl = document.getElementById('projectTitle');
        if (titleEl) titleEl.innerText = foundProject['نام پروژه'] || t('project.unnamed');
        const descEl = document.getElementById('projectDesc');
        if (descEl) {
            descEl.innerText = t('project.meta', {
                province: foundProject.استان || '',
                district: foundProject.منطقه || '',
                classes: foundProject['تعداد کلاس'] || 0
            });
        }
        const target = Number(foundProject['targetAmount(USDT)']) || 0;
        const select = document.getElementById('networkSelect');
        if (select) {
            select.innerHTML = '';
            const donationNetworks = networkConfig.getDonationNetworks();
            donationNetworks.forEach(net => {
                const opt = document.createElement('option');
                opt.value = net.id;
                const hasFund = projectHasFundOnNetwork(foundProject, net);
                const isActive = net.status === 'active' && net.enabled;
                opt.textContent = net.name + ' — ' + (net.walletName || t('network.wallet')) + (isActive && hasFund ? '' : t('network.inactiveSuffix'));
                opt.disabled = !isActive || !hasFund;
                select.appendChild(opt);
            });
            const preferred = ['polygon_amoy', 'tron_nile'].find(id => {
                const net = getNetworks()[id];
                if (!net) return false;
                return net.status === 'active' && net.enabled && projectHasFundOnNetwork(foundProject, net);
            });
            const firstEnabled = Array.from(select.options).find(option => !option.disabled);
            const Network = preferred || firstEnabled?.value || null;
            if (Network) {
                select.value = Network;
                selectNetwork(Network);
            } else {
                selectedNetwork = null;
                currentContract = null;
                updateButtonState();
            }
        }
        return { project: foundProject, target: target };
    } catch (error) {
        console.error('[Donate] load project error:', error);
        const title = document.getElementById('projectTitle');
        if (title) title.innerText = t('project.loadError');
        throw error;
    }
}

async function loadProjectFinancials(target = null) {
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    if (text) text.innerText = t('progress.reading');
    let totalRaised = 0;
    try {
        if (window.ClassChainRaisedReader && projects) {
            const result = await window.ClassChainRaisedReader.getProjectRaisedUSDT(projects);
            totalRaised = Number(result?.total) || 0;
        }
    } catch (error) {
        console.error('[Donate] treasury read error:', error);
        if (text) text.innerText = t('progress.readFailed');
        return;
    }
    const projectTarget = target !== null ? Number(target) || 0 : Number(projects?.['targetAmount(USDT)']) || 0;
    const percent = projectTarget > 0 ? Math.min((totalRaised / projectTarget) * 100, 100) : 0;
    if (fill) fill.style.width = percent + '%';
    if (text) text.innerText = tProgress(totalRaised, projectTarget, percent);
}

function saveEmail() {
    const email = document.getElementById('donorEmail')?.value.trim();
    const consent = document.getElementById('consent')?.checked;
    if (!email || !consent) {
        alert(t('email.invalid'));
        return;
    }
    alert(t('email.saved'));
}

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
        if (!prev) map.set(key, { donor: row.donor, total: amount, count: 1 });
        else { prev.total += amount; prev.count += 1; }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
}

async function loadDonorsFromIndexer(projectId) {
    const el = document.getElementById('donorsList');
    if (!el) return;
    const id = String(projectId || projects?.ProjectID || '').trim();
    if (!id) {
        el.innerHTML = '<p>' + t('donors.noProjectId') + '</p>';
        return;
    }
    el.innerHTML = '<p>' + t('donors.loading') + '</p>';
    try {
        const res = await fetch(INDEXER_API + '/api/donors?projectId=' + encodeURIComponent(id), { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const list = aggregateIndexerDonors(data.donors || []);
        if (!list.length) {
            el.innerHTML = '<p>' + t('donors.empty') + '</p>';
            return;
        }
        const rows = list.slice(0, 15).map(d =>
            '<div class="donor-item"><span class="donor-address" title="' + d.donor + '">' + shortDonorAddr(d.donor) + '</span><span class="donor-amount"><strong>' + d.total.toFixed(2) + '</strong> USDT</span></div>'
        ).join('');
        const more = list.length > 15 ? '<p style="opacity:.75;margin-top:8px;">' + t('donors.more', { n: list.length - 15 }) + '</p>' : '';
        el.innerHTML = '<h3 style="margin:0 0 10px;">' + t('donors.title', { count: list.length }) + '</h3>' + rows + more;
    } catch (e) {
        console.error('[Donate] Indexer donors failed:', e);
        el.innerHTML = '<p style="color:#e74c3c;">' + t('donors.error') + '</p>';
    }
}

function restoreDonateStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const amountParam = params.get('amount');
    const networkParam = params.get('network');
    const termsParam = params.get('terms');
    if (amountParam) {
        const n = parseFloat(amountParam);
        if (!isNaN(n) && n > 0) {
            selectedAmount = n;
            const input = document.getElementById('customAmount');
            if (input) input.value = String(n);
        }
    }
    if (networkParam && getNetworks()[networkParam]) {
        const select = document.getElementById('networkSelect');
        if (select) select.value = networkParam;
        selectNetwork(networkParam);
    }
    if (termsParam === '1') {
        const terms = document.getElementById('termsConsent');
        if (terms) terms.checked = true;
    }
    updateButtonState();
}

async function initializeDonatePage() {
    try {
        const { target } = await loadProjectData();
        await loadProjectFinancials(target);
        const projectId = new URLSearchParams(window.location.search).get('project');
        await loadDonorsFromIndexer(projectId);
        restoreDonateStateFromUrl();
    } catch (e) {
        console.error('[Donate] init failed', e);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const amountInput = document.getElementById('customAmount');
    if (amountInput) {
        amountInput.addEventListener('input', function () {
            selectedAmount = parseFloat(amountInput.value) || 0;
        });
    }
    const terms = document.getElementById('termsConsent');
    if (terms) terms.addEventListener('change', updateButtonState);
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', async function () {
            if (!selectedNetwork) {
                alert(t('alert.selectNetwork'));
                return;
            }
            const net = getNetworks()[selectedNetwork];
            if (!net) {
                alert(t('alert.invalidNetwork'));
                return;
            }
            if (!currentContract) {
                alert(t('alert.treasuryMissing'));
                return;
            }
            selectedAmount = parseFloat(document.getElementById('customAmount')?.value) || 0;
            if (!selectedAmount || selectedAmount <= 0) {
                alert(t('alert.invalidAmount'));
                return;
            }
            connectBtn.textContent = t('status.connecting', { name: net.walletName || net.name });
            connectBtn.disabled = true;
            try {
                if (typeof window.startDonationFlow === 'function') {
                    await window.startDonationFlow({
                        amount: selectedAmount,
                        network: selectedNetwork,
                        contract: currentContract,
                        project: projects,
                        onStatus: function (key) {
                            const title = document.getElementById('paymentStatusTitle');
                            if (title) title.textContent = t(key);
                        }
                    });
                } else if (walletManager && typeof walletManager.connectAndDonate === 'function') {
                    await walletManager.connectAndDonate({
                        amount: selectedAmount,
                        networkId: selectedNetwork,
                        contractAddress: currentContract
                    });
                } else {
                    // fallback: open wallet connect via existing methods if present
                    console.warn('[Donate] No donation flow function found — connectBtn relies on donate.js extended handlers');
                    alert(t('err.walletConnect'));
                    connectBtn.textContent = t('btn.connectPay');
                    connectBtn.disabled = false;
                }
            } catch (err) {
                handleTransactionError(err, null, null, net);
                connectBtn.textContent = t('btn.connectPay');
                updateButtonState();
            }
        });
    }
    initializeDonatePage();
    updateButtonState();
});
