// js/app.js
import { NETWORKS, ACTIVE_NETWORKS } from './config/networks.js';
import { NetworkManager } from './core/NetworkManager.js';
import { ContractManager } from './core/ContractManager.js';
import { ProjectManager } from './core/ProjectManager.js';

// ============================================
// نمونه‌سازی از کلاس‌ها
// ============================================
const networkManager = new NetworkManager();
const contractManager = new ContractManager(networkManager);
const projectManager = new ProjectManager();

// State
let currentProjectId = '';
let selectedNetwork = 'polygon_amoy';

// ============================================
// توابع اصلی
// ============================================

// رندر کردن تب‌های شبکه
function renderNetworkTabs() {
    const container = document.querySelector('.network-tabs');
    if (!container) {
        console.error('عنصر network-tabs یافت نشد');
        return;
    }
    
    container.innerHTML = '';

    ACTIVE_NETWORKS.forEach(network => {
        const tab = document.createElement('button');
        tab.className = `network-tab ${network.id === selectedNetwork ? 'active' : ''}`;
        tab.dataset.network = network.id;
        tab.innerHTML = `
            <span class="network-icon">${network.icon || '🌐'}</span>
            <span class="network-name">${network.name}</span>
            <span class="network-badge" style="background:${network.color || '#666'}">${network.isTestnet ? 'تست' : 'مایننت'}</span>
        `;
        tab.onclick = () => selectNetwork(network.id);
        container.appendChild(tab);
    });
}

// انتخاب شبکه
function selectNetwork(networkId) {
    selectedNetwork = networkId;
    renderNetworkTabs();
    updateConnectionStatus();
    
    // بارگذاری مجدد جدول
    if (typeof loadProjectsTable === 'function') {
        loadProjectsTable();
    }
}

// اتصال به شبکه
async function connectToNetwork() {
    const networkId = selectedNetwork;
    const statusEl = document.getElementById('connectionStatus');
    const btnEl = document.getElementById('connectBtn');

    if (!statusEl || !btnEl) {
        console.error('عناصر اتصال یافت نشدند');
        return;
    }

    try {
        btnEl.disabled = true;
        btnEl.textContent = '⏳ در حال اتصال...';
        statusEl.textContent = 'در حال اتصال...';
        statusEl.style.color = '#f39c12';

        // اتصال به شبکه
        await networkManager.connectNetwork(networkId);
        await contractManager.initFactory();

        const connection = networkManager.getConnection();
        const network = NETWORKS[networkId];

        statusEl.innerHTML = `
            <span style="color: #27ae60;">✅ متصل شد</span>
            <br>
            <small>شبکه: ${network.name}</small>
            <br>
            <small>آدرس: ${connection.account.slice(0, 6)}...${connection.account.slice(-4)}</small>
        `;
        statusEl.style.color = '#27ae60';
        btnEl.textContent = '✅ متصل';
        btnEl.style.background = '#27ae60';
        btnEl.disabled = false;

        // بارگذاری مجدد جدول
        if (typeof loadProjectsTable === 'function') {
            await loadProjectsTable();
        }

    } catch (error) {
        console.error('خطا در اتصال:', error);
        statusEl.innerHTML = `<span style="color: #e74c3c;">❌ ${error.message || 'خطا در اتصال'}</span>`;
        statusEl.style.color = '#e74c3c';
        btnEl.textContent = '🔄 اتصال مجدد';
        btnEl.disabled = false;
        btnEl.style.background = '#3498db';
    }
}

// بروزرسانی وضعیت اتصال
function updateConnectionStatus() {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;

    if (networkManager.isConnected) {
        const network = networkManager.getCurrentNetwork();
        const connection = networkManager.getConnection();
        statusEl.innerHTML = `
            <span style="color: #27ae60;">✅ متصل به ${network.name}</span>
            <br>
            <small>${connection.account.slice(0, 6)}...${connection.account.slice(-4)}</small>
        `;
        statusEl.style.color = '#27ae60';
    } else {
        statusEl.innerHTML = `<span style="color: #95a5a6;">⏳ متصل نیستید</span>`;
        statusEl.style.color = '#95a5a6';
    }
}

// ============================================
// توابع ساخت خزانه
// ============================================

