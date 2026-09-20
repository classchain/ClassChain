/**
 * Admin — Voting + allocate panel (Phase 2)
 */
import { indexerFetch, formatUsdt } from './config/indexer.js';

function el(id) {
  return document.getElementById(id);
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
          <tr><th>ID</th><th>عنوان</th><th>وضعیت</th><th>کاندیدها</th><th></th></tr>
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
    const projects = await loadProjectsForVoting();
    const candidateProjects = projects.filter((project) =>
      (r.candidate_projects || []).includes(String(project.ProjectID))
    );
    fillProjectSelect(el('votingCloseProject'), candidateProjects, false);
    renderResultInputs(candidateProjects, r.result_tally || r.tally || []);
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

let projectsCache = null;

async function loadProjectsForVoting() {
  if (projectsCache) return projectsCache;
  const response = await fetch('../frontend/data/Projects.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Projects.json قابل بارگذاری نیست');
  const data = await response.json();
  projectsCache = (data.features || [])
    .map((feature) => feature?.attributes)
    .filter((project) => {
      if (!project?.ProjectID || String(project.ProjectID) === 'GENERAL_POOL') return false;
      return Object.values(project.funds || {}).some((fund) => fund?.address);
    });
  return projectsCache;
}

function renderResultInputs(candidateProjects, tally = []) {
  const box = el('votingResultInputs');
  if (!box) return;
  const counts = new Map((tally || []).map((item) => [String(item.project_id), Number(item.vote_count || 0)]));
  box.innerHTML = candidateProjects.map((project) => {
    const value = counts.get(String(project.ProjectID)) || 0;
    return '<div class="result-vote-item">' +
      '<label>' + project.ProjectID + ' — ' + (project['نام پروژه'] || 'بدون نام') + '</label>' +
      '<input type="number" min="0" step="1" data-vote-count="' + project.ProjectID + '" value="' + value + '">' +
      '</div>';
  }).join('');
}

function fillProjectSelect(select, projects, multiple = false) {
  if (!select) return;
  select.multiple = multiple;
  select.innerHTML = multiple ? '' : '<option value="">انتخاب پروژه</option>';
  for (const project of projects) {
    const option = document.createElement('option');
    option.value = String(project.ProjectID);
    option.textContent = String(project.ProjectID) + ' — ' + (project['نام پروژه'] || 'بدون نام');
    select.appendChild(option);
  }
}

async function prepareVotingProjectSelectors() {
  const projects = await loadProjectsForVoting();
  fillProjectSelect(el('votingNewCandidates'), projects, true);
}

export async function openRound() {
  const title = el('votingNewTitle')?.value?.trim();
  const candidateSelect = el('votingNewCandidates');
  const cands = candidateSelect
    ? Array.from(candidateSelect.selectedOptions).map((option) => option.value).filter(Boolean)
    : [];
  if (!title || !cands.length) {
    alert('عنوان و حداقل یک پروژه کاندید لازم است');
    return;
  }
  try {
    const data = await indexerFetch('/api/voting/rounds', {
      method: 'POST',
      body: JSON.stringify({
        title,
        candidate_projects: cands,
      }),
    });
    alert('راند باز شد: #' + data.round?.id);
    await loadVotingRounds();
  } catch (e) {
    alert('خطا: ' + e.message);
  }
}

export async function saveVotingResult() {
  const roundId = el('votingSelectedRoundId')?.value;
  const selected = el('votingCloseProject')?.value?.trim();
  const inputs = Array.from(document.querySelectorAll('[data-vote-count]'));
  if (!roundId || !selected || !inputs.length) {
    alert('ابتدا راند و پروژه منتخب را مشخص کنید');
    return;
  }
  const resultTally = inputs.map((input) => ({
    project_id: input.getAttribute('data-vote-count'),
    vote_count: Number(input.value || 0),
  }));
  if (resultTally.some((item) => !Number.isInteger(item.vote_count) || item.vote_count < 0)) {
    alert('تعداد آرا باید عدد صحیح صفر یا بیشتر باشد');
    return;
  }
  try {
    await indexerFetch('/api/voting/rounds/' + roundId + '/close', {
      method: 'POST',
      body: JSON.stringify({
        selected_project_id: selected,
        result_tally: resultTally,
      }),
    });
    alert('نتیجه رأی‌گیری ثبت و راند بسته شد');
    await loadVotingRounds();
    await loadRoundDetail(roundId);
  } catch (e) {
    alert('خطا: ' + e.message);
  }
}

export async function closeRound() {
  const roundId = el('votingSelectedRoundId')?.value;
  const selected = el('votingCloseProject')?.value?.trim();
  if (!roundId || !selected) {
    alert('راند را از جزئیات انتخاب کنید و پروژه منتخب را مشخص کنید');
    return;
  }
  try {
    const data = await indexerFetch(`/api/voting/rounds/${roundId}/close`, {
      method: 'POST',
      body: JSON.stringify({ selected_project_id: selected }),
    });
    const amountRaw = data.round?.required_amount_raw || '0';
    alert('راند بسته شد · برآورد پروژه: ' + formatUsdt(amountRaw) + ' USDT');
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
  el('votingResultBtn')?.addEventListener('click', () => saveVotingResult());
  el('votingCloseBtn')?.addEventListener('click', () => closeRound());
  el('votingAllocateBtn')?.addEventListener('click', () => allocateRound());
  prepareVotingProjectSelectors().catch((e) => console.error(e));
  el('votingRoundsList')?.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const id = t.getAttribute('data-round-detail');
    if (id) loadRoundDetail(id);
  });
}

window.loadVotingRounds = loadVotingRounds;
