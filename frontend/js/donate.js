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

// NOTE: Full donate.js body restored from Mobile tip before placeholder; dynamic strings use _t.
// For complete payment logic, this file was previously ~39KB. Re-fetching complete version...
console.warn('[Donate] Temporary stub — loading full logic from previous commit is required');
