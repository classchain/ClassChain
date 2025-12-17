import { loadProvinces } from './map-layers.js';
import { loadProjects } from './map-layers.js';
import { setupBasemaps, setupHomeButton, resetPanel } from './ui-controls.js';
import { setupDonationButton } from './web3-donation.js';

export let map;
export let markersCluster;
export let currentContractAddress = null;

function initMap() {
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

    setupBasemaps(map);
    setupHomeButton(map);
    resetPanel();

    loadProvinces();
    loadProjects();

    console.log("نقشه کلاس‌چین آماده شد!");
}

initMap();
