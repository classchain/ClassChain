let currentContractAddress = null;
let currentProjectId = null;
const map = L.map('map', { renderer: L.canvas() }).setView([32.4279, 53.6880], 5);

let selectedLayer = null;
let selectedCountyLayer = null;
let selectedProjectMarker = null;
let geo, countiesLayer = null, projectsLayer = null;

const infoPanelWrapper = document.getElementById('infoPanelWrapper');
const closePanelBtn = document.getElementById('closePanel');
const fixedContributeBtn = document.getElementById('fixedContributeBtn');

// توابع مدیریت پنل
function openPanel() {
    if (window.innerWidth < 1024) {
        infoPanelWrapper.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closePanel() {
    infoPanelWrapper.classList.remove('open');
    document.body.style.overflow = '';
}

// بستن با کلیک خارج از پنل
map.getContainer().addEventListener('click', () => {
    if (window.innerWidth < 1024 && infoPanelWrapper.classList.contains('open')) {
        closePanel();
    }
});

closePanelBtn.addEventListener('click', closePanel);

// Drag to close در موبایل
//let touchStartY = 0;
//infoPanelWrapper.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
//infoPanelWrapper.addEventListener('touchmove', e => {
//    if (window.innerWidth >= 1024) return;
//    const deltaY = e.touches[0].clientY - touchStartY;
//    if (deltaY > 0) {
//        infoPanelWrapper.style.transform = `translateY(${deltaY}px)`;
//    }
//}, { passive: false });
//infoPanelWrapper.addEventListener('touchend', () => {
//    if (window.innerWidth >= 1024) return;
//    const deltaY = event.changedTouches[0].clientY - touchStartY;
//    if (deltaY > 100) closePanel();
//    infoPanelWrapper.style.transform = '';
//});
// Drag طبیعی در موبایل — بدون بسته شدن خودکار
//let touchStartY = 0;
//infoPanelWrapper.addEventListener('touchstart', e => {
//    touchStartY = e.touches[0].clientY;
//}, { passive: true });

//infoPanelWrapper.addEventListener('touchmove', e => {
//    if (window.innerWidth >= 1024) return;
//    const deltaY = e.touches[0].clientY - touchStartY;
//    if (deltaY > 0) { // فقط کشیدن به پایین
//        infoPanelWrapper.style.transition = 'none';
//        infoPanelWrapper.style.transform = `translateY(${deltaY}px)`;
//    }
//}, { passive: false });

//infoPanelWrapper.addEventListener('touchend', () => {
//    if (window.innerWidth >= 1024) return;
    
    // همیشه به حالت باز برگردد — بسته نشود
//    infoPanelWrapper.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
//    infoPanelWrapper.style.transform = '';
//});
// هندل برای باز کردن دستی پنل با drag به بالا در موبایل
// باز کردن پنل فقط با drag به بالا از پایین صفحه (در موبایل)
// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
let touchStartY = 0;
let isDragging = false;

infoPanelWrapper.addEventListener('touchstart', e => {
    if (window.innerWidth >= 1024) return;
    touchStartY = e.touches[0].clientY;
    isDragging = true;
    infoPanelWrapper.style.transition = 'none'; // برای حرکت نرم
}, { passive: true });

infoPanelWrapper.addEventListener('touchmove', e => {
    if (!isDragging || window.innerWidth >= 1024) return;
    const currentY = e.touches[0].clientY;
    const deltaY = touchStartY - currentY; // مثبت = کشیدن به بالا

    if (deltaY > 0) {
        const progress = Math.min(deltaY / window.innerHeight, 1); // 0 تا 1
        const translateY = (1 - progress) * 100; // از 100% به 0%
        infoPanelWrapper.style.transform = `translateY(${translateY}%)`;
    }
}, { passive: false });

infoPanelWrapper.addEventListener('touchend', () => {
    if (!isDragging || window.innerWidth >= 1024) return;
    isDragging = false;

    // تشخیص اینکه کاربر چقدر کشیده
    const style = window.getComputedStyle(infoPanelWrapper);
    const matrix = style.transform;
    const translateY = matrix === 'none' ? 100 : parseFloat(matrix.split(',')[5]) || 100;

    infoPanelWrapper.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';

    if (translateY < 70) { // اگر بیشتر از 30% کشیده شده → باز بماند
        infoPanelWrapper.classList.add('open');
        infoPanelWrapper.style.transform = 'translateY(0)';
    } else {
        infoPanelWrapper.classList.remove('open');
        infoPanelWrapper.style.transform = 'translateY(100%)';
    }
});
// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<


// تابع نمایش محتوا در پنل
function showInPanel(content) {
    document.getElementById('infoPanel').innerHTML = content;
    openPanel(); // در موبایل پنل باز می‌شود
}

// باقی کدهای شما بدون تغییر (رنگ‌ها، آیکون‌ها، خوشه‌بندی، کلیک‌ها و ...)
function toggleAccordion(element) {
    element.classList.toggle('collapsed');
    const content = element.nextElementSibling;
    content.classList.toggle('collapsed');
}

function getProvinceColor(capita, min, max) {
    if (capita === 0 || capita == null) return '#34495e';
    const ratio = max === min ? 0.5 : (capita - min) / (max - min);
    const r = Math.min(255, Math.round(52 + ratio * 200));
    const g = Math.min(255, Math.round(73 + ratio * 182));
    const b = Math.min(255, Math.round(94 + ratio * 161));
    return `rgb(${r},${g},${b})`;
}

function getCountyColor(capita, min, max) {
    if (capita === 0 || capita == null) return '#777777';
    const ratio = max === min ? 0.5 : (capita - min) / (max - min);
    const r = Math.round(139 + ratio * 113);
    const g = Math.round(0 + ratio * 228);
    const b = Math.round(0 + ratio * 236);
    return `rgb(${r},${g},${b})`;
}

// آیکون‌ها (همان قبلی)
//const normalIcon = L.divIcon({
//	html: `<div style="background:#e74c3c; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 8px rgba(0,0,0,0.7);"></div>`,
//	className: 'custom-div-icon',
//	iconSize: [16, 16],
//	iconAnchor: [8, 8]	
//});

//const selectedIcon = L.divIcon({
//	html: `<div style="background:#f1c40f; width:20px; height:20px; border-radius:50%; border:4px solid white; box-shadow:0 0 12px rgba(241,196,15,0.8); animation:pulse 1.5s infinite;"></div>`,
//	className: 'custom-div-icon',
//	iconSize: [28, 28],
//	iconAnchor: [14, 14]
//});

const projectIcon = L.divIcon({
    html: `<div style="background:#e74c3c; width:10px; height:10px; border-radius:50%; border:2px solid white; box-shadow:0 0 6px rgba(0,0,0,0.8);"></div>`,
    className: 'custom-project-marker',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

const selectedProjectIcon = L.divIcon({
    html: `<div style="background:#f1c40f; width:18px; height:18px; border-radius:50%; border:3px solid white; box-shadow:0 0 12px #f1c40f;"></div>`,
    className: 'custom-project-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

const markersCluster = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 60,
    iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        let size = count < 10 ? 40 : count < 100 ? 50 : 60;
        return L.divIcon({
            html: `<div style="background:#e74c3c;color:white;font-weight:bold;border-radius:50%;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;box-shadow:0 0 12px rgba(0,0,0,0.6);font-size:14px;">${count}</div>`,
            className: '',
            iconSize: [size, size]
        });
    }
});

// انیمیشن پالس
const stylePulse = document.createElement('style');
stylePulse.innerHTML = `@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(241,196,15,0.7); } 70% { box-shadow: 0 0 0 10px rgba(241,196,15,0); } 100% { box-shadow: 0 0 0 0 rgba(241,196,15,0); } }`;
document.head.appendChild(stylePulse);

// بارگذاری استان‌ها، شهرستان‌ها، پروژه‌ها، loadDonors، basemapها، zoomToIran، redirectToDonate
// تمام کدهای قبلی شما دقیقاً همانجا کپی شده‌اند (به جز showInPanel که حالا openPanel هم صدا می‌زند)

// فقط یک نمونه از تغییر کوچک در کلیک‌ها:
//layer.on('click', e => {
//    // ... کدهای قبلی
//    showInPanel(` ... `); // این تابع حالا در موبایل پنل را هم باز می‌کند
//});

fetch('data/ir-new.json')
    .then(r => r.json())
    .then(data => {
        const features = data.features.map(f => ({
            type: "Feature",
            geometry: { type: "Polygon", coordinates: f.geometry.rings },
            properties: f.attributes
        }));

        const capitas = features.map(f => f.properties.P_capita || 0).filter(c => c > 0);
        const minCapita = capitas.length ? Math.min(...capitas) : 1;
        const maxCapita = capitas.length ? Math.max(...capitas) : 1;

        geo = L.geoJSON(features, {
            style: feature => ({
                color: "#2c3e50", weight: 2,
                fillColor: getProvinceColor(feature.properties.P_capita || 0, minCapita, maxCapita),
                fillOpacity: 0.75
            }),
            onEachFeature: (feature, layer) => {
                const p = feature.properties;

                layer.on('click', e => {
                    L.DomEvent.stopPropagation(e);

                    // ریست قبلی‌ها
                    if (selectedLayer) geo.resetStyle(selectedLayer);
                    if (selectedCountyLayer) countiesLayer?.resetStyle(selectedCountyLayer);
                    if (selectedProjectMarker) selectedProjectMarker.setIcon(projectIcon);

                    layer.setStyle({ weight: 6, color: "#e74c3c", fillOpacity: 0.9 });
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
                        </div>
                    `);

                    showCountiesOfProvince(p.Name);
                });

                layer.on('mouseover', () => { if (selectedLayer !== layer) layer.setStyle({ weight: 5 }); });
                layer.on('mouseout', () => { if (selectedLayer !== layer) geo.resetStyle(layer); });
            }
        }).addTo(map);
    });

fetch('data/Projects.json')
    .then(r => r.json())
    .then(data => {
        data.features.forEach(feature => {
            const a = feature.attributes;
            const x = a.x;
            const y = a.y;

            if (x && y && !isNaN(x) && !isNaN(y)) {
                const marker = L.marker([y, x], { icon: projectIcon });
                marker.properties = a;

                marker.on('click', function(e) {
                    if (selectedProjectMarker) {
                        selectedProjectMarker.setIcon(projectIcon);
                    }

                    this.setIcon(selectedProjectIcon);
                    selectedProjectMarker = this;

                    if (selectedLayer) {
                        selectedLayer.setStyle({ fillOpacity: 0 });
                    }

                    if (selectedCountyLayer) {
                        selectedCountyLayer.setStyle({ fillOpacity: 0 });
                    }

                    let financialInfo = '';

                    if (a.contractAddress && a.contractAddress !== null && a.contractAddress !== "") {
                        financialInfo = `


                        <div class="info-item" style="background:rgba(46,204,113,0.2); padding:12px; border-radius:8px; margin-top:15px;">
                            <span class="info-label">خزانه هوشمند پروژه:</span><br>
                            <span class="info-value contract-address">
                                <a href="https://polygonscan.com/address/${a.contractAddress}" target="_blank" style="color:#3498db; text-decoration:underline;">
                                    ${a.contractAddress}
                                </a>
                            </span>
                        </div>

                        <div class="info-item" style="margin-top:15px;">
                            <span class="info-label">برآورد هزینه ساخت:</span>
                            <span class="info-value">${a['targetAmount(USDT)'] ? Number(a['targetAmount(USDT)']).toLocaleString('fa-IR') + ' USDT' : 'نامشخص'}</span>
                        </div>

                        <div id="donorsList" style="margin-top:15px;">
                            <span class="info-label">در حال بارگذاری لیست کمک‌کنندگان...</span>
                        </div>
                        `;
                    } else {
                        financialInfo = '<div class="info-item" style="color:#e67e22; margin-top:15px;">خزانه هوشمند هنوز راه‌اندازی نشده</div>';
                    }

                    showInPanel(`
                        <div class="accordion-section">
                            <div class="accordion-title" onclick="toggleAccordion(this)">اطلاعات عمومی پروژه</div>
                            <div class="accordion-content">
                                <div class="info-item"><span class="info-label">نام پروژه:</span><span class="info-value">${a['نام پروژه'] || 'بدون نام'}</span></div>
                                <div class="info-item"><span class="info-label">کد پروژه:</span><span class="info-value">${a['ProjectID']}</span></div>
                                <div class="info-item"><span class="info-label">استان:</span><span class="info-value">${a['استان']}</span></div>
                                <div class="info-item"><span class="info-label">منطقه:</span><span class="info-value">${a['منطقه']}</span></div>
                                <div class="info-item"><span class="info-label">نوع پروژه:</span><span class="info-value">${a['نوع پروژه (نیاز)']}</span></div>
                                <div class="info-item"><span class="info-label">تعداد کلاس:</span><span class="info-value">${a['تعداد کلاس'] || '—'}</span></div>
                                <div class="info-item"><span class="info-label">زیربنا:</span><span class="info-value">${a['زیربنا'] ? Number(a['زیربنا']).toLocaleString('fa-IR') + ' م²' : '—'}</span></div>
                                <div class="info-item"><span class="info-label">وضعیت:</span><span class="info-value">${a['وضعیت راهبری پروژه'] || '—'}</span></div>
                                <div class="info-item"><span class="info-label">مسئول:</span><span class="info-value">${a['مسئول پروژه'] || '—'}</span></div>
                                <div class="info-item"><span class="info-label">تلفن:</span><span class="info-value">${a['شماره تلفن مسئول پروژه'] || '—'}</span></div>
                                ${a['آدرس پروژه'] ? `<div class="info-item"><span class="info-label">آدرس:</span><span class="info-value">${a['آدرس پروژه']}</span></div>` : ''}
                            </div>
                        </div>

                        <div class="accordion-section">
                            <div class="accordion-title" onclick="toggleAccordion(this)">اطلاعات مالی</div>
                            <div class="accordion-content">
                                ${financialInfo}
                            </div>
                        </div>

                        <div class="accordion-section">
                            <div class="accordion-title" onclick="toggleAccordion(this)">گزارشات پروژه</div>
                            <div class="accordion-content">
                                <a href="project-images.html?project=${a['ProjectID']}" class="report-link" target="_blank">تصاویر</a>
                                <a href="financial-docs.html?project=${a['ProjectID']}" class="report-link" target="_blank">مستندات مالی</a>
                            </div>
                        </div>

						<div class="fixed-contribute-button" id="fixedContributeBtn" style="display: none;">
							<button onclick="redirectToDonate('${a.ProjectID}')">
								مشارکت در ساخت
							</button>
							<p>(انتخاب شبکه و پرداخت با کیف پول)</p>
						</div>
                    `);

                    if (a.contractAddress && a.contractAddress !== null && a.contractAddress !== "") {
                        currentContractAddress = a.contractAddress;
                        loadDonors(a.contractAddress);
                        document.getElementById('fixedContributeBtn').style.display = 'block';
                    } else {
                        currentContractAddress = null;
                        document.getElementById('fixedContributeBtn').style.display = 'none';
                    }

                    map.setView([y, x], 14, { animate: true });
                });

                markersCluster.addLayer(marker);
            }
        });

        map.addLayer(markersCluster);
        console.log(`${data.features.length} پروژه با خوشه‌بندی بارگذاری شد`);
    })
    .catch(err => {
        console.error("خطا در بارگذاری پروژه‌ها:", err);
    });
	

// همین برای شهرستان و پروژه هم اعمال شده
function showCountiesOfProvince(provinceName) {
    if (!countiesLayer) {
        fetch('data/counties.json')
            .then(r => r.json())
            .then(raw => {
                let features = raw.features?.[0]?.geometry?.rings 
                    ? raw.features.map(f => ({ type: "Feature", geometry: { type: "Polygon", coordinates: f.geometry.rings }, properties: f.attributes }))
                    : raw.features || raw;

                const capitas = features.map(f => f.properties.C_capita || 0).filter(c => c > 0);
                const minCapita = capitas.length ? Math.min(...capitas) : 1;
                const maxCapita = capitas.length ? Math.max(...capitas) : 1;

                countiesLayer = L.geoJSON(features, {
                    style: feature => {
                        const c = feature.properties.C_capita || 0;
                        return {
                            color: c === 0 ? "#555555" : "#2c3e50",
                            weight: c === 0 ? 2.5 : 1.5,
                            fillColor: getCountyColor(c, minCapita, maxCapita),
                            fillOpacity: c === 0 ? 0.9 : 0.75
                        };
                    },
                    onEachFeature: (feature, layer) => {
                        const c = feature.properties;

                        layer.on('click', e => {
                            L.DomEvent.stopPropagation(e);

                            if (selectedCountyLayer && selectedCountyLayer !== layer) countiesLayer.resetStyle(selectedCountyLayer);
                            if (selectedProjectMarker) selectedProjectMarker.setIcon(projectIcon);

                            // <<< این خط مهم بود و درست شد >>>
                            layer.setStyle({ weight: 6, color: "#c62828", fill: false }); // بدون پر شدن (بی‌رنگ)

                            // محو کردن استان
                            if (selectedLayer) {
                                selectedLayer.setStyle({ fillOpacity: 0 });
                            }

                            selectedCountyLayer = layer;
                            layer.bringToFront();
                            map.fitBounds(layer.getBounds(), { padding: [30, 30], animate: true, duration: 1 });

                            showInPanel(`
                                <div class="province-info">
                                    <h3>${c.Name || c.name || 'نامشخص'}</h3>
                                    <div class="info-item"><span class="info-label">استان:</span><span class="info-value">${c.pname || c.Pname || provinceName}</span></div>
                                    ${c.ccenter_na ? `<div class="info-item"><span class="info-label">مرکز شهرستان:</span><span class="info-value">${c.ccenter_na}</span></div>` : ''}
                                    ${c.area ? `<div class="info-item"><span class="info-label">مساحت:</span><span class="info-value">${Number(c.area).toLocaleString('fa-IR')} هکتار</span></div>` : ''}
                                    ${c.C_capita !== undefined ? `<div class="info-item"><span class="info-label">سرانه شهرستانی:</span><span class="info-value">${c.C_capita === 0 ? 'صفر' : Number(c.C_capita).toFixed(2)}</span></div>` : ''}
                                </div>
                            `);
                        });

                        if ((c.pname || c.Pname) === provinceName) layer.addTo(map);
                    }
                });

                showCountiesOfProvince(provinceName); // دوباره فراخوانی برای نمایش
            });
        return;
    }

    let count = 0;
    countiesLayer.eachLayer(l => {
        const pname = l.feature.properties.pname || l.feature.properties.Pname;
        if (pname === provinceName) {
            l.addTo(map);
            countiesLayer.resetStyle(l);
            if (l === selectedCountyLayer) l.setStyle({ weight: 6, color: "#c62828", fill: false });
            count++;
        } else {
            map.removeLayer(l);
        }
    });

    const panel = document.querySelector('.info-item:last-child');
    if (panel && panel.querySelector('.info-label')?.textContent.includes('شهرستان')) {
        panel.innerHTML = `<span class="info-label">تعداد شهرستان:</span><span class="info-value">${count} شهرستان</span>`;
    }
}

async function loadDonors(contractAddress) {
    const apiKey = "DYB75BHRNWEGAGAEH73AWJUPQ8EDRKN7RB"; // از https://polygonscan.com/myapikey رایگان بگیر
	const clcTokenAddress = "0x39Af73d2736f6EC94778a38c0C7Ef800e58B13a7"; // توکن CLC تست
	const url = `https://api-amoy.polygonscan.com/api?module=account&action=tokentx&contractaddress=0x41e94eb019c0762f9bfcf9fb78e59bec0a32e187&address=${contractAddress}&sort=desc&apikey=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "1" && data.result.length > 0) {
            let totalRaised = 0;
            let donorsHtml = '<h4 style="color:#ecf0f1; margin:15px 0 10px;">کمک‌کنندگان</h4>';

            const uniqueDonors = new Map(); // برای جمع زدن کمک‌های تکراری

            data.result.forEach(tx => {
                if (tx.to.toLowerCase() === contractAddress.toLowerCase()) {
                    const amount = parseInt(tx.value) / 1e6; // USDT 6 اعشار
                    totalRaised += amount;

                    const from = tx.from;
                    if (uniqueDonors.has(from)) {
                        uniqueDonors.set(from, uniqueDonors.get(from) + amount);
                    } else {
                        uniqueDonors.set(from, amount);
                    }
                }
            });

            // نمایش جمع کل
            document.querySelector('#donorsList').innerHTML = `
                <div class="info-item">
                    <span class="info-label">جمع کمک‌های دریافتی:</span>
                    <span class="info-value">${totalRaised.toFixed(2)} USDT</span>
                </div>
            ` + donorsHtml;

            // لیست کمک‌کنندگان
            uniqueDonors.forEach((amount, address) => {
                donorsHtml += `
                <div class="info-item" style="font-size:0.9em; background:rgba(255,255,255,0.05); margin:5px 0; padding:8px; border-radius:6px;">
                    <span class="info-value">
                        <a href="https://polygonscan.com/address/${address}" target="_blank" style="color:#3498db;">
                            ${address.substring(0,8)}...${address.substring(36)}
                        </a>
                    </span>
                    <span class="info-label">${amount.toFixed(2)} USDT</span>
                </div>
                `;
            });

            document.querySelector('#donorsList').innerHTML += donorsHtml;
        } else {
            document.querySelector('#donorsList').innerHTML = '<p style="opacity:0.7;">شما اولین مشارکت کننده این مدرسه باشید</p>';
        }
    } catch (err) {
        document.querySelector('#donorsList').innerHTML = '<p style="color:#e74c3c;">خطا در بارگذاری کمک‌ها</p>';
    }
}

// در نهایت:
function zoomToIran() {
    map.flyTo([32.4279, 53.6880], 6, { animate: true, duration: 1.5 });

    if (selectedLayer && geo) { geo.resetStyle(selectedLayer); selectedLayer = null; }
    if (selectedCountyLayer && countiesLayer) { countiesLayer.resetStyle(selectedCountyLayer); selectedCountyLayer = null; }
    if (selectedProjectMarker) { selectedProjectMarker.setIcon(projectIcon); selectedProjectMarker = null; }
    if (countiesLayer) map.removeLayer(countiesLayer);

    showInPanel(`
        <div class="no-selection">
            <div class="icon">🗺️</div>
            <h3>یک مورد را انتخاب کنید</h3>
            <p>روی استان، شهرستان یا پروژه کلیک کنید</p>
        </div>
    `);

    closePanel();
    fixedContributeBtn.style.display = 'none';
    currentContractAddress = null;
    currentProjectId = null;
}

const basemapLayers = {
        carto: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }),
        persiangis: L.tileLayer('https://map.persiangis.ir/tile/{z}/{x}/{y}.png', { attribution: '© PersianGIS' }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' }),
        light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }),
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' })
};

let currentBasemap = basemapLayers.carto;
currentBasemap.addTo(map);
	
function changeBasemap(val) {
	map.removeLayer(currentBasemap);
	currentBasemap = basemapLayers[val];
	currentBasemap.addTo(map);
}

function redirectToDonate(projectId) {
    if (projectId) {
        window.location.href = 'donate.html?project=' + projectId;
    } else {
        alert('پروژه انتخاب نشده است');
    }
}	
