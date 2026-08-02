let projectData = {};
let projectId = null;
let selectedNetworkId = null;
let selectedNetCfg = null;
let connection = null;          // خروجی WalletManager
let fundAddress = null;
let multisigAddress = null;
let isOwner = false;

const fundABI = [
    { "inputs": [{ "internalType": "address", "name": "token", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "token", "type": "address" }, { "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "withdrawToken", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
];

const multisigABI = [
    { "inputs": [], "name": "getOwners", "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "numConfirmationsRequired", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "_txIndex", "type": "uint256" }], "name": "getTransaction", "outputs": [
        { "internalType": "address", "name": "to", "type": "address" },
        { "internalType": "uint256", "name": "value", "type": "uint256" },
        { "internalType": "bytes", "name": "data", "type": "bytes" },
        { "internalType": "bool", "name": "executed", "type": "bool" },
        { "internalType": "uint256", "name": "numConfirmations", "type": "uint256" }
    ], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "getTransactionCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "_to", "type": "address" }, { "internalType": "uint256", "name": "_value", "type": "uint256" }, { "internalType": "bytes", "name": "_data", "type": "bytes" }], "name": "submitTransaction", "outputs": [{ "internalType": "uint256", "name": "txIndex", "type": "uint256" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "_txIndex", "type": "uint256" }], "name": "confirmTransaction", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "_txIndex", "type": "uint256" }], "name": "executeTransaction", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
];

const walletManager = new (window.ClassChainWalletManager || function(){})();

// ==================== شروع ====================
async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    projectId = urlParams.get('project');

    if (!projectId) {
        document.getElementById('loading').innerHTML = '<p style="color:var(--danger);">آیدی پروژه مشخص نشده است.</p>';
        return;
    }

    try {
        const resp = await fetch('data/Projects.json');
        const data = await resp.json();
        const feature = (data.features || []).find(f => f.attributes?.ProjectID === projectId);
        projectData = feature?.attributes || {};

        if (!projectData || Object.keys(projectData).length === 0) {
            document.getElementById('loading').innerHTML = '<p style="color:var(--danger);">پروژه پیدا نشد.</p>';
            return;
        }

        document.getElementById('projectName').textContent =
            projectData['نام پروژه'] || projectData.نام_پروژه || `پروژه ${projectId}`;
        document.getElementById('projectIdDisplay').textContent = projectId;

        // مجموع کمک‌ها
        await loadTotalRaised();

        // پر کردن لیست شبکه‌ها
        populateNetworkSelect();

        document.getElementById('loading').style.display = 'none';
        document.getElementById('main').style.display = 'block';

    } catch (err) {
        console.error(err);
        document.getElementById('loading').innerHTML =
            '<p style="color:var(--danger);">خطا در بارگذاری پروژه: ' + (err.message || 'نامشخص') + '</p>';
    }
}

async function loadTotalRaised() {
    try {
        if (window.ClassChainRaisedReader) {
            const result = await window.ClassChainRaisedReader.getProjectRaisedUSDT(projectData);
            document.getElementById('totalRaised').textContent = (result.total || 0).toFixed(2) + ' USDT';

            const box = document.getElementById('breakdownBox');
            if (result.breakdown && result.breakdown.length) {
                const parts = result.breakdown
                    .filter(b => b.amount > 0)
                    .map(b => `${b.network}: ${b.amount.toFixed(2)}`);
                box.textContent = parts.length ? parts.join('  |  ') : '';
            }
        }
    } catch (e) {
        console.warn('خطا در خواندن مجموع:', e);
    }
}

// ---------- اصلاح populateNetworkSelect ----------
function populateNetworkSelect() {
    const config = window.ClassChainNetworkConfig;
    if (!config) return;

    const select = document.getElementById('networkSelect');
    select.innerHTML = '<option value="">— ابتدا شبکه را انتخاب کنید —</option>';

    const allNets = Object.values(config.NETWORKS);

    allNets.forEach(net => {
        let hasAddress = false;
        (net.addressFields || []).forEach(f => {
            if (projectData[f] && projectData[f] !== 'null') hasAddress = true;
        });
        if (projectData.funds) {
            (net.fundsKeys || []).forEach(k => {
                if (projectData.funds[k]?.address) hasAddress = true;
            });
        }
        if (!hasAddress) return;

        const opt = document.createElement('option');
        opt.value = net.id;
        opt.textContent = `${net.name}${net.status === 'active' ? '' : ' (در انتظار)'}`;
        opt.disabled = net.status !== 'active';
        select.appendChild(opt);
    });

    select.addEventListener('change', onNetworkChange);

    // ❌ دیگر شبکه را خودکار انتخاب نکن
    // ❌ هیچ connect خودکاری انجام نشود
}

// ---------- اصلاح onNetworkChange ----------
function onNetworkChange() {
    selectedNetworkId = document.getElementById('networkSelect').value;
    selectedNetCfg = window.ClassChainNetworkConfig?.getNetwork(selectedNetworkId) || null;

    connection = null;
    fundAddress = null;
    multisigAddress = null;
    isOwner = false;

    document.getElementById('fundDetails').style.display = 'none';
    document.getElementById('noAccessCard').style.display = 'none';
    document.getElementById('connectedWalletInfo').textContent = '';
    document.getElementById('status').innerHTML = '';

    const btn = document.getElementById('btnConnectNetwork');
    if (!selectedNetCfg) {
        btn.style.display = 'none';
        return;
    }

    btn.style.display = 'inline-block';
    btn.textContent = `اتصال ${selectedNetCfg.walletName} (${selectedNetCfg.name})`;
    btn.onclick = connectSelectedNetwork;   // فقط با کلیک کاربر
}

async function connectSelectedNetwork() {
    if (!selectedNetCfg) return;

    try {
        setStatus('در حال اتصال به کیف پول...', 'warning');

        // استفاده از WalletManager اگر موجود باشد
        if (window.ClassChainWalletManager) {
            const wm = new window.ClassChainWalletManager();
            connection = await wm.connect(selectedNetCfg);
        } else {
            // fallback ساده
            if (selectedNetCfg.type === 'EVM') {
                if (!window.ethereum) throw new Error('MetaMask نصب نیست');
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                const web3 = new Web3(window.ethereum);
                const accounts = await web3.eth.getAccounts();
                const chainId = Number(await web3.eth.getChainId());
                if (selectedNetCfg.chainId && chainId !== selectedNetCfg.chainId) {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x' + selectedNetCfg.chainId.toString(16) }]
                    });
                }
                connection = { type: 'EVM', account: accounts[0], web3, network: selectedNetCfg };
            } else if (selectedNetCfg.type === 'TVM') {
                if (!window.tronWeb) throw new Error('TronLink نصب نیست');
                if (typeof window.tronWeb.request === 'function') {
                    await window.tronWeb.request({ method: 'tron_requestAccounts' });
                }
                await new Promise(r => setTimeout(r, 300));
                const account = window.tronWeb.defaultAddress?.base58;
                if (!account) throw new Error('حساب TronLink یافت نشد');
                connection = { type: 'TVM', account, tronWeb: window.tronWeb, network: selectedNetCfg };
            }
        }

        document.getElementById('connectedWalletInfo').textContent =
            `وصل شد: ${connection.account.slice(0, 8)}...${connection.account.slice(-6)}`;

        setStatus('', '');
        await loadFundDataForSelectedNetwork();

    } catch (err) {
        console.error(err);
        setStatus('خطا در اتصال: ' + (err.message || 'نامشخص'), 'error');
    }
}

