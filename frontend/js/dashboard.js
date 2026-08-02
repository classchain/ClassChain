let userAddress = null;
let userAddressType = null; // 'EVM' | 'TVM'

const fundABI = [
    { "inputs": [{ "internalType": "address", "name": "token", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }
];

const multisigABI = [
    { "inputs": [], "name": "getOwners", "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }], "stateMutability": "view", "type": "function" }
];

// ==================== اتصال MetaMask ====================
async function connectMetaMask() {
    console.log('کلیک روی MetaMask');
    if (typeof window.ethereum === 'undefined') {
        alert('لطفاً افزونه MetaMask را نصب کنید.');
        return;
    }

    try {
        let accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length === 0) {
            accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        }

        if (!accounts || accounts.length === 0) {
            alert('هیچ حسابی انتخاب نشد.');
            return;
        }

        userAddress = accounts[0];
        userAddressType = 'EVM';

        document.getElementById('accountDisplay').textContent =
            `وصل شد (MetaMask): ${userAddress.slice(0, 8)}...${userAddress.slice(-6)}`;

        document.getElementById('connectSection').style.display = 'none';
        document.getElementById('loading').style.display = 'block';

        await loadProjects();

    } catch (err) {
        console.error('خطا در اتصال MetaMask:', err);
        if (err.code === 4001) {
            alert('اتصال MetaMask لغو شد.');
        } else {
            alert('خطا در اتصال MetaMask: ' + (err.message || 'مشکل ناشناخته'));
        }
    }
}

// ==================== اتصال TronLink ====================
async function connectTronLink() {
    console.log('کلیک روی TronLink');
    const tronWeb = window.tronWeb;

    if (!tronWeb) {
        alert('لطفاً افزونه TronLink را نصب و فعال کنید.');
        return;
    }

    try {
        if (typeof tronWeb.request === 'function') {
            await tronWeb.request({ method: 'tron_requestAccounts' });
        }

        // کمی صبر برای آپدیت شدن defaultAddress
        await new Promise(r => setTimeout(r, 300));

        const account = tronWeb.defaultAddress?.base58;
        if (!account) {
            alert('TronLink قفل است یا هیچ حسابی انتخاب نشده. لطفاً قفل را باز کنید و دوباره امتحان کنید.');
            return;
        }

        userAddress = account;
        userAddressType = 'TVM';

        document.getElementById('accountDisplay').textContent =
            `وصل شد (TronLink): ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

        document.getElementById('connectSection').style.display = 'none';
        document.getElementById('loading').style.display = 'block';

        await loadProjects();

    } catch (err) {
        console.error('خطا در اتصال TronLink:', err);
        if (err.code === 4001 || (err.message && err.message.toLowerCase().includes('cancel'))) {
            alert('اتصال TronLink لغو شد.');
        } else {
            alert('خطا در اتصال TronLink: ' + (err.message || 'مشکل ناشناخته'));
        }
    }
}

// ==================== چک مالکیت روی یک شبکه ====================
async function checkOwnershipOnNetwork(project, netCfg, userAddr, addrType) {
    // ۱. از فیلد funds داخل Projects.json
    if (project.funds && typeof project.funds === 'object') {
        for (const key of (netCfg.fundsKeys || [])) {
            const fundInfo = project.funds[key];
            if (!fundInfo) continue;

            const owners = fundInfo.owners || [];
            const isOwner = owners.some(o =>
                String(o).toLowerCase() === String(userAddr).toLowerCase()
            );
            if (isOwner) {
                return {
                    isOwner: true,
                    fundAddress: fundInfo.address || null,
                    multisigAddress: fundInfo.multisigAddress || null,
                    requiredSignatures: fundInfo.requiredSignatures || 1,
                    source: 'funds'
                };
            }
        }
    }

    // ۲. برای EVM از قرارداد بخوان
    if (addrType === 'EVM' && netCfg.type === 'EVM' && netCfg.rpc) {
        const addresses = [];
        (netCfg.addressFields || []).forEach(f => {
            if (project[f] && project[f] !== 'null') addresses.push(project[f]);
        });
        if (project.funds) {
            (netCfg.fundsKeys || []).forEach(k => {
                if (project.funds[k]?.address) addresses.push(project.funds[k].address);
            });
        }

        for (const fundAddr of [...new Set(addresses)]) {
            try {
                const web3 = new Web3(netCfg.rpc);
                const fundContract = new web3.eth.Contract(fundABI, fundAddr);
                const owner = await fundContract.methods.owner().call();

                if (owner.toLowerCase() === userAddr.toLowerCase()) {
                    return { isOwner: true, fundAddress: fundAddr, multisigAddress: null, source: 'contract' };
                }

                try {
                    const multisig = new web3.eth.Contract(multisigABI, owner);
                    const owners = await multisig.methods.getOwners().call();
                    if (owners.some(o => o.toLowerCase() === userAddr.toLowerCase())) {
                        return {
                            isOwner: true,
                            fundAddress: fundAddr,
                            multisigAddress: owner,
                            source: 'contract-multisig'
                        };
                    }
                } catch (_) {}
            } catch (e) {
                console.warn(`خطا در چک مالکیت ${netCfg.id}:`, e.message);
            }
        }
    }

    return { isOwner: false };
}

// ==================== بارگذاری پروژه‌ها ====================
async function loadProjects() {
    try {
        document.getElementById('loading').innerHTML = '<p>در حال بارگذاری لیست پروژه‌ها...</p>';

        const resp = await fetch('data/Projects.json');
        if (!resp.ok) throw new Error('فایل Projects.json لود نشد');
        const data = await resp.json();

        const config = window.ClassChainNetworkConfig;
        if (!config) {
            throw new Error('network-config.js لود نشده است');
        }

        const activeNetworks = config.getActiveNetworks();
        const myProjects = [];
        let checkedCount = 0;

        const features = data.features || [];

        for (const feature of features) {
            const attr = feature.attributes;
            if (!attr) continue;

            const hasAnyFund = activeNetworks.some(net => {
                const addrs = (net.addressFields || []).some(f => attr[f] && attr[f] !== 'null');
                const hasFunds = attr.funds && Object.keys(attr.funds).length > 0;
                return addrs || hasFunds;
            });
            if (!hasAnyFund) continue;

            checkedCount++;

            const ownedNetworks = [];
            for (const net of activeNetworks) {
                // فقط شبکه‌هایی که نوعشان با نوع کیف‌پول کاربر سازگار است را چک کن
                if (net.type === 'EVM' && userAddressType !== 'EVM') continue;
                if (net.type === 'TVM' && userAddressType !== 'TVM') continue;

                const ownership = await checkOwnershipOnNetwork(attr, net, userAddress, userAddressType);
                if (ownership.isOwner) {
                    ownedNetworks.push({
                        networkId: net.id,
                        networkName: net.name,
                        fundAddress: ownership.fundAddress,
                        multisigAddress: ownership.multisigAddress,
                        requiredSignatures: ownership.requiredSignatures
                    });
                }
            }

            if (ownedNetworks.length === 0) continue;

            let totalRaised = 0;
            let breakdown = [];
            try {
                if (window.ClassChainRaisedReader) {
                    const result = await window.ClassChainRaisedReader.getProjectRaisedUSDT(attr);
                    totalRaised = result.total || 0;
                    breakdown = result.breakdown || [];
                }
            } catch (e) {
                console.warn('خطا در خواندن raised پروژه', attr.ProjectID, e);
            }

            myProjects.push({
                id: attr.ProjectID,
                name: attr['نام پروژه'] || attr.نام_پروژه || `پروژه ${attr.ProjectID}`,
                totalRaised: totalRaised,
                breakdown: breakdown,
                ownedNetworks: ownedNetworks,
                attributes: attr
            });
        }

        displayProjects(myProjects);

        if (myProjects.length === 0) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('noAccess').style.display = 'block';
            document.getElementById('noAccess').innerHTML = `
                <p>هیچ پروژه‌ای پیدا نشد که شما صاحب خزانه آن باشید.</p>
                <p>تعداد پروژه‌های بررسی‌شده: ${checkedCount}</p>
                <p style="font-size:0.85em;opacity:0.7;">آدرس شما: ${userAddress}</p>
            `;
        }

    } catch (err) {
        console.error('خطای کلی در لود پروژه‌ها:', err);
        document.getElementById('loading').innerHTML = `
            <p style="color:var(--danger);">خطا در بارگذاری پروژه‌ها:</p>
            <p>${err.message || 'مشکل ناشناخته'}</p>
            <p>لطفاً صفحه را رفرش کنید یا اتصال کیف پول را چک کنید.</p>
        `;
    }
}

// ==================== نمایش کارت‌ها ====================
function displayProjects(projectsList) {
    document.getElementById('loading').style.display = 'none';

    const container = document.getElementById('projectsList');

    if (projectsList.length === 0) {
        document.getElementById('noAccess').style.display = 'block';
        return;
    }

    document.getElementById('noAccess').style.display = 'none';
    container.innerHTML = '';

    projectsList.forEach(proj => {
        const card = document.createElement('div');
        card.className = 'project-card';

        let breakdownHtml = '';
        if (proj.breakdown && proj.breakdown.length > 0) {
            const parts = proj.breakdown
                .filter(b => b.amount > 0)
                .map(b => `<span style="font-size:0.8em;opacity:0.85;">${b.network}: ${b.amount.toFixed(2)}</span>`);
            if (parts.length) {
                breakdownHtml = `<div class="project-info" style="margin-top:4px;">${parts.join(' | ')}</div>`;
            }
        }

        const networksLabel = proj.ownedNetworks.map(n => n.networkName).join('، ');

        card.innerHTML = `
            <div class="project-title">${proj.name}</div>
            <div class="project-info">آیدی: ${proj.id}</div>
            <div class="project-info">شبکه‌های تحت مالکیت شما: ${networksLabel}</div>
            <div class="project-balance">${proj.totalRaised.toFixed(2)} USDT (مجموع همه شبکه‌ها)</div>
            ${breakdownHtml}
            <a href="manage-fund.html?project=${proj.id}" class="manage-btn">مدیریت خزانه‌ها</a>
        `;
        container.appendChild(card);
    });
}

// ==================== اتصال دکمه‌ها بعد از لود صفحه ====================
document.addEventListener('DOMContentLoaded', function () {
    const btnMeta = document.getElementById('btnMetaMask');
    const btnTron = document.getElementById('btnTronLink');

    if (btnMeta) {
        btnMeta.addEventListener('click', connectMetaMask);
    }
    if (btnTron) {
        btnTron.addEventListener('click', connectTronLink);
    }

    console.log('Dashboard آماده است. دکمه‌ها متصل شدند.');
});

// particles
if (typeof particlesJS === 'function') {
    particlesJS("particles-js", {
        "particles": {
            "number": { "value": 100 },
            "color": { "value": ["#4cc9f0", "#8b5cf6", "#7209b7"] },
            "shape": { "type": "circle" },
            "opacity": { "value": 0.6, "random": true },
            "size": { "value": 3, "random": true },
            "line_linked": { "enable": true, "distance": 140, "color": "#6366f1", "opacity": 0.3, "width": 1 },
            "move": { "enable": true, "speed": 1.5 }
        },
        "interactivity": {
            "events": { "onhover": { "enable": true, "mode": "repulse" } }
        }
    });
}
