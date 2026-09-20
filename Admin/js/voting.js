/**
 * Admin — Voting + allocate panel (Phase 2)
 */
import { indexerFetch, formatUsdt } from './config/indexer.js';

function el(id) {
  return document.getElementById(id);
}

/** USDT human amount → 6-decimal base units. Long integers are treated as already-raw. */
function usdtToRaw(v) {
  const s = String(v || '').trim().replace(/,/g, '');
  if (!s) throw new Error('مبلغ خالی است');
  if (/^\d{10,}$/.test(s)) return s;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) throw new Error('مبلغ USDT نامعتبر است');
  return String(BigInt(Math.round(n * 1e6)));
}

export async function loadVotingRounds() {
  const box = el('votingRoundsList');
  if (!box) return;
  box.innerHTML = '<p class="muted">…</p>';
  try {
    const data = await indexerFetch('/api/voting/rounds');
    const rounds = data.rounds || [];
    if (!rounds.length) {
      box.innerHTML = '<p class="muted">راندی نیست.</p>';
      return;
    }
    box.innerHTML = `
      <table class="admin-simple-table">
        <thead>
          <tr><th>ID</th><th>عنوان</th><th>وضعیت</th><th>کاندیدها</th><th>شبکه</th><th></th></tr>
        </thead>
        <tbody>
          ${rounds
            .map((r) => {
              const cands = Array.isArray(r.candidate_projects)
                ? r.candidate_projects.join(', ')
                : r.candidate_projects;
              return `<tr>
              <td>${r.id}</td>
              <td>${r.title || ''}</td>
              <td><strong>${r.status}</strong></td>
              <td style="font-size:12px;">${cands || '—'}</td>
              <td>${r.network_id || 'جهانی'}</td>
              <td>
                <button type="button" class="btn-sm btn-secondary" data-round-detail="${r.id}">جزئیات</button>
              </td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>`;
  } catch (e) {
    box.innerHTML = `<p class="err">${e.message}</p>`;
  }
}

export async function loadRoundDetail(id) {
  const box = el('votingRoundDetail');
  if (!box) return;
  try {
    const data = await indexerFetch(`/api/voting/rounds/${id}`);
    const r = data.round;
    if (!r) {
      box.innerHTML = 'یافت نشد';
      return;
    }
    if (el('votingSelectedRoundId')) el('votingSelectedRoundId').value = r.id;
    const tally = (r.tally || [])
      .map((t) => `${t.project_id}: ${t.vote_count}`)
      .join(' · ');
    box.innerHTML = `
      <div class="round-detail">
        <p><strong>#${r.id}</strong> ${r.title} — <code>${r.status}</code></p>
        <p>کاندیدها: ${(r.candidate_projects || []).join(', ') || '—'}</p>
        <p>آرا: ${r.votes_count ?? 0} | Tally: ${tally || '—'}</p>
        <p>منتخب: ${r.selected_project_id || '—'} | مبلغ: ${
          r.required_amount_raw ? formatUsdt(r.required_amount_raw) + ' USDT' : '—'
        }</p>
        <p class="muted">batch: ${r.allocation_batch_id || '—'}</p>
      </div>`;
  } catch (e) {
    box.innerHTML = `<p class="err">${e.message}</p>`;
  }
}

export async function openRound() {
  const title = el('votingNewTitle')?.value?.trim();
  const cands = el('votingNewCandidates')?.value
    ?.split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const networkId = el('votingNewNetwork')?.value || null;
  if (!title || !cands?.length) {
    alert('عنوان و حداقل یک پروژه کاندید لازم است');
    return;
  }
  try {
    const data = await indexerFetch('/api/voting/rounds', {
      method: 'POST',
      body: JSON.stringify({
        title,
        candidate_projects: cands,
        network_id: networkId || null,
      }),
    });
    alert('راند باز شد: #' + data.round?.id);
    await loadVotingRounds();
  } catch (e) {
    alert('خطا: ' + e.message);
  }
}

export async function castVote() {
  const roundId = el('votingSelectedRoundId')?.value || el('votingVoteRoundId')?.value;
  const donor = el('votingVoteDonor')?.value?.trim();
  const networkId = el('votingVoteNetwork')?.value?.trim() || 'polygon_amoy';
  const projectId = el('votingVoteProject')?.value?.trim();
  if (!roundId || !donor || !projectId) {
    alert('ابتدا جزئیات راند را بزنید، سپس donor و project را پر کنید');
    return;
  }
  try {
    await indexerFetch(`/api/voting/rounds/${roundId}/vote`, {
      method: 'POST',
      body: JSON.stringify({
        donor,
        network_id: networkId,
        project_id: projectId,
      }),
    });
    alert('رای ثبت شد');
    await loadRoundDetail(roundId);
  } catch (e) {
    alert('خطا: ' + e.message);
  }
}

export async function closeRound() {
  const roundId = el('votingSelectedRoundId')?.value;
  const selected = el('votingCloseProject')?.value?.trim();
  const amountInput = el('votingCloseAmount')?.value?.trim();
  if (!roundId || !selected || !amountInput) {
    alert('راند را از جزئیات انتخاب کنید، پروژه و مبلغ USDT لازم است');
    return;
  }
  let amountRaw;
  try {
    amountRaw = usdtToRaw(amountInput);
  } catch (e) {
    alert(e.message);
    return;
  }
  try {
    await indexerFetch(`/api/voting/rounds/${roundId}/close`, {
      method: 'POST',
      body: JSON.stringify({
        selected_project_id: selected,
        required_amount_raw: amountRaw,
      }),
    });
    alert('راند بسته شد · ' + formatUsdt(amountRaw) + ' USDT');
    await loadVotingRounds();
    await loadRoundDetail(roundId);
  } catch (e) {
    alert('خطا: ' + e.message);
  }
}

export async function allocateRound() {
  const roundId = el('votingSelectedRoundId')?.value;
  if (!roundId) {
    alert('ابتدا راند را انتخاب کنید (جزئیات)');
    return;
  }
  try {
    const data = await indexerFetch(`/api/voting/rounds/${roundId}/allocate`, {
      method: 'POST',
      body: '{}',
    });
    const disb = data.disbursement?.disbursements || data.disbursement || {};
    alert(
      'allocate OK\nbatch: ' +
        (data.allocation_batch_id || '') +
        '\nallocated: ' +
        formatUsdt(data.allocated_amount_raw || '0') +
        ' USDT' +
        (data.fully_funded ? '' : '\nکمبود: ' + formatUsdt(data.shortfall_raw || '0')) +
        '\ndisbursement: ' +
        JSON.stringify(disb, null, 2)
    );
    await loadVotingRounds();
    await loadRoundDetail(roundId);
  } catch (e) {
    alert('خطا: ' + e.message);
  }
}

export function initVotingPanel() {
  el('votingRefreshBtn')?.addEventListener('click', () => loadVotingRounds());
  el('votingOpenBtn')?.addEventListener('click', () => openRound());
  el('votingVoteBtn')?.addEventListener('click', () => castVote());
  el('votingCloseBtn')?.addEventListener('click', () => closeRound());
  el('votingAllocateBtn')?.addEventListener('click', () => allocateRound());
  el('votingRoundsList')?.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const id = t.getAttribute('data-round-detail');
    if (id) loadRoundDetail(id);
  });
}

window.loadVotingRounds = loadVotingRounds;
