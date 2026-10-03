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
        <td class="muted" title="${(r.error || '').replace(/\"/g, '"')}">${err || '—'}</td>
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
        try {
          const d = await api('/api/voting/rounds/' + rid);
          const r = d.round;
          $('vDetail').innerHTML = `<pre>${JSON.stringify(r, null, 2)}</pre>`;
          if (r?.status === 'OPEN' && $('vCloseProject') && r.selected_project_id) {
            $('vCloseProject').value = r.selected_project_id;
          }
        } catch (e) { $('vDetail').innerHTML = `<p class="err">${e.message}</p>`; }
      };
    });
  } catch (e) { $('vRounds').innerHTML = `<p class="err">${e.message}</p>`; }
}

function phaseLabel(status) {
  if (status === 'OPEN') return 'رأی باز — هنوز بسته نشده';
  if (status === 'CLOSED') return 'منتظر Allocate';
  if (status === 'ALLOCATED') return 'تخصیص حسابداری شده';
  return status || '—';
}

export async function loadDisburseRounds() {
  const box = $('dRounds');
  if (!box) return;
  box.innerHTML = '<p class="muted">…</p>';
  try {
    const data = await api('/api/voting/rounds');
    const rounds = data.rounds || [];
    if (!rounds.length) {
      box.innerHTML = '<p class="muted">راندی نیست</p>';
      return;
    }
    box.innerHTML = `<div class="table-wrap"><table class="ops-table">
      <thead><tr>
        <th>ID</th><th>عنوان</th><th>وضعیت</th><th>فاز</th><th>منتخب</th><th>مبلغ هدف</th><th>batch</th><th></th>
      </tr></thead><tbody>${rounds.map((r) => {
        const canAlloc = r.status === 'CLOSED';
        const action = canAlloc
          ? `<button type="button" class="primary" data-alloc="${r.id}">Allocate</button>`
          : `<button type="button" class="ghost" data-round-detail="${r.id}">جزئیات</button>`;
        return `<tr>
          <td>${r.id}</td>
          <td>${r.title || ''}</td>
          <td>${badge(r.status)}</td>
          <td style="font-size:12px">${phaseLabel(r.status)}</td>
          <td>${r.selected_project_id || '—'}</td>
          <td>${r.required_amount_raw ? usdtRaw(r.required_amount_raw) : '—'}</td>
          <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis" title="${r.allocation_batch_id || ''}">${r.allocation_batch_id ? short(r.allocation_batch_id) : '—'}</td>
          <td>${action}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;

    box.querySelectorAll('[data-alloc]').forEach((btn) => {
      btn.onclick = () => allocateRoundById(btn.dataset.alloc, btn);
    });
    box.querySelectorAll('[data-round-detail]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          const d = await api('/api/voting/rounds/' + btn.dataset.roundDetail);
          const result = $('dAllocResult');
          if (result) result.innerHTML = `<pre style="white-space:pre-wrap;font-size:12px">${JSON.stringify(d.round, null, 2)}</pre>`;
        } catch (e) { alert(e.message); }
      };
    });
  } catch (e) {
    box.innerHTML = `<p class="err">${e.message}</p>`;
  }
}

