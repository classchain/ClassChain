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

const MULTISIG_ABI = [
  {
    inputs: [
      { internalType: "address", name: "_to", type: "address" },
      { internalType: "uint256", name: "_value", type: "uint256" },
      { internalType: "bytes", name: "_data", type: "bytes" }
    ],
    name: "submitTransaction",
    outputs: [{ internalType: "uint256", name: "txIndex", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "_txIndex", type: "uint256" }],
    name: "confirmTransaction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "_txIndex", type: "uint256" }],
    name: "getTransaction",
    outputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "bytes", name: "data", type: "bytes" },
      { internalType: "bool", name: "executed", type: "bool" },
      { internalType: "uint256", name: "numConfirmations", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getTransactionCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

const FUND_WITHDRAW_ABI = [{
  inputs: [
    { internalType: "address", name: "token", type: "address" },
    { internalType: "address", name: "to", type: "address" },
    { internalType: "uint256", name: "amount", type: "uint256" }
  ],
  name: "withdrawToken",
  outputs: [],
  stateMutability: "nonpayable",
  type: "function"
}];

function networkLabel(networkId) {
  return networkId === 'tron_nile' ? 'TRON / Nile' : networkId === 'polygon_amoy' ? 'EVM / Amoy' : networkId;
}

function walletLabel(networkId) {
  return networkId === 'tron_nile' ? 'TronLink' : 'MetaMask';
}

function getTronWeb() {
  return window.tronWeb || window.tron?.tronWeb || null;
}

function tronBase58ToHex(address, tronWeb) {
  const value = String(address || '').trim();
  if (!value) throw new Error('آدرس TRON خالی است.');
  if (/^41[0-9a-fA-F]{40}$/.test(value)) return value;
  if (!tronWeb?.address?.toHex) throw new Error('TronLink برای تبدیل آدرس در دسترس نیست.');
  return tronWeb.address.toHex(value);
}

function getWalletForRow(row) {
  const network = window.ClassChainNetworkConfig?.getNetwork?.(row.network_id);
  if (!network) throw new Error('تنظیمات شبکه پیدا نشد: ' + row.network_id);

  if (network.type === 'EVM') {
    if (!window.ethereum) throw new Error('برای Amoy باید MetaMask نصب و فعال باشد.');
    return { type: 'EVM', network, provider: window.ethereum };
  }

  if (network.type === 'TVM') {
    const tronWeb = getTronWeb();
    if (!tronWeb) throw new Error('برای Nile باید TronLink نصب و فعال باشد.');
    return { type: 'TVM', network, provider: tronWeb };
  }

  throw new Error('نوع شبکه پشتیبانی نمی‌شود: ' + network.type);
}

async function ensureEvmNetwork(provider, chainId) {
  const wanted = '0x' + Number(chainId).toString(16);
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === wanted.toLowerCase()) return;
  await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: wanted }] });
}

async function findEvmDisbursementTx(row, multisig) {
  const fund = String(row.from_address || '').toLowerCase();
  const token = window.ClassChainNetworkConfig.getTokenAddress(row.network_id, 'USDT');
  const web3 = new Web3(multisig._provider);
  const encoder = new web3.eth.Contract(FUND_WITHDRAW_ABI);
  const expected = encoder.methods.withdrawToken(
    token, row.to_address, String(row.amount_raw)
  ).encodeABI().toLowerCase();
  const count = Number(await multisig.methods.getTransactionCount().call());

  for (let i = count - 1; i >= 0; i--) {
    const tx = await multisig.methods.getTransaction(i).call();
    if (
      String(tx.to).toLowerCase() === fund &&
      String(tx.value) === '0' &&
      String(tx.data).toLowerCase() === expected &&
      !tx.executed
    ) {
      return { index: i, confirmations: Number(tx.numConfirmations || 0) };
    }
  }
  return null;
}

async function submitEvmDisbursement(row, web3, multisig) {
  const token = window.ClassChainNetworkConfig.getTokenAddress(row.network_id, 'USDT');
  if (!token) throw new Error('آدرس USDT شبکه پیدا نشد.');
  if (!row.from_address || !row.to_address || !row.multisig_address) {
    throw new Error('اطلاعات GENERAL_POOL / مقصد / Multisig ناقص است.');
  }

  const fund = new web3.eth.Contract(FUND_WITHDRAW_ABI);
  const data = fund.methods.withdrawToken(
    token, row.to_address, String(row.amount_raw)
  ).encodeABI();

  const tx = multisig.methods.submitTransaction(row.from_address, '0', data);
  const receipt = await tx.send({ from: (await web3.eth.getAccounts())[0] });
  const index = Number(await multisig.methods.getTransactionCount().call()) - 1;
  return { index, txHash: receipt?.transactionHash || null };
}

