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

function inferNetworkId(row) {
  if (row.network_id) return row.network_id;
  if (row.networkId) return row.networkId;
  const donor = String(row.donor || '');
  if (donor.startsWith('T')) return 'tron_nile';
  if (donor.startsWith('0x') || donor.startsWith('0X')) return 'polygon_amoy';
  return 'unknown';
}

function amountToRaw(row) {
  if (row.amount_raw != null && String(row.amount_raw).trim() !== '') {
    try {
      return BigInt(String(row.amount_raw));
    } catch {
      /* fall through */
    }
  }
  const a = Number(row.amount || 0);
  if (!Number.isFinite(a)) return 0n;
  return BigInt(Math.round(a * 1e6));
}

/**
 * Render GENERAL_POOL treasury:
 * - on-chain balance (same source as donate page) when possible
 * - indexed deposits from /api/transfers on all networks
 */
export async function loadGeneralPoolTreasuryInfo() {
  const box = el('generalPoolTreasuryInfo');
  const depositsBox = el('generalPoolDeposits');
  if (!box) return;

  box.innerHTML = '<div class="treasury-info-loading muted">در حال بارگذاری اطلاعات خزانه…</div>';
  if (depositsBox) depositsBox.innerHTML = '<p class="muted">…</p>';

  try {
    const [registry, transfersData, syncData] = await Promise.all([
      loadProjectsRegistry(),
      indexerFetch('/api/transfers?projectId=GENERAL_POOL').catch(() => ({ transfers: [] })),
      indexerFetch('/api/sync-status').catch(() => ({ treasuries: [] })),
    ]);

    const general = findGeneralPool(registry);
    if (!general) {
      box.innerHTML = '<div class="err">GENERAL_POOL در Projects.json یافت نشد.</div>';
      return;
    }

    const funds = general.funds || {};
    const networks = Object.keys(funds).sort();
    const transfers = transfersData.transfers || transfersData.donors || [];

    const indexedByNet = {};
    let indexedTotal = 0n;
    for (const t of transfers) {
      const nid = inferNetworkId(t);
      const raw = amountToRaw(t);
      indexedByNet[nid] = (indexedByNet[nid] || 0n) + raw;
      indexedTotal += raw;
    }

    let chainTotal = null;
    let chainBreakdown = [];
    try {
      if (window.ClassChainRaisedReader?.getProjectRaisedUSDT) {
        const result = await window.ClassChainRaisedReader.getProjectRaisedUSDT(general);
        chainTotal = Number(result?.total) || 0;
        chainBreakdown = result?.breakdown || [];
      }
    } catch (e) {
      console.warn('on-chain balance failed', e);
    }

    const chainByNet = {};
    for (const b of chainBreakdown) {
      const nid = b.networkId || b.network_id || b.network;
      chainByNet[nid] = Number(b.amount) || 0;
    }

    const syncMap = {};
    for (const t of syncData.treasuries || []) {
      if (String(t.project_id) === 'GENERAL_POOL') {
        syncMap[t.network_id] = t;
      }
    }

    if (!networks.length) {
      box.innerHTML = '<div class="err">برای GENERAL_POOL هنوز آدرسی ثبت نشده.</div>';
      return;
    }

    const rows = networks
      .map((nid) => {
        const fund = funds[nid] || {};
        const addr = fund.address || '—';
        const chainBal =
          chainByNet[nid] != null ? Number(chainByNet[nid]).toFixed(2) : null;
        const indexedBal = formatUsdt(String(indexedByNet[nid] || 0n));
        const sync = syncMap[nid];
        const syncLabel = sync
          ? `indexed ${sync.tx_count ?? 0} tx · ${sync.status || '?'}`
          : 'sync n/a';
        const owners = Array.isArray(fund.owners) ? fund.owners.length : 0;
        const sigs = fund.requiredSignatures ?? 1;
        const multi = fund.isMultisig ? `multisig ${sigs}/${owners}` : 'تک‌امضا';
        const balHtml =
          chainBal != null
            ? `<div class="ti-bal">${chainBal} USDT</div><div class="ti-meta">ایندکس: ${indexedBal}</div>`
            : `<div class="ti-bal">${indexedBal} USDT</div><div class="ti-meta">از transfers ایندکسر</div>`;
        return `<div class="ti-row">
          <div>
            <div class="ti-net">${nid}</div>
            <div class="ti-addr" title="${addr}">${shortAddr(addr)}</div>
            <div class="ti-meta">${multi} · ${syncLabel}</div>
          </div>
          <div style="text-align:left">${balHtml}</div>
        </div>`;
      })
      .join('');

    const totalLabel =
      chainTotal != null
        ? `${chainTotal.toFixed(2)} USDT (زنجیره)`
        : `${formatUsdt(String(indexedTotal))} USDT (ایندکس)`;

    box.innerHTML = `
      <div class="ti-title">خزانه عمومی · موجودی فعلی</div>
      ${rows}
      <div class="ti-meta">جمع: <strong>${totalLabel}</strong>
        ${chainTotal != null ? ` · ایندکس‌شده: ${formatUsdt(String(indexedTotal))} USDT` : ''}
      </div>
    `;

    if (depositsBox) {
      if (!transfers.length) {
        depositsBox.innerHTML =
          '<p class="muted">واریزی ایندکس‌شده‌ای ثبت نشده (sync ممکن است ناقص باشد).</p>';
      } else {
        const sorted = [...transfers].sort((a, b) => {
          const ba = Number(a.block_number || 0);
          const bb = Number(b.block_number || 0);
          if (bb !== ba) return bb - ba;
          return Number(b.event_index || 0) - Number(a.event_index || 0);
        });
        depositsBox.innerHTML = `
          <table class="admin-simple-table">
            <thead>
              <tr>
                <th>#</th>
                <th>شبکه</th>
                <th>Donor</th>
                <th>مبلغ</th>
                <th>Tx</th>
                <th>بلاک</th>
              </tr>
            </thead>
            <tbody>
              ${sorted
                .map((t, i) => {
                  const nid = inferNetworkId(t);
                  const tx = t.tx_hash || t.txHash || '';
                  return `<tr>
                    <td>${i + 1}</td>
                    <td>${nid}</td>
                    <td><code title="${t.donor || ''}">${shortAddr(t.donor)}</code></td>
                    <td><strong>${formatUsdt(String(amountToRaw(t)))}</strong></td>
                    <td><code title="${tx}">${shortAddr(tx)}</code></td>
                    <td>${t.block_number ?? '—'}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
          <p class="ti-meta" style="margin-top:8px">مجموع واریزی‌های ایندکس‌شده: <strong>${formatUsdt(String(indexedTotal))} USDT</strong> · ${transfers.length} تراکنش</p>
        `;
      }
    }
  } catch (e) {
    box.innerHTML = `<div class="err">${e.message}</div>`;
    if (depositsBox) depositsBox.innerHTML = '';
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

  loadGeneralPoolTreasuryInfo();
  loadQueue();
}

window.loadContributors = loadContributors;
window.loadQueue = loadQueue;
window.loadMembers = loadMembers;
window.loadGeneralPoolTreasuryInfo = loadGeneralPoolTreasuryInfo;
