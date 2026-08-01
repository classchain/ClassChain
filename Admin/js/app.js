// js/app.js
import { NETWORKS, ACTIVE_NETWORKS } from './config/networks.js';
import { NetworkManager } from './core/NetworkManager.js';
import { ContractManager } from './core/ContractManager.js';
import { ProjectManager } from './core/ProjectManager.js';


// ============================================
// نرمال‌سازی آدرس Tron به Base58 (T...)
// ورودی می‌تواند Base58، hex با 41، یا 0x باشد
// ============================================
function toTronBase58(address) {
  if (!address || typeof address !== 'string') return address;
  const trimmed = address.trim();
  if (/^T[a-zA-Z0-9]{33}$/.test(trimmed)) return trimmed;

  try {
    const tronWeb = window.tronWeb;
    if (!tronWeb || !tronWeb.address || typeof tronWeb.address.fromHex !== 'function') {
      console.warn('TronWeb برای تبدیل آدرس در دسترس نیست');
      return trimmed;
    }

    let hex = trimmed;
    if (hex.startsWith('0x') || hex.startsWith('0X')) {
      // 0x + 20 bytes → 41 + 20 bytes
      hex = '41' + hex.slice(2).toLowerCase();
    } else if (!hex.toLowerCase().startsWith('41') && /^[a-fA-F0-9]{40}$/.test(hex)) {
      hex = '41' + hex.toLowerCase();
    }

    return tronWeb.address.fromHex(hex);
  } catch (e) {
    console.warn('خطا در تبدیل آدرس به Base58:', trimmed, e);
    return trimmed;
  }
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
function ensureAdminAuth() {
  let key = sessionStorage.getItem('classchain_admin_key');
  if (!key) {
    key = prompt('🔐 رمز ادمین را وارد کنید:');
    if (key && key.trim()) {
      sessionStorage.setItem('classchain_admin_key', key.trim());
    } else {
      alert('بدون رمز ادمین، امکان ذخیره خزانه‌ها روی گیت‌هاب نخواهد بود.');
    }
  }
  return sessionStorage.getItem('classchain_admin_key');
}

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

        // ============================================
        // 🔍 استخراج آدرس خزانه از تراکنش
        // ============================================
        console.log('📦 تراکنش کامل:', tx);

        let fundAddress = null;
        let ownerOrMultisig = null;
        let isMultisig = false;

        // 1️⃣ روش اول: از رویدادها
        if (tx.events) {
            // رویداد FundCreated
            const fundCreated = tx.events.FundCreated;
            if (fundCreated) {
                const returnValues = fundCreated.returnValues || fundCreated.args || {};
                fundAddress = returnValues.fundAddress || returnValues[1];
                ownerOrMultisig = returnValues.ownerOrMultisig || returnValues[2];
                isMultisig = returnValues.isMultisig || false;
                console.log('✅ از رویداد FundCreated:', { fundAddress, ownerOrMultisig, isMultisig });
            }

            // اگر رویداد FundCreated نبود، همه رویدادها را بررسی کن
            if (!fundAddress) {
                for (const eventName in tx.events) {
                    const event = tx.events[eventName];
                    const args = event.returnValues || event.args || {};
                    console.log(`🔍 بررسی رویداد ${eventName}:`, args);

                    // بررسی فیلدهای احتمالی
                    if (args.fundAddress || args.fund) {
                        fundAddress = args.fundAddress || args.fund;
                        ownerOrMultisig = args.ownerOrMultisig || args.owner || args[1];
                        isMultisig = args.isMultisig || false;
                        console.log(`✅ از رویداد ${eventName}:`, { fundAddress, ownerOrMultisig, isMultisig });
                        break;
                    }
                }
            }
        }

        // 2️⃣ روش دوم: از Logs
        if (!fundAddress && tx.logs) {
            for (const log of tx.logs) {
                try {
                    // decode log if possible
                    if (log.topics && log.topics.length > 0) {
                        // بررسی event signature
                        const eventSignature = log.topics[0];
                        console.log(`🔍 بررسی log با signature: ${eventSignature}`);
                    }
                } catch (e) {
                    console.warn('خطا در decode log:', e);
                }
            }
        }

        // 3️⃣ روش سوم: از receipt
        if (!fundAddress && tx.receipt) {
            console.log('📋 Receipt:', tx.receipt);
            // اگر contractAddress در receipt باشد
            if (tx.receipt.contractAddress) {
                fundAddress = tx.receipt.contractAddress;
                console.log('✅ از receipt.contractAddress:', fundAddress);
            }
        }

        // 4️⃣ روش چهارم: از result (برای برخی نسخه‌های web3)
        if (!fundAddress && tx.result) {
            console.log('📋 Result:', tx.result);
            if (Array.isArray(tx.result) && tx.result.length > 0) {
                fundAddress = tx.result[0];
                console.log('✅ از result[0]:', fundAddress);
            }
        }

        // 5️⃣ روش پنجم: اگر هنوز آدرس پیدا نشد، از توابع قرارداد بخوان
        if (!fundAddress) {
            try {
                const contractAddress = await contractManager.getFundAddress(projectId);
                if (contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000') {
                    fundAddress = contractAddress;
                    console.log('✅ از getFundAddress:', fundAddress);
                }
            } catch (e) {
                console.warn('خطا در getFundAddress:', e);
            }
        }

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
        console.error('❌ خطا:', error);
        showError('خطا در ساخت خزانه: ' + (error.message || 'نامشخص'));
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// ============================================
// تابع بررسی پروژه
// ============================================

async function checkProject() {
    const projectIdInput = document.getElementById('projectId');
    const projectId = projectIdInput?.value?.trim();

    if (!projectId) {
        showError('لطفاً ProjectID را وارد کنید');
        return;
    }

    // نمایش لودینگ
    const resultDiv = document.getElementById('createResult');
    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.style.background = '#f8f9fa';
        resultDiv.style.border = '2px solid #3498db';
        resultDiv.innerHTML = `
            <div style="text-align:center;padding:20px;">
                <span style="font-size:24px;">⏳</span>
                <p>در حال جستجوی پروژه ${projectId}...</p>
            </div>
        `;
    }

    try {
        // بارگذاری پروژه‌ها
        await projectManager.loadProjects();
        const project = await projectManager.getProjectById(projectId);

        if (!project) {
            showError(`❌ پروژه ${projectId} در سیستم یافت نشد`);
            return;
        }

        const attr = project.attributes;
        const allFunds = projectManager.getAllFunds(project);
        const multisig = projectManager.getMultisigAddress(project);
        // ============================================
        // تشخیص اینکه آیا پروژه در شبکه فعلی خزانه دارد
        // ============================================
        const hasFundOnCurrentNetwork = projectManager.hasFund(project, selectedNetwork);
        // ساخت HTML نمایش اطلاعات
        let html = `
            <div style="padding:10px 0;">
                <h3 style="color: #2c3e50; margin-top: 0;">✅ پروژه پیدا شد</h3>
                <table style="width:100%;border-collapse:collapse;margin-top:10px;direction:rtl;">
                    <tr>
                        <td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">ProjectID:</td>
                        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${attr.ProjectID || '---'}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">نام پروژه:</td>
                        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${attr['نام پروژه'] || 'نامشخص'}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">استان:</td>
                        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${attr['استان'] || 'نامشخص'}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">هدف (USDT):</td>
                        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${attr['targetAmount(USDT)']?.toLocaleString() || '0'}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">وضعیت:</td>
                        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${attr.status || 'در انتظار'}</td>
                    </tr>
        `;

        // نمایش وضعیت خزانه‌ها در شبکه‌های مختلف

        // نمایش خزانه‌های موجود - با استفاده از تابع جدید
        const fundKeys = Object.keys(allFunds).filter(k => k !== '_multisig');
        if (fundKeys.length > 0) {
            html += `
                <tr>
                    <td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;" colspan="2">
                        <span style="color:#27ae60;">✅ خزانه‌های موجود (${fundKeys.length}):</span>
                    </td>
                </tr>
            `;
            fundKeys.forEach(networkId => {
                const fund = allFunds[networkId];
                const network = NETWORKS[networkId];
                const isCurrentNetwork = networkId === selectedNetwork;
                html += `
                    <tr style="${isCurrentNetwork ? 'background:#e8f5e9;' : ''}">
                        <td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;padding-right:20px;">
                            ${network?.icon || '🌐'} ${network?.name || networkId}
                            ${isCurrentNetwork ? '<span style="color:#27ae60;font-size:11px;"> (شبکه فعلی)</span>' : ''}
                        </td>
                        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;direction:ltr;">
                            <a href="${network?.explorerUrl || '#'}/address/${fund.address}" target="_blank" style="color:#3498db;">
                                ${fund.address.slice(0, 8)}...${fund.address.slice(-6)}
                            </a>
                            ${fund.multisigAddress ? `🔑 MultiSig` : ''}
                        </td>
                    </tr>
                `;
            });
        } else {
            html += `
                <tr>
                    <td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;" colspan="2">
                        <span style="color:#f39c12;">⏳ این پروژه هنوز خزانه‌ای ندارد</span>
                    </td>
                </tr>
            `;
        }

        html += `
                </table>
                <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;">
                    <button onclick="window.fillProjectId('${attr.ProjectID}')" style="padding:8px 16px;background:#3498db;color:white;border:none;border-radius:6px;cursor:pointer;">
                        📝 پر کردن فیلدها
                    </button>
        `;

        // ============================================
        // دکمه ساخت خزانه - فعال یا غیرفعال
        // ============================================
        if (hasFundOnCurrentNetwork) {
            // اگر خزانه در شبکه فعلی وجود دارد، دکمه غیرفعال
            const network = NETWORKS[selectedNetwork];
            html += `
                    <button style="padding:8px 16px;background:#95a5a6;color:white;border:none;border-radius:6px;cursor:not-allowed;" disabled>
                        ✅ خزانه در ${network?.name || 'این شبکه'} وجود دارد
                    </button>
            `;
        } else {
            // اگر خزانه در شبکه فعلی وجود ندارد، دکمه فعال
            html += `
                    <button onclick="window.createFundFromCheck()" style="padding:8px 16px;background:#27ae60;color:white;border:none;border-radius:6px;cursor:pointer;">
                        🚀 ساخت خزانه در شبکه ${NETWORKS[selectedNetwork]?.name || 'فعلی'}
                    </button>
            `;
        }

        html += `
                </div>
                <div style="margin-top:10px;padding:10px;background:#f8f9fa;border-radius:6px;font-size:12px;color:#666;">
                    💡 شبکه فعلی: ${NETWORKS[selectedNetwork]?.icon || '🌐'} ${NETWORKS[selectedNetwork]?.name || 'نامشخص'}
                    ${hasFundOnCurrentNetwork ? ' ✅ خزانه دارد' : ' ⏳ خزانه ندارد'}
                </div>
            </div>
        `;

        // نمایش نتیجه
        if (resultDiv) {
            resultDiv.style.display = 'block';
            resultDiv.style.background = '#e8f5e9';
            resultDiv.style.border = '2px solid #27ae60';
            resultDiv.innerHTML = html;
        }

        // پر کردن خودکار ProjectID در فیلد
        if (projectIdInput) {
            projectIdInput.value = attr.ProjectID;
        }

    } catch (error) {
        console.error('خطا در بررسی پروژه:', error);
        showError('خطا در بررسی پروژه: ' + (error.message || 'نامشخص'));
    }
}
// ============================================
// توابع کمکی
// ============================================

