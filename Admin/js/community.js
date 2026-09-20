/**
 * Admin — Community / FIFO queue (Phase 1 + 3)
 */
import { indexerFetch, formatUsdt, shortAddr } from './config/indexer.js';

function el(id) {
  return document.getElementById(id);
}

function tableOrEmpty(rows, html, emptyText) {
  if (!rows.length) return `<p class="muted">${emptyText}</p>`;
  return html;
}

export async function loadContributors() {
  const box = el('communityContributors');
  if (!box) return;
  box.innerHTML = '<p class="muted">…</p>';
  try {
    const networkId = el('communityNetwork')?.value || '';
    const q = networkId ? `?network_id=${encodeURIComponent(networkId)}&limit=100` : '?limit=100';
    const data = await indexerFetch(`/api/contributors${q}`);
    const rows = data.contributors || [];
    box.innerHTML = tableOrEmpty(
      rows,
      `
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
      </table>`,
      'کسی با unallocated > 0 نیست.'
    );
  } catch (e) {
    box.innerHTML = `<p class="err">${e.message}</p>`;
  }
}

export async function loadQueue() {
  const box = el('communityQueue');
  if (!box) return;
  box.innerHTML = '<p class="muted">…</p>';
  try {
    const networkId = el('communityNetwork')?.value || '';
    const q = networkId ? `?network_id=${encodeURIComponent(networkId)}&limit=50` : '?limit=50';
    const data = await indexerFetch(`/api/queue${q}`);
    const rows = data.queue || [];
    box.innerHTML = tableOrEmpty(
      rows,
      `
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
            <td><code title="${r.donor}">${shortAddr(r.donor)}</code></td>
            <td>${r.network_id}</td>
            <td>${formatUsdt(r.amount_raw)}</td>
            <td><strong>${formatUsdt(r.remaining_raw)}</strong></td>
            <td>${r.status}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>`,
      'صف خالی است.'
    );
  } catch (e) {
    box.innerHTML = `<p class="err">${e.message}</p>`;
  }
}

export async function loadMembers() {
  const box = el('communityMembers');
  if (!box) return;
  box.innerHTML = '<p class="muted">…</p>';
  try {
    const data = await indexerFetch('/api/community/members?type=contributor');
    const rows = data.members || [];
    box.innerHTML = tableOrEmpty(
      rows,
      `
      <table class="admin-simple-table">
        <thead>
          <tr>
            <th>Telegram</th>
            <th>Donor</th>
            <th>شبکه</th>
            <th>آزاد</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
            <td><code>${r.telegram_user_id || '—'}</code></td>
            <td><code title="${r.donor || ''}">${shortAddr(r.donor)}</code></td>
            <td>${r.network_id || '—'}</td>
            <td><strong>${formatUsdt(r.unallocated)}</strong></td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>`,
      'عضو لینک‌شده‌ای با موجودی آزاد نیست.'
    );
  } catch (e) {
    box.innerHTML = `<p class="err">${e.message}</p>`;
  }
}

export async function lookupContributor() {
  const donor = el('communityLookupDonor')?.value?.trim();
  const telegramId = el('communityLookupTelegram')?.value?.trim();
  const networkId = el('communityLookupNetwork')?.value?.trim() || 'polygon_amoy';
  const box = el('communityLookupResult');
  if (!donor && !telegramId) {
    alert('آدرس donor یا شناسه تلگرام لازم است');
    return;
  }
  if (!box) return;
  box.innerHTML = '<p class="muted">…</p>';
  try {
    let payload;
    if (telegramId) {
      payload = await indexerFetch(
        `/api/community/status?telegram_user_id=${encodeURIComponent(telegramId)}`
      );
    } else {
      const [contributor, status] = await Promise.all([
        indexerFetch(
          `/api/contributor?donor=${encodeURIComponent(donor)}&network_id=${encodeURIComponent(networkId)}`
        ),
        indexerFetch(
          `/api/community/status?donor=${encodeURIComponent(donor)}&network_id=${encodeURIComponent(networkId)}`
        ).catch(() => null),
      ]);
      payload = { contributor: contributor.contributor, community: status };
    }
    box.innerHTML = `<pre>${JSON.stringify(payload, null, 2)}</pre>`;
  } catch (e) {
    box.innerHTML = `<p class="err">${e.message}</p>`;
  }
}

export function initCommunityPanel() {
  el('communityRefreshBtn')?.addEventListener('click', async () => {
    await loadContributors();
    await loadQueue();
    await loadMembers();
  });
  el('communityNetwork')?.addEventListener('change', async () => {
    await loadContributors();
    await loadQueue();
  });
  el('communityLookupBtn')?.addEventListener('click', () => lookupContributor());
}

window.loadContributors = loadContributors;
window.loadQueue = loadQueue;
window.loadMembers = loadMembers;
