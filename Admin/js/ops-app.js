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
    await finance.loadProjects();
    const [, status] = await Promise.all([
      finance.loadRaisedForAll(finance.projectsCache),
      loadIndexerHealth(finance.getNetworkFilter()),
    ]);
    syncCache = status;
    await fillNetworkSelects();
    finance.renderFinancialUI(finance.projectsCache);
    $('lastUpdated').textContent = 'آخرین بروزرسانی: ' + new Date().toLocaleString('fa-IR');
  } catch (e) {
    console.error(e);
    logOps('refresh error: ' + e.message);
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
      const data = await api('/api/voting/rounds', { method: 'POST', body: JSON.stringify({ title, candidate_projects: cands }) });
      alert('راند #' + (data.round?.id || '')); loadRounds();
    } catch (e) { alert(e.message); }
  };
  $('vVote').onclick = async () => {
    try {
      const id = $('vRoundId').value;
      await api('/api/voting/rounds/' + id + '/vote', {
        method: 'POST',
        body: JSON.stringify({ donor: $('vDonor').value.trim(), project_id: $('vProject').value.trim() }),
      });
      alert('رای ثبت شد');
    } catch (e) { alert(e.message); }
  };
  $('vClose').onclick = async () => {
    try {
      const id = $('vRoundId').value;
      await api('/api/voting/rounds/' + id + '/close', {
        method: 'POST',
        body: JSON.stringify({ selected_project_id: $('vCloseProject').value.trim() }),
      });
      alert('بسته شد'); loadRounds();
    } catch (e) { alert(e.message); }
  };
  $('vAlloc').onclick = async () => {
    try {
      const id = $('vRoundId').value;
      const data = await api('/api/voting/rounds/' + id + '/allocate', { method: 'POST', body: '{}' });
      alert(JSON.stringify(data).slice(0, 400));
    } catch (e) { alert(e.message); }
  };
}

initTabs();
initEvents();
refreshAll();
