// js/app.js
// Phase 1+2: بدون CLC — استفاده از getFullNetwork / ACTIVE_NETWORKS
import {
  NETWORKS,
  ACTIVE_NETWORKS,
  getFullNetwork,
  toTronBase58 as toTronBase58FromConfig
} from './config/networks.js';
import { NetworkManager } from './core/NetworkManager.js';
import { ContractManager } from './core/ContractManager.js';
import { ProjectManager } from './core/ProjectManager.js';
import { getAdminToken, startAdminLogin, clearAdminAuth } from './core/AdminAuth.js';
import { setupAddProject } from './addProject.js';

// نرمال‌سازی آدرس Tron (از helper مشترک config)
function toTronBase58(address) {
  return toTronBase58FromConfig(address);
}

function normalizeAddressesForNetwork(fundAddress, ownerOrMultisig, owners) {
  if (!networkManager.isTVM()) {
    return { fundAddress, ownerOrMultisig, owners };
  }
  return {
    fundAddress: toTronBase58(fundAddress),
    ownerOrMultisig: ownerOrMultisig ? toTronBase58(ownerOrMultisig) : ownerOrMultisig,
    owners: (owners || []).map(a => toTronBase58(a))
  };
}


// ============================================
// احراز هویت ادمین (رمز فقط در session نگه داشته میشه)
// ============================================
// احراز هویت با GitHub OAuth؛ توکن فقط در حافظه صفحه می‌ماند
function ensureAdminAuth() {
    return Boolean(getAdminToken());
}

window.ensureAdminAuth = ensureAdminAuth;

document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('adminLoginBtn');
    const status = document.getElementById('adminAuthStatus');

    const updateStatus = () => {
        const loggedIn = Boolean(getAdminToken());

        if (status) {
            status.textContent = loggedIn
                ? '✅ ورود ادمین تأیید شد'
                : '🔒 ورود ادمین لازم است';
        }

        if (loginButton) {
            loginButton.textContent = loggedIn
                ? 'خروج ادمین'
                : 'ورود با GitHub';
        }
    };

    window.addEventListener('classchain-admin-auth-changed', updateStatus);

    loginButton?.addEventListener('click', () => {
        if (getAdminToken()) {
            clearAdminAuth();
            updateStatus();
        } else {
            startAdminLogin();
        }
    });

    updateStatus();
});

// اجرای فوری هنگام بارگذاری صفحه
ensureAdminAuth();

// در دسترس بودن برای دکمه‌ی احتمالی "تغییر رمز" در آینده
window.ensureAdminAuth = ensureAdminAuth;
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
        const network = getFullNetwork(networkId) || NETWORKS[networkId];

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

        // بلوک تراکنش ساخت خزانه = مبدا canonical اسکن
        const scanFromBlock = await contractManager.getTransactionBlock(tx);
        console.log(`🔎 scanFromBlock = ${scanFromBlock}`);
        
        // ============================================
        // 🔍 استخراج آدرس خزانه (رویداد / Tron log / mapping کارخانه)
        // ============================================
        console.log('📦 تراکنش کامل:', tx);

        const resolved = await contractManager.resolveFundAddressAfterCreate(projectId, tx);
        let fundAddress = resolved.fundAddress;
        let ownerOrMultisig = resolved.ownerOrMultisig;
        let isMultisig = resolved.isMultisig;

        console.log('🔍 نتیجه resolveFundAddressAfterCreate:', resolved);

        // ============================================
        // ✅ بررسی نهایی
        // ============================================
        if (!fundAddress) {
            console.error('❌ آدرس خزانه پیدا نشد!');
            console.error('📦 تراکنش:', tx);
            throw new Error('آدرس خزانه دریافت نشد. لطفاً تراکنش را در Explorer بررسی کنید.');
        }
        
        // اگر کاربر Multisig انتخاب کرده، حتماً isMultisig را true کن
        if (ownershipType === 'multisig') {
            isMultisig = true;
        }
        
        // 🔑 Fallback: اگر مولتی‌سیگ است و آدرس از رویداد نیامد → از owner() خزانه بخوان
        if (isMultisig && !ownerOrMultisig && fundAddress) {
            try {
                ownerOrMultisig = await contractManager.getFundOwner(fundAddress);
                console.log('✅ مالک/Multisig از owner() خزانه:', ownerOrMultisig);
            } catch (e) {
                console.warn('خطا در خواندن owner خزانه:', e);
            }
        }
        
        // نرمال‌سازی آدرس‌های Tron به Base58
        ({ fundAddress, ownerOrMultisig, owners } = normalizeAddressesForNetwork(
            fundAddress, ownerOrMultisig, owners
        ));

        console.log(`✅ آدرس خزانه (نرمال‌شده): ${fundAddress}`);
        if (ownerOrMultisig) {
            console.log(`👤 مالک/Multisig (نرمال‌شده): ${ownerOrMultisig}`);
        }

        // به‌روزرسانی JSON
        const fundData = {
            address: fundAddress,
            multisigAddress: isMultisig ? ownerOrMultisig : null,
            owners: owners,
            requiredSignatures: requiredSigs,
            scanFromBlock
        };

        await projectManager.updateProjectFunds(projectId, selectedNetwork, fundData);
        const updatedJson = await projectManager.saveProjects();

        // نمایش نتیجه
        showSuccess(projectId, fundAddress, ownerOrMultisig, isMultisig, updatedJson);

        // بارگذاری مجدد جدول
        if (typeof loadProjectsTable === 'function') {
            await loadProjectsTable(false);
        }

    } catch (error) {
        console.error('❌ خطا:', error);
        showError('خطا در ساخت خزانه: ' + (error.message || 'نامشخص'));
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}
