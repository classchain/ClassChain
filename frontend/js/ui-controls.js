import { map, markersCluster } from './main.js';
import { resetPanel } from './ui-controls.js'; // خودمرجع نیست، فقط برای استفاده داخلی اگر لازم شد

// تابع نمایش محتوای پنل
export function showInPanel(html) {
    const panel = document.getElementById('infoPanel');
    // پاک کردن محتوای قبلی و اضافه کردن محتوای جدید
    panel.innerHTML = `
        ${html}
        <div class="fixed-contribute-button" id="fixedContributeBtn" style="display: none;">
            <button id="contributeButton">الان در ساخت این مدرسه مشارکت می‌کنم</button>
            <p>(اتصال به MetaMask و ارسال USDT در شبکه Polygon)</p>
        </div>
    `;
}

// مخفی و نمایش دکمه مشارکت
export function hideContributeButton() {
    const btn = document.getElementById('fixedContributeBtn');
    if (btn) btn.style.display = 'none';
}

export function showContributeButton() {
    const btn = document.getElementById('fixedContributeBtn');
    if (btn) btn.style.display = 'block';
}

// پنل پیش‌فرض
export function resetPanel() {
    showInPanel(`
        <div class="no-selection">
            <div class="icon">🗺️</div>
            <h3>یک مورد را انتخاب کنید</h3>
            <p>روی استان، شهرستان یا پروژه کلیک کنید</p>
        </div>
    `);
    hideContributeButton();
}

// راه‌اندازی انتخابگر لایه پایه
export function setupBasemaps(map) {
    const basemaps = {
        carto: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }),
        persiangis: L.tileLayer('https://map.persiangis.ir/tile/{z}/{x}/{y}.png', { attribution: '© PersianGIS' }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' }),
        light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }),
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' })
    };

    let currentBasemap = basemaps.carto;
    currentBasemap.addTo(map);

    document.getElementById('basemapSelect').addEventListener('change', (e) => {
        map.removeLayer(currentBasemap);
        currentBasemap = basemaps[e.target.value];
        currentBasemap.addTo(map);
    });
}

// راه‌اندازی دکمه بازگشت به ایران
export function setupHomeButton(map) {
    document.getElementById('homeButton').addEventListener('click', () => {
        map.flyTo([32.4279, 53.6880], 5, { animate: true, duration: 1.5 });
        resetPanel();

        // اگر لایه شهرستان یا انتخاب قبلی بود، ریست کن (اختیاری)
        // countiesLayer?.remove();
    });
}