async function findTronDisbursementTx(row, tronWeb) {
  const token = window.ClassChainNetworkConfig.getTokenAddress(row.network_id, 'USDT');
  const expectedParams = tronWeb.utils.abi.encodeParams(
    ['address', 'address', 'uint256'],
    [
      tronBase58ToHex(token, tronWeb),
      tronBase58ToHex(row.to_address, tronWeb),
      String(row.amount_raw)
    ]
  ).replace(/^0x/, '').toLowerCase();
  const expectedData = '01e33667' + expectedParams;
  const multisig = await tronWeb.contract(MULTISIG_ABI, row.multisig_address);
  const count = Number(await multisig.getTransactionCount().call());

  for (let i = count - 1; i >= 0; i--) {
    const tx = await multisig.getTransaction(i).call();
    const data = String(tx.data || '').replace(/^0x/, '').toLowerCase();
    if (
      String(tx.to || '').toUpperCase() === String(row.from_address || '').toUpperCase() &&
      String(tx.value || '0') === '0' &&
      data === expectedData &&
      !tx.executed
    ) {
      return { index: i, confirmations: Number(tx.numConfirmations || 0), contract: multisig };
    }
  }
  return null;
}

async function submitTronDisbursement(row, tronWeb) {
  const token = window.ClassChainNetworkConfig.getTokenAddress(row.network_id, 'USDT');
  if (!token) throw new Error('آدرس USDT شبکه پیدا نشد.');
  const data = '0x01e33667' + tronWeb.utils.abi.encodeParams(
    ['address', 'address', 'uint256'],
    [
      tronBase58ToHex(token, tronWeb),
      tronBase58ToHex(row.to_address, tronWeb),
      String(row.amount_raw)
    ]
  ).replace(/^0x/, '');

  const multisig = await tronWeb.contract(MULTISIG_ABI, row.multisig_address);
  const result = await multisig.submitTransaction(
    row.from_address, 0, data
  ).send({
    feeLimit: 150000000,
    callValue: 0,
    shouldPollResponse: true
  });
  const count = Number(await multisig.getTransactionCount().call());
  return {
    index: count - 1,
    txHash: typeof result === 'string'
      ? result
      : result?.txid || result?.txID || result?.transaction?.txID || null
  };
}

