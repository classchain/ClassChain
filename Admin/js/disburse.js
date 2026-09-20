/**
 * Admin — Disbursement panel
 *
 * Money movement is initiated and confirmed by GENERAL_POOL treasury
 * owners through their wallet. The Worker never holds private keys.
 */
import { indexerFetch, formatUsdt, shortAddr } from './config/indexer.js';
import { getFullNetwork, getTokenAddress } from './config/networks.js';

function el(id) {
  return document.getElementById(id);
}

const MULTISIG_ABI = [
  {
    name: 'submitTransaction',
    type: 'function',
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
      { name: '_data', type: 'bytes' }
    ],
    outputs: []
  },
  {
    name: 'confirmTransaction',
    type: 'function',
    inputs: [{ name: '_txIndex', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'getTransactionCount',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'getTransaction',
    type: 'function',
    inputs: [{ name: '_txIndex', type: 'uint256' }],
    outputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'executed', type: 'bool' },
      { name: 'numConfirmations', type: 'uint256' }
    ]
  }
];

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  }
];

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

function hideLegacyControls() {
  ['disburseApprover', 'disburseBatchId', 'disburseProjectId', 'disbursePrepareBtn'].forEach(id => {
    const node = el(id);
    if (!node) return;
    node.closest('.form-group')?.style && (node.closest('.form-group').style.display = 'none');
    node.style.display = 'none';
  });
}

function getWalletProvider(networkId) {
  const network = getFullNetwork(networkId);
  if (network?.type === 'EVM') {
    if (!window.ethereum) throw new Error('کیف پول EVM پیدا نشد.');
    return { type: 'EVM', provider: window.ethereum, network };
  }
  if (network?.type === 'TVM') {
    if (!window.tronWeb?.ready) throw new Error('TronLink متصل نیست.');
    return { type: 'TVM', provider: window.tronWeb, network };
  }
  throw new Error('شبکه پشتیبانی نمی‌شود.');
}

async function ensureEvmNetwork(provider, chainId) {
  const hexChainId = '0x' + Number(chainId).toString(16);
  const current = await provider.request({ method: 'eth_chainId' });
  if (current.toLowerCase() === hexChainId.toLowerCase()) return;
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: hexChainId }]
  });
}

function encodeTronTransfer(to, amountRaw) {
  const clean = String(to).replace(/^41/, '').replace(/^0x/i, '');
  const amount = BigInt(String(amountRaw));
  return 'a9059cbb' + clean.padStart(64, '0') + amount.toString(16).padStart(64, '0');
}

async function submitEvm(row, account) {
  const token = getTokenAddress(row.network_id, 'USDT');
  if (!token) throw new Error('آدرس USDT این شبکه تنظیم نشده است.');
  if (!row.multisig_address) throw new Error('برای GENERAL_POOL آدرس Multisig ثبت نشده است.');

  const web3 = new Web3(window.ethereum);
  const multisig = new web3.eth.Contract(MULTISIG_ABI, row.multisig_address);
  const tokenContract = new web3.eth.Contract(ERC20_ABI, token);
  const data = tokenContract.methods.transfer(row.to_address, String(row.amount_raw)).encodeABI();

  const tx = multisig.methods.submitTransaction(token, '0', data);
  const receipt = await tx.send({ from: account });

  const count = await multisig.methods.getTransactionCount().call();
  const txIndex = Number(count) - 1;

  return { txHash: receipt.transactionHash, txIndex };
}

async function findEvmTransaction(multisig, row) {
  const token = getTokenAddress(row.network_id, 'USDT');
  const tokenContract = new Web3(window.ethereum).eth.Contract;
  const erc20 = new Web3(window.ethereum).eth.Contract(ERC20_ABI, token);
  const expectedData = erc20.methods.transfer(row.to_address, String(row.amount_raw)).encodeABI().toLowerCase();
  const count = Number(await multisig.methods.getTransactionCount().call());

  for (let i = count - 1; i >= 0; i--) {
    const tx = await multisig.methods.getTransaction(i).call();
    if (
      String(tx.to).toLowerCase() === token.toLowerCase() &&
      String(tx.value) === '0' &&
      String(tx.data).toLowerCase() === expectedData &&
      !tx.executed
    ) {
      return { index: i, confirmations: Number(tx.numConfirmations || 0) };
    }
  }
  return null;
}

async function submitTron(row, tronWeb) {
  if (!row.multisig_address) throw new Error('برای GENERAL_POOL آدرس Multisig ثبت نشده است.');
  const token = getTokenAddress(row.network_id, 'USDT');
  const data = encodeTronTransfer(row.to_address, row.amount_raw);

  const contract = await tronWeb.contract(MULTISIG_ABI, row.multisig_address);
  const tx = await contract.submitTransaction(token, 0, '0x' + data).send({
    from: tronWeb.defaultAddress.base58
  });

  const count = await contract.getTransactionCount().call();
  return { txHash: typeof tx === 'string' ? tx : tx?.txid || tx?.transaction || '', txIndex: Number(count) - 1 };
}