async function loadFundDataForSelectedNetwork() {
    if (!selectedNetCfg || !connection) return;

    // پیدا کردن آدرس خزانه این شبکه
    fundAddress = null;
    if (projectData.funds) {
        for (const k of (selectedNetCfg.fundsKeys || [])) {
            if (projectData.funds[k]?.address) {
                fundAddress = projectData.funds[k].address;
                multisigAddress = projectData.funds[k].multisigAddress || null;
                break;
            }
        }
    }
    if (!fundAddress) {
        for (const f of (selectedNetCfg.addressFields || [])) {
            if (projectData[f] && projectData[f] !== 'null') {
                fundAddress = projectData[f];
                break;
            }
        }
    }

    if (!fundAddress) {
        setStatus('آدرس خزانه برای این شبکه پیدا نشد.', 'error');
        return;
    }

    document.getElementById('selectedNetworkName').textContent = selectedNetCfg.name;
    document.getElementById('fundAddress').textContent =
        fundAddress.slice(0, 10) + '...' + fundAddress.slice(-8);

    // ===== شاخه EVM =====
    if (selectedNetCfg.type === 'EVM' && connection.type === 'EVM') {
        await loadEvmFundData();
    }
    // ===== شاخه TVM =====
    else if (selectedNetCfg.type === 'TVM' && connection.type === 'TVM') {
        await loadTronFundData();
    } else {
        setStatus('نوع کیف پول با شبکه انتخاب‌شده سازگار نیست.', 'error');
    }
}

