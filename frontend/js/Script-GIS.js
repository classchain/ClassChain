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

// RESTORED_MARKER - full file continues in next approach if truncated
console.error('Script-GIS partial restore failed - need full file');