async function confirmEvm(row, account, index) {
  const web3 = new Web3(window.ethereum);
  const multisig = new web3.eth.Contract(MULTISIG_ABI, row.multisig_address);
  const receipt = await multisig.methods.confirmTransaction(String(index)).send({ from: account });
  return receipt.transactionHash;
}

async function confirmTron(row, tronWeb, index) {
  const contract = await tronWeb.contract(MULTISIG_ABI, row.multisig_address);
  const tx = await contract.confirmTransaction(index).send({
    from: tronWeb.defaultAddress.base58
  });
  return typeof tx === 'string' ? tx : tx?.txid || tx?.transaction || '';
}

async function walletAction(row) {
  const wallet = getWalletProvider(row.network_id);

  if (wallet.type === 'EVM') {
    await ensureEvmNetwork(wallet.provider, wallet.network.chainId);
    const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
    const account = accounts?.[0];
    if (!account) throw new Error('کیف پول متصل نیست.');

    const web3 = new Web3(wallet.provider);
    const multisig = new web3.eth.Contract(MULTISIG_ABI, row.multisig_address);

    const existing = await findEvmTransaction(multisig, row);
    let txHash;
    let txIndex = existing?.index;

    if (txIndex === undefined) {
      const submitted = await submitEvm(row, account);
      txHash = submitted.txHash;
      txIndex = submitted.txIndex;
    } else {
      txHash = await confirmEvm(row, account, txIndex);
    }

    await recordOnchainState(row.id, txIndex, txHash, account);
    return { txIndex, txHash };
  }

  const tronWeb = wallet.provider;
  const contract = await tronWeb.contract(MULTISIG_ABI, row.multisig_address);
  const count = Number(await contract.getTransactionCount().call());
  const txHash = await confirmTron(row, tronWeb, Math.max(0, count - 1));
  await recordOnchainState(row.id, Math.max(0, count - 1), txHash, tronWeb.defaultAddress.base58);
  return { txIndex: Math.max(0, count - 1), txHash };
}

async function recordOnchainState(id, txIndex, txHash, approver) {
  // Existing endpoint records the wallet approval in the operational ledger.
  // The actual authorization remains on-chain in the GENERAL_POOL multisig.
  const data = await indexerFetch(`/api/disburse/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({
      approver,
      onchain_tx_index: txIndex,
      onchain_tx_hash: txHash
    })
  });
  return data;
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
            <th>امضاها</th>
            <th>وضعیت</th>
            <th>عملیات</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const signatures = `${r.confirmations_count || 0}/${r.required_signatures || 1}`;
            const action = r.multisig_address
              ? (r.onchain_tx_index == null ? 'ایجاد تراکنش' : 'تأیید با کیف پول')
              : 'نیازمند Multisig';

            return `
              <tr>
                <td>${r.id}</td>
                <td><code>${r.project_id}</code></td>
                <td>${r.network_id}</td>
                <td><strong>${formatUsdt(r.amount_raw)}</strong></td>
                <td style="font-size:11px;">${shortAddr(r.from_address)} → ${shortAddr(r.to_address)}</td>
                <td>${signatures}</td>
                <td>${statusBadge(r.status)}</td>
                <td>
                  <button type="button" class="btn-secondary btn-sm" data-disburse-wallet="${r.id}">${action}</button>
                  <button type="button" class="btn-secondary btn-sm" data-disburse-detail="${r.id}">جزئیات</button>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#e74c3c;">خطا: ${e.message}</p>`;
  }
}

export async function approveDisburse(id) {
  try {
    const data = await indexerFetch(`/api/disburse/${id}`);
    if (!data.disbursement) throw new Error('درخواست یافت نشد.');
    await walletAction(data.disbursement);
    alert('تراکنش کیف پول ثبت شد. وضعیت پس از تأیید بلاکچین به‌روزرسانی می‌شود.');
    await loadDisbursePending();
    await loadDisburseDetail(id);
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
      <pre style="background:#f8f9fa;padding:12px;border-radius:8px;overflow:auto;font-size:12px;">${JSON.stringify(d, null, 2)}</pre>`;
  } catch (e) {
    box.innerHTML = `<p style="color:#e74c3c;">${e.message}</p>`;
  }
}

export function initDisbursePanel() {
  hideLegacyControls();
  el('disburseRefreshBtn')?.addEventListener('click', () => loadDisbursePending());
  el('disburseNetworkFilter')?.addEventListener('change', () => loadDisbursePending());

  el('disbursePendingList')?.addEventListener('click', e => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const aid = t.getAttribute('data-disburse-wallet');
    const did = t.getAttribute('data-disburse-detail');

    if (aid) approveDisburse(aid);
    if (did) loadDisburseDetail(did);
  });
}

window.loadDisbursePending = loadDisbursePending;
window.approveDisburse = approveDisburse;