// ---------- جایگزین تابع loadEvmFundData (بخش موجودی) ----------
async function loadEvmFundData() {
    const web3 = connection.web3;
    const userAddress = connection.account;
    const usdt = selectedNetCfg.usdtAddress;
    const decimals = selectedNetCfg.tokenDecimals || 6;

    // ✅ موجودی را از RPC عمومی بخوان (نه از MetaMask)
    let balanceFormatted = '0.0000';
    try {
        // روش ۱: از raised-reader (مطمئن‌ترین)
        if (window.ClassChainRaisedReader) {
            const result = await window.ClassChainRaisedReader.getProjectRaisedUSDT(projectData);
            const item = (result.breakdown || []).find(b =>
                b.networkId === selectedNetCfg.id ||
                (b.address && fundAddress && b.address.toLowerCase() === fundAddress.toLowerCase())
            );
            if (item && item.amount != null) {
                balanceFormatted = Number(item.amount).toFixed(4);
            }
        }

        // روش ۲: اگر raised-reader چیزی نداد، مستقیم با RPC شبکه
        if (balanceFormatted === '0.0000' && selectedNetCfg.rpc) {
            const readWeb3 = new Web3(selectedNetCfg.rpc);
            const token = new readWeb3.eth.Contract([
                { constant: true, inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], type: 'function' }
            ], usdt);
            const raw = await token.methods.balanceOf(fundAddress).call();
            balanceFormatted = (Number(raw) / (10 ** decimals)).toFixed(4);
        }
    } catch (e) {
        console.warn('خطا در خواندن موجودی:', e);
    }
    document.getElementById('fundBalance').textContent = balanceFormatted + ' USDT';

    // مالکیت
    let ownerAddr = '-';
    let required = '1';
    let owners = [];
    isOwner = false;
    multisigAddress = null;

    try {
        const owner = await fundContract.methods.owner().call();
        ownerAddr = owner.slice(0, 10) + '...' + owner.slice(-8);

        if (owner.toLowerCase() === userAddress.toLowerCase()) {
            isOwner = true;
            owners = [userAddress];
            required = '1 (تک‌مالکی)';
        } else {
            try {
                const multisigContract = new web3.eth.Contract(multisigABI, owner);
                required = await multisigContract.methods.numConfirmationsRequired().call();
                owners = await multisigContract.methods.getOwners().call();
                isOwner = owners.some(o => o.toLowerCase() === userAddress.toLowerCase());
                multisigAddress = owner;
            } catch (e) {
                console.warn('Multisig نیست', e);
            }
        }
    } catch (e) {
        console.warn('خطا در خواندن owner', e);
    }

    // اگر در funds هم owners داشت، ترجیح بده
    if (projectData.funds) {
        for (const k of (selectedNetCfg.fundsKeys || [])) {
            const info = projectData.funds[k];
            if (info?.owners?.length) {
                const fromFunds = info.owners.some(o => o.toLowerCase() === userAddress.toLowerCase());
                if (fromFunds) isOwner = true;
                if (!owners.length) owners = info.owners;
                if (info.requiredSignatures) required = info.requiredSignatures;
                if (info.multisigAddress) multisigAddress = info.multisigAddress;
            }
        }
    }

    document.getElementById('ownerAddress').textContent = ownerAddr;
    document.getElementById('requiredConfirmations').textContent = required;

    if (!isOwner) {
        document.getElementById('fundDetails').style.display = 'none';
        document.getElementById('noAccessCard').style.display = 'block';
        return;
    }

    document.getElementById('noAccessCard').style.display = 'none';
    document.getElementById('fundDetails').style.display = 'block';

    // لیست مالکان
    const ownersList = document.getElementById('ownersList');
    ownersList.innerHTML = '';
    owners.forEach(o => {
        const item = document.createElement('div');
        item.className = 'info-item';
        item.innerHTML = `
            <div class="info-label">صاحب</div>
            <div class="info-value">${o.slice(0, 10)}...${o.slice(-8)}</div>
            ${o.toLowerCase() === userAddress.toLowerCase() ? '<small style="color:var(--success);">شما</small>' : ''}
        `;
        ownersList.appendChild(item);
    });

    // pending txs
    if (!multisigAddress) {
        document.getElementById('pendingTxs').innerHTML =
            '<p style="opacity:0.7;">این خزانه تک‌مالکی است. برداشت مستقیم انجام می‌شود.</p>';
    } else {
        await loadPendingTransactions(web3, userAddress);
    }

    // دکمه برداشت
    document.getElementById('btnWithdraw').onclick = () => submitWithdrawEvm(web3, userAddress, usdt, decimals);
}

