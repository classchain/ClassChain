import { loadProvinces } from './map-layers.js';
import { loadProjects } from './map-layers.js';
import { setupBasemaps, setupHomeButton, showInPanel, resetPanel } from './ui-controls.js';
import { setContributeHandler } from './web3-donation.js';

export let map;
export let currentContractAddress = null;
export let markersCluster;

export function initMap() {
    map = L.map('map', { renderer: L.canvas() }).setView([32.4279, 53.6880], 5);

    markersCluster = L.markerClusterGroup({
        maxClusterRadius: 60,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            const size = count < 10 ? 40 : count < 100 ? 50 : 60;
            return L.divIcon({
                html: `<div style="background:#e74c3c;color:white;font-weight:bold;border-radius:50%;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;box-shadow:0 0 12px rgba(0,0,0,0.6);font-size:14px;">${count}</div>`,
                className: '',
                iconSize: [size, size]
            });
        }
    });
    map.addLayer(markersCluster);

    // راه‌اندازی لایه‌های پایه و دکمه‌ها
    setupBasemaps(map);
    setupHomeButton(map, resetPanel);

    // بارگذاری داده‌ها
    loadProvinces(map, showInPanel);
    loadProjects(map, showInPanel, setContributeHandler);

    // پنل پیش‌فرض
    resetPanel();
}

initMap();