async function walletAction(row) {
  const wallet = getWalletForRow(row);

  if (wallet.type === 'EVM') {
    await ensureEvmNetwork(wallet.provider, wallet.network.chainId);
    const web3 = new Web3(wallet.provider);
    const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
    const account = accounts?.[0];
    if (!account) throw new Error('کیف پول متصل نیست.');

    const fundOwner = await getEvmFundOwner(web3, row.from_address);
    const required = Number(row.required_signatures || 1);

    if (required <= 1) {
      const fund = new web3.eth.Contract(FUND_WITHDRAW_ABI, row.from_address);
      const receipt = await fund.methods.withdrawToken(
        window.ClassChainNetworkConfig.getTokenAddress(row.network_id, 'USDT'),
        row.to_address,
        String(row.amount_raw)
      ).send({ from: account });
      const txHash = receipt?.transactionHash || null;
      await api('/api/disburse/' + row.id + '/approve', {
        method: 'POST',
        body: JSON.stringify({ approver: account, onchain_tx_index: null, onchain_tx_hash: txHash })
      });
      await api('/api/disburse/' + row.id + '/executed', {
        method: 'POST',
        body: JSON.stringify({ execute_tx_hash: txHash, onchain_tx_index: null })
      });
      return { phase: 'executed', txHash, txIndex: null };
    }

    const multisigAddress = row.multisig_address || fundOwner;
    if (!multisigAddress) throw new Error('آدرس Multisig خزانه عمومی پیدا نشد.');

    const multisig = new web3.eth.Contract(MULTISIG_ABI, multisigAddress);
    multisig._provider = wallet.provider;
    let existing = await findEvmDisbursementTx(row, multisig);

    if (!existing) {
      const submitted = await submitEvmDisbursement(row, web3, multisig);
      existing = { index: submitted.index };
    }

    const receipt = await multisig.methods.confirmTransaction(String(existing.index))
      .send({ from: account });
    const txHash = receipt?.transactionHash || null;

    await api('/api/disburse/' + row.id + '/approve', {
      method: 'POST',
      body: JSON.stringify({
        approver: account,
        onchain_tx_index: existing.index,
        onchain_tx_hash: txHash
      })
    });

    const finalTx = await multisig.methods.getTransaction(existing.index).call();
    if (finalTx.executed) {
      await api('/api/disburse/' + row.id + '/executed', {
        method: 'POST',
        body: JSON.stringify({
          execute_tx_hash: txHash,
          onchain_tx_index: existing.index
        })
      });
    }
    return { phase: finalTx.executed ? 'executed' : 'confirmed', txHash, txIndex: existing.index };
  }

  const tronWeb = wallet.provider;
  let account = tronWeb.defaultAddress?.base58;
  if (!account && typeof tronWeb.request === 'function') {
    try { await tronWeb.request({ method: 'tron_requestAccounts' }); } catch (_) {}
    account = tronWeb.defaultAddress?.base58;
  }
  if (!account) throw new Error('TronLink قفل است یا حسابی انتخاب نشده است.');

  const expectedHost = new URL(wallet.network.rpcUrl).host.toLowerCase();
  const actualHost = String(tronWeb.fullNode?.host || '').toLowerCase();
  if (actualHost && !actualHost.includes(expectedHost)) {
    throw new Error('TronLink روی شبکه Nile نیست. شبکه TronLink را روی Nile قرار دهید.');
  }

  const required = Number(row.required_signatures || 1);
  const fundOwner = getTronBase58(await getTronFundOwner(tronWeb, row.from_address));

  if (required <= 1) {
    const fund = await tronWeb.contract(FUND_WITHDRAW_ABI, row.from_address);
    const result = await fund.withdrawToken(
      getTronBase58(window.ClassChainNetworkConfig.getTokenAddress(row.network_id, 'USDT')),
      getTronBase58(row.to_address),
      String(row.amount_raw)
    ).send({ feeLimit: 150000000, callValue: 0, shouldPollResponse: true });
    const txHash = typeof result === 'string'
      ? result
      : result?.txid || result?.txID || result?.transaction?.txID || null;

    await api('/api/disburse/' + row.id + '/approve', {
      method: 'POST',
      body: JSON.stringify({ approver: account, onchain_tx_index: null, onchain_tx_hash: txHash })
    });
    await api('/api/disburse/' + row.id + '/executed', {
      method: 'POST',
      body: JSON.stringify({ execute_tx_hash: txHash, onchain_tx_index: null })
    });
    return { phase: 'executed', txHash, txIndex: null };
  }

  const multisigAddress = row.multisig_address || fundOwner;
  if (!multisigAddress) throw new Error('آدرس Multisig خزانه عمومی پیدا نشد.');

  const effectiveRow = { ...row, multisig_address: multisigAddress };
  let existing = await findTronDisbursementTx(effectiveRow, tronWeb);

  if (!existing) {
    const submitted = await submitTronDisbursement(effectiveRow, tronWeb);
    existing = {
      index: submitted.index,
      contract: await tronWeb.contract(MULTISIG_ABI, multisigAddress)
    };
  }

  const result = await existing.contract.confirmTransaction(existing.index).send({
    feeLimit: 150000000,
    callValue: 0,
    shouldPollResponse: true
  });
  const txHash = typeof result === 'string'
    ? result
    : result?.txid || result?.txID || result?.transaction?.txID || null;

  await api('/api/disburse/' + row.id + '/approve', {
    method: 'POST',
    body: JSON.stringify({
      approver: account,
      onchain_tx_index: existing.index,
      onchain_tx_hash: txHash
    })
  });

  const finalTx = await existing.contract.getTransaction(existing.index).call();
  if (finalTx.executed) {
    await api('/api/disburse/' + row.id + '/executed', {
      method: 'POST',
      body: JSON.stringify({
        execute_tx_hash: txHash,
        onchain_tx_index: existing.index
      })
    });
  }

  return { phase: finalTx.executed ? 'executed' : 'confirmed', txHash, txIndex: existing.index };
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
            <td><b>${networkLabel(r.network_id)}</b></td>
            <td>${usdtRaw(r.amount_raw)}</td>
            <td title="${r.from_address || ''}">${short(r.from_address || '')}</td>
            <td title="${r.to_address || ''}">${short(r.to_address || '')}</td>
            <td>${badge(r.status)}</td>
            <td>
              <button type="button" class="ghost" data-a="${r.id}">اتصال ${walletLabel(r.network_id)} و امضا</button>
              <button type="button" class="ghost" data-d="${r.id}">جزئیات</button>
            </td>
          </tr>`).join('')
        }</tbody></table></div>` : '<p class="muted">درخواست انتقال در انتظار نیست</p>';

    $('dList').querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = async () => {
        try {
          const d = await api('/api/disburse/' + b.dataset.a);
          const row = d.disbursement;
          if (!row) throw new Error('درخواست انتقال پیدا نشد.');
          const result = await walletAction(row);
          alert(result.phase === 'executed'
            ? 'تراکنش on-chain اجرا شد و وضعیت ثبت شد.'
            : 'امضای on-chain ثبت شد؛ Owner بعدی باید تأیید کند.');
          await loadDisbursePending();
          await loadDisburseRounds();
        } catch (e) {
          alert(e.message);
        }
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
