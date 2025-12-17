import { map, markersCluster, currentContractAddress } from './main.js';
import { showInPanel, hideContributeButton, showContributeButton } from './ui-controls.js';
import { setupDonationButton, loadDonors } from './web3-donation.js';

let provincesLayer = null;
let countiesLayer = null;
let selectedProvinceLayer = null;
let selectedCountyLayer = null;
let selectedProjectMarker = null;

// آیکون پروژه
const projectIcon = L.divIcon({
    html: '<div class="project-marker"><div class="pulse"></div></div>',
    iconSize: [40, 40],
    className: 'custom-marker'
});

const selectedProjectIcon = L.divIcon({
    html: '<div class="project-marker selected"><div class="pulse"></div></div>',
    iconSize: [50, 50],
    className: 'custom-marker'
});

export function loadProvinces(map) {
    fetch('data/ir-new.json')
        .then(r => r.json())
        .then(data => {
            const features = data.features.map(f => ({
                type: "Feature",
                geometry: { type: "Polygon", coordinates: f.geometry.rings },
                properties: f.attributes
            }));

            const capitas = features.map(f => f.properties.P_capita || 0);
            const min = Math.min(...capitas);
            const max = Math.max(...capitas);

            function getColor(c) {
                if (c === 0) return '#7f8c8d';
                return c > max * 0.8 ? '#e74c3c' :
                       c > max * 0.6 ? '#e67e22' :
                       c > max * 0.4 ? '#f1c40f' :
                       c > max * 0.2 ? '#2ecc71' : '#3498db';
            }

            provincesLayer = L.geoJSON(features, {
                style: f => ({
                    fillColor: getColor(f.properties.P_capita || 0),
                    weight: 2,
                    opacity: 1,
                    color: '#2c3e50',
                    fillOpacity: 0.7
                }),
                onEachFeature: (feature, layer) => {
                    const p = feature.properties;
                    layer.on({
                        mouseover: e => e.target.setStyle({ weight: 4, fillOpacity: 0.9 }),
                        mouseout: e => provincesLayer.resetStyle(e.target),
                        click: e => {
                            if (selectedProvinceLayer) provincesLayer.resetStyle(selectedProvinceLayer);
                            selectedProvinceLayer = e.target;
                            e.target.setStyle({ weight: 5, color: '#fff' });

                            // نمایش اطلاعات استان (کد قبلی شما رو اینجا خلاصه کردم)
                            let html = `
                                <div class="province-info">
                                    <h3>${p.Name || 'نامشخص'}</h3>
                                    <div class="info-item"><span class="info-label">جمعیت</span><span class="info-value">${p.Population?.toLocaleString() || '-'} نفر</span></div>
                                    <div class="info-item"><span class="info-label">سرانه دانش‌آموزی</span><span class="info-value">${p.P_capita || '-'} کلاس به ازای هر ۱۰۰۰ دانش‌آموز</span></div>
                                </div>
                            `;
                            showInPanel(html);
                            hideContributeButton();
                            map.fitBounds(e.target.getBounds());
                        }
                    });
                }
            }).addTo(map);
        })
        .catch(err => console.error('خطا در بارگذاری استان‌ها:', err));
}

export function loadProjects(map) {
    fetch('data/Projects.json')
        .then(r => r.json())
        .then(data => {
            data.features.forEach(feature => {
                const a = feature.attributes;
                const x = a.x, y = a.y;
                if (!x || !y) return;

                const marker = L.marker([y, x], { icon: projectIcon });
                marker.on('click', () => {
                    // ریست انتخاب قبلی
                    if (selectedProjectMarker) selectedProjectMarker.setIcon(projectIcon);
                    marker.setIcon(selectedProjectIcon);
                    selectedProjectMarker = marker;

                    // ساخت HTML اطلاعات پروژه (دقیقاً مثل کد قدیمی شما)
                    let html = `
                        <div class="project-info">
                            <h3>${a.projectName || 'پروژه آموزشی'}</h3>
                            <div class="info-item"><span class="info-label">استان</span><span class="info-value">${a.province}</span></div>
                            <div class="info-item"><span class="info-label">شهرستان</span><span class="info-value">${a.county}</span></div>
                            <div class="info-item"><span class="info-label">تعداد کلاس</span><span class="info-value">${a.classCount} کلاس</span></div>
                            <div class="info-item"><span class="info-label">هزینه تقریبی</span><span class="info-value">${a.cost?.toLocaleString()} تومان</span></div>
                    `;

                    if (a.contractAddress && a.contractAddress.trim() !== "") {
                        html += `
                            <div class="info-item"><span class="info-label">آدرس قرارداد</span><span class="info-value contract-address">${a.contractAddress}</span></div>
                            <div id="donorsList"></div>
                        `;
                        currentContractAddress = a.contractAddress;
                        loadDonors(a.contractAddress);
                        showContributeButton();
                        setupDonationButton(a.contractAddress);
                    } else {
                        currentContractAddress = null;
                        hideContributeButton();
                    }

                    html += `</div>`;
                    showInPanel(html);

                    map.setView([y, x], 14, { animate: true });
                });

                markersCluster.addLayer(marker);
            });

            console.log(`${data.features.length} پروژه بارگذاری شد`);
        })
        .catch(err => console.error('خطا در بارگذاری پروژه‌ها:', err));
}
