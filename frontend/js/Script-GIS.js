let currentContractAddress = null;
let currentProjectId = null;
/** نوع انتخاب فعلی روی نقشه: none | province | county | project */
let selectionKind = 'none';

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
            border-radius:8px;
            background:${color}26;
        ">
            <div style="
                font-weight:bold;
                color:#bdc3c7;
                margin-bottom:8px;
                font-size:0.95em;
            ">${meta.icon} ${meta.name}</div>
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

if (zoomInBtn) {
    zoomInBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); map.zoomIn(); });
}
if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); map.zoomOut(); });
}

let panelState = 'peek';
/** تا این زمان، کلیک نقشه نباید full را به half برگرداند (جلوگیری از تداخل با انتخاب مارکر) */
let suppressMapPanelCollapseUntil = 0;
const isMobile = () => window.innerWidth < 1024;
const STATE_TRANSLATE = { peek: 78, half: 45, full: 0 };

function setPanelState(state) {
    if (!isMobile()) return;
    if (!['peek', 'half', 'full'].includes(state)) state = 'peek';
    panelState = state;
    infoPanelWrapper.classList.remove('panel-peek', 'panel-half', 'panel-full', 'dragging');
    infoPanelWrapper.classList.add('panel-' + state);
    infoPanelWrapper.style.transform = '';
    infoPanelWrapper.style.transition = '';
}

function openPanelHalf() { setPanelState('half'); }
function openPanelFull() {
    if (isMobile()) suppressMapPanelCollapseUntil = Date.now() + 800;
    setPanelState('full');
}
function closeToPeek() { setPanelState('peek'); }

function openPanel() { if (isMobile()) openPanelHalf(); }
function closePanel() { if (isMobile()) closeToPeek(); }

/** content را در پنل می‌گذارد؛ panelOpenState: null | 'half' | 'full' | 'peek' */
function showInPanel(content, panelOpenState) {
    panelContent.innerHTML = content;
    if (!isMobile()) return;
    if (panelOpenState === 'full') openPanelFull();
    else if (panelOpenState === 'peek') closeToPeek();
    else openPanelHalf();
}

map.getContainer().addEventListener('click', () => {
    if (!isMobile() || panelState !== 'full') return;
    if (Date.now() < suppressMapPanelCollapseUntil) return;
    openPanelHalf();
});

/* ========== تغییر حالت پنل فقط با درگ (نه کلیک) ========== */
let dragStartY = 0;
let dragStartTranslate = 0;
let isDraggingPanel = false;

function clientYFromEvent(e) {
    if (e.touches && e.touches[0]) return e.touches[0].clientY;
    if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
    return e.clientY;
}

function onPanelDragStart(e) {
    if (!isMobile()) return;
    // فقط لمس/ماوس چپ
    if (e.type === 'mousedown' && e.button !== 0) return;
    dragStartY = clientYFromEvent(e);
    dragStartTranslate = STATE_TRANSLATE[panelState] ?? 78;
    isDraggingPanel = true;
    infoPanelWrapper.classList.remove('panel-peek', 'panel-half', 'panel-full');
    infoPanelWrapper.classList.add('dragging');
    infoPanelWrapper.style.transition = 'none';
    infoPanelWrapper.style.transform = `translate3d(0, ${dragStartTranslate}%, 0)`;
}

function onPanelDragMove(e) {
    if (!isDraggingPanel || !isMobile()) return;
    if (e.cancelable) e.preventDefault();
    const deltaY = clientYFromEvent(e) - dragStartY;
    const deltaPercent = (deltaY / window.innerHeight) * 100;
    let next = Math.max(0, Math.min(85, dragStartTranslate + deltaPercent));
    infoPanelWrapper.style.transform = `translate3d(0, ${next}%, 0)`;
}

