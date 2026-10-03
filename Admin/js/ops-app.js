import {
  $, api, getSecret, setSecret, getNetworks, networkIdsFromSync,
  fmtUsdt, usdtRaw, short, colorForNetwork, logOps, INDEXER, PROJECTS_URL
} from './ops-core.js';
import { createFinanceModule } from './ops-finance.js';
import {
  loadIndexerHealth, runSync, loadCommunity, loadRounds, loadDisburse
} from './ops-actions.js';

const finance = createFinanceModule({
  $, api, getNetworks, networkIdsFromSync, fmtUsdt, usdtRaw, short,
  colorForNetwork, logOps, INDEXER, PROJECTS_URL, runSync,
});

function showBootError(msg) {
  const grid = $('projectsGrid');
  if (grid) grid.innerHTML = `<p class="err" style="padding:12px">${msg}</p>`;
  const bars = $('netBars');
  if (bars) bars.innerHTML = `<p class="err">${msg}</p>`;
  console.error('[ops]', msg);
  try { logOps(msg); } catch (_) {}
}

let autoTimer = null;
let syncCache = null;

async function fillNetworkSelects() {
  let nets = [];
  try { nets = await getNetworks(); } catch (_) {}
  if (!nets.length && syncCache) {
    nets = networkIdsFromSync(syncCache).map((id) => ({ id, name: id }));
  }
  const opts = '<option value="">همه شبکه‌ها</option>' +
    nets.map((n) => `<option value="${n.id}">${n.name || n.id}</option>`).join('');
  ['netFilter', 'cNet'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = opts;
    if (prev) el.value = prev;
  });
}

async function refreshAll() {
  $('btnRefresh').disabled = true;
  try {
    if (!finance || typeof finance.loadProjects !== 'function') {
      throw new Error('ماژول مالی لود نشد. از ریشه ریپو سرو کنید (نه file://).');
    }
    if (!window.ClassChainNetworkConfig) {
      showBootError('network-config لود نشد. مسیر ../frontend/js را چک کنید.');
    } else {
      try { await window.ClassChainNetworkConfig.ready; }
      catch (e) { showBootError('network-config failed: ' + (e.message || e)); }
    }
    if (!window.ClassChainRaisedReader) {
      console.warn('RaisedReader missing — balances may be 0');
    }

    await finance.loadProjects();
    if (!finance.projectsCache.length) {
      showBootError('Projects.json خالی یا مسیر ../frontend/data/Projects.json اشتباه است.');
    }

    const raisedPromise = finance.loadRaisedForAll(finance.projectsCache).catch((e) => {
      console.warn('raised load', e);
      return null;
    });
    const status = await loadIndexerHealth(finance.getNetworkFilter());
    await raisedPromise;
    syncCache = status;
    await fillNetworkSelects();
    finance.renderFinancialUI(finance.projectsCache);
    $('lastUpdated').textContent = 'آخرین بروزرسانی: ' + new Date().toLocaleString('fa-IR');
  } catch (e) {
    console.error(e);
    showBootError('خطا در بروزرسانی: ' + (e.message || e));
  } finally {
    $('btnRefresh').disabled = false;
  }
}

function initTabs() {
  document.querySelectorAll('.ops-nav [data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ops-nav [data-tab]').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active');
      if (btn.dataset.tab === 'community') loadCommunity();
      if (btn.dataset.tab === 'voting') loadRounds();
      if (btn.dataset.tab === 'disburse') loadDisburse();
      if (btn.dataset.tab === 'indexer') loadIndexerHealth(finance.getNetworkFilter());
    });
  });
}

function initEvents() {
  $('btnRefresh').onclick = refreshAll;
  $('saveSecret').onclick = () => { setSecret($('secret').value); alert('Secret ذخیره شد'); $('secret').value = ''; };
  $('netFilter').onchange = () => {
    finance.setNetworkFilter($('netFilter').value);
    finance.renderFinancialUI(finance.projectsCache);
    loadIndexerHealth(finance.getNetworkFilter());
  };
  $('sortProjects').onchange = () => finance.renderFinancialUI(finance.projectsCache);
  $('syncOne').onclick = () => {
    const p = $('syncProject').value.trim();
    if (!p) return alert('projectId');
    runSync(p);
  };
  $('syncAll').onclick = () => {
    if (confirm('Sync همه ممکن است fail شود. ادامه؟')) runSync('');
  };
  $('opsAuto').onchange = (e) => {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (e.target.checked) { refreshAll(); autoTimer = setInterval(refreshAll, 60000); }
  };
  $('drawerBackdrop').onclick = finance.closeDrawer;
  $('drawerClose').onclick = finance.closeDrawer;
  $('cRefresh').onclick = loadCommunity;
  $('cNet').onchange = loadCommunity;
  $('vRefresh').onclick = loadRounds;
  $('dRefresh').onclick = loadDisburse;

  $('vOpen').onclick = async () => {
    try {
      const title = $('vTitle').value.trim();
      const cands = $('vCands').value.split(/[,\s]+/).filter(Boolean);
      if (!title) return alert('عنوان راند الزامی است');
      if (!cands.length) return alert('حداقل یک پروژه کاندید لازم است');
      const data = await api('/api/voting/rounds', {
        method: 'POST',
        body: JSON.stringify({ title, candidate_projects: cands }),
      });
      alert('راند باز شد: #' + (data.round?.id || ''));
      $('vTitle').value = '';
      $('vCands').value = '';
      loadRounds();
    } catch (e) { alert(e.message); }
  };

  $('vClose').onclick = async () => {
    try {
      const id = ($('vRoundId').value || '').trim();
      const selected = ($('vCloseProject').value || '').trim();
      if (!id) return alert('ابتدا از لیست راندها «جزئیات» یک راند باز را بزنید');
      if (!selected) return alert('پروژه منتخب الزامی است — بدون آن راند بسته نمی‌شود');

      // برای بستن دستی: tally را از کاندیداهای راند با صفر می‌سازیم
      // (رأی واقعی فعلاً از تلگرام خوانده نمی‌شود)
      let resultTally = [];
      try {
        const d = await api('/api/voting/rounds/' + id);
        const cands = d.round?.candidate_projects || [];
        resultTally = cands.map((pid) => ({
          project_id: String(pid),
          vote_count: 0,
        }));
      } catch (_) {
        resultTally = [{ project_id: selected, vote_count: 0 }];
      }

      await api('/api/voting/rounds/' + id + '/close', {
        method: 'POST',
        body: JSON.stringify({
          selected_project_id: selected,
          result_tally: resultTally,
        }),
      });
      alert('راند #' + id + ' بسته شد · منتخب: ' + selected);
      $('vCloseProject').value = '';
      loadRounds();
    } catch (e) { alert(e.message); }
  };

  $('dAlloc').onclick = async () => {
    const box = $('dAllocResult');
    try {
      const id = ($('dAllocRoundId').value || '').trim();
      if (!id) return alert('شناسه راند CLOSED را وارد کنید');
      if (box) box.textContent = 'در حال Allocate…';
      const data = await api('/api/voting/rounds/' + id + '/allocate', {
        method: 'POST',
        body: '{}',
      });
      if (box) box.innerHTML = '<pre style="white-space:pre-wrap;font-size:12px">' +
        JSON.stringify(data, null, 2).slice(0, 2000) + '</pre>';
      alert('Allocate انجام شد · batch: ' + (data.allocation_batch_id || '—'));
      loadDisburse();
    } catch (e) {
      if (box) box.innerHTML = '<p class="err">' + e.message + '</p>';
      alert(e.message);
    }
  };
}

initTabs();
initEvents();
refreshAll();