// ============================================
// ساخت خزانه از طریق دکمه بررسی
// ============================================
async function createFundFromCheck() {
    // دریافت ProjectID از فیلد
    const projectIdInput = document.getElementById('projectId');
    const projectId = projectIdInput?.value?.trim();

    if (!projectId) {
        showError('لطفاً ProjectID را وارد کنید');
        return;
    }

    // بررسی اتصال به شبکه
    if (!networkManager.isConnected) {
        showError('❌ لطفاً ابتدا به شبکه متصل شوید');
        return;
    }

    // بررسی اینکه آیا پروژه در شبکه فعلی خزانه دارد
    try {
        await projectManager.loadProjects();
        const project = await projectManager.getProjectById(projectId);

        if (!project) {
            showError(`پروژه ${projectId} یافت نشد`);
            return;
        }

        if (projectManager.hasFund(project, selectedNetwork)) {
            showError(`❌ پروژه ${projectId} در شبکه ${NETWORKS[selectedNetwork]?.name} قبلاً خزانه دارد`);
            return;
        }
    } catch (error) {
        showError('خطا در بررسی پروژه: ' + error.message);
        return;
    }

    // تشخیص نوع مالکیت از تب فعال
    const activeTab = document.querySelector('.ownership-tab.active');
    const ownershipType = activeTab?.dataset?.type || 'single';

    // دریافت اطلاعات مالک
    let owners = [];
    let requiredSigs = 1;

    if (ownershipType === 'single') {
        const owner = document.getElementById('singleOwnerAddress')?.value?.trim();
        if (!owner || !isValidAddress(owner)) {
            showError('❌ آدرس مالک معتبر نیست');
            return;
        }
        owners = [owner];
    } else {
        const ownerInputs = document.querySelectorAll('#ownersContainer .owner-input');
        owners = Array.from(ownerInputs)
            .map(input => input.value.trim())
            .filter(addr => addr && isValidAddress(addr));

        if (owners.length === 0) {
            showError('❌ حداقل یک مالک معتبر وارد کنید');
            return;
        }

        const sigsInput = document.getElementById('requiredSigs');
        requiredSigs = parseInt(sigsInput?.value) || 2;
        if (requiredSigs > owners.length || requiredSigs < 1) {
            showError('❌ تعداد امضا نامعتبر است');
            return;
        }
    }

    // نمایش لودینگ
    const btn = document.querySelector('.btn-create') || document.activeElement;
    if (btn) {
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ در حال ساخت...';
    }

    try {
        // ساخت خزانه
        let tx;
        if (ownershipType === 'single') {
            tx = await contractManager.createSingleOwnerFund(projectId, owners[0]);
        } else {
            tx = await contractManager.createMultisigFund(projectId, owners, requiredSigs);
        }

        // ============================================
        // 🔍 استخراج آدرس خزانه (همان کد بالا)
        // ============================================
        console.log('📦 تراکنش کامل:', tx);

        let fundAddress = null;
        let ownerOrMultisig = null;
        let isMultisig = false;

        // 1️⃣ از رویدادها
        if (tx.events) {
            const fundCreated = tx.events.FundCreated;
            if (fundCreated) {
                const returnValues = fundCreated.returnValues || fundCreated.args || {};
                fundAddress = returnValues.fundAddress || returnValues[1];
                ownerOrMultisig = returnValues.ownerOrMultisig || returnValues[2];
                isMultisig = returnValues.isMultisig || false;
            }

            if (!fundAddress) {
                for (const eventName in tx.events) {
                    const event = tx.events[eventName];
                    const args = event.returnValues || event.args || {};
                    if (args.fundAddress || args.fund) {
                        fundAddress = args.fundAddress || args.fund;
                        ownerOrMultisig = args.ownerOrMultisig || args.owner || args[1];
                        isMultisig = args.isMultisig || false;
                        break;
                    }
                }
            }
        }

        // 2️⃣ از receipt
        if (!fundAddress && tx.receipt?.contractAddress) {
            fundAddress = tx.receipt.contractAddress;
        }

        // 3️⃣ از getFundAddress
        if (!fundAddress) {
            try {
                const contractAddress = await contractManager.getFundAddress(projectId);
                if (contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000') {
                    fundAddress = contractAddress;
                }
            } catch (e) {
                console.warn('خطا در getFundAddress:', e);
            }
        }
        if (!fundAddress) {
            throw new Error('آدرس خزانه دریافت نشد');
        }

        // اگر کاربر Multisig انتخاب کرده، حتماً isMultisig را true کن
        if (ownershipType === 'multisig') {
            isMultisig = true;
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
            requiredSignatures: requiredSigs
        };

        await projectManager.updateProjectFunds(projectId, selectedNetwork, fundData);
        const updatedJson = await projectManager.saveProjects();

        // نمایش نتیجه
        showSuccess(projectId, fundAddress, ownerOrMultisig, isMultisig, updatedJson);

        // بارگذاری مجدد جدول و بررسی مجدد
        await loadProjectsTable();

        // بررسی مجدد پروژه برای نمایش وضعیت جدید
        await checkProject();

    } catch (error) {
        console.error('خطا:', error);
        showError('خطا در ساخت خزانه: ' + (error.message || 'نامشخص'));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🚀 ساخت خزانه';
        }
    }
}

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
        
        <hr style="margin: 20px 0; border: 1px solid #ddd;">
        
        <h4 style="color: #2c3e50;">📄 JSON به‌روز شده:</h4>
        <p style="font-size: 13px; color: #666; margin-bottom: 8px;">
            فایل Projects.json به‌روز شد. آن را کپی کنید یا از گزینه‌های زیر استفاده کنید:
        </p>
        <textarea id="jsonOutput" style="width:100%;height:300px;font-family:monospace;font-size:12px;direction:ltr;padding:10px;border:1px solid #ddd;border-radius:6px;background:#f8f9fa;">${json}</textarea>
        
        <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;">
            <button onclick="window.copyJSON()" style="padding:10px 20px;background:#3498db;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
                📋 کپی JSON
            </button>
            <button onclick="window.downloadJSON()" style="padding:10px 20px;background:#27ae60;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
                💾 دانلود فایل
            </button>
            <button onclick="window.pushToGitHub()" style="padding:10px 20px;background:#6c5ce7;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
                🚀 آپلود به GitHub
            </button>
            <button onclick="window.openJSON()" style="padding:10px 20px;background:#f39c12;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
                👁️ مشاهده در مرورگر
            </button>
        </div>
        
        <div style="margin-top:15px;padding:12px;background:#fff3cd;border-radius:6px;font-size:13px;color:#856404;">
            ⚠️ <strong>نکته:</strong> فایل JSON را در مسیر <code style="background:#fff;padding:2px 8px;border-radius:4px;">frontend/data/Projects.json</code> جایگزین کنید.
        </div>
    `;
}

function scrollToCreate() {
    const section = document.getElementById('section-create');
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}
// ============================================
// توابع بارگذاری جدول
// ============================================
async function loadProjectsTable() {
    try {
        await projectManager.loadProjects();
        const projects = projectManager.projects;
        const tbody = document.querySelector('#projectsTable tbody');
        const thead = document.querySelector('#projectsTable thead');
        if (!tbody || !thead) return;
        
        // ============================================
        // 📊 ساخت هدر جدول
        // ============================================
        const networksToShow = ACTIVE_NETWORKS;
        
        let headerHTML = `
            <tr>
                <th style="width:100px;text-align:center;">ProjectID</th>
                <th style="text-align:right;padding-right:20px;">نام پروژه</th>
                <th style="width:120px;text-align:center;">هدف (USDT)</th>
        `;
        
        // اضافه کردن ستون برای هر شبکه
        networksToShow.forEach(network => {
            headerHTML += `<th style="width:120px;text-align:center;">${network.icon} ${network.name}</th>`;
        });
        
        headerHTML += `
                <th style="width:100px;text-align:center;">عملیات</th>
            </tr>
        `;
        
        thead.innerHTML = headerHTML;
        
        // ============================================
        // 📋 پر کردن بدنه جدول
        // ============================================
        tbody.innerHTML = '';

        const networkFilter = document.getElementById('networkFilter')?.value || 'all';

        projects.features.forEach((f, index) => {
            const attr = f.attributes;
            
            // فیلتر بر اساس شبکه
            if (networkFilter !== 'all') {
                if (!projectManager.hasFund(f, networkFilter)) {
                    return;
                }
            }

            const row = document.createElement('tr');
            row.dataset.projectId = attr.ProjectID || '';
            row.dataset.rowIndex = index;
            
            // ============================================
            // ✨ هایلایت هنگام کلیک روی ردیف
            // ============================================
            row.addEventListener('click', function(e) {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
                
                document.querySelectorAll('#projectsTable tbody tr').forEach(r => {
                    r.classList.remove('selected');
                });
                
                this.classList.add('selected');
                
                const projectId = this.dataset.projectId;
                if (projectId) {
                    document.getElementById('projectId').value = projectId;
                }
            });
            
            // ============================================
            // ستون ProjectID
            // ============================================
            const idCell = document.createElement('td');
            idCell.textContent = attr.ProjectID || '---';
            idCell.style.fontWeight = 'bold';
            idCell.style.textAlign = 'center';
            row.appendChild(idCell);

            // ============================================
            // ستون نام پروژه
            // ============================================
            const nameCell = document.createElement('td');
            nameCell.textContent = attr['نام پروژه'] || 'نامشخص';
            nameCell.style.textAlign = 'right';
            nameCell.style.paddingRight = '20px';
            row.appendChild(nameCell);

            // ============================================
            // ستون هدف
            // ============================================
            const targetCell = document.createElement('td');
            targetCell.textContent = attr['targetAmount(USDT)']?.toLocaleString() || '0';
            targetCell.style.textAlign = 'center';
            row.appendChild(targetCell);

            // ============================================
            // 🔍 ستون‌های شبکه‌ها - به ازای هر شبکه یک ستون
            // ============================================
            networksToShow.forEach(network => {
                const cell = document.createElement('td');
                const address = projectManager.getFundAddress(f, network.id);
                
                if (address) {
                    const multisig = projectManager.getMultisigAddress(f);
                    
                    cell.innerHTML = `
                        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                            <span style="color: #27ae60; font-size:18px;">✅</span>
                            <a href="${network.explorerUrl}/address/${address}" 
                               target="_blank" 
                               style="font-size:10px;color:#3498db;text-decoration:none;direction:ltr;"
                               onclick="event.stopPropagation();">
                                ${address.slice(0, 6)}...${address.slice(-4)}
                            </a>
                            ${multisig ? `<span style="font-size:8px;color:#6c5ce7;">🔑 MultiSig</span>` : ''}
                        </div>
                    `;
                } else {
                    cell.innerHTML = `
                        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                            <span style="color: #bdc3c7; font-size:18px;">❌</span>
                            <span style="font-size:9px;color:#bdc3c7;">ندارد</span>
                        </div>
                    `;
                }
                cell.style.textAlign = 'center';
                row.appendChild(cell);
            });

            // ============================================
            // 🎯 ستون عملیات - فقط یک دکمه
            // ============================================
            const actionCell = document.createElement('td');
            const id = attr.ProjectID || '';
            actionCell.innerHTML = `
                <button onclick="window.selectProjectAndCheck('${id}')" 
                        style="padding:6px 14px;font-size:12px;background:#3498db;color:white;border:none;border-radius:6px;cursor:pointer;transition:all 0.2s;"
                        onmouseover="this.style.background='#2980b9'"
                        onmouseout="this.style.background='#3498db'">
                    🔍 بررسی
                </button>
            `;
            actionCell.style.textAlign = 'center';
            row.appendChild(actionCell);

            tbody.appendChild(row);
        });

        // ============================================
        // 📊 آمار در پایین جدول
        // ============================================
        const totalProjects = projects.features.length;
        const projectsWithFund = projects.features.filter(f => {
            const allFunds = projectManager.getAllFunds(f);
            return Object.keys(allFunds).filter(k => k !== '_multisig').length > 0;
        }).length;
        
        const footer = document.querySelector('#projectsTable tfoot');
        if (footer) {
            const totalCols = 3 + networksToShow.length + 1; // ProjectID + Name + Target + networks + Action
            footer.innerHTML = `
                <tr style="background:#f8f9fa;font-weight:bold;">
                    <td colspan="${totalCols}" style="text-align:center;padding:12px;font-size:13px;color:#2c3e50;">
                        📊 مجموع: ${totalProjects} پروژه | 
                        ✅ دارای خزانه: ${projectsWithFund} | 
                        ⏳ بدون خزانه: ${totalProjects - projectsWithFund}
                    </td>
                </tr>
            `;
        }

    } catch (error) {
        console.error('خطا در بارگذاری جدول:', error);
        const tbody = document.querySelector('#projectsTable tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#e74c3c;padding:20px;">❌ خطا در بارگذاری داده‌ها</td></tr>`;
        }
    }
}