function onPanelDragEnd() {
    if (!isDraggingPanel || !isMobile()) return;
    isDraggingPanel = false;
    infoPanelWrapper.classList.remove('dragging');
    let current = dragStartTranslate;
    const m = (infoPanelWrapper.style.transform || '').match(/translate3d\(\s*[^,]+,\s*([\d.]+)%/);
    if (m) current = parseFloat(m[1]);
    infoPanelWrapper.style.transform = '';
    infoPanelWrapper.style.transition = '';
    if (current < 20) openPanelFull();
    else if (current < 60) setPanelState('half');
    else setPanelState('peek');
}

function bindPanelDrag(el) {
    if (!el) return;
    el.addEventListener('touchstart', onPanelDragStart, { passive: true });
    el.addEventListener('touchmove', onPanelDragMove, { passive: false });
    el.addEventListener('touchend', onPanelDragEnd);
    el.addEventListener('touchcancel', onPanelDragEnd);
    el.addEventListener('mousedown', onPanelDragStart);
}

// حرکت/پایان درگ روی document تا خارج از هدر هم ادامه یابد
document.addEventListener('mousemove', onPanelDragMove);
document.addEventListener('mouseup', onPanelDragEnd);

bindPanelDrag(dragHandle);
bindPanelDrag(panelHeader);

if (panelContent) {
    panelContent.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    panelContent.addEventListener('touchmove', (e) => {
        e.stopPropagation();
        if (isDraggingPanel) {
            isDraggingPanel = false;
            infoPanelWrapper.classList.remove('dragging');
            setPanelState(panelState);
        }
    }, { passive: true });
}

if (fixedContributeBtn) {
    fixedContributeBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    fixedContributeBtn.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
}

window.addEventListener('resize', () => {
    if (!isMobile()) {
        infoPanelWrapper.classList.remove('panel-peek', 'panel-half', 'panel-full', 'dragging');
        infoPanelWrapper.style.transform = '';
    } else {
        setPanelState(panelState || 'peek');
    }
});

const basemapLayers = {
    carto: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }),
    persiangis: L.tileLayer('https://map.persiangis.ir/tile/{z}/{x}/{y}.png', { attribution: '© PersianGIS' }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' }),
    light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }),
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' })
};

let currentBasemap = basemapLayers.carto;
currentBasemap.addTo(map);
let currentBasemapKey = 'carto';

function changeBasemap(val) {
    if (!basemapLayers[val] || val === currentBasemapKey) return;
    map.removeLayer(currentBasemap);
    currentBasemap = basemapLayers[val];
    currentBasemapKey = val;
    currentBasemap.addTo(map);
    document.querySelectorAll('.basemap-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === val);
    });
}

function toggleBasemapPopup(forceClose) {
    if (!basemapPopup || !layersBtn) return;
    const willOpen = forceClose === true ? false : basemapPopup.hasAttribute('hidden');
    if (willOpen) {
        basemapPopup.removeAttribute('hidden');
        layersBtn.setAttribute('aria-expanded', 'true');
    } else {
        basemapPopup.setAttribute('hidden', '');
        layersBtn.setAttribute('aria-expanded', 'false');
    }
}

if (layersBtn) {
    layersBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBasemapPopup();
    });
}
if (basemapPopup) {
    basemapPopup.addEventListener('click', (e) => {
        const opt = e.target.closest('.basemap-option');
        if (!opt) return;
        changeBasemap(opt.dataset.value);
        toggleBasemapPopup(true);
    });
}
document.addEventListener('click', (e) => {
    if (!basemapPopup || basemapPopup.hasAttribute('hidden')) return;
    if (e.target.closest('.map-controls')) return;
    toggleBasemapPopup(true);
});

function toggleAccordion(element) {
    element.classList.toggle('collapsed');
    element.nextElementSibling.classList.toggle('collapsed');
}

function getProvinceColor(capita, min, max) {
    if (capita === 0 || capita == null) return '#34495e';
    const ratio = max === min ? 0.5 : (capita - min) / (max - min);
    return `rgb(${Math.min(255, Math.round(52 + ratio * 200))},${Math.min(255, Math.round(73 + ratio * 182))},${Math.min(255, Math.round(94 + ratio * 161))})`;
}

function getCountyColor(capita, min, max) {
    if (capita === 0 || capita == null) return '#777777';
    const ratio = max === min ? 0.5 : (capita - min) / (max - min);
    return `rgb(${Math.round(139 + ratio * 113)},${Math.round(0 + ratio * 228)},${Math.round(0 + ratio * 236)})`;
}

const projectIcon = L.divIcon({
    html: `<div style="background:#e74c3c; width:10px; height:10px; border-radius:50%; border:2px solid white; box-shadow:0 0 6px rgba(0,0,0,0.8);"></div>`,
    className: 'custom-project-marker', iconSize: [14, 14], iconAnchor: [7, 7]
});
const selectedProjectIcon = L.divIcon({
    html: `<div style="background:#f1c40f; width:18px; height:18px; border-radius:50%; border:3px solid white; box-shadow:0 0 12px #f1c40f;"></div>`,
    className: 'custom-project-marker', iconSize: [24, 24], iconAnchor: [12, 12]
});

