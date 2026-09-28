/**
 * Ops finance + visual (network-agnostic)
 */
export function createFinanceModule(ctx) {
  const {
    $, api, getNetworks, networkIdsFromSync, fmtUsdt, usdtRaw, short,
    colorForNetwork, logOps, INDEXER, PROJECTS_URL
  } = ctx;

  let projectsCache = [];
  let raisedCache = new Map();
  let networkFilter = '';

  async function loadProjects() {
    const res = await fetch(PROJECTS_URL + '?t=' + Date.now());
    const data = await res.json();
    projectsCache = (data.features || []).map((f) => f.attributes || f).filter((a) => a && a.ProjectID);
    return projectsCache;
  }

  async function loadRaisedForAll(projects) {
    const reader = window.ClassChainRaisedReader;
    raisedCache = new Map();
    if (!reader?.getProjectRaisedUSDT) return raisedCache;
    const queue = [...projects];
    const workers = Array.from({ length: Math.min(4, queue.length || 1) }, async () => {
      while (queue.length) {
        const p = queue.shift();
        try {
          raisedCache.set(String(p.ProjectID), await reader.getProjectRaisedUSDT(p));
        } catch {
          raisedCache.set(String(p.ProjectID), { total: 0, breakdown: [] });
        }
      }
    });
    await Promise.all(workers);
    return raisedCache;
  }

  function filterBreakdown(breakdown) {
    if (!networkFilter) return breakdown || [];
    return (breakdown || []).filter((b) => b.networkId === networkFilter);
  }
  function sumBreakdown(breakdown) {
    return filterBreakdown(breakdown).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  }
  function isGeneral(p) {
    return String(p.ProjectID).toUpperCase() === 'GENERAL_POOL';
  }
  function projectProgress(p) {
    const raised = raisedCache.get(String(p.ProjectID)) || { total: 0, breakdown: [] };
    const total = sumBreakdown(raised.breakdown);
    const target = Number(p['targetAmount(USDT)'] || p.targetAmount || 0) || 0;
    const pct = target > 0 ? Math.min(100, (total / target) * 100) : 0;
    return { total, target, pct, raised };
  }
  function renderDonut(el, pct) {
    if (!el) return;
    const p = Math.max(0, Math.min(100, pct || 0));
    const deg = (p / 100) * 360;
    el.style.background = `conic-gradient(var(--accent2) ${deg}deg, rgba(255,255,255,0.08) ${deg}deg)`;
    const span = el.querySelector('span');
    if (span) span.textContent = Math.round(p) + '%';
  }
  function renderNetBars(container, perNet) {
    if (!container) return;
    const entries = Object.entries(perNet || {});
    if (!entries.length) {
      container.innerHTML = '<p class="muted">شبکه‌ای نیست</p>';
      return;
    }
    const max = Math.max(...entries.map(([, v]) => v), 1);
    container.innerHTML = entries.map(([id, amt], i) => {
      const w = Math.max(2, Math.round((amt / max) * 100));
      const col = colorForNetwork(id, i);
      return `<div class="net-bar-row"><span title="${id}">${id.replace(/_/g, ' ')}</span>
        <div class="net-bar-track"><div class="net-bar-fill" style="width:${w}%;background:${col}"></div></div>
        <span class="amt">${fmtUsdt(amt)}</span></div>`;
    }).join('');
  }
  function aggregateFinancial(projects) {
    let projectTvl = 0, targetSum = 0, generalTotal = 0;
    const perNetProjects = {};
    for (const p of projects) {
      const { total, target, raised } = projectProgress(p);
      const bd = filterBreakdown(raised.breakdown);
      if (isGeneral(p)) {
        generalTotal += total;
      } else {
        projectTvl += total;
        if (target > 0) targetSum += target;
        bd.forEach((b) => {
          perNetProjects[b.networkId] = (perNetProjects[b.networkId] || 0) + (Number(b.amount) || 0);
        });
      }
    }
    return {
      projectTvl, targetSum, generalTotal, perNetProjects,
      overallPct: targetSum > 0 ? (projectTvl / targetSum) * 100 : 0,
    };
  }

  function renderFinancialUI(projects) {
    const agg = aggregateFinancial(projects);
    $('kpiTvl').textContent = fmtUsdt(agg.projectTvl);
    $('kpiGeneral').textContent = fmtUsdt(agg.generalTotal);
    $('kpiPct').textContent = Math.round(agg.overallPct) + '%';
    $('kpiProjects').textContent = String(projects.filter((p) => !isGeneral(p)).length);
    renderDonut($('donutOverall'), agg.overallPct);
    renderNetBars($('netBars'), agg.perNetProjects);

    const g = projects.find(isGeneral);
    const gBox = $('generalBody');
    if (!g) gBox.innerHTML = '<p class="muted">GENERAL_POOL نیست</p>';
    else {
      const { total, raised } = projectProgress(g);
      const bd = filterBreakdown(raised.breakdown);
      const chips = bd.map((b, i) =>
        `<span class="chip on" style="border:1px solid ${colorForNetwork(b.networkId, i)}">${b.networkId}: ${fmtUsdt(b.amount)}</span>`
      ).join('') || '<span class="muted">بدون موجودی</span>';
      gBox.innerHTML = `<div class="pc-meta" style="margin-bottom:10px"><span>موجودی کل</span><b>${fmtUsdt(total)} USDT</b></div><div class="net-chips">${chips}</div>`;
    }

    const list = projects.filter((p) => !isGeneral(p));
    const sort = ($('sortProjects')?.value) || 'pct';
    list.sort((a, b) => {
      const pa = projectProgress(a), pb = projectProgress(b);
      if (sort === 'pct') return pb.pct - pa.pct;
      if (sort === 'raised') return pb.total - pa.total;
      if (sort === 'target') return pb.target - pa.target;
      return String(a.ProjectID).localeCompare(String(b.ProjectID));
    });
    const grid = $('projectsGrid');
    grid.innerHTML = list.map((p) => {
      const { total, target, pct, raised } = projectProgress(p);
      const name = (p['نام پروژه'] || p.name || p.ProjectID || '').toString().trim();
      const shortName = name.length > 48 ? name.slice(0, 46) + '…' : name;
      const bd = filterBreakdown(raised.breakdown);
      const chips = bd.map((b) =>
        `<span class="chip ${b.amount > 0 ? 'on' : ''}">${b.networkId.split('_').pop()}: ${fmtUsdt(b.amount)}</span>`
      ).join('');
      return `<article class="project-card" data-pid="${p.ProjectID}">
        <div class="pc-head"><p class="pname" title="${name.replace(/"/g, '&quot;')}">${shortName}</p>
        <span class="pid">#${p.ProjectID}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="pc-meta"><span><b>${Math.round(pct)}%</b></span>
        <span><b>${fmtUsdt(total)}</b> / ${fmtUsdt(target)} USDT</span></div>
        <div class="net-chips">${chips || '<span class="chip">—</span>'}</div></article>`;
    }).join('') || '<p class="muted">پروژه‌ای نیست</p>';
    grid.querySelectorAll('.project-card').forEach((card) => {
      card.onclick = () => openDrawer(card.dataset.pid);
    });
  }

  function openDrawer(projectId) {
    const p = projectsCache.find((x) => String(x.ProjectID) === String(projectId));
    const drawer = $('drawer'), backdrop = $('drawerBackdrop');
    if (!p || !drawer) return;
    const { total, target, pct, raised } = projectProgress(p);
    const funds = p.funds || {};
    const fundLines = Object.keys(funds).map((nid) => {
      const f = funds[nid];
      return `<div class="row"><span class="chip on">${nid}</span> <code style="direction:ltr;font-size:11px">${f.address || '—'}</code></div>`;
    }).join('') || '<p class="muted">خزانه ثبت نشده</p>';
    const bd = (raised.breakdown || []).map((b) =>
      `<tr><td>${b.networkId}</td><td>${fmtUsdt(b.amount)}</td><td style="direction:ltr;font-size:11px">${short(b.address)}</td></tr>`
    ).join('');
    $('drawerTitle').textContent = `#${p.ProjectID}`;
    $('drawerBody').innerHTML = `
      <p class="muted">${(p['نام پروژه'] || '').toString()}</p>
      <div class="progress-track" style="margin:12px 0"><div class="progress-fill" style="width:${pct}%"></div></div>
      <p><b>${Math.round(pct)}%</b> — ${fmtUsdt(total)} / ${fmtUsdt(target)} USDT</p>
      <h3 style="margin-top:16px;font-size:0.9rem">موجودی per-network</h3>
      <div class="table-wrap"><table class="ops-table"><thead><tr><th>شبکه</th><th>USDT</th><th>آدرس</th></tr></thead>
      <tbody>${bd || '<tr><td colspan="3">—</td></tr>'}</tbody></table></div>
      <h3 style="margin-top:16px;font-size:0.9rem">آدرس خزانه‌ها</h3>${fundLines}
      <div class="row" style="margin-top:16px"><button type="button" class="primary" id="drawerSync">Sync Indexer</button></div>`;
    drawer.classList.add('open');
    backdrop.classList.add('open');
    $('drawerSync').onclick = () => ctx.runSync(String(projectId));
  }
  function closeDrawer() {
    $('drawer')?.classList.remove('open');
    $('drawerBackdrop')?.classList.remove('open');
  }

  return {
    loadProjects, loadRaisedForAll, renderFinancialUI, openDrawer, closeDrawer,
    get projectsCache() { return projectsCache; },
    setNetworkFilter(v) { networkFilter = v; },
    getNetworkFilter() { return networkFilter; },
  };
}
