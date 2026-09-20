/**
 * Admin — Disbursement panel (Phase 4)
 */
import { indexerFetch, formatUsdt, shortAddr } from './config/indexer.js';

function el(id) {
  return document.getElementById(id);
}

function statusBadge(status) {
  const colors = {
    PENDING_APPROVAL: '#f39c12',
    APPROVED: '#3498db',
    EXECUTED: '#27ae60',
    FAILED: '#e74c3c',
    NO_DESTINATION: '#95a5a6',
  };
  const c = colors[status] || '#7f8c8d';
  return `<span style="background:${c};color:#fff;padding:2px 8px;border-radius:6px;font-size:12px;">${status}</span>`;
}

export async function loadDisbursePending() {
  const box = el('disbursePendingList');
  if (!box) return;
  box.innerHTML = '<p style="color:#888;">در حال بارگذاری…</p>';
  try {
    const networkId = el('disburseNetworkFilter')?.value || '';
    const q = networkId ? `?network_id=${encodeURIComponent(networkId)}` : '';
    const data = await indexerFetch(`/api/disburse/pending${q}`);
    const rows = data.pending || [];
    if (!rows.length) {
      box.innerHTML = '<p style="color:#666;">درخواستی در انتظار تأیید نیست.</p>';
      return;
    }
    box.innerHTML = `
      <table class="admin-simple-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>پروژه</th>
            <th>شبکه</th>
            <th>مبلغ (USDT)</th>
            <th>از → به</th>
            <th>وضعیت</th>
            <th>عملیات</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${r.id}</td>
              <td><code>${r.project_id}</code></td>
              <td>${r.network_id}</td>
              <td><strong>${formatUsdt(r.amount_raw)}</strong></td>
              <td style="font-size:11px;">
                ${shortAddr(r.from_address)} → ${shortAddr(r.to_address)}
              </td>
              <td>${statusBadge(r.status)}</td>
              <td>
                <button type="button" class="btn-secondary btn-sm" data-disburse-approve="${r.id}">تأیید</button>
                <button type="button" class="btn-secondary btn-sm" data-disburse-detail="${r.id}">جزئیات</button>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#e74c3c;">خطا: ${e.message}</p>`;
  }
}

export async function approveDisburse(id) {
  const approver = el('disburseApprover')?.value?.trim();
  if (!approver) {
    alert('آدرس approver را وارد کنید');
    return;
  }
  try {
    const data = await indexerFetch(`/api/disburse/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approver }),
    });
    alert(`وضعیت: ${data.disbursement?.status || 'ok'}`);
    await loadDisbursePending();
    if (el('disburseDetailId')?.value == id) await loadDisburseDetail(id);
  } catch (e) {
    alert('خطا: ' + e.message);
  }
}

export async function loadDisburseDetail(id) {
  const box = el('disburseDetailBox');
  if (!box) return;
  box.innerHTML = '…';
  try {
    const data = await indexerFetch(`/api/disburse/${id}`);
    const d = data.disbursement;
    if (!d) {
      box.innerHTML = 'یافت نشد';
      return;
    }
    if (el('disburseDetailId')) el('disburseDetailId').value = d.id;
    box.innerHTML = `
      <pre style="background:#f8f9fa;padding:12px;border-radius:8px;overflow:auto;font-size:12px;">${JSON.stringify(d, null, 2)}</pre>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <input type="text" id="disburseTxHash" placeholder="execute_tx_hash (0x...)" style="flex:1;min-width:200px;padding:8px;">
        <button type="button" class="btn-connect" id="disburseMarkExecutedBtn">ثبت EXECUTED</button>
      </div>`;
    el('disburseMarkExecutedBtn')?.addEventListener('click', () => markExecuted(d.id));
  } catch (e) {
    box.innerHTML = `<p style="color:#e74c3c;">${e.message}</p>`;
  }
}

export async function markExecuted(id) {
  const tx = el('disburseTxHash')?.value?.trim();
  if (!tx) {
    alert('tx hash لازم است');
    return;
  }
  try {
    const data = await indexerFetch(`/api/disburse/${id}/executed`, {
      method: 'POST',
      body: JSON.stringify({ execute_tx_hash: tx }),
    });
    alert(`ثبت شد: ${data.disbursement?.status}`);
    await loadDisbursePending();
    await loadDisburseDetail(id);
  } catch (e) {
    alert('خطا: ' + e.message);
  }
}

export async function prepareDisburse() {
  const batch = el('disburseBatchId')?.value?.trim();
  const projectId = el('disburseProjectId')?.value?.trim();
  if (!batch || !projectId) {
    alert('batch_id و project_id لازم است');
    return;
  }
  try {
    const data = await indexerFetch('/api/disburse/prepare', {
      method: 'POST',
      body: JSON.stringify({
        allocation_batch_id: batch,
        project_id: projectId,
      }),
    });
    alert('prepare: ' + JSON.stringify(data.disbursements || data, null, 2));
    await loadDisbursePending();
  } catch (e) {
    alert('خطا: ' + e.message);
  }
}

export function initDisbursePanel() {
  el('disburseRefreshBtn')?.addEventListener('click', () => loadDisbursePending());
  el('disburseNetworkFilter')?.addEventListener('change', () => loadDisbursePending());
  el('disbursePrepareBtn')?.addEventListener('click', () => prepareDisburse());
  el('disbursePendingList')?.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const aid = t.getAttribute('data-disburse-approve');
    const did = t.getAttribute('data-disburse-detail');
    if (aid) approveDisburse(aid);
    if (did) loadDisburseDetail(did);
  });
}

window.loadDisbursePending = loadDisbursePending;
window.approveDisburse = approveDisburse;