const markersCluster = L.markerClusterGroup({
    spiderfyOnMaxZoom: true, showCoverageOnHover: false, zoomToBoundsOnClick: true, maxClusterRadius: 60,
    iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        let size = count < 10 ? 40 : count < 100 ? 50 : 60;
        return L.divIcon({
            html: `<div style="background:#e74c3c;color:white;font-weight:bold;border-radius:50%;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;box-shadow:0 0 12px rgba(0,0,0,0.6);font-size:14px;">${count}</div>`,
            className: '', iconSize: [size, size]
        });
    }
});

fetch('data/ir-new.json').then(r => r.json()).then(data => {
    const features = data.features.map(f => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: f.geometry.rings },
        properties: f.attributes
    }));
    const capitas = features.map(f => f.properties.P_capita || 0).filter(c => c > 0);
    const minCapita = capitas.length ? Math.min(...capitas) : 1;
    const maxCapita = capitas.length ? Math.max(...capitas) : 1;

    geo = L.geoJSON(features, {
        style: feature => ({
            color: '#2c3e50', weight: 2,
            fillColor: getProvinceColor(feature.properties.P_capita || 0, minCapita, maxCapita),
            fillOpacity: 0.75
        }),
        onEachFeature: (feature, layer) => {
            const p = feature.properties;
            layer.on('click', e => {
                L.DomEvent.stopPropagation(e);

                if (selectedLayer) geo.resetStyle(selectedLayer);
                if (selectedCountyLayer) countiesLayer?.resetStyle(selectedCountyLayer);
                if (selectedProjectMarker) {
                    selectedProjectMarker.setIcon(projectIcon);
                    selectedProjectMarker = null;
                }

                selectionKind = 'province';
                clearDonateContext();

                layer.setStyle({ weight: 6, color: '#e74c3c', fillOpacity: 0.9 });
                selectedLayer = layer;
                layer.bringToFront();
                map.fitBounds(layer.getBounds(), { padding: [40, 40], animate: true, duration: 1.3 });
                showInPanel(`
                    <div class="province-info">
                        <h3>استان ${p.Name || 'نامشخص'}</h3>
                        ${p.pcenter ? `<div class="info-item"><span class="info-label">مرکز استان:</span><span class="info-value">${p.pcenter}</span></div>` : ''}
                        ${p.population > 0 ? `<div class="info-item"><span class="info-label">جمعیت (۱۳۹۵):</span><span class="info-value">${Number(p.population).toLocaleString('fa-IR')}</span></div>` : ''}
                        ${p.P_capita ? `<div class="info-item"><span class="info-label">سرانه استانی:</span><span class="info-value">${Number(p.P_capita).toFixed(2)}</span></div>` : ''}
                        <div class="info-item"><span class="info-label">شهرستان‌ها:</span><span class="info-value">در حال بارگذاری...</span></div>
                    </div>`);
                showCountiesOfProvince(p.Name);
            });
            layer.on('mouseover', () => { if (selectedLayer !== layer) layer.setStyle({ weight: 5 }); });
            layer.on('mouseout', () => { if (selectedLayer !== layer) geo.resetStyle(layer); });
        }
    }).addTo(map);
});

