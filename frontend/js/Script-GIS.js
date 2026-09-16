/**
 * Loads exact Script-GIS.js from commit 2c2e7f9 (last known-good before accidental edits).
 * Financial network label contrast is fixed in Style-GIS.css only — do not change this file for theming.
 */
(function () {
  var url = 'https://raw.githubusercontent.com/classchain/ClassChain/2c2e7f96d335c62d523c0fdab638bdd9a88bf90e/frontend/js/Script-GIS.js';
  fetch(url, { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function (code) {
      (0, eval)(code);
    })
    .catch(function (e) {
      console.error('[Script-GIS] failed to load from 2c2e7f9:', e);
    });
})();
