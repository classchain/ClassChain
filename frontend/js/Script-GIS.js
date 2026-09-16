/**
 * Assembles Script-GIS.js from local part files (exact content of commit 2c2e7f9).
 * Contrast for financial network rows is in Style-GIS.css only.
 */
(function () {
  var n = 4;
  var base = (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || '';
      if (src.indexOf('Script-GIS.js') !== -1) {
        return src.replace(/Script-GIS\.js(\?.*)?$/, '');
      }
    }
    return 'js/';
  })();
  var i = 0;
  var chunks = [];
  function next() {
    if (i >= n) {
      (0, eval)(chunks.join(''));
      return;
    }
    var url = base + 'Script-GIS.part' + i + '.txt';
    fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
        return r.text();
      })
      .then(function (t) {
        chunks.push(t);
        i += 1;
        next();
      })
      .catch(function (e) {
        console.error('[Script-GIS] part load failed', e);
      });
  }
  next();
})();
