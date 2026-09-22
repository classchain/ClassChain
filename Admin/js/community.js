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

async function loadProjectsRegistry() {
  const url = '../frontend/data/Projects.json';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Projects.json: HTTP ' + res.status);
  return res.json();
}

function findGeneralPool(registry) {
  const features = registry?.features || [];
  for (const f of features) {
    const a = f?.attributes;
    if (a && String(a.ProjectID) === 'GENERAL_POOL') return a;
  }
  return null;
}

/**
 * Render GENERAL_POOL treasury summary in the hero panel:
 * addresses per network + ledger unallocated totals.
 */
export async function loadGeneralPoolTreasuryInfo() {
  const box = el('generalPoolTreasuryInfo');
  if (!box) return;

  box.innerHTML = '<div class="treasury-info-loading muted">در حال بارگذاری اطلاعات خزانه…</div>';

  try {
    const [registry, contributorsData] = await Promise.all([
      loadProjectsRegistry(),
      indexerFetch('/api/contributors?limit=500').catch(() => ({ contributors: [] })),
    ]);

    const general = findGeneralPool(registry);
    if (!general) {
      box.innerHTML = '<div class="err">GENERAL_POOL در Projects.json یافت نشد.</div>';
      return;
    }

    const funds = general.funds || {};
    const contributors = contributorsData.contributors || [];

    // Sum unallocated per network from ledger
    const unallocByNet = {};
    let totalUnalloc = 0n;
    for (const c of contributors) {
      const nid = c.network_id || c.networkId;
      const u = BigInt(String(c.unallocated || '0'));
      unallocByNet[nid] = (unallocByNet[nid] || 0n) + u;
      totalUnalloc += u;
    }

    const networks = Object.keys(funds).sort();
    if (!networks.length) {
      box.innerHTML = '<div class="err">برای GENERAL_POOL هنوز آدرسی ثبت نشده.</div>';
      return;
    }

    const rows = networks
      .map((nid) => {
        const fund = funds[nid] || {};
        const addr = fund.address || '—';
        const bal = unallocByNet[nid] != null ? formatUsdt(String(unallocByNet[nid])) : '0';
        const owners = Array.isArray(fund.owners) ? fund.owners.length : 0;
        const sigs = fund.requiredSignatures ?? 1;
        const multi = fund.isMultisig ? `multisig ${sigs}/${owners}` : 'تک‌امضا';
        return `<div class="ti-row">
          <div>
            <div class="ti-net">${nid}</div>
            <div class="ti-addr" title="${addr}">${shortAddr(addr)}</div>
            <div class="ti-meta">${multi}</div>
          </div>
          <div class="ti-bal">${bal} USDT</div>
        </div>`;
      })
      .join('');

    box.innerHTML = `
      <div class="ti-title">خزانه عمومی · موجودی آزاد دفترکل</div>
      ${rows}
      <div class="ti-meta">جمع آزاد: <strong>${formatUsdt(String(totalUnalloc))} USDT</strong> · موجودی زنجیره جداگانه است</div>
    `;
  } catch (e) {
    box.innerHTML = `<div class="err">${e.message}</div>`;
  }
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
    await loadGeneralPoolTreasuryInfo();
    await loadContributors();
    await loadQueue();
    await loadMembers();
  });
  el('communityNetwork')?.addEventListener('change', async () => {
    await loadContributors();
    await loadQueue();
  });
  el('communityLookupBtn')?.addEventListener('click', () => lookupContributor());

  // Initial treasury + queue when panel boots
  loadGeneralPoolTreasuryInfo();
  loadQueue();
}

window.loadContributors = loadContributors;
window.loadQueue = loadQueue;
window.loadMembers = loadMembers;
window.loadGeneralPoolTreasuryInfo = loadGeneralPoolTreasuryInfo;