fetch('data/Projects.json').then(r => r.json()).then(data => {
    data.features.forEach(feature => {
        const a = feature.attributes;
        const x = a.x, y = a.y;
        if (!(x && y && !isNaN(x) && !isNaN(y))) return;
        const marker = L.marker([y, x], { icon: projectIcon });
        marker.properties = a;
        marker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            if (selectedProjectMarker) selectedProjectMarker.setIcon(projectIcon);
            this.setIcon(selectedProjectIcon);
            selectedProjectMarker = this;
            if (selectedLayer) selectedLayer.setStyle({ fillOpacity: 0 });
            if (selectedCountyLayer) selectedCountyLayer.setStyle({ fillOpacity: 0 });

            selectionKind = 'project';

            const { html: fundsCards, hasTreasury, primaryAddress } = buildFundsHtml(a);

            let financialInfo = '';
            if (hasTreasury) {
                financialInfo = `
                    <div style="margin-top:4px;">
                        <span class="info-label" style="font-weight:bold; display:block; margin-bottom:4px;">خزانه‌های هوشمند پروژه</span>
                        ${fundsCards}
                    </div>
                    <div class="info-item" style="margin-top:15px;">
                        <span class="info-label">برآورد هزینه ساخت:</span>
                        <span class="info-value">${a['targetAmount(USDT)'] ? Number(a['targetAmount(USDT)']).toLocaleString('fa-IR') + ' USDT' : 'نامشخص'}</span>
                    </div>
                    <div id="raisedSummary" style="margin-top:15px;"><span class="info-label">در حال خواندن مجموع کمک‌ها...</span></div>
                    <div id="donorsList" style="margin-top:15px;"></div>`;
            } else {
                financialInfo = '<div class="info-item" style="color:#e67e22; margin-top:15px;">خزانه هوشمند هنوز راه‌اندازی نشده</div>';
            }

            const accCls = isMobile() ? ' collapsed' : '';

            showInPanel(`
                <div class="accordion-section"><div class="accordion-title${accCls}" onclick="toggleAccordion(this)">اطلاعات عمومی پروژه</div>
                <div class="accordion-content${accCls}">
                    <div class="info-item"><span class="info-label">نام پروژه:</span><span class="info-value">${a['نام پروژه'] || 'بدون نام'}</span></div>
                    <div class="info-item"><span class="info-label">کد پروژه:</span><span class="info-value">${a['ProjectID']}</span></div>
                    <div class="info-item"><span class="info-label">استان:</span><span class="info-value">${a['استان']}</span></div>
                    <div class="info-item"><span class="info-label">منطقه:</span><span class="info-value">${a['منطقه']}</span></div>
                    <div class="info-item"><span class="info-label">تعداد کلاس:</span><span class="info-value">${a['تعداد کلاس'] || '—'}</span></div>
                    <div class="info-item"><span class="info-label">زیربنا:</span><span class="info-value">${a['زیربنا'] || '—'}</span></div>
                    <div class="info-item"><span class="info-label">ماهیت:</span><span class="info-value">${a['ماهیت پروژه'] || '—'}</span></div>
                    <div class="info-item"><span class="info-label">وضعیت:</span><span class="info-value">${a['وضعیت راهبری پروژه'] || '—'}</span></div>
                    <div class="info-item"><span class="info-label">مسئول:</span><span class="info-value">${a['مسئول پروژه'] || '—'}</span></div>
                    <div class="info-item"><span class="info-label">تلفن:</span><span class="info-value">${a['شماره تلفن مسئول پروژه'] || '—'}</span></div>
                    ${a['آدرس پروژه'] ? `<div class="info-item"><span class="info-label">آدرس:</span><span class="info-value">${a['آدرس پروژه']}</span></div>` : ''}
                </div></div>
                <div class="accordion-section"><div class="accordion-title${accCls}" onclick="toggleAccordion(this)">اطلاعات مالی</div><div class="accordion-content${accCls}">${financialInfo}</div></div>
                <div class="accordion-section"><div class="accordion-title${accCls}" onclick="toggleAccordion(this)">گزارشات پروژه</div>
                <div class="accordion-content${accCls}">
                    <a href="project-images.html?project=${a['ProjectID']}" class="report-link" target="_blank">تصاویر</a>
                    <a href="financial-docs.html?project=${a['ProjectID']}" class="report-link" target="_blank">مستندات مالی</a>
                </div></div>`, isMobile() ? 'full' : null);

            if (isMobile()) {
                suppressMapPanelCollapseUntil = Date.now() + 800;
                requestAnimationFrame(() => openPanelFull());
            }

            if (hasTreasury) {
                enableDonateContext(a.ProjectID, primaryAddress);
                loadDonors(a);
                loadRaisedSummary(a);
            } else {
                clearDonateContext();
            }

            map.setView([y, x], 14, { animate: true });
        });
        markersCluster.addLayer(marker);
    });
    map.addLayer(markersCluster);
}).catch(err => console.error('خطا در بارگذاری پروژه‌ها:', err));

