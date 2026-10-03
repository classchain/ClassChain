/** Indexer + community + voting + disburse */
import { $, api, usdtRaw, short, logOps, badge } from './ops-core.js';

export async function loadIndexerHealth(networkFilter) {
  const tbody = $('syncTableBody');
  try {
    const [health, status] = await Promise.all([
      api('/health').catch((e) => ({ ok: false, error: e.message })),
      api('/api/sync-status'),
    ]);
    const rows = status.treasuries || [];
    const tips = {};
    let ok = 0, fail = 0, lagN = 0;
    rows.forEach((r) => {
      if (r.status === 'SUCCESS' && r.last_scanned_block)
        tips[r.network_id] = Math.max(tips[r.network_id] || 0, r.last_scanned_block);
    });
    rows.forEach((r) => {
      if (r.status === 'SUCCESS') ok++; else fail++;
      const tip = tips[r.network_id] || 0;
      const last = r.last_scanned_block || 0;
      if (tip && tip - last > 5000) lagN++;
    });
    $('kpiIndexer').textContent = health.ok ? 'OK' : 'DOWN';
    $('kpiIndexer').style.color = health.ok ? 'var(--good)' : 'var(--bad)';
    $('idxMeta').textContent = (health.ok ? 'Worker OK' : 'DOWN') + ` · ${ok} ok / ${fail} fail · ${lagN} lag` +
      (health.networks ? ' · ' + health.networks.join(', ') : '');
    const filtered = networkFilter ? rows.filter((r) => r.network_id === networkFilter) : rows;
    tbody.innerHTML = filtered.slice().sort((a, b) => String(a.project_id).localeCompare(String(b.project_id))).map((r) => {
      const tip = tips[r.network_id] || 0;
      const last = r.last_scanned_block || 0;
      const lag = tip ? Math.max(0, tip - last) : 0;
      let cls = '', badgeHtml = '<span class="badge badge-ok">OK</span>';
      if (r.status !== 'SUCCESS') { cls = 'row-fail'; badgeHtml = `<span class="badge badge-fail">${r.status || 'FAIL'}</span>`; }
      else if (lag > 5000) { cls = 'row-lag'; badgeHtml = '<span class="badge badge-lag">LAG</span>'; }
      const err = (r.error || '').slice(0, 50);
      return `<tr class="${cls}"><td><b>${r.project_id}</b></td><td>${r.network_id}</td><td>${last.toLocaleString()}</td>
        <td>${lag ? lag.toLocaleString() : '0'}</td><td>${r.tx_count ?? '—'}</td><td>${badgeHtml}</td>
        <td class="muted" title="${(r.error || '').replace(/"/g, '"')}">${err || '—'}</td>
        <td><button type="button" class="ghost" data-sync="${r.project_id}">Sync</button></td></tr>`;
    }).join('') || '<tr><td colspan="8" class="muted">خالی</td></tr>';
    tbody.querySelectorAll('[data-sync]').forEach((b) => { b.onclick = () => runSync(b.dataset.sync); });
    return status;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="err">${e.message}</td></tr>`;
    $('kpiIndexer').textContent = 'ERR';
    return null;
  }
}

export async function runSync(projectId) {
  const q = projectId ? ('?projectId=' + encodeURIComponent(projectId)) : '';
  logOps('sync ' + (projectId || 'ALL') + ' …');
  try {
    const data = await api('/sync' + q, { method: 'POST' });
    const s = data.summary || {};
    logOps(`synced=${s.synced} failed=${s.failed} inserted=${s.inserted}`);
    await loadIndexerHealth('');
  } catch (e) { logOps('خطا: ' + e.message); }
}

export async function loadCommunity() {
  const net = $('cNet')?.value || '';
  const q = net ? `?network_id=${encodeURIComponent(net)}&limit=100` : '?limit=100';
  try {
    const [c, qdata] = await Promise.all([
      api('/api/contributors' + q),
      api('/api/queue' + (net ? `?network_id=${encodeURIComponent(net)}` : '')),
    ]);
    const rows = c.contributors || [];
    $('cList').innerHTML = rows.length
      ? `<div class="table-wrap"><table class="ops-table"><thead><tr><th>Donor</th><th>شبکه</th><th>آزاد</th><th>کل</th></tr></thead><tbody>${
          rows.map((r) => `<tr><td title="${r.donor}">${short(r.donor)}</td><td>${r.network_id}</td><td><b>${usdtRaw(r.unallocated)}</b></td><td>${usdtRaw(r.total_contributed)}</td></tr>`).join('')
        }</tbody></table></div>` : '<p class="muted">خالی</p>';
    const qr = qdata.queue || [];
    $('cQueue').innerHTML = qr.length
      ? `<div class="table-wrap"><table class="ops-table"><thead><tr><th>#</th><th>Donor</th><th>باقی</th><th>وضعیت</th></tr></thead><tbody>${
          qr.map((r) => `<tr><td>${r.id}</td><td>${short(r.donor)}</td><td>${usdtRaw(r.remaining_raw)}</td><td>${r.status}</td></tr>`).join('')
        }</tbody></table></div>` : '<p class="muted">صف خالی</p>';
  } catch (e) { $('cList').innerHTML = `<p class="err">${e.message}</p>`; }
}

export async function loadRounds() {
  try {
    const data = await api('/api/voting/rounds');
    const rounds = data.rounds || [];
    $('vRounds').innerHTML = rounds.length
      ? `<div class="table-wrap"><table class="ops-table"><thead><tr><th>ID</th><th>عنوان</th><th>وضعیت</th><th>منتخب</th><th></th></tr></thead><tbody>${
          rounds.map((r) => `<tr><td>${r.id}</td><td>${r.title || ''}</td><td>${badge(r.status)}</td><td>${r.selected_project_id || '—'}</td><td><button type="button" class="ghost" data-rid="${r.id}">جزئیات</button></td></tr>`).join('')
        }</tbody></table></div>` : '<p class="muted">راندی نیست</p>';
    $('vRounds').querySelectorAll('[data-rid]').forEach((b) => {
      b.onclick = async () => {
        const rid = b.dataset.rid;
        if ($('vRoundId')) $('vRoundId').value = rid;
        if ($('vRoundIdShow')) $('vRoundIdShow').value = rid;
        if ($('dAllocRoundId') && !($('dAllocRoundId').value || '').trim()) {
          // فقط اگر خالی باشد پیشنهاد می‌کنیم
        }
        try {
          const d = await api('/api/voting/rounds/' + rid);
          const r = d.round;
          $('vDetail').innerHTML = `<pre>${JSON.stringify(r, null, 2)}</pre>`;
          // اگر CLOSED است، برای Allocate در تب تخصیص پیشنهاد بده
          if (r?.status === 'CLOSED' && $('dAllocRoundId')) {
            $('dAllocRoundId').value = String(rid);
          }
          // اگر OPEN است و منتخب خالی، فیلد بستن را آماده نگه دار
          if (r?.status === 'OPEN' && $('vCloseProject') && r.selected_project_id) {
            $('vCloseProject').value = r.selected_project_id;
          }
        } catch (e) { $('vDetail').innerHTML = `<p class="err">${e.message}</p>`; }
      };
    });
  } catch (e) { $('vRounds').innerHTML = `<p class="err">${e.message}</p>`; }
}

export async function loadDisburse() {
  try {
    const data = await api('/api/disburse/pending');
    const rows = data.pending || [];
    $('dList').innerHTML = rows.length
      ? `<div class="table-wrap"><table class="ops-table"><thead><tr><th>ID</th><th>پروژه</th><th>مبلغ</th><th>وضعیت</th><th></th></tr></thead><tbody>${
          rows.map((r) => `<tr><td>${r.id}</td><td>${r.project_id}</td><td>${usdtRaw(r.amount_raw)}</td><td>${badge(r.status)}</td>
          <td><button type="button" class="ghost" data-a="${r.id}">تأیید</button>
          <button type="button" class="ghost" data-d="${r.id}">جزئیات</button></td></tr>`).join('')
        }</tbody></table></div>` : '<p class="muted">در انتظار نیست</p>';
    $('dList').querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = async () => {
        const approver = $('dApprover').value.trim();
        if (!approver) return alert('approver لازم است');
        try {
          await api('/api/disburse/' + b.dataset.a + '/approve', { method: 'POST', body: JSON.stringify({ approver }) });
          loadDisburse();
        } catch (e) { alert(e.message); }
      };
    });
    $('dList').querySelectorAll('[data-d]').forEach((b) => {
      b.onclick = async () => {
        try {
          const d = await api('/api/disburse/' + b.dataset.d);
          $('dDetail').innerHTML = `<pre>${JSON.stringify(d.disbursement, null, 2)}</pre>`;
        } catch (e) { alert(e.message); }
      };
    });
  } catch (e) { $('dList').innerHTML = `<p class="err">${e.message}</p>`; }
}
