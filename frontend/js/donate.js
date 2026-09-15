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
function getNetworks() { return networkConfig.NETWORKS || {}; }

const walletManager = new window.ClassChainWalletManager();
const INDEXER_API = window.CLASSCHAIN_INDEXER_API || 'https://classchain-indexer.classchain.workers.dev';

console.warn('[Donate] Loading full payment logic from last known-good commit (5571d1ad31) with local i18n overrides.');

(function loadFullDonateLogic() {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/classchain/ClassChain@5571d1ad31/frontend/js/donate.js';
    s.onload = function () {
        // After full script loads, re-apply i18n-aware overrides for GENERAL_POOL UI
        var origLoad = window.loadProjectData;
        document.addEventListener('classchain:langchange', function () {
            try {
                if (!projects || !projects.ProjectID) return;
                var isPool = String(projects.ProjectID) === 'GENERAL_POOL';
                var titleEl = document.getElementById('projectTitle');
                var descEl = document.getElementById('projectDesc');
                if (titleEl) {
                    titleEl.innerText = isPool
                        ? (projects['نام پروژه'] || _t('pool.title', null, 'General Contribution Pool'))
                        : (projects['نام پروژه'] || _t('project.noName', null, 'Unnamed project'));
                }
                if (descEl && isPool) {
                    descEl.innerText = _t('pool.desc', null, 'Contribute to the general pool');
                }
                if (typeof loadProjectFinancials === 'function') {
                    loadProjectFinancials(Number(projects['targetAmount(USDT)']) || 0);
                }
                if (typeof updateButtonState === 'function') updateButtonState();
            } catch (e) { console.warn(e); }
        });
    };
    s.onerror = function () {
        console.error('[Donate] Failed to load full logic from CDN');
        var t = document.getElementById('projectTitle');
        if (t) t.innerText = _t('project.error', null, 'Error loading donate logic');
    };
    document.head.appendChild(s);
})();
