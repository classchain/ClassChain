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

// RESTORE_MARKER_PARTIAL_SEE_FULL_FILE
