// js/app.js
import { NETWORKS, ACTIVE_NETWORKS } from './config/networks.js';
import { NetworkManager } from './core/NetworkManager.js';
import { ContractManager } from './core/ContractManager.js';
import { ProjectManager } from './core/ProjectManager.js';

// نمونه‌سازی
const networkManager = new NetworkManager();
const contractManager = new ContractManager(networkManager);
const projectManager = new ProjectManager();

// State
let currentProjectId = '';
let selectedNetwork = 'polygon_amoy';

// ============ UI Functions ============

function renderNetworkTabs() {
  const container = document.querySelector('.network-tabs');
  container.innerHTML = '';

  ACTIVE_NETWORKS.forEach(network => {
    const tab = document.createElement('button');
    tab.className = `network-tab ${network.id === selectedNetwork ? 'active' : ''}`;
    tab.dataset.network = network.id;
    tab.innerHTML = `
      <span class="network-icon">${network.icon}</span>
      <span class="network-name">${network.name}</span>
      <span class="network-badge" style="background:${network.color}">${network.isTestnet ? 'تست' : 'مایننت'}</span>
    `;
    tab.onclick = () => selectNetwork(network.id);
    container.appendChild(tab);
  });
}

function selectNetwork(networkId) {
  selectedNetwork = networkId;
  renderNetworkTabs();
  
  // به‌روزرسانی وضعیت اتصال
  updateConnectionStatus();
  
  // بارگذاری مجدد جدول
  loadProjectsTable();
}

async function connectToNetwork() {
  const networkId = selectedNetwork;
  const statusEl = document.getElementById('connectionStatus');
  const btnEl = document.getElementById('connectBtn');

  try {
    btnEl.disabled = true;
    btnEl.textContent = '⏳ در حال اتصال...';
    statusEl.textContent = 'در حال اتصال...';

    await networkManager.connectNetwork(networkId);
    await contractManager.initFactory();

    statusEl.innerHTML = `
      <span style="color: #27ae60;">✅ متصل شد</span>
      <br>
      <small>شبکه: ${NETWORKS[networkId].name}</small>
      <br>
      <small>آدرس: ${networkManager.getConnection().account.slice(0, 6)}...${networkManager.getConnection().account.slice(-4)}</small>
    `;
    btnEl.textContent = '✅ متصل';
    btnEl.style.background = '#27ae60';

  } catch (error) {
    statusEl.innerHTML = `<span style="color: #e74c3c;">❌ ${error.message}</span>`;
    btnEl.textContent = '🔄 اتصال مجدد';
    btnEl.disabled = false;
  }
}

function updateConnectionStatus() {
  const statusEl = document.getElementById('connectionStatus');
  if (networkManager.isConnected) {
    const network = networkManager.getCurrentNetwork();
    const account = networkManager.getConnection().account;
    statusEl.innerHTML = `
      <span style="color: #27ae60;">✅ متصل به ${network.name}</span>
      <br>
      <small>${account.slice(0, 6)}...${account.slice(-4)}</small>
    `;
  } else {
    statusEl.innerHTML = `<span style="color: #95a5a6;">⏳ متصل نیستید</span>`;
  }
}

// ============ Create Fund ============