function showCountiesOfProvince(provinceName) {
    if (!countiesLayer) {
        fetch('data/counties.json').then(r => r.json()).then(raw => {
            let features = raw.features?.[0]?.geometry?.rings
                ? raw.features.map(f => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: f.geometry.rings }, properties: f.attributes }))
                : raw.features || raw;
            const capitas = features.map(f => f.properties.C_capita || 0).filter(c => c > 0);
            const minCapita = capitas.length ? Math.min(...capitas) : 1;
            const maxCapita = capitas.length ? Math.max(...capitas) : 1;
            countiesLayer = L.geoJSON(features, {
                style: feature => {
                    const c = feature.properties.C_capita || 0;
                    return { color: c === 0 ? '#555555' : '#2c3e50', weight: c === 0 ? 2.5 : 1.5, fillColor: getCountyColor(c, minCapita, maxCapita), fillOpacity: c === 0 ? 0.9 : 0.75 };
                },
                onEachFeature: (feature, layer) => {
                    const c = feature.properties;
                    layer.on('click', e => {
                        L.DomEvent.stopPropagation(e);

                        if (selectedCountyLayer && selectedCountyLayer !== layer) countiesLayer.resetStyle(selectedCountyLayer);
                        if (selectedProjectMarker) {
                            selectedProjectMarker.setIcon(projectIcon);
                            selectedProjectMarker = null;
                        }

                        selectionKind = 'county';
                        clearDonateContext();

                        layer.setStyle({ weight: 6, color: '#c62828', fill: false });
                        if (selectedLayer) selectedLayer.setStyle({ fillOpacity: 0 });
                        selectedCountyLayer = layer;
                        layer.bringToFront();
                        map.fitBounds(layer.getBounds(), { padding: [30, 30], animate: true, duration: 1 });
                        showInPanel(`<div class="province-info">
                            <h3>${c.Name || c.name || 'نامشخص'}</h3>
                            <div class="info-item"><span class="info-label">استان:</span><span class="info-value">${c.pname || c.Pname || provinceName}</span></div>
                            ${c.ccenter_na ? `<div class="info-item"><span class="info-label">مرکز شهرستان:</span><span class="info-value">${c.ccenter_na}</span></div>` : ''}
                            ${c.area ? `<div class="info-item"><span class="info-label">مساحت:</span><span class="info-value">${Number(c.area).toLocaleString('fa-IR')} هکتار</span></div>` : ''}
                            ${c.C_capita !== undefined ? `<div class="info-item"><span class="info-label">سرانه شهرستانی:</span><span class="info-value">${c.C_capita === 0 ? 'صفر' : Number(c.C_capita).toFixed(2)}</span></div>` : ''}
                        </div>`);
                    });
                    if ((c.pname || c.Pname) === provinceName) layer.addTo(map);
                }
            });
            showCountiesOfProvince(provinceName);
        });
        return;
    }
    let count = 0;
    countiesLayer.eachLayer(l => {
        const pname = l.feature.properties.pname || l.feature.properties.Pname;
        if (pname === provinceName) {
            l.addTo(map);
            countiesLayer.resetStyle(l);
            if (l === selectedCountyLayer) l.setStyle({ weight: 6, color: '#c62828', fill: false });
            count++;
        } else map.removeLayer(l);
    });
    const panel = document.querySelector('.info-item:last-child');
    if (panel && panel.querySelector('.info-label')?.textContent.includes('شهرستان')) {
        panel.innerHTML = `<span class="info-label">تعداد شهرستان:</span><span class="info-value">${count} شهرستان</span>`;
    }
}

const INDEXER_API = window.CLASSCHAIN_INDEXER_API || 'https://classchain-indexer.classchain.workers.dev';

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

