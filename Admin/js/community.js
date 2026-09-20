/**
 * Admin — Community / FIFO queue (Phase 1)
 */
import { indexerFetch, formatUsdt, shortAddr } from './config/indexer.js';

function el(id) {
  return document.getElementById(id);
}

export async function loadContributors() {
  const box = el('communityContributors');
  if (!box) return;
  box.innerHTML = '…';
  try {
    const networkId = el('communityNetwork')?.value || '';
    const q = networkId ? `?network_id=${encodeURIComponent(networkId)}&limit=100` : '?limit=100';
    const data = await indexerFetch(`/api/contributors${q}`);
    const rows = data.contributors || [];
    if (!rows.length) {
      box.innerHTML = '<p>کسی با unallocated > 0 نیست.</p>';
      return;
    }
    box.innerHTML = `
      <table class="admin-simple-table">
        <thead>
          <tr>
            <th>Donor</th>
            <th>شبکه</th>
            <th>کل</th>
            <th>تخصیص‌یافته</th>
            <th>آزاد</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
            <td><code title="${r.donor}">${shortAddr(r.donor)}</code></td>
            <td>${r.network_id}</td>
            <td>${formatUsdt(r.total_contributed)}</td>
            <td>${formatUsdt(r.total_allocated)}</td>
            <td><strong>${formatUsdt(r.unallocated)}</strong></td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#e74c3c;">${e.message}</p>`;
  }
}

export async function loadQueue() {
  const box = el('communityQueue');
  if (!box) return;
  box.innerHTML = '…';
  try {
    const networkId = el('communityNetwork')?.value || '';
    const q = networkId ? `?network_id=${encodeURIComponent(networkId)}&limit=50` : '?limit=50';
    const data = await indexerFetch(`/api/queue${q}`);
    const rows = data.queue || [];
    if (!rows.length) {
      box.innerHTML = '<p>صف خالی است.</p>';
      return;
    }
    box.innerHTML = `
      <table class="admin-simple-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Donor</th>
            <th>شبکه</th>
            <th>مبلغ</th>
            <th>باقی‌مانده</th>
            <th>وضعیت</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
            <td>${r.id}</td>
            <td><code>${shortAddr(r.donor)}</code></td>
            <td>${r.network_id}</td>
            <td>${formatUsdt(r.amount_raw)}</td>
            <td><strong>${formatUsdt(r.remaining_raw)}</strong></td>
            <td>${r.status}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#e74c3c;">${e.message}</p>`;
  }
}

export async function lookupContributor() {
  const donor = el('communityLookupDonor')?.value?.trim();
  const networkId = el('communityLookupNetwork')?.value?.trim() || 'polygon_amoy';
  const box = el('communityLookupResult');
  if (!donor) {
    alert('آدرس donor لازم است');
    return;
  }
  if (!box) return;
  box.innerHTML = '…';
  try {
    const data = await indexerFetch(
      `/api/contributor?donor=${encodeURIComponent(donor)}&network_id=${encodeURIComponent(networkId)}`
    );
    const c = data.contributor;
    box.innerHTML = `<pre style="background:#f8f9fa;padding:12px;border-radius:8px;font-size:12px;">${JSON.stringify(c, null, 2)}</pre>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#e74c3c;">${e.message}</p>`;
  }
}

export function initCommunityPanel() {
  el('communityRefreshBtn')?.addEventListener('click', async () => {
    await loadContributors();
    await loadQueue();
  });
  el('communityNetwork')?.addEventListener('change', async () => {
    await loadContributors();
    await loadQueue();
  });
  el('communityLookupBtn')?.addEventListener('click', () => lookupContributor());
}

window.loadContributors = loadContributors;
window.loadQueue = loadQueue;