async function loadPendingTransactions(web3, userAddress) {
    const multisigContract = new web3.eth.Contract(multisigABI, multisigAddress);
    const pendingDiv = document.getElementById('pendingTxs');

    try {
        const count = await multisigContract.methods.getTransactionCount().call();
        if (count == 0) {
            pendingDiv.innerHTML = '<p>هیچ تراکنش در انتظاری وجود ندارد.</p>';
            return;
        }

        pendingDiv.innerHTML = '';
        const required = await multisigContract.methods.numConfirmationsRequired().call();

        for (let i = 0; i < count; i++) {
            const tx = await multisigContract.methods.getTransaction(i).call();
            if (tx.executed) continue;

            const div = document.createElement('div');
            div.className = 'pending-tx';
            div.innerHTML = `
                <p><strong>تراکنش #${i}</strong></p>
                <p>مقصد: ${tx.to.slice(0, 10)}...${tx.to.slice(-8)}</p>
                <p>تأییدها: ${tx.numConfirmations} / ${required}</p>
                <button onclick="confirmTx(${i})">تأیید این تراکنش</button>
            `;
            pendingDiv.appendChild(div);
        }
    } catch (e) {
        pendingDiv.innerHTML = '<p>خطا در خواندن تراکنش‌های در انتظار.</p>';
        console.warn(e);
    }
}

async function confirmTx(txIndex) {
    if (!connection || !multisigAddress) return;
    try {
        setStatus('در حال ارسال تأیید...', 'warning');
        const multisigContract = new connection.web3.eth.Contract(multisigABI, multisigAddress);
        await multisigContract.methods.confirmTransaction(txIndex).send({
            from: connection.account,
            gas: 300000
        });
        setStatus('تأیید موفق!', 'success');
        await loadFundDataForSelectedNetwork();
    } catch (err) {
        setStatus('خطا در تأیید: ' + (err.message || 'نامشخص'), 'error');
    }
}

