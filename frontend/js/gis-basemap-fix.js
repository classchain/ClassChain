/* Basemap under provinces + map size fix (runs after Script-GIS.js) */
(function () {
  function refreshMapSize() {
    try {
      if (typeof map !== 'undefined' && map && map.invalidateSize) {
        map.invalidateSize(false);
      }
      if (typeof currentBasemap !== 'undefined' && currentBasemap && map && map.hasLayer(currentBasemap)) {
        currentBasemap.bringToBack();
      }
    } catch (e) {}
  }

  function softenProvinceFills() {
    try {
      if (typeof geo === 'undefined' || !geo) return;
      geo.eachLayer(function (layer) {
        if (typeof selectedLayer !== 'undefined' && layer === selectedLayer) return;
        var s = layer.options || {};
        layer.setStyle({ fillOpacity: 0.55, weight: s.weight || 2, color: s.color || '#2c3e50' });
      });
    } catch (e) {}
  }

  if (typeof changeBasemap === 'function') {
    var _orig = changeBasemap;
    window.changeBasemap = function (val) {
      _orig(val);
      setTimeout(refreshMapSize, 50);
    };
  }

  setTimeout(refreshMapSize, 0);
  setTimeout(refreshMapSize, 250);
  setTimeout(softenProvinceFills, 800);
  setTimeout(softenProvinceFills, 2000);
  window.addEventListener('resize', function () {
    clearTimeout(window.__gisMapResizeFix);
    window.__gisMapResizeFix = setTimeout(refreshMapSize, 100);
  });
})();