async function createFund() {
    const projectId = document.getElementById('projectId')?.value?.trim();
    if (!projectId) {
        showError('لطفاً ProjectID را وارد کنید');
        return;
    }

    // بررسی اتصال
    if (!networkManager.isConnected) {
        showError('لطفاً ابتدا به شبکه متصل شوید');
        return;
    }

    // تشخیص نوع مالکیت
    const activeTab = document.querySelector('.ownership-tab.active');
    const ownershipType = activeTab?.dataset?.type || 'single';

    // دریافت اطلاعات مالک
    let owners = [];
    let requiredSigs = 1;

    if (ownershipType === 'single') {
        const owner = document.getElementById('singleOwnerAddress')?.value?.trim();
        if (!owner || !isValidAddress(owner)) {
            showError('آدرس مالک معتبر نیست');
            return;
        }
        owners = [owner];
    } else {
        const ownerInputs = document.querySelectorAll('#ownersContainer .owner-input');
        owners = Array.from(ownerInputs)
            .map(input => input.value.trim())
            .filter(addr => addr && isValidAddress(addr));
        
        if (owners.length === 0) {
            showError('حداقل یک مالک معتبر وارد کنید');
            return;
        }

        const sigsInput = document.getElementById('requiredSigs');
        requiredSigs = parseInt(sigsInput?.value) || 2;
        if (requiredSigs > owners.length || requiredSigs < 1) {
            showError('تعداد امضا نامعتبر است');
            return;
        }
    }

    // نمایش لودینگ
    const btn = document.querySelector('.btn-create');
    if (!btn) return;
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

        // استخراج اطلاعات از رویداد
        const event = tx.events?.FundCreated?.returnValues || {};
        const fundAddress = event.fundAddress || event[1];
        const ownerOrMultisig = event.ownerOrMultisig || event[2];
        const isMultisig = event.isMultisig || false;

        if (!fundAddress) {
            throw new Error('آدرس خزانه دریافت نشد');
        }

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
        if (typeof loadProjectsTable === 'function') {
            await loadProjectsTable();
        }

    } catch (error) {
        console.error('خطا:', error);
        showError('خطا در ساخت خزانه: ' + (error.message || 'نامشخص'));
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// ============================================
// توابع کمکی
// ============================================

function isValidAddress(address) {
    if (!address) return false;
    const network = NETWORKS[selectedNetwork];
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
    if (!result) return;
    result.style.display = 'block';
    result.style.background = '#fde8e8';
    result.style.border = '2px solid #e74c3c';
    result.style.padding = '20px';
    result.style.borderRadius = '10px';
    result.innerHTML = `<span style="color: #e74c3c;">❌ ${message}</span>`;
}

function showSuccess(projectId, fundAddress, ownerAddress, isMultisig, json) {
    const result = document.getElementById('createResult');
    if (!result) return;
    result.style.display = 'block';
    result.style.background = '#e8f5e9';
    result.style.border = '2px solid #27ae60';
    result.style.padding = '20px';
    result.style.borderRadius = '10px';
    
    const network = NETWORKS[selectedNetwork];
    
    result.innerHTML = `
        <h3 style="color: #27ae60; margin-top: 0;">✅ خزانه با موفقیت ساخته شد!</h3>
        <p><strong>پروژه:</strong> ${projectId}</p>
        <p><strong>شبکه:</strong> ${network?.icon || '🌐'} ${network?.name || 'نامشخص'}</p>
        <p><strong>آدرس خزانه:</strong> 
            <a href="${network?.explorerUrl || '#'}/address/${fundAddress}" target="_blank" style="color: #3498db;">${fundAddress}</a>
        </p>
        ${isMultisig ? `<p><strong>آدرس Multisig:</strong> <a href="${network?.explorerUrl || '#'}/address/${ownerAddress}" target="_blank" style="color: #3498db;">${ownerAddress}</a></p>` : ''}
        <p><strong>JSON به‌روز شده:</strong></p>
        <textarea id="jsonOutput" style="width:100%;height:250px;font-family:monospace;font-size:12px;direction:ltr;padding:10px;border:1px solid #ddd;border-radius:6px;">${json}</textarea>
        <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
            <button onclick="window.copyJSON()" style="padding:8px 16px;background:#3498db;color:white;border:none;border-radius:6px;cursor:pointer;">📋 کپی JSON</button>
            <button onclick="window.downloadJSON()" style="padding:8px 16px;background:#27ae60;color:white;border:none;border-radius:6px;cursor:pointer;">💾 دانلود JSON</button>
            <button onclick="window.pushToGitHub()" style="padding:8px 16px;background:#6c5ce7;color:white;border:none;border-radius:6px;cursor:pointer;">🚀 آپلود به GitHub</button>
        </div>
    `;
}

// ============================================
// توابع بارگذاری جدول
// ============================================

async function loadProjectsTable() {
    try {
        await projectManager.loadProjects();
        const projects = projectManager.projects;
        const tbody = document.querySelector('#projectsTable tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        const networkFilter = document.getElementById('networkFilter')?.value || 'all';

        projects.features.forEach(f => {
            const attr = f.attributes;
            
            // فیلتر بر اساس شبکه
            if (networkFilter !== 'all') {
                const funds = attr.funds || {};
                if (!funds[networkFilter] || !funds[networkFilter].address) {
                    return;
                }
            }

            const row = document.createElement('tr');
            
            // ProjectID
            const idCell = document.createElement('td');
            idCell.textContent = attr.ProjectID || '---';
            row.appendChild(idCell);

            // نام پروژه
            const nameCell = document.createElement('td');
            nameCell.textContent = attr['نام پروژه'] || 'نامشخص';
            row.appendChild(nameCell);

            // هدف
            const targetCell = document.createElement('td');
            targetCell.textContent = attr['targetAmount(USDT)']?.toLocaleString() || '0';
            row.appendChild(targetCell);

            // جمع‌آوری شده
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
                        <small style="font-size:10px;">${fund.address.slice(0, 6)}...${fund.address.slice(-4)}</small>
                    `;
                } else {
                    cell.innerHTML = `<span style="color: #95a5a6;">❌</span>`;
                }
                cell.style.fontSize = '12px';
                row.appendChild(cell);
            });

            // وضعیت
            const statusCell = document.createElement('td');
            const hasAnyFund = Object.values(attr.funds || {}).some(f => f && f.address);
            statusCell.innerHTML = hasAnyFund ? 
                '<span style="color:#27ae60;">✅ فعال</span>' : 
                '<span style="color:#f39c12;">⏳ در انتظار</span>';
            row.appendChild(statusCell);

            // عملیات
            const actionCell = document.createElement('td');
            const id = attr.ProjectID || '';
            actionCell.innerHTML = `
                <button onclick="window.fillProjectId('${id}')" style="padding:4px 10px;font-size:11px;background:#3498db;color:white;border:none;border-radius:4px;cursor:pointer;">
                    📝 انتخاب
                </button>
            `;
            row.appendChild(actionCell);

            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('خطا در بارگذاری جدول:', error);
        const tbody = document.querySelector('#projectsTable tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#e74c3c;">خطا در بارگذاری داده‌ها</td></tr>`;
        }
    }
}

// ============================================
// توابع Global (برای استفاده در onclick)
// ============================================

window.selectNetwork = selectNetwork;
window.connectToNetwork = connectToNetwork;
window.createFund = createFund;
window.loadProjectsTable = loadProjectsTable;
window.fillProjectId = (id) => {
    const input = document.getElementById('projectId');
    if (input) input.value = id;
};
window.copyJSON = () => {
    const textarea = document.getElementById('jsonOutput');
    if (!textarea) return;
    navigator.clipboard.writeText(textarea.value).then(() => {
        alert('✅ JSON کپی شد!');
    }).catch(() => {
        // Fallback
        textarea.select();
        document.execCommand('copy');
        alert('✅ JSON کپی شد!');
    });
};
window.downloadJSON = () => {
    const textarea = document.getElementById('jsonOutput');
    if (!textarea) return;
    const blob = new Blob([textarea.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Projects.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
window.pushToGitHub = async () => {
    const textarea = document.getElementById('jsonOutput');
    if (!textarea) return;
    try {
        await projectManager.pushToGitHub(textarea.value);
        alert('✅ فایل با موفقیت به GitHub آپلود شد!');
    } catch (error) {
        alert('❌ خطا در آپلود: ' + (error.message || 'نامشخص'));
    }
};

// ============================================
// رویدادهای DOM
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 Admin Panel راه‌اندازی شد');
    
    // رندر تب‌های شبکه
    renderNetworkTabs();
    
    // رویدادهای ساخت خزانه
    const createBtn = document.querySelector('.btn-create');
    if (createBtn) {
        createBtn.addEventListener('click', createFund);
    }

    // رویدادهای تب‌های مالکیت
    document.querySelectorAll('.ownership-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.ownership-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const type = this.dataset.type;
            const singleDiv = document.getElementById('singleOwnerFields');
            const multiDiv = document.getElementById('multisigFields');
            
            if (singleDiv) singleDiv.style.display = type === 'single' ? 'block' : 'none';
            if (multiDiv) multiDiv.style.display = type === 'multisig' ? 'block' : 'none';
        });
    });

    // دکمه اتصال
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', connectToNetwork);
    }

    // بارگذاری اولیه جدول
    loadProjectsTable();

    // تنظیم فیلتر شبکه
    const networkFilter = document.getElementById('networkFilter');
    if (networkFilter) {
        networkFilter.addEventListener('change', loadProjectsTable);
        // پر کردن گزینه‌های فیلتر
        ACTIVE_NETWORKS.forEach(n => {
            const option = document.createElement('option');
            option.value = n.id;
            option.textContent = n.name;
            networkFilter.appendChild(option);
        });
    }

    // افزودن owner (برای Multisig)
    const addOwnerBtn = document.querySelector('.btn-add');
    if (addOwnerBtn) {
        addOwnerBtn.addEventListener('click', () => {
            const container = document.getElementById('ownersContainer');
            if (!container) return;
            const div = document.createElement('div');
            div.className = 'owner-item';
            div.innerHTML = `
                <input type="text" class="owner-input" placeholder="آدرس مالک جدید">
                <button onclick="this.parentElement.remove()" class="btn-remove" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;">❌</button>
            `;
            container.appendChild(div);
        });
    }

    // ذخیره توکن GitHub
    const saveTokenBtn = document.querySelector('[onclick="saveGitHubToken()"]');
    if (saveTokenBtn) {
        saveTokenBtn.addEventListener('click', () => {
            const input = document.getElementById('githubToken');
            if (input && input.value) {
                localStorage.setItem('github_token', input.value);
                alert('✅ توکن ذخیره شد!');
                input.value = '';
            }
        });
    }
});

console.log('✅ app.js بارگذاری شد');