async function submitWithdrawEvm(web3, userAddress, usdt, decimals) {
    const amountInput = document.getElementById('withdrawAmount').value;
    const toAddress = document.getElementById('withdrawTo').value.trim();

    if (!amountInput || !toAddress || !web3.utils.isAddress(toAddress)) {
        setStatus('مقدار و آدرس معتبر وارد کنید', 'error');
        return;
    }

    const amount = web3.utils.toBN(Math.round(parseFloat(amountInput) * (10 ** decimals)));
    const fundContract = new web3.eth.Contract(fundABI, fundAddress);

    try {
        setStatus('در حال ارسال تراکنش...', 'warning');

        if (!multisigAddress) {
            // تک‌مالکی
            const tx = await fundContract.methods.withdrawToken(usdt, toAddress, amount).send({
                from: userAddress,
                gas: 300000
            });
            setStatus(`برداشت موفق! <a href="${selectedNetCfg.explorer}/tx/${tx.transactionHash}" target="_blank">مشاهده</a>`, 'success');
        } else {
            // Multisig
            const withdrawData = web3.eth.abi.encodeFunctionCall({
                name: 'withdrawToken',
                type: 'function',
                inputs: [
                    { type: 'address', name: 'token' },
                    { type: 'address', name: 'to' },
                    { type: 'uint256', name: 'amount' }
                ]
            }, [usdt, toAddress, amount]);

            const multisigContract = new web3.eth.Contract(multisigABI, multisigAddress);
            const tx = await multisigContract.methods.submitTransaction(fundAddress, 0, withdrawData).send({
                from: userAddress,
                gas: 400000
            });

            setStatus(`درخواست ثبت شد. <a href="${selectedNetCfg.explorer}/tx/${tx.transactionHash}" target="_blank">مشاهده</a>`, 'success');
        }

        await loadFundDataForSelectedNetwork();
        await loadTotalRaised();

    } catch (err) {
        console.error(err);
        setStatus('خطا در برداشت: ' + (err.message || 'نامشخص'), 'error');
    }
}

// ==================== Tron (پایه) ====================
async function loadTronFundData() {
    const userAddress = connection.account;
    const decimals = selectedNetCfg.tokenDecimals || 6;

    // ✅ موجودی از raised-reader
    let balanceFormatted = '0.0000';
    try {
        if (window.ClassChainRaisedReader) {
            const result = await window.ClassChainRaisedReader.getProjectRaisedUSDT(projectData);
            const item = (result.breakdown || []).find(b =>
                b.networkId === selectedNetCfg.id ||          // 'tron'
                b.networkId === 'tron_nile' ||
                (b.address && fundAddress &&
                    String(b.address).toLowerCase() === String(fundAddress).toLowerCase())
            );
            if (item && item.amount != null) {
                balanceFormatted = Number(item.amount).toFixed(4);
            }
        }
    } catch (e) {
        console.warn('خطا در خواندن موجودی Tron:', e);
    }
    document.getElementById('fundBalance').textContent = balanceFormatted + ' USDT';

    // مالکیت از funds
    isOwner = false;
    let owners = [];
    let required = '1';

    if (projectData.funds) {
        for (const k of (selectedNetCfg.fundsKeys || [])) {
            const info = projectData.funds[k];
            if (!info) continue;
            owners = info.owners || [];
            required = info.requiredSignatures || 1;
            multisigAddress = info.multisigAddress || null;
            isOwner = owners.some(o => String(o).toLowerCase() === String(userAddress).toLowerCase());
        }
    }

    document.getElementById('ownerAddress').textContent = multisigAddress
        ? (multisigAddress.slice(0, 8) + '...')
        : (owners[0] ? owners[0].slice(0, 8) + '...' : '-');
    document.getElementById('requiredConfirmations').textContent = required;

    if (!isOwner) {
        document.getElementById('fundDetails').style.display = 'none';
        document.getElementById('noAccessCard').style.display = 'block';
        return;
    }

    document.getElementById('noAccessCard').style.display = 'none';
    document.getElementById('fundDetails').style.display = 'block';

    const ownersList = document.getElementById('ownersList');
    ownersList.innerHTML = '';
    owners.forEach(o => {
        const item = document.createElement('div');
        item.className = 'info-item';
        item.innerHTML = `
            <div class="info-label">صاحب</div>
            <div class="info-value">${String(o).slice(0, 8)}...${String(o).slice(-6)}</div>
            ${String(o).toLowerCase() === userAddress.toLowerCase() ? '<small style="color:var(--success);">شما</small>' : ''}
        `;
        ownersList.appendChild(item);
    });

    document.getElementById('pendingTxs').innerHTML =
        '<p style="opacity:0.7;">مدیریت Multisig ترون در نسخه بعدی کامل می‌شود. فعلاً فقط نمایش موجودی و مالکیت فعال است.</p>';

    document.getElementById('btnWithdraw').onclick = () => submitWithdrawTron();
}

