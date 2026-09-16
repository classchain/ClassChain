/**
 * Temporary bootstrap: loads the exact Script-GIS.js from commit 2c2e7f9
 * (last known-good state) so the map works while the full file is restored in-repo.
 * CSS contrast fixes for financial network rows live in Style-GIS.css.
 */
(function () {
  var url = 'https://raw.githubusercontent.com/classchain/ClassChain/2c2e7f96d335c62d523c0fdab638bdd9a88bf90e/frontend/js/Script-GIS.js';
  var s = document.createElement('script');
  s.src = url;
  s.async = false;
  s.onerror = function () {
    console.error('[Script-GIS] failed to load from 2c2e7f9 raw URL');
    // Fallback: fetch + eval (CORS allowed on raw.githubusercontent.com)
    fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (code) { (0, eval)(code); })
      .catch(function (e) { console.error('[Script-GIS] fallback failed', e); });
  };
  document.head.appendChild(s);
})();
