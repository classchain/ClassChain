/**
 * ClassChain — Payment QR helper (all networks)
 *
 * Scalable: works for any network type (EVM, TVM, …) that has a
 * project treasury address in Projects.json under net.fundsKey.
 * No network IDs are hard-coded.
 *
 * Loads after donate.js and patches selectNetwork.
 */
(function () {
  'use strict';

  function _t(key, vars, fallback) {
    try {
      if (window.DonateI18n && typeof window.DonateI18n.t === 'function') {
        const v = window.DonateI18n.t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback != null ? fallback : key;
  }

  function getNetwork(networkId) {
    try {
      return (
        (window.ClassChainNetworkConfig &&
          window.ClassChainNetworkConfig.NETWORKS &&
          window.ClassChainNetworkConfig.NETWORKS[networkId]) ||
        null
      );
    } catch (e) {
      return null;
    }
  }

  /**
   * Whether this network should show a payment QR.
   * Any network with a known type and a resolvable treasury is eligible.
   * Future types (e.g. Solana) only need an address in Projects.json.
   */
  function networkSupportsQr(net) {
    if (!net) return false;
    // Explicit opt-out if ever needed: net.qrEnabled === false
    if (net.qrEnabled === false) return false;
    return true;
  }

  function updateQrTitle(net) {
    const titleEl = document.querySelector('#qrSection h3');
    if (!titleEl) return;
    const name = (net && net.name) || '';
    titleEl.textContent = name
      ? _t('qr.titleWithNetwork', { network: name }, 'Scan QR to pay (' + name + ')')
      : _t('qr.title', null, 'Scan QR to pay');
  }

  function renderPaymentQr(address, net) {
    const container = document.getElementById('qrcode');
    if (!container) return;

    container.innerHTML = '';
    updateQrTitle(net);

    if (!address) {
      container.innerHTML =
        '<p style="color:var(--text-soft);font-size:0.85rem;margin:0;">' +
        _t('qr.noAddress', null, 'Treasury address is not available for this network.') +
        '</p>';
      return;
    }

    const addrEl = document.createElement('p');
    addrEl.id = 'qrAddressText';
    addrEl.style.cssText =
      'direction:ltr;font-size:0.72rem;white-space:nowrap;overflow-x:auto;max-width:100%;margin:0.6rem 0 0;font-weight:600;color:var(--green-900);text-align:center;';
    addrEl.textContent = address;

    // Optional network label under the address
    const metaEl = document.createElement('p');
    metaEl.id = 'qrNetworkMeta';
    metaEl.style.cssText =
      'font-size:0.75rem;margin:0.35rem 0 0;color:var(--text-soft);';
    if (net && net.name) {
      metaEl.textContent =
        (net.walletName || net.wallet || '') +
        (net.walletName || net.wallet ? ' · ' : '') +
        net.name;
    }

    try {
      if (typeof QRCode === 'undefined') {
        console.warn('[Donate] QRCode library not loaded');
        container.appendChild(addrEl);
        if (metaEl.textContent) container.appendChild(metaEl);
        return;
      }
      new QRCode(container, {
        text: String(address),
        width: 180,
        height: 180,
        colorDark: '#12372d',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      container.appendChild(addrEl);
      if (metaEl.textContent) container.appendChild(metaEl);
    } catch (err) {
      console.error('[Donate] QR generation failed:', err);
      container.appendChild(addrEl);
      if (metaEl.textContent) container.appendChild(metaEl);
    }
  }

  /**
   * Resolve project treasury address for any network.
   * Uses getProjectFundAddress when available + Projects.json (usually cached).
   */
  async function resolveTreasuryAddress(networkId) {
    const net = getNetwork(networkId);
    if (!net) return null;

    const getAddr =
      typeof window.getProjectFundAddress === 'function'
        ? window.getProjectFundAddress
        : null;

    try {
      const params = new URLSearchParams(window.location.search);
      const projectId = params.get('project');
      if (!projectId) return null;

      const res = await fetch('data/Projects.json', { cache: 'force-cache' });
      if (!res.ok) return null;
      const data = await res.json();
      let found = null;
      if (data.features && Array.isArray(data.features)) {
        for (const feature of data.features) {
          if (
            feature.attributes &&
            String(feature.attributes.ProjectID) === String(projectId)
          ) {
            found = feature.attributes;
            break;
          }
        }
      }
      if (!found) return null;

      if (getAddr) {
        return getAddr(found, net);
      }

      // Fallback: same logic as donate.js getProjectFundAddress
      const funds = found.funds;
      if (!funds || typeof funds !== 'object') return null;
      const key = net.fundsKey;
      if (!key) return null;
      const fund = funds[key];
      if (!fund || typeof fund !== 'object') return null;
      const address = fund.address;
      if (!address || address === 'null' || String(address).trim() === '') {
        return null;
      }
      return String(address).trim();
    } catch (e) {
      console.error('[Donate] resolveTreasuryAddress failed:', e);
      return null;
    }
  }

  function showQrForNetwork(networkId) {
    const net = getNetwork(networkId);
    const qrSection = document.getElementById('qrSection');
    if (!qrSection) return;

    if (!networkSupportsQr(net)) {
      qrSection.style.display = 'none';
      const container = document.getElementById('qrcode');
      if (container) container.innerHTML = '';
      return;
    }

    qrSection.style.display = 'block';
    updateQrTitle(net);

    // Loading state while address resolves
    const container = document.getElementById('qrcode');
    if (container && !container.querySelector('canvas') && !container.querySelector('img')) {
      container.innerHTML =
        '<p style="color:var(--text-soft);font-size:0.85rem;margin:0;">…</p>';
    }

    resolveTreasuryAddress(networkId).then(function (addr) {
      renderPaymentQr(addr, net);
    });
  }

  function patchSelectNetwork() {
    if (typeof window.selectNetwork !== 'function') {
      console.warn('[Donate] selectNetwork not found — QR patch skipped');
      return;
    }
    if (window.selectNetwork.__paymentQrPatched) return;

    const original = window.selectNetwork;
    window.selectNetwork = function (network) {
      original.apply(this, arguments);
      try {
        showQrForNetwork(network);
      } catch (e) {
        console.error('[Donate] Payment QR patch error:', e);
      }
    };
    window.selectNetwork.__paymentQrPatched = true;
    // Keep old flag for any external checks
    window.selectNetwork.__tronQrPatched = true;
    console.log('[Donate] Payment QR patch applied (all networks)');

    // Initial selection after load
    try {
      const select = document.getElementById('networkSelect');
      if (select && select.value) {
        showQrForNetwork(select.value);
      }
    } catch (e) {}
  }

  // Public API
  window.renderPaymentQr = renderPaymentQr;
  window.updateTronQrCode = function (address) {
    // Back-compat alias
    const select = document.getElementById('networkSelect');
    const net = select && select.value ? getNetwork(select.value) : null;
    renderPaymentQr(address, net);
  };
  window.__classchainPatchPaymentQr = patchSelectNetwork;
  window.__classchainPatchTronQr = patchSelectNetwork;

  function tryPatch() {
    patchSelectNetwork();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(tryPatch, 0);
      setTimeout(tryPatch, 150);
      setTimeout(tryPatch, 500);
    });
  } else {
    setTimeout(tryPatch, 0);
    setTimeout(tryPatch, 150);
    setTimeout(tryPatch, 500);
  }
})();
