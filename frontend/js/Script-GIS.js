let currentContractAddress = null;
let currentProjectId = null;
/** نوع انتخاب فعلی روی نقشه: none | province | county | project */
let selectionKind = 'none';
/** آخرین context پنل برای re-render روی تغییر زبان */
let lastPanelContext = { kind: 'none', data: null };

function _t(key, vars, fallback) {
    try {
        if (window.GisI18n && typeof window.GisI18n.t === 'function') {
            const v = window.GisI18n.t(key, vars);
            if (v && v !== key) return v;
        }
    } catch (e) {}
    return fallback != null ? fallback : key;
}

const map = L.map('map', {
    renderer: L.canvas(),
    zoomControl: false
}).setView([32.4279, 53.6880], 5);

let selectedLayer = null;
let selectedCountyLayer = null;
let selectedProjectMarker = null;
let geo, countiesLayer = null, projectsLayer = null;

const infoPanelWrapper = document.getElementById('infoPanelWrapper');
const fixedContributeBtn = document.getElementById('fixedContributeBtn');
const contributeActionBtn = document.getElementById('contributeActionBtn');
const panelHeader = document.getElementById('panelHeader');
const panelContent = document.getElementById('infoPanel');
const dragHandle = document.getElementById('dragHandle');
const layersBtn = document.getElementById('layersBtn');
const basemapPopup = document.getElementById('basemapPopup');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const homeBtn = document.getElementById('homeBtn');

function clearDonateContext() {
    currentProjectId = null;
    currentContractAddress = null;
    if (fixedContributeBtn) fixedContributeBtn.style.display = 'none';
}

function enableDonateContext(projectId, contractAddress) {
    currentProjectId = projectId || null;
    currentContractAddress = contractAddress || null;
    if (fixedContributeBtn) {
        fixedContributeBtn.style.display = currentProjectId ? 'block' : 'none';
    }
}

function normalizeFundAddress(value) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s || s === 'null' || s === 'undefined') return null;
    return s;
}

function collectProjectFunds(projectAttributes) {
    const a = projectAttributes || {};
    const byNetwork = new Map();

    const funds = a.funds && typeof a.funds === 'object' ? a.funds : {};
    for (const [networkId, entry] of Object.entries(funds)) {
        if (!entry || typeof entry !== 'object') continue;
        const address = normalizeFundAddress(entry.address);
        if (!address) continue;
        byNetwork.set(networkId, { networkId, address });
    }

    const legacyPolygon = normalizeFundAddress(a.contractAddress);
    if (legacyPolygon && !byNetwork.has('polygon_amoy')) {
        byNetwork.set('polygon_amoy', { networkId: 'polygon_amoy', address: legacyPolygon });
    }
    const legacyTron = normalizeFundAddress(a.contractAddressTron);
    if (legacyTron && !byNetwork.has('tron_nile') && !byNetwork.has('tron_mainnet')) {
        byNetwork.set('tron_nile', { networkId: 'tron_nile', address: legacyTron });
    }

    return [...byNetwork.values()];
}

function getNetworkMeta(networkId) {
    const cfg = window.ClassChainNetworkConfig;
    const net = cfg?.getNetwork?.(networkId) || cfg?.NETWORKS?.[networkId] || null;
    if (net) {
        return {
            id: net.id || networkId,
            name: net.name || networkId,
            type: net.type || 'EVM',
            color: net.color || '#3498db',
            icon: net.icon || '💎',
            explorerUrl: (net.explorerUrl || net.explorer || '').replace(/\/$/, '')
        };
    }
    const FALLBACK = {
        polygon_amoy: { name: 'Polygon Amoy', type: 'EVM', color: '#8247E5', icon: '🟣', explorerUrl: 'https://amoy.polygonscan.com' },
        tron_nile: { name: 'Tron Nile', type: 'TVM', color: '#EF0027', icon: '🔴', explorerUrl: 'https://nile.tronscan.org' },
        tron_mainnet: { name: 'Tron Mainnet', type: 'TVM', color: '#EF0027', icon: '🔴', explorerUrl: 'https://tronscan.org' }
    };
    const fb = FALLBACK[networkId] || {};
    return {
        id: networkId,
        name: fb.name || networkId,
        type: fb.type || 'EVM',
        color: fb.color || '#3498db',
        icon: fb.icon || '💎',
        explorerUrl: fb.explorerUrl || ''
    };
}

function fundExplorerUrl(meta, address) {
    if (!meta.explorerUrl || !address) return null;
    if (meta.type === 'TVM') return `${meta.explorerUrl}/#/address/${address}`;
    return `${meta.explorerUrl}/address/${address}`;
}

function buildFundsHtml(projectAttributes) {
    const entries = collectProjectFunds(projectAttributes);
    if (!entries.length) return { html: '', hasTreasury: false, primaryAddress: null };

    const cards = entries.map(({ networkId, address }) => {
        const meta = getNetworkMeta(networkId);
        const href = fundExplorerUrl(meta, address);
        const color = meta.color;
        const addrInner = href
            ? `<a href="${href}" target="_blank" rel="noopener noreferrer"
                  style="color:${color}; text-decoration:underline; word-break:break-all;">${address}</a>`
            : `<span style="color:${color}; word-break:break-all;">${address}</span>`;

        return `
        <div style="
            margin-top:10px;
            padding:12px;
            border-radius:10px;
            background:#fff;
            border:1px solid rgba(24,52,43,0.11);
            border-right:4px solid ${color};
            box-shadow:0 4px 14px rgba(18,55,45,0.06);
        ">
            <div style="
                font-weight:700;
                color:#12372d;
                margin-bottom:8px;
                font-size:0.95em;
                display:flex;
                align-items:center;
                gap:6px;
            "><span style="color:${color};font-size:1.05em;">${meta.icon}</span> <span>${meta.name}</span></div>
            <div style="
                font-size:0.85em;
                line-height:1.4;
                direction:ltr;
                text-align:left;
            ">${addrInner}</div>
        </div>`;
    }).join('');

    return {
        html: cards,
        hasTreasury: true,
        primaryAddress: entries[0].address
    };
}

/* FILE_CONTINUED_IN_NEXT_UPDATE */