// ============================================
// توابع Global (برای استفاده در onclick)
// ============================================
window.checkProject = checkProject;
window.scrollToCreate = scrollToCreate;
window.selectNetwork = selectNetwork;
window.connectToNetwork = connectToNetwork;
window.createFund = createFund;
window.loadProjectsTable = loadProjectsTable;
window.createFundFromCheck = createFundFromCheck;
window.fillProjectId = (id) => {
    const input = document.getElementById('projectId');
    if (input) input.value = id;
};
// ============================================
// انتخاب پروژه و رفتن به صفحه بررسی
// ============================================

window.selectProjectAndCheck = (projectId) => {
    if (!projectId) return;
    
    // 1. پر کردن فیلد ProjectID
    const input = document.getElementById('projectId');
    if (input) {
        input.value = projectId;
    }
    
    // 2. هایلایت کردن ردیف مربوطه در جدول
    document.querySelectorAll('#projectsTable tbody tr').forEach(row => {
        row.classList.remove('selected');
        if (row.dataset.projectId === projectId) {
            row.classList.add('selected');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
    
    // 3. رفتن به بخش ساخت خزانه
    const section = document.getElementById('section-create');
    if (section) {
        document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
        section.style.display = 'block';
        
        document.querySelectorAll('.sidebar-nav a').forEach(link => {
            link.classList.remove('active');
            if (link.dataset.section === 'create') {
                link.classList.add('active');
            }
        });
        
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // 4. اجرای بررسی خودکار
    setTimeout(() => {
        checkProject();
    }, 300);
};

// ============================================
// مشاهده JSON در مرورگر
// ============================================
window.openJSON = () => {
    const textarea = document.getElementById('jsonOutput');
    if (!textarea) return;

    // ایجاد یک Blob و باز کردن در تب جدید
    const blob = new Blob([textarea.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ============================================
// کپی JSON
// ============================================

window.copyJSON = () => {
    const textarea = document.getElementById('jsonOutput');
    if (!textarea) return;

    navigator.clipboard.writeText(textarea.value)
        .then(() => {
            // نمایش پیام موفقیت
            showTemporaryMessage('✅ JSON با موفقیت کپی شد!');
        })
        .catch(() => {
            // روش جایگزین
            textarea.select();
            document.execCommand('copy');
            showTemporaryMessage('✅ JSON با موفقیت کپی شد!');
        });
};

// تابع کمکی برای نمایش پیام موقت
function showTemporaryMessage(message) {
    const result = document.getElementById('createResult');
    if (!result) return;

    const msg = document.createElement('p');
    msg.style.cssText = 'color: #27ae60; margin-top: 10px; font-weight: bold;';
    msg.textContent = message;
    result.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
}

// ============================================
// دانلود فایل JSON
// ============================================

window.downloadJSON = () => {
    const textarea = document.getElementById('jsonOutput');
    if (!textarea) return;

    const blob = new Blob([textarea.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Projects.json';  // نام فایل
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    // پیام تأیید
    const result = document.getElementById('createResult');
    if (result) {
        const note = document.createElement('p');
        note.style.cssText = 'color: #27ae60; margin-top: 10px; font-weight: bold;';
        note.textContent = '✅ فایل با موفقیت دانلود شد!';
        result.appendChild(note);
        setTimeout(() => note.remove(), 3000);
    }
};
// ============================================
// آپلود به GitHub
// ============================================

window.pushToGitHub = async () => {
    const textarea = document.getElementById('jsonOutput');
    if (!textarea) return;

    // بررسی توکن
    const token = localStorage.getItem('github_token');
    if (!token) {
        // نمایش پیام برای وارد کردن توکن
        const result = document.getElementById('createResult');
        if (result) {
            result.innerHTML += `
                <div style="margin-top:15px;padding:15px;background:#fde8e8;border:2px solid #e74c3c;border-radius:8px;">
                    <h4 style="color:#e74c3c;">❌ توکن GitHub تنظیم نشده است</h4>
                    <p style="font-size:13px;">لطفاً توکن خود را در بخش <strong>تنظیمات</strong> وارد کنید.</p>
                    <button onclick="document.querySelector('[data-section=\\"settings\\"]')?.click();" 
                            style="padding:8px 16px;background:#3498db;color:white;border:none;border-radius:6px;cursor:pointer;">
                        ⚙️ رفتن به تنظیمات
                    </button>
                </div>
            `;
        }
        return;
    }

    try {
        // نمایش لودینگ
        const btn = event?.target;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ در حال آپلود...';
        }

        await projectManager.pushToGitHub(textarea.value);

        // پیام موفقیت
        showTemporaryMessage('✅ فایل با موفقیت به GitHub آپلود شد!');

    } catch (error) {
        console.error('❌ خطا در آپلود:', error);
        showError('❌ خطا در آپلود به GitHub: ' + (error.message || 'نامشخص'));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🚀 آپلود به GitHub';
        }
    }
};

// ============================================
// رویدادهای DOM
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📱 Admin Panel راه‌اندازی شد');
    try {
        // بارگذاری اولیه پروژه‌ها
        await projectManager.loadProjects();
        console.log('✅ پروژه‌ها بارگذاری شدند:', projectManager.projects?.features?.length || 0, 'مورد');
    } catch (error) {
        console.error('❌ خطا در بارگذاری اولیه:', error);
        // نمایش خطا به کاربر
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.innerHTML = `<span style="color: #e74c3c;">⚠️ خطا: ${error.message}</span>`;
        }
    }
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

    // Auto-complete برای ProjectID
    const projectIdInput = document.getElementById('projectId');
    if (projectIdInput) {
        // پیشنهاد پروژه‌ها هنگام تایپ
        projectIdInput.addEventListener('input', async function() {
            const value = this.value.trim();
            if (value.length < 2) return;

            try {
                await projectManager.loadProjects();
                const projects = projectManager.projects?.features || [];
                const matches = projects
                    .filter(f => {
                        const id = f.attributes.ProjectID || '';
                        return id.includes(value);
                    })
                    .slice(0, 5);

                if (matches.length > 0) {
                    // نمایش پیشنهادات (می‌توانید از datalist استفاده کنید)
                    const datalist = document.getElementById('projectSuggestions');
                    if (datalist) {
                        datalist.innerHTML = matches.map(f => 
                            `<option value="${f.attributes.ProjectID}">${f.attributes['نام پروژه'] || ''}</option>`
                        ).join('');
                    }
                }
            } catch (error) {
                console.error('خطا در auto-complete:', error);
            }
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
