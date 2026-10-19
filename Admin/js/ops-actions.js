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

const FUND_WITHDRAW_TRON_ABI = [{
  constant: false,
  inputs: [
    { name: "token", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" }
  ],
  name: "withdrawToken",
  outputs: [],
  payable: false,
  stateMutability: "Nonpayable",
  type: "Function"
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

function getTronBase58(address, tronWeb = getTronWeb()) {
  const value = String(address || '').trim();
  if (!value) throw new Error('آدرس TRON خالی است.');
  if (value.startsWith('T')) return value;
  // 0x-prefixed 20-byte or 41-prefixed 21-byte hex
  let hex = value.replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{40}$/.test(hex)) hex = '41' + hex;
  if (/^41[0-9a-fA-F]{40}$/.test(hex)) {
    if (!tronWeb?.address?.fromHex) throw new Error('TronLink برای تبدیل آدرس در دسترس نیست.');
    return tronWeb.address.fromHex(hex);
  }
  return value;
}

function tronBase58ToHex(address, tronWeb) {
  const value = String(address || '').trim();
  if (!value) throw new Error('آدرس TRON خالی است.');
  let hex = value.replace(/^0x/i, '');
  if (/^41[0-9a-fA-F]{40}$/.test(hex)) return hex.toLowerCase();
  if (/^[0-9a-fA-F]{40}$/.test(hex)) return ('41' + hex).toLowerCase();
  if (!tronWeb?.address?.toHex) throw new Error('TronLink برای تبدیل آدرس در دسترس نیست.');
  return String(tronWeb.address.toHex(value)).replace(/^0x/i, '').toLowerCase();
}

/** 20-byte hex (0x…) for ABI encodeParams — strips TRON 0x41 prefix */
function tronAddrToAbiHex(address, tronWeb) {
  let hex = tronBase58ToHex(address, tronWeb).replace(/^0x/i, '').toLowerCase();
  if (hex.startsWith('41') && hex.length === 42) hex = hex.slice(2);
  if (hex.length !== 40) throw new Error('آدرس TRON نامعتبر برای ABI: ' + address);
  return '0x' + hex;
}

function sameTronAddr(a, b, tronWeb = getTronWeb()) {
  if (!a || !b) return false;
  try {
    return tronAddrToAbiHex(a, tronWeb) === tronAddrToAbiHex(b, tronWeb);
  } catch {
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }
}

function buildTronWithdrawCalldata(tronWeb, token, toAddress, amountRaw) {
  const params = tronWeb.utils.abi.encodeParams(
    ['address', 'address', 'uint256'],
    [
      tronAddrToAbiHex(token, tronWeb),
      tronAddrToAbiHex(toAddress, tronWeb),
      String(amountRaw)
    ]
  ).replace(/^0x/, '').toLowerCase();
  return '01e33667' + params;
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

async function waitForEvmReceipt(web3, txHash, attempts = 90) {
  for (let i = 0; i < attempts; i++) {
    const receipt = await web3.eth.getTransactionReceipt(txHash).catch(() => null);
    if (receipt) {
      let successful = false;
      try { successful = BigInt(receipt.status) === 1n; } catch (_) {}
      if (!successful) {
        const error = new Error('نتیجه موفقیت Receipt تراکنش قابل تأیید نیست: ' + txHash);
        error.txHash = txHash;
        if (receipt.status === false || receipt.status === 0 || receipt.status === 0n || receipt.status === '0x0' || receipt.status === '0') {
          error.txFailed = true;
        }
        throw error;
      }
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const error = new Error('تراکنش ارسال شده اما Receipt هنوز در دسترس نیست؛ قبل از تلاش مجدد وضعیت این هش را بررسی کنید: ' + txHash);
  error.txHash = txHash;
  throw error;
}

async function sendEvmTransaction(provider, web3, tx, onBroadcast = null) {
  const transaction = {
    from: tx.from,
    to: tx.to,
    data: tx.data,
    value: tx.value || '0x0'
  };
  // Estimate gas from the exact transaction and add a 20% safety margin.
  // Leave gas-price selection to the wallet so EIP-1559 networks remain compatible.
  const estimated = BigInt(await web3.eth.estimateGas(transaction));
  transaction.gas = '0x' + ((estimated * 120n + 99n) / 100n).toString(16);
  let txHash;
  try {
    txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [transaction]
    });
  } catch (error) {
    if (error?.code !== 4001) error.broadcastUnknown = true;
    throw error;
  }
  if (typeof onBroadcast === 'function') onBroadcast(txHash);
  const receipt = await waitForEvmReceipt(web3, txHash);
  return { ...receipt, transactionHash: txHash };
}
async function getEvmFundOwner(web3, fundAddress) {
  const fund = new web3.eth.Contract([{
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }], fundAddress);
  return fund.methods.owner().call();
}

async function getTronFundOwner(tronWeb, fundAddress) {
  const fund = await tronWeb.contract([{
    constant: true,
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'View',
    type: 'Function'
  }], fundAddress);
  return fund.owner().call();
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

  const account = (await web3.eth.getAccounts())[0];
  const receipt = await sendEvmTransaction(multisig._provider, web3, {
    from: account,
    to: multisig.options.address,
    data: multisig.methods.submitTransaction(row.from_address, '0', data).encodeABI()
  });
  const index = Number(await multisig.methods.getTransactionCount().call()) - 1;
  return { index, txHash: receipt?.transactionHash || null };
}

async function findTronDisbursementTx(row, tronWeb) {
  const token = window.ClassChainNetworkConfig.getTokenAddress(row.network_id, 'USDT');
  const expectedData = buildTronWithdrawCalldata(
    tronWeb,
    token,
    row.to_address,
    row.amount_raw
  );
  const multisig = await tronWeb.contract(MULTISIG_ABI, row.multisig_address);
  const count = Number(await multisig.getTransactionCount().call());

  // Prefer lowest index with most confirmations so all signers converge on one tx
  let best = null;
  for (let i = 0; i < count; i++) {
    const tx = await multisig.getTransaction(i).call();
    const data = String(tx.data || tx[2] || '').replace(/^0x/i, '').toLowerCase();
    const toAddr = tx.to || tx[0];
    const value = String(tx.value ?? tx[1] ?? '0');
    const executed = tx.executed === true || tx[3] === true;
    const conf = Number(tx.numConfirmations ?? tx[4] ?? 0);
    if (executed) continue;
    if (value !== '0') continue;
    if (!sameTronAddr(toAddr, row.from_address, tronWeb)) continue;
    if (data !== expectedData) continue;
    if (!best || conf > best.confirmations || (conf === best.confirmations && i < best.index)) {
      best = { index: i, confirmations: conf, contract: multisig };
    }
  }
  return best;
}

function extractTronTxId(result) {
  if (!result) return null;
  if (typeof result === 'string') return result;
  return result.txid || result.txID || result.transaction?.txID || result.transaction?.txid || null;
}

/**
 * TronWeb + shouldPollResponse:true tries to ABI-decode contractResult.
 * Void methods (and some failed/empty returns) throw:
 *   data out-of-bounds (buffer=0x, length=0, offset=32, BUFFER_OVERRUN)
 * So we always send with shouldPollResponse:false and only keep the txID.
 */
async function waitForTronReceipt(tronWeb, txHash, attempts = 90) {
  if (typeof tronWeb?.trx?.getTransactionInfo !== 'function') {
    const error = new Error('امکان بررسی Receipt تراکنش TRON وجود ندارد؛ دوباره ارسال نکنید: ' + txHash);
    error.txHash = txHash;
    throw error;
  }
  for (let i = 0; i < attempts; i++) {
    const info = await tronWeb.trx.getTransactionInfo(txHash).catch(() => null);
    if (info && (info.blockNumber || info.block_number)) {
      const result = String(info.receipt?.result || info.result || '').toUpperCase();
      if (result && result !== 'SUCCESS') {
        const error = new Error('تراکنش TRON روی شبکه ناموفق شد: ' + txHash + (info.resMessage ? ' · ' + info.resMessage : ''));
        error.txHash = txHash;
        error.txFailed = true;
        throw error;
      }
      if (result !== 'SUCCESS') {
        const error = new Error('رسید TRON موجود است اما نتیجه موفقیت قابل تأیید نیست؛ انتقال را دوباره ارسال نکنید: ' + txHash);
        error.txHash = txHash;
        throw error;
      }
      return txHash;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const error = new Error('تراکنش TRON ارسال شد ولی نتیجه نهایی هنوز تأیید نشده است؛ قبل از تلاش مجدد این هش را بررسی کنید: ' + txHash);
  error.txHash = txHash;
  throw error;
}

async function sendTronVoid(methodCall, onBroadcast = null) {
  let result;
  try {
    result = await methodCall.send({
      callValue: 0,
      shouldPollResponse: false
    });
  } catch (error) {
    if (error?.code !== 4001) error.broadcastUnknown = true;
    throw error;
  }
  const txHash = extractTronTxId(result);
  if (!txHash) {
    const error = new Error('پاسخ ارسال TRON فاقد txID است؛ وضعیت شبکه را بررسی کنید و دوباره ارسال نکنید.');
    error.broadcastUnknown = true;
    throw error;
  }
  if (typeof onBroadcast === 'function') onBroadcast(txHash);
  await waitForTronReceipt(getTronWeb(), txHash);
  return txHash;
}
async function submitTronDisbursement(row, tronWeb) {
  const token = window.ClassChainNetworkConfig.getTokenAddress(row.network_id, 'USDT');
  if (!token) throw new Error('آدرس USDT شبکه پیدا نشد.');
  // calldata without 0x — matches what is stored in multisig.getTransaction().data
  const data = '0x' + buildTronWithdrawCalldata(tronWeb, token, row.to_address, row.amount_raw);

  const multisig = await tronWeb.contract(MULTISIG_ABI, row.multisig_address);
  const txHash = await sendTronVoid(
    multisig.submitTransaction(getTronBase58(row.from_address, tronWeb), 0, data)
  );
  const count = Number(await multisig.getTransactionCount().call());
  return {
    index: count - 1,
    txHash
  };
}

function singleSigRecoveryKey(row) {
  return 'classchain:single-sig-disbursement:' + row.network_id + ':' + row.id;
}
function readSingleSigRecovery(row) {
  try {
    const value = localStorage.getItem(singleSigRecoveryKey(row));
    return value ? JSON.parse(value) : null;
  } catch (_) { return null; }
}
function saveSingleSigRecovery(row, data) {
  try { localStorage.setItem(singleSigRecoveryKey(row), JSON.stringify(data)); } catch (_) {}
}
function clearSingleSigRecovery(row) {
  try { localStorage.removeItem(singleSigRecoveryKey(row)); } catch (_) {}
}
async function finalizeSingleSig(row, approver, txHash) {
  if (!txHash) throw new Error('هش تراکنش موجود نیست؛ انتقال را دوباره ارسال نکنید.');
  await api('/api/disburse/' + row.id + '/approve', {
    method: 'POST',
    body: JSON.stringify({ approver, onchain_tx_index: null, onchain_tx_hash: txHash })
  });
  await api('/api/disburse/' + row.id + '/executed', {
    method: 'POST',
    body: JSON.stringify({ execute_tx_hash: txHash, onchain_tx_index: null })
  });
  clearSingleSigRecovery(row);
  return { phase: 'executed', txHash, txIndex: null };
}

async function walletAction(row) {
  const latestData = await api('/api/disburse/' + row.id);
  const latest = latestData.disbursement || {};
  if (latest.status === 'EXECUTED') {
    clearSingleSigRecovery(row);
    throw new Error('این انتقال قبلاً اجرا شده است؛ ارسال دوباره مجاز نیست.');
  }
  const requiredSignatures = Number(row.required_signatures || 1);
  const recovery = requiredSignatures <= 1 ? readSingleSigRecovery(row) : null;
  if (requiredSignatures <= 1 && (latest.status === 'APPROVED' || latest.status === 'PROCESSING') && !recovery) {
    throw new Error('این انتقال قبلاً آغاز شده یا وضعیت آن نامشخص است؛ برای جلوگیری از پرداخت تکراری، ابتدا تراکنش روی شبکه و D1 را بررسی کنید.');
  }
  const wallet = getWalletForRow(row);

  if (wallet.type === 'EVM') {
    await ensureEvmNetwork(wallet.provider, wallet.network.chainId);
    const web3 = new Web3(wallet.provider);
    const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
    const account = accounts?.[0];
    if (!account) throw new Error('کیف پول متصل نیست.');

    if (recovery?.txHash) {
      try {
        await waitForEvmReceipt(web3, recovery.txHash);
      } catch (error) {
        if (error.txFailed) {
          clearSingleSigRecovery(row);
          await api('/api/disburse/' + row.id + '/release-claim', {
            method: 'POST',
            body: JSON.stringify({ approver: recovery.approver || account })
          }).catch(() => {});
        }
        throw error;
      }
      return finalizeSingleSig(row, recovery.approver || account, recovery.txHash);
    }
    const priorApprovals = Array.isArray(row.approvals) ? row.approvals : [];
    if (priorApprovals.some((x) => String(x.approver || '').toLowerCase() === String(account).toLowerCase())) {
      throw new Error('این کیف قبلاً برای این درخواست امضا کرده است.');
    }
    const ownersEvm = Array.isArray(row.multisig_owners) ? row.multisig_owners : [];
    if (ownersEvm.length && !ownersEvm.some((o) => String(o).toLowerCase() === String(account).toLowerCase())) {
      throw new Error('کیف متصل در فهرست مالکان GENERAL این شبکه نیست.');
    }

    const fundOwner = await getEvmFundOwner(web3, row.from_address);
    const required = Number(row.required_signatures || 1);

    if (required <= 1) {
      await api('/api/disburse/' + row.id + '/claim', {
        method: 'POST',
        body: JSON.stringify({ approver: account })
      });
      const fund = new web3.eth.Contract(FUND_WITHDRAW_ABI, row.from_address);
      let receipt;
      try {
        receipt = await sendEvmTransaction(wallet.provider, web3, {
        from: account,
        to: row.from_address,
        data: fund.methods.withdrawToken(
          window.ClassChainNetworkConfig.getTokenAddress(row.network_id, 'USDT'),
          row.to_address,
          String(row.amount_raw)
        ).encodeABI()
        }, (txHash) => saveSingleSigRecovery(row, { txHash, approver: account, createdAt: Date.now() }));
      } catch (error) {
        if (error.txFailed) {
          clearSingleSigRecovery(row);
          await api('/api/disburse/' + row.id + '/release-claim', {
            method: 'POST',
            body: JSON.stringify({ approver: account })
          }).catch(() => {});
        } else if (error.txHash) {
          saveSingleSigRecovery(row, { txHash: error.txHash, approver: account, createdAt: Date.now() });
        } else if (!error.broadcastUnknown) {
          await api('/api/disburse/' + row.id + '/release-claim', {
            method: 'POST',
            body: JSON.stringify({ approver: account })
          }).catch(() => {});
        }
        throw error;
      }
      const txHash = receipt?.transactionHash || null;
      // Persist the hash before any API call; a failed D1/API write must not trigger a second transfer.
      saveSingleSigRecovery(row, { txHash, approver: account, createdAt: Date.now() });
      return finalizeSingleSig(row, account, txHash);
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

    const receipt = await sendEvmTransaction(wallet.provider, web3, {
      from: account,
      to: multisigAddress,
      data: multisig.methods.confirmTransaction(String(existing.index)).encodeABI()
    });
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

  if (recovery?.txHash) {
    try {
      await waitForTronReceipt(tronWeb, recovery.txHash);
    } catch (error) {
      if (error.txFailed) {
        clearSingleSigRecovery(row);
        await api('/api/disburse/' + row.id + '/release-claim', {
          method: 'POST',
          body: JSON.stringify({ approver: recovery.approver || account })
        }).catch(() => {});
      }
      throw error;
    }
    return finalizeSingleSig(row, recovery.approver || account, recovery.txHash);
  }
  const priorApprovalsT = Array.isArray(row.approvals) ? row.approvals : [];
  // Tron base58 is case-sensitive — never lowercase-compare
  if (priorApprovalsT.some((x) => sameTronAddr(x.approver, account, tronWeb))) {
    throw new Error('این کیف قبلاً برای این درخواست امضا کرده است.');
  }
  const ownersT = Array.isArray(row.multisig_owners) ? row.multisig_owners : [];
  if (ownersT.length) {
    const ok = ownersT.some((o) => sameTronAddr(o, account, tronWeb));
    if (!ok) throw new Error('کیف متصل در فهرست مالکان GENERAL این شبکه نیست.');
  }

  const expectedHost = new URL(wallet.network.rpcUrl).host.toLowerCase();
  const actualHost = String(tronWeb.fullNode?.host || '').toLowerCase();
  if (actualHost && !actualHost.includes(expectedHost)) {
    throw new Error('TronLink روی شبکه Nile نیست. شبکه TronLink را روی Nile قرار دهید.');
  }

  const required = Number(row.required_signatures || 1);
  const fundOwner = getTronBase58(await getTronFundOwner(tronWeb, row.from_address));

  if (required <= 1) {
    await api('/api/disburse/' + row.id + '/claim', {
      method: 'POST',
      body: JSON.stringify({ approver: account })
    });
    const fund = await tronWeb.contract(FUND_WITHDRAW_TRON_ABI, row.from_address);
    let txHash;
    try {
      txHash = await sendTronVoid(
      fund.withdrawToken(
        getTronBase58(window.ClassChainNetworkConfig.getTokenAddress(row.network_id, 'USDT'), tronWeb),
        getTronBase58(row.to_address, tronWeb),
        String(row.amount_raw)
      ),
      (broadcastHash) => saveSingleSigRecovery(row, { txHash: broadcastHash, approver: account, createdAt: Date.now() })
      );
    } catch (error) {
      if (error.txFailed) {
        clearSingleSigRecovery(row);
        await api('/api/disburse/' + row.id + '/release-claim', {
          method: 'POST',
          body: JSON.stringify({ approver: account })
        }).catch(() => {});
      } else if (error.txHash) {
        saveSingleSigRecovery(row, { txHash: error.txHash, approver: account, createdAt: Date.now() });
      } else if (!error.broadcastUnknown) {
        await api('/api/disburse/' + row.id + '/release-claim', {
          method: 'POST',
          body: JSON.stringify({ approver: account })
        }).catch(() => {});
      }
      throw error;
    }

    // Persist the hash before any API call; a failed D1/API write must not trigger a second transfer.
    saveSingleSigRecovery(row, { txHash, approver: account, createdAt: Date.now() });
    return finalizeSingleSig(row, account, txHash);
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

  // confirmTransaction is void → must not use shouldPollResponse:true
  const txHash = await sendTronVoid(
    existing.contract.confirmTransaction(existing.index)
  );

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
function sameAddr(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function normalizeApprover(a) {
  return String(a || '').trim().toLowerCase();
}

function renderSignerRows(row) {
  const required = Number(row.required_signatures) || 1;
  const owners = Array.isArray(row.multisig_owners) && row.multisig_owners.length
    ? row.multisig_owners
    : [];
  const approvals = Array.isArray(row.approvals) ? row.approvals : [];
  const approvedSet = new Set(approvals.map((x) => normalizeApprover(x.approver)));
  const confCount = Math.min(Number(row.confirmations_count) || approvedSet.size, required);
  const isExecuted = row.status === 'EXECUTED';
  const isSingle = required <= 1 && (!row.multisig_address || owners.length <= 1);

  if (isExecuted) {
    return `<div class="disb-signers"><div class="disb-signers-head"><strong>✓ انتقال اجرا شده</strong>
      <span class="muted">${confCount}/${required} امضا</span></div></div>`;
  }

  if (isSingle || !owners.length) {
    const recovery = readSingleSigRecovery(row);
    const canRecover = required <= 1 && Boolean(recovery?.txHash) &&
      (row.status === 'PROCESSING' || row.status === 'APPROVED');
    const already = approvals.length > 0 || row.status === 'APPROVED' || row.status === 'PROCESSING';
    const btn = canRecover
      ? `<button type="button" class="primary" data-a="${row.id}">بررسی و تکمیل تراکنش قبلی</button>`
      : already
        ? `<button type="button" class="ghost" disabled>${row.status === 'PROCESSING' ? 'قفل — بررسی نتیجه تراکنش' : 'قفل — امضا ثبت شده'}</button>`
        : `<button type="button" class="primary" data-a="${row.id}">اتصال ${walletLabel(row.network_id)} و انتقال</button>`;
    return `<div class="disb-signers"><div class="disb-signers-head"><strong>تک‌امضا / Owner</strong>
      <span class="muted">${confCount}/${required}</span></div>
      <div class="disb-signer-row"><span class="disb-signer-addr muted">Owner خزانه GENERAL</span>
      <span class="disb-signer-act">${btn}</span></div></div>`;
  }

  const reconcileButton = row.status === 'APPROVED' && required > 1
    ? `<button type="button" class="primary" data-reconcile="${row.id}">بازبینی اجرای شبکه</button>`
    : '';
  const rowsHtml = owners.map((owner, i) => {
    const done = approvedSet.has(normalizeApprover(owner));
    const awaitingReconciliation = row.status === 'APPROVED' && required > 1 && !done;
    const locked = done || isExecuted || row.status === 'APPROVED';
    const lockLabel = awaitingReconciliation
      ? 'قفل — بررسی اجرای شبکه'
      : done ? '✓ امضا شد — قفل'
      : row.status === 'APPROVED' ? 'قفل — بررسی اجرای شبکه' : 'قفل';
    const btn = locked
      ? `<button type="button" class="ghost" disabled>${lockLabel}</button>`
      : `<button type="button" class="primary" data-a="${row.id}" data-owner="${String(owner).replace(/"/g, '&quot;')}">امضا با ${walletLabel(row.network_id)}</button>`;
    return `<div class="disb-signer-row ${done ? 'is-signed' : ''}">
      <span class="disb-signer-idx">${i + 1}</span>
      <span class="disb-signer-addr" title="${owner}">${short(owner)}</span>
      <span class="disb-signer-st">${done ? '✓ امضا شده' : 'در انتظار'}</span>
      <span class="disb-signer-act">${btn}</span>
    </div>`;
  }).join('');

  return `<div class="disb-signers">
    <div class="disb-signers-head"><strong>امضاها: ${confCount}/${required}</strong>
      <span class="muted">${owners.length} مالک Multisig · ${networkLabel(row.network_id)}</span>
      ${reconcileButton}</div>
    ${rowsHtml}
  </div>`;
}

export async function loadDisbursePending() {
  const box = $('dList');
  if (!box) return;
  box.innerHTML = '<p class="muted">در حال بارگذاری…</p>';

  try {
    const data = await api('/api/disburse/pending');
    let rows = data.pending || [];

    // Enrich each row with approvals + owners (per-network card needs full state)
    const enriched = await Promise.all(rows.map(async (r) => {
      try {
        const d = await api('/api/disburse/' + r.id);
        return { ...r, ...(d.disbursement || {}), approvals: (d.disbursement || d).approvals || [] };
      } catch {
        return { ...r, approvals: [] };
      }
    }));

    if (!enriched.length) {
      box.innerHTML = '<p class="muted">درخواست انتقال در انتظار نیست</p>';
      return;
    }

    box.innerHTML = `<div class="disb-list">${enriched.map((r) => {
      const executed = r.status === 'EXECUTED';
      return `<article class="disb-card ${executed ? 'is-done' : ''}" data-id="${r.id}">
        <div class="disb-card-head">
          <div>
            <strong>تخصیص #${r.id}</strong>
            <span class="muted">پروژه ${r.project_id}</span>
          </div>
          ${badge(r.status)}
        </div>
        <div class="disb-grid">
          <div><span>شبکه</span><strong>${networkLabel(r.network_id)}</strong></div>
          <div><span>مبلغ</span><strong>${usdtRaw(r.amount_raw)} USDT</strong></div>
          <div><span>مبدأ (GENERAL)</span><code title="${r.from_address || ''}">${short(r.from_address || '')}</code></div>
          <div><span>مقصد (خزانه پروژه)</span><code title="${r.to_address || ''}">${short(r.to_address || '')}</code></div>
        </div>
        ${renderSignerRows(r)}
        <div class="disb-card-actions">
          <button type="button" class="ghost" data-d="${r.id}">جزئیات</button>
          ${executed ? '<span class="muted">✓ این شبکه قفل است — انتقال دوباره ممکن نیست</span>' : ''}
        </div>
      </article>`;
    }).join('')}</div>`;

    box.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = async () => {
        if (b.disabled) return;
        const id = b.dataset.a;
        const allBtns = box.querySelectorAll(`[data-a="${id}"]`);
        allBtns.forEach((x) => { x.disabled = true; x.textContent = 'در حال امضا…'; });
        try {
          const d = await api('/api/disburse/' + id);
          const row = d.disbursement;
          if (!row) throw new Error('درخواست انتقال پیدا نشد.');
          if (row.status === 'EXECUTED') {
            await loadDisbursePending();
            return;
          }
          // If this owner already approved, lock without re-send
          const approvals = Array.isArray(row.approvals) ? row.approvals : [];
          // walletAction itself handles submit/confirm/execute
          const result = await walletAction({ ...row, approvals });
          alert(
            result.phase === 'executed'
              ? 'تراکنش on-chain اجرا شد و وضعیت ثبت شد. دکمه این شبکه قفل شد.'
              : 'امضای on-chain ثبت شد؛ Owner بعدی باید تأیید کند. دکمه این امضاکننده قفل شد.'
          );
          await loadDisbursePending();
          await loadDisburseRounds();
        } catch (e) {
          alert(e.message);
          await loadDisbursePending();
        }
      };
    });

    box.querySelectorAll('[data-reconcile]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        b.textContent = 'در حال بررسی…';
        try {
          const d = await api('/api/disburse/' + b.dataset.reconcile);
          const row = d.disbursement;
          const approvals = Array.isArray(row?.approvals) ? row.approvals : [];
          const finalApproval = approvals
            .filter((a) => a.onchain_tx_index !== null && a.onchain_tx_index !== undefined && a.onchain_tx_hash)
            .sort((a, c) => Number(c.approved_at || 0) - Number(a.approved_at || 0))[0];
          if (!finalApproval) {
            throw new Error('هش و شماره تراکنش امضای نهایی در D1 موجود نیست؛ از ارسال مجدد خودداری کنید.');
          }
          await api('/api/disburse/' + b.dataset.reconcile + '/executed', {
            method: 'POST',
            body: JSON.stringify({
              execute_tx_hash: finalApproval.onchain_tx_hash,
              onchain_tx_index: Number(finalApproval.onchain_tx_index),
            }),
          });
          alert('اجرای واقعی USDT روی شبکه تأیید و وضعیت D1 اصلاح شد.');
          await loadDisbursePending();
          await loadDisburseRounds();
        } catch (e) {
          alert('وضعیت همچنان تأیید نشده است: ' + e.message);
          await loadDisbursePending();
        }
      };
    });

    box.querySelectorAll('[data-d]').forEach((b) => {
      b.onclick = async () => {
        try {
          const d = await api('/api/disburse/' + b.dataset.d);
          const target = $('dDetail');
          if (target) {
            target.innerHTML = `<pre style="white-space:pre-wrap;font-size:12px">${JSON.stringify(d.disbursement || d, null, 2)}</pre>`;
          }
        } catch (e) { alert(e.message); }
      };
    });
  } catch (e) {
    box.innerHTML = `<p class="err">${e.message}</p>`;
  }
}

export async function loadDisburse() {
  await Promise.all([loadDisburseRounds(), loadDisbursePending()]);
}
