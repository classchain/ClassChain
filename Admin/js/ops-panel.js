
export async function initOpsPanel({ api, badge }) {
  let opsTimer = null;
  function logOps(m) {
    const el = document.getElementById('opsLog');
    if (!el) return;
    el.textContent = '[' + new Date().toLocaleTimeString('fa-IR') + '] ' + m + '\n' + el.textContent.slice(0, 3000);
  }
  async function loadOps() {
    const box = document.getElementById('opsTable');
    const kpis = document.getElementById('opsKpis');
    if (!box) return;
    try {
      const [health, status] = await Promise.all([
        api('/health').catch(e => ({ ok: false, error: e.message })),
        api('/api/sync-status'),
      ]);
      const rows = status.treasuries || [];
      const tips = {};
      let ok = 0, fail = 0, lagN = 0;
      rows.forEach(r => {
        if (r.status === 'SUCCESS' && r.last_scanned_block)
          tips[r.network_id] = Math.max(tips[r.network_id] || 0, r.last_scanned_block);
      });
      rows.forEach(r => {
        if (r.status === 'SUCCESS') ok++; else fail++;
        const tip = tips[r.network_id] || 0;
        const last = r.last_scanned_block || 0;
        if (tip && tip - last > 5000) lagN++;
      });
      kpis.innerHTML = `
        <span class="badge" style="background:${health.ok?'#27ae60':'#e74c3c'}">Worker ${health.ok?'OK':'DOWN'}</span>
        <span class="badge" style="background:#6c5ce7">${rows.length} treasury</span>
        <span class="badge" style="background:#27ae60">${ok} SUCCESS</span>
        <span class="badge" style="background:${fail?'#e74c3c':'#27ae60'}">${fail} FAILED</span>
        <span class="badge" style="background:${lagN?'#f39c12':'#27ae60'}">${lagN} lag&gt;5k</span>`;
      const meta = document.getElementById('opsMeta');
      if (meta) meta.textContent = new Date().toLocaleString('fa-IR') + (health.networks ? ' · ' + health.networks.join(', ') : '');
      const sorted = rows.slice().sort((a,b) => String(a.project_id).localeCompare(String(b.project_id)) || a.network_id.localeCompare(b.network_id));
      box.innerHTML = `<table><thead><tr><th>پروژه</th><th>شبکه</th><th>آخرین بلاک</th><th>Lag</th><th>Tx</th><th>وضعیت</th><th>خطا</th><th></th></tr></thead><tbody>${
        sorted.map(r => {
          const tip = tips[r.network_id] || 0;
          const last = r.last_scanned_block || 0;
          const lag = tip ? Math.max(0, tip - last) : 0;
          const bad = r.status !== 'SUCCESS';
          const laggy = !bad && lag > 5000;
          const bg = bad ? '#fdf0ef' : (laggy ? '#fff8e8' : '');
          const err = (r.error || '').slice(0, 70);
          return `<tr style="background:${bg}"><td><b>${r.project_id}</b></td><td>${r.network_id}</td><td>${last}</td><td>${lag}</td><td>${r.tx_count??'—'}</td><td>${badge(r.status||'—')}</td><td class="muted" title="${(r.error||'').replace(/"/g,'&quot;')}">${err||'—'}</td><td><button class="secondary" data-sync="${r.project_id}">Sync</button></td></tr>`;
        }).join('')
      }</tbody></table>`;
      box.querySelectorAll('[data-sync]').forEach(b => { b.onclick = () => runSync(b.dataset.sync); });
    } catch (e) {
      box.innerHTML = `<p class="err">${e.message}</p>`;
    }
  }
  async function runSync(projectId) {
    const q = projectId ? ('?projectId=' + encodeURIComponent(projectId)) : '';
    logOps('sync ' + (projectId || 'ALL') + ' …');
    try {
      const data = await api('/sync' + q, { method: 'POST' });
      const s = data.summary || {};
      logOps(`synced=${s.synced} failed=${s.failed} inserted=${s.inserted}`);
      (s.results || []).filter(r => r.status && r.status !== 'SKIPPED_PROJECT_FILTER').slice(0, 8).forEach(r => {
        logOps(`  ${r.projectId||''} ${r.networkId||''} ${r.status} ${r.fromBlock||''}-${r.toBlock||''}`);
      });
      await loadOps();
    } catch (e) { logOps('خطا: ' + e.message); }
  }
  document.getElementById('opsRefresh').onclick = loadOps;
  document.getElementById('syncOne').onclick = () => {
    const p = document.getElementById('syncProject').value.trim();
    if (!p) return alert('projectId');
    runSync(p);
  };
  document.getElementById('syncAll').onclick = () => {
    if (confirm('Sync همه ممکن است fail شود. ادامه؟')) runSync('');
  };
  document.getElementById('opsAuto').onchange = (e) => {
    if (opsTimer) { clearInterval(opsTimer); opsTimer = null; }
    if (e.target.checked) { loadOps(); opsTimer = setInterval(loadOps, 30000); }
  };
  return { loadOps, runSync };
}