async function submitWithdrawTron() {
    if (!connection || connection.type !== 'TVM' || !selectedNetCfg) {
        setStatus('ابتدا با TronLink به شبکه Tron وصل شوید.', 'error');
        return;
    }

    const amountInput = document.getElementById('withdrawAmount').value;
    const toAddress = document.getElementById('withdrawTo').value.trim();

    if (!amountInput || parseFloat(amountInput) <= 0) {
        setStatus('مقدار معتبر وارد کنید.', 'error');
        return;
    }
    if (!toAddress || !toAddress.startsWith('T') || toAddress.length < 30) {
        setStatus('آدرس مقصد Tron معتبر نیست (باید با T شروع شود).', 'error');
        return;
    }
    if (!fundAddress) {
        setStatus('آدرس خزانه پیدا نشد.', 'error');
        return;
    }

    const tronWeb = connection.tronWeb;
    const decimals = selectedNetCfg.tokenDecimals || 6;
    const amount = Math.floor(parseFloat(amountInput) * (10 ** decimals));
    const usdt = selectedNetCfg.usdtAddress; // Base58 روی Nile

    // اگر Multisig واقعی داشتیم اینجا submitTransaction می‌رفت
    // فعلاً برای حالت تک‌مالکی / owner مستقیم:
    if (multisigAddress) {
        setStatus('برداشت Multisig ترون هنوز پیاده‌سازی نشده. فعلاً فقط خزانه تک‌مالکی پشتیبانی می‌شود.', 'warning');
        return;
    }

    try {
        setStatus('در حال ارسال تراکنش برداشت به TronLink...', 'warning');

        const fundContract = await tronWeb.contract(fundWithdrawABI, fundAddress);
        
        // فراخوانی withdrawToken(token, to, amount)
        const tx = await fundContract.withdrawToken(usdt, toAddress, amount).send({
            feeLimit: 100_000_000, // 100 TRX
            callValue: 0,
            shouldPollResponse: true
        });

        const txId = typeof tx === 'string' ? tx : (tx?.txid || tx?.transaction?.txID || JSON.stringify(tx));

        setStatus(
            `برداشت موفق! <a href="${selectedNetCfg.explorer}/#/transaction/${txId}" target="_blank">مشاهده در Tronscan</a>`,
            'success'
        );

        // رفرش موجودی
        await loadFundDataForSelectedNetwork();
        await loadTotalRaised();

    } catch (err) {
        console.error('خطا در برداشت Tron:', err);

        let msg = err.message || err.toString() || 'خطای نامشخص';
        if (msg.includes('cancel') || msg.includes('Cancel') || err.code === 4001) {
            msg = 'تراکنش توسط شما لغو شد.';
        } else if (msg.includes('owner') || msg.includes('Ownable')) {
            msg = 'شما owner این خزانه نیستید.';
        } else if (msg.includes('Insufficient') || msg.includes('balance')) {
            msg = 'موجودی خزانه کافی نیست.';
        }

        setStatus('خطا در برداشت: ' + msg, 'error');
    }
}

function setStatus(message, type) {
    const statusDiv = document.getElementById('status');
    if (!statusDiv) return;
    statusDiv.className = type ? `status ${type}` : '';
    statusDiv.innerHTML = message || '';
}

// particles
if (typeof particlesJS === 'function') {
    particlesJS("particles-js", {
        "particles": {
            "number": { "value": 80 },
            "color": { "value": ["#4cc9f0", "#8b5cf6", "#7209b7"] },
            "shape": { "type": "circle" },
            "opacity": { "value": 0.5, "random": true },
            "size": { "value": 3, "random": true },
            "line_linked": { "enable": true, "distance": 140, "color": "#6366f1", "opacity": 0.25, "width": 1 },
            "move": { "enable": true, "speed": 1.2 }
        },
        "interactivity": {
            "events": { "onhover": { "enable": true, "mode": "repulse" } }
        }
    });
}

// شروع
document.addEventListener('DOMContentLoaded', init);