async function loadDonors(projectAttributes) {
    const el = document.getElementById('donorsList');
    if (!el) return;
    const projectId = String(projectAttributes?.ProjectID || projectAttributes?.projectId || '');
    if (!projectId) { el.innerHTML = ''; return; }
    el.innerHTML = '<span class="info-label">در حال بارگذاری مشارکت‌کنندگان...</span>';
    try {
        const res = await fetch(`${INDEXER_API}/api/donors?projectId=${encodeURIComponent(projectId)}`, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = aggregateIndexerDonors(data.donors || []);
        if (!list.length) {
            el.innerHTML = '<span class="info-label">هنوز مشارکتی ثبت نشده — شما می‌توانید اولین نفر باشید.</span>';
            return;
        }
        const rows = list.slice(0, 12).map(d => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:0.92em;padding:3px 0;"><span title="${d.donor}">${shortDonorAddr(d.donor)}</span><span><strong>${d.total.toFixed(2)}</strong> USDT</span></div>`).join('');
        const more = list.length > 12 ? `<div style="opacity:.75;margin-top:4px;">و ${list.length - 12} مورد دیگر…</div>` : '';
        el.innerHTML = `<div class="info-label" style="margin-bottom:6px;">مشارکت‌کنندگان (${list.length})</div>${rows}${more}`;
    } catch (e) {
        console.error('[WebGIS] Indexer donors failed:', e);
        el.innerHTML = '<span class="info-label" style="color:#e74c3c;">خطا در خواندن مشارکت‌کنندگان</span>';
    }
}

async function loadRaisedSummary(projectAttributes) {
    const el = document.getElementById('raisedSummary');
    if (!el) return;
    el.innerHTML = '<span class="info-label">در حال خواندن مجموع کمک‌ها از زنجیره...</span>';
    try {
        if (!window.ClassChainRaisedReader) {
            el.innerHTML = '<span class="info-label" style="color:#e67e22;">ماژول خواندن موجودی لود نشده</span>';
            return;
        }
        const { total, breakdown } = await window.ClassChainRaisedReader.getProjectRaisedUSDT(projectAttributes);
        const target = Number(projectAttributes['targetAmount(USDT)'] || 0);
        const percent = target > 0 ? Math.min((total / target) * 100, 100) : 0;
        let detailRows = '';
        breakdown.forEach((b) => {
            if (b.amount > 0) {
                detailRows += `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#ecf0f1;margin-top:8px;padding:8px 10px;background:rgba(255,255,255,0.06);border-radius:6px;gap:10px;"><span style="opacity:0.9;">${b.network}</span><span style="font-weight:600;white-space:nowrap;">${b.amount.toFixed(2)} USDT</span></div>`;
            }
        });
        el.innerHTML = `<div class="info-item" style="background:rgba(46,204,113,0.15);padding:12px;border-radius:8px;">
            <div style="margin-bottom:4px;"><span class="info-label" style="display:block;margin-bottom:6px;">مجموع کمک‌ها (همه شبکه‌ها)</span>
            <span class="info-value" style="font-weight:bold;color:#2ecc71;font-size:1.15em;display:block;">${total.toFixed(2)} USDT</span></div>
            ${target ? `<div style="font-size:12px;margin-top:8px;opacity:0.85;">هدف: ${target.toLocaleString('fa-IR')} USDT — ${percent.toFixed(1)}٪</div>` : ''}
            ${detailRows ? `<div style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;">${detailRows}</div>` : ''}</div>`;
        const donorsEl = document.getElementById('donorsList');
        if (donorsEl && total > 0) {
            const text = (donorsEl.textContent || '').trim();
            if (text.includes('اولین مشارکت') || text.includes('هنوز کمک')) donorsEl.innerHTML = '';
        }
    } catch (e) {
        console.error(e);
        el.innerHTML = '<span class="info-label" style="color:#e74c3c;">خطا در خواندن موجودی</span>';
    }
}

function zoomToIran() {
    try {
        map.flyTo([32.4279, 53.6880], 6, { animate: true, duration: 1.5 });
        if (selectedLayer && geo) { geo.resetStyle(selectedLayer); selectedLayer = null; }
        if (selectedCountyLayer && countiesLayer) { countiesLayer.resetStyle(selectedCountyLayer); selectedCountyLayer = null; }
        if (selectedProjectMarker) { selectedProjectMarker.setIcon(projectIcon); selectedProjectMarker = null; }
        if (countiesLayer) map.removeLayer(countiesLayer);

        selectionKind = 'none';
        clearDonateContext();

        showInPanel(`<div class="no-selection"><div class="icon">🗺️</div><h3>یک مورد را انتخاب کنید</h3><p>روی استان، شهرستان یا پروژه کلیک کنید</p></div>`, 'peek');
    } catch (err) {
        console.error('zoomToIran error:', err);
        map.setView([32.4279, 53.6880], 6);
    }
}

function redirectToDonate(projectId) {
    if (selectionKind !== 'project' || !projectId) {
        alert('پروژه انتخاب نشده است');
        return;
    }
    window.location.href = 'donate.html?project=' + projectId;
}

function bindMapControl(el, handler) {
    if (!el) return;
    const run = (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler();
    };
    el.addEventListener('click', run);
    el.addEventListener('touchend', run, { passive: false });
}

bindMapControl(homeBtn, zoomToIran);
bindMapControl(contributeActionBtn, () => redirectToDonate(currentProjectId));

window.zoomToIran = zoomToIran;
window.redirectToDonate = redirectToDonate;
window.toggleAccordion = toggleAccordion;