async function createFund() {
  const projectId = document.getElementById('projectId').value.trim();
  const ownershipType = document.querySelector('.ownership-tab.active')?.dataset.type || 'single';

  if (!projectId) {
    return showError('لطفاً ProjectID را وارد کنید');
  }

  // بررسی وجود پروژه در JSON
  try {
    const project = await projectManager.getProjectById(projectId);
    if (!project) {
      return showError(`پروژه ${projectId} در سیستم یافت نشد`);
    }
  } catch (error) {
    return showError('خطا در بررسی پروژه: ' + error.message);
  }

  // بررسی اتصال
  if (!networkManager.isConnected) {
    return showError('لطفاً ابتدا به شبکه متصل شوید');
  }

  // دریافت اطلاعات مالکیت
  let owners = [];
  let requiredSigs = 1;

  if (ownershipType === 'single') {
    const owner = document.getElementById('singleOwnerAddress').value.trim();
    if (!isValidAddress(owner, selectedNetwork)) {
      return showError('آدرس مالک معتبر نیست');
    }
    owners = [owner];
  } else {
    const ownerInputs = document.querySelectorAll('#ownersContainer .owner-input');
    owners = Array.from(ownerInputs)
      .map(input => input.value.trim())
      .filter(addr => isValidAddress(addr, selectedNetwork));
    
    if (owners.length === 0) {
      return showError('حداقل یک مالک معتبر وارد کنید');
    }

    requiredSigs = parseInt(document.getElementById('requiredSigs').value) || 2;
    if (requiredSigs > owners.length || requiredSigs < 1) {
      return showError('تعداد امضا نامعتبر است');
    }
  }

  // نمایش لودینگ
  const btn = document.querySelector('.btn-create');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ در حال ساخت...';

  try {
    // ساخت خزانه
    let tx;
    if (ownershipType === 'single') {
      tx = await contractManager.createSingleOwnerFund(projectId, owners[0]);
    } else {
      tx = await contractManager.createMultisigFund(projectId, owners, requiredSigs);
    }

    // استخراج اطلاعات
    const event = tx.events?.FundCreated?.returnValues || tx.logs?.[0]?.data;
    const fundAddress = event?.fundAddress || event?.fundAddress;
    const ownerOrMultisig = event?.ownerOrMultisig || event?.ownerOrMultisig;
    const isMultisig = event?.isMultisig || false;

    // به‌روزرسانی JSON
    const fundData = {
      address: fundAddress,
      multisigAddress: isMultisig ? ownerOrMultisig : null,
      owners: owners,
      requiredSignatures: requiredSigs
    };

    await projectManager.updateProjectFunds(projectId, selectedNetwork, fundData);
    const updatedJson = await projectManager.saveProjects();

    // نمایش نتیجه
    showSuccess(projectId, fundAddress, ownerOrMultisig, isMultisig, updatedJson);

    // بارگذاری مجدد جدول
    await loadProjectsTable();

  } catch (error) {
    console.error(error);
    showError('خطا در ساخت خزانه: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ============ Helper Functions ============

function isValidAddress(address, networkId) {
  const network = NETWORKS[networkId];
  if (!network) return false;
  
  if (network.type === 'EVM') {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
  } else if (network.type === 'TVM') {
    return /^T[a-zA-Z0-9]{33}$/.test(address);
  }
  return false;
}

function showError(message) {
  const result = document.getElementById('createResult');
  result.style.display = 'block';
  result.style.background = '#fde8e8';
  result.style.border = '2px solid #e74c3c';
  result.innerHTML = `<span style="color: #e74c3c;">❌ ${message}</span>`;
}

function showSuccess(projectId, fundAddress, ownerAddress, isMultisig, json) {
  const result = document.getElementById('createResult');
  result.style.display = 'block';
  result.style.background = '#e8f5e9';
  result.style.border = '2px solid #27ae60';
  
  const network = NETWORKS[selectedNetwork];
  
  result.innerHTML = `
    <h3 style="color: #27ae60;">✅ خزانه با موفقیت ساخته شد!</h3>
    <p><strong>پروژه:</strong> ${projectId}</p>
    <p><strong>شبکه:</strong> ${network.icon} ${network.name}</p>
    <p><strong>آدرس خزانه:</strong> 
      <a href="${network.explorerUrl}/address/${fundAddress}" target="_blank">${fundAddress}</a>
    </p>
    ${isMultisig ? `<p><strong>آدرس Multisig:</strong> <a href="${network.explorerUrl}/address/${ownerAddress}" target="_blank">${ownerAddress}</a></p>` : ''}
    <p><strong>JSON به‌روز شده:</strong></p>
    <textarea id="jsonOutput" style="width:100%;height:300px;font-family:monospace;font-size:12px;">${json}</textarea>
    <div style="margin-top:10px;">
      <button onclick="copyJSON()">📋 کپی JSON</button>
      <button onclick="downloadJSON()">💾 دانلود JSON</button>
      <button onclick="pushToGitHub()">🚀 آپلود به GitHub</button>
    </div>
  `;
}

// ============ Table Functions ============

async function loadProjectsTable() {
  try {
    const projects = await projectManager.loadProjects();
    const tbody = document.querySelector('#projectsTable tbody');
    tbody.innerHTML = '';

    // فیلتر بر اساس شبکه
    const networkFilter = document.getElementById('networkFilter')?.value || 'all';

    projects.features.forEach(f => {
      const attr = f.attributes;
      
      // فیلتر
      if (networkFilter !== 'all') {
        const funds = attr.funds || {};
        if (!funds[networkFilter] || !funds[networkFilter].address) {
          return;
        }
      }

      const row = document.createElement('tr');
      
      // ستون ProjectID
      const idCell = document.createElement('td');
      idCell.textContent = attr.ProjectID;
      row.appendChild(idCell);

      // ستون نام پروژه
      const nameCell = document.createElement('td');
      nameCell.textContent = attr['نام پروژه'] || 'نامشخص';
      row.appendChild(nameCell);

      // ستون هدف
      const targetCell = document.createElement('td');
      targetCell.textContent = attr['targetAmount(USDT)']?.toLocaleString() || '0';
      row.appendChild(targetCell);

      // ستون جمع‌آوری شده
      const raisedCell = document.createElement('td');
      raisedCell.textContent = attr.raisedAmount?.toLocaleString() || '0';
      row.appendChild(raisedCell);

      // ستون‌های شبکه‌ها
      ACTIVE_NETWORKS.forEach(network => {
        const cell = document.createElement('td');
        const funds = attr.funds || {};
        const fund = funds[network.id];
        
        if (fund && fund.address) {
          cell.innerHTML = `
            <span style="color: #27ae60;">✅</span>
            <br>
            <small>${fund.address.slice(0, 6)}...${fund.address.slice(-4)}</small>
          `;
        } else {
          cell.innerHTML = `<span style="color: #95a5a6;">❌</span>`;
        }
        cell.style.fontSize = '12px';
        row.appendChild(cell);
      });

      // ستون وضعیت
      const statusCell = document.createElement('td');
      const hasAnyFund = Object.values(attr.funds || {}).some(f => f && f.address);
      statusCell.innerHTML = hasAnyFund ? 
        '<span style="color:#27ae60;">✅ فعال</span>' : 
        '<span style="color:#f39c12;">⏳ در انتظار</span>';
      row.appendChild(statusCell);

      // ستون عملیات
      const actionCell = document.createElement('td');
      actionCell.innerHTML = `
        <button onclick="fillProjectId('${attr.ProjectID}')" style="padding:4px 8px;font-size:11px;">
          📝 انتخاب
        </button>
      `;
      row.appendChild(actionCell);

      tbody.appendChild(row);
    });

  } catch (error) {
    console.error('خطا در بارگذاری جدول:', error);
  }
}

// ============ Event Listeners ============

document.addEventListener('DOMContentLoaded', () => {
  // رندر شبکه‌ها
  renderNetworkTabs();
  
  // رویدادهای ساخت خزانه
  document.querySelector('.btn-create')?.addEventListener('click', createFund);
  
  // بارگذاری اولیه جدول
  loadProjectsTable();

  // نمایش/مخفی کردن فیلدهای مالکیت
  document.querySelectorAll('.ownership-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.ownership-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      const type = this.dataset.type;
      document.getElementById('singleOwnerFields').style.display = type === 'single' ? 'block' : 'none';
      document.getElementById('multisigFields').style.display = type === 'multisig' ? 'block' : 'none';
    });
  });

  // دکمه اتصال
  document.getElementById('connectBtn')?.addEventListener('click', connectToNetwork);
});

// Global functions for inline onclick
window.selectNetwork = selectNetwork;
window.loadProjectsTable = loadProjectsTable;
window.createFund = createFund;
window.fillProjectId = (id) => {
  document.getElementById('projectId').value = id;
};
window.copyJSON = () => {
  const textarea = document.getElementById('jsonOutput');
  navigator.clipboard.writeText(textarea.value);
  alert('✅ JSON کپی شد!');
};
window.downloadJSON = () => {
  const textarea = document.getElementById('jsonOutput');
  const blob = new Blob([textarea.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Projects.json';
  a.click();
  URL.revokeObjectURL(url);
};
window.pushToGitHub = async () => {
  const textarea = document.getElementById('jsonOutput');
  try {
    await projectManager.pushToGitHub(textarea.value);
    alert('✅ فایل با موفقیت به GitHub آپلود شد!');
  } catch (error) {
    alert('❌ خطا در آپلود: ' + error.message);
  }
};