export async function allocateRoundById(roundId, btnEl) {
  const box = $('dAllocResult');
  if (!roundId) return alert('شناسه راند لازم است');

  let amountRaw = null;
  const amountStr = ($('dAllocAmount')?.value || '').trim().replace(/,/g, '');
  if (amountStr) {
    if (!/^\d+(\.\d+)?$/.test(amountStr)) return alert('مبلغ نامعتبر است');
    const [w, f = ''] = amountStr.split('.');
    amountRaw = (BigInt(w) * 1000000n + BigInt((f + '000000').slice(0, 6))).toString();
    if (amountRaw === '0') return alert('مبلغ باید بزرگ‌تر از صفر باشد');
  }

  const msg = amountRaw
    ? ('Allocate راند #' + roundId + ' با مبلغ دستی ' + amountStr + ' USDT؟\n(FIFO قطعی؛ سقف = موجودی آزاد صف)')
    : ('Allocate راند #' + roundId + ' با مبلغ target؟\n(FIFO قطعی؛ سقف = موجودی آزاد صف)');
  if (!confirm(msg)) return;

  if (btnEl) btnEl.disabled = true;
  if (box) box.textContent = 'در حال Allocate راند #' + roundId + '…';
  try {
    const body = amountRaw ? { required_amount_raw: amountRaw } : {};
    const data = await api('/api/voting/rounds/' + roundId + '/allocate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const disb = data.disbursement?.disbursements || data.disbursement || [];
    const summary = {
      round_id: data.round_id || roundId,
      project_id: data.project_id,
      allocation_batch_id: data.allocation_batch_id,
      requested_amount_raw: data.requested_amount_raw,
      effective_amount_raw: data.effective_amount_raw,
      queue_available_raw: data.queue_available_raw,
      capped_to_queue: data.capped_to_queue,
      by_network: data.by_network,
      allocated_amount_raw: data.allocated_amount_raw,
      shortfall_raw: data.shortfall_raw,
      fully_funded: data.fully_funded,
      slices_count: data.slices_count,
      networks_in_slices: [...new Set((data.slices || []).map((x) => x.network_id))],
      disbursements: disb,
    };
    if (box) {
      box.innerHTML = '<pre style="white-space:pre-wrap;font-size:12px">' +
        JSON.stringify(summary, null, 2).slice(0, 4000) + '</pre>';
    }
    alert(
      'Allocate OK\n' +
      'batch: ' + (data.allocation_batch_id || '—') + '\n' +
      'allocated: ' + usdtRaw(data.allocated_amount_raw || '0') + ' USDT' +
      (data.capped_to_queue ? '\n(سقف صف اعمال شد)' : '') +
      (data.by_network ? '\nper-network: ' + JSON.stringify(data.by_network) : '')
    );
    await loadDisburseRounds();
    await loadDisbursePending();
  } catch (e) {
    if (box) box.innerHTML = '<p class="err">' + e.message + '</p>';
    alert(e.message);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

let connectedApprover = null;

export function getConnectedApprover() {
  return connectedApprover;
}

export function setConnectedApprover(addr) {
  connectedApprover = addr ? String(addr) : null;
  const el = $('dWalletStatus');
  if (el) {
    el.textContent = connectedApprover
      ? ('متصل: ' + connectedApprover.slice(0, 8) + '…' + connectedApprover.slice(-4))
      : 'کیف متصل نیست';
  }
}

export async function connectApproverWallet() {
  if (!window.ethereum) {
    alert('MetaMask / کیف EVM پیدا نشد');
    return null;
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const account = accounts && accounts[0];
  if (!account) {
    alert('اتصال کیف لغو شد');
    return null;
  }
  setConnectedApprover(account);
  return account;
}

export async function loadDisbursePending() {
  try {
    const data = await api('/api/disburse/pending');
    const rows = data.pending || [];
    $('dList').innerHTML = rows.length
      ? `<div class="table-wrap"><table class="ops-table"><thead><tr>
          <th>ID</th><th>پروژه</th><th>شبکه</th><th>مبلغ</th><th>از</th><th>به</th><th>وضعیت</th><th></th>
        </tr></thead><tbody>${
          rows.map((r) => `<tr>
            <td>${r.id}</td>
            <td>${r.project_id}</td>
            <td><b>${r.network_id || '—'}</b></td>
            <td>${usdtRaw(r.amount_raw)}</td>
            <td title="${r.from_address || ''}">${short(r.from_address || '')}</td>
            <td title="${r.to_address || ''}">${short(r.to_address || '')}</td>
            <td>${badge(r.status)}</td>
            <td>
              <button type="button" class="ghost" data-a="${r.id}">تأیید با کیف</button>
              <button type="button" class="ghost" data-d="${r.id}">جزئیات</button>
            </td>
          </tr>`).join('')
        }</tbody></table></div>` : '<p class="muted">درخواست انتقال در انتظار نیست</p>';

    $('dList').querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = async () => {
        let approver = getConnectedApprover();
        if (!approver) approver = await connectApproverWallet();
        if (!approver) return alert('ابتدا کیف پول صاحب امضای GENERAL را متصل کنید');
        if (!confirm('ثبت تأیید با کیف\n' + approver + '؟')) return;
        try {
          await api('/api/disburse/' + b.dataset.a + '/approve', {
            method: 'POST',
            body: JSON.stringify({ approver }),
          });
          loadDisbursePending();
        } catch (e) { alert(e.message); }
      };
    });
    $('dList').querySelectorAll('[data-d]').forEach((b) => {
      b.onclick = async () => {
        try {
          const d = await api('/api/disburse/' + b.dataset.d);
          $('dDetail').innerHTML = `<pre style="white-space:pre-wrap;font-size:12px">${JSON.stringify(d.disbursement || d, null, 2)}</pre>`;
        } catch (e) { alert(e.message); }
      };
    });
  } catch (e) {
    $('dList').innerHTML = `<p class="err">${e.message}</p>`;
  }
}

export async function loadDisburse() {
  await Promise.all([loadDisburseRounds(), loadDisbursePending()]);
}
