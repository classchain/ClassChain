/**
 * Temporary recovery loader — loads last known-good donate.js from commit a1c53d7
 * then applies stage-1 i18n patches at runtime.
 * Replace this file with the full fixed donate.js in the next stage.
 */
(function () {
  var src = 'https://cdn.jsdelivr.net/gh/classchain/ClassChain@a1c53d7bd8da81d424fdc8059d5dc59b15ab3f0e/frontend/js/donate.js';
  var s = document.createElement('script');
  s.src = src;
  s.onload = function () {
    console.log('[Donate] recovered base from a1c53d7');
    try {
      if (typeof loadProjectFinancials === 'function') {
        var _orig = loadProjectFinancials;
        window.loadProjectFinancials = async function (target) {
          await _orig(target);
          var text = document.getElementById('progressText');
          if (!text) return;
          var t = Number(projects && projects['targetAmount(USDT)']) || 0;
          var isOpen = t <= 0 || String(projects && projects.ProjectID) === 'GENERAL_POOL';
          if (isOpen) return;
          var m = (text.innerText || '0').match(/([\d.,]+)/);
          var raised = m ? parseFloat(m[1].replace(/,/g, '')) : 0;
          if (isNaN(raised)) raised = 0;
          var percent = Math.min((raised / t) * 100, 100);
          if (window.DonateI18n && DonateI18n.t) {
            text.innerText = DonateI18n.t('progress.template', {
              raised: raised.toFixed(2),
              target: t.toLocaleString('en-US'),
              percent: percent.toFixed(1)
            });
          }
        };
      }
    } catch (e) {
      console.warn('[Donate] stage1 patch after recovery failed', e);
    }
  };
  s.onerror = function () {
    console.error('[Donate] failed to load recovery script from', src);
  };
  document.head.appendChild(s);
})();
