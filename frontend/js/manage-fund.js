let web3;
let userAddress;
let fundContract;
let multisigContract;
let projectData = {};
let fundAddress;
let multisigAddress = null; // ابتدا null باشه

const USDC_ADDRESS = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

const fundABI = [
    {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}
];

const multisigABI = [
    {"inputs":[],"name":"getOwners","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"numConfirmationsRequired","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"_txIndex","type":"uint256"}],"name":"getTransaction","outputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"},{"internalType":"bool","name":"executed","type":"bool"},{"internalType":"uint256","name":"numConfirmations","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"getTransactionCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"_to","type":"address"},{"internalType":"uint256","name":"_value","type":"uint256"},{"internalType":"bytes","name":"_data","type":"bytes"}],"name":"submitTransaction","outputs":[{"internalType":"uint256","name":"txIndex","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"_txIndex","type":"uint256"}],"name":"confirmTransaction","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"_txIndex","type":"uint256"}],"name":"executeTransaction","outputs":[],"stateMutability":"nonpayable","type":"function"}
];

async function loadProject() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');

    if (!projectId) {
        document.getElementById('loading').innerHTML = '<p style="color:var(--danger);">آیدی پروژه مشخص نشده است.</p>';
        return;
    }

    try {
        const resp = await fetch('data/Projects.json');
        const data = await resp.json();
        projectData = data.features.find(f => f.attributes.ProjectID === projectId)?.attributes || {};

        if (!projectData.contractAddress) {
            document.getElementById('loading').innerHTML = '<p style="color:var(--danger);">پروژه پیدا نشد یا خزانه ندارد.</p>';
            return;
        }

        fundAddress = projectData.contractAddress;

        await connectWallet();
        await loadFundData();

        document.getElementById('projectName').textContent = projectData.نام_پروژه || `پروژه ${projectId}`;

        document.getElementById('loading').style.display = 'none';
        document.getElementById('main').style.display = 'block';

    } catch (err) {
        console.error(err);
        document.getElementById('loading').innerHTML = '<p style="color:var(--danger);">خطا در بارگذاری پروژه: ' + (err.message || "نامشخص") + '</p>';
    }
}

async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert("لطفاً MetaMask نصب کنید");
        return;
    }

    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        web3 = new Web3(window.ethereum);
        const accounts = await web3.eth.getAccounts();
        userAddress = accounts[0];

        const chainId = await web3.eth.getChainId();
        if (chainId !== 80002) {
            alert("لطفاً به شبکه Polygon Amoy Testnet سوئیچ کنید");
            return;
        }
    } catch (err) {
        alert("خطا در اتصال کیف پول");
    }
}

async function loadFundData() {
    fundContract = new web3.eth.Contract(fundABI, fundAddress);

    // موجودی USDC
    let balance = 0;
    try {
        balance = await fundContract.methods.balanceOf(USDC_ADDRESS).call();
    } catch (e) {
        console.warn("خطا در خواندن موجودی");
    }
    const balanceFormatted = (balance / 1e6).toFixed(4);
    document.getElementById('fundBalance').textContent = balanceFormatted;

    // آدرس خزانه
    document.getElementById('fundAddress').textContent = fundAddress.slice(0,10) + "..." + fundAddress.slice(-8);

    // تشخیص نوع مالکیت و مالک — شبیه dashboard
    let ownerAddr = "نامشخص";
    let required = "1";
    let owners = [];
    let isOwner = false;
    try {
        const owner = await fundContract.methods.owner().call();
        ownerAddr = owner.slice(0,10) + "..." + owner.slice(-8);

        if (owner.toLowerCase() === userAddress.toLowerCase()) {
            // تک‌مالکی
            isOwner = true;
            owners = [userAddress];
            required = "1 (تک‌مالکی)";
        } else {
            // چندمالکی — چک Multisig
            multisigContract = new web3.eth.Contract(multisigABI, owner);
            try {
                required = await multisigContract.methods.numConfirmationsRequired().call();
                owners = await multisigContract.methods.getOwners().call();
                isOwner = owners.some(o => o.toLowerCase() === userAddress.toLowerCase());
            } catch (e) {
                console.warn("خطا در خواندن اطلاعات Multisig", e);
            }
            multisigAddress = owner;
        }
    } catch (e) {
        console.warn("خطا در خواندن مالک خزانه", e);
    }

    document.getElementById('ownerAddress').textContent = ownerAddr;
    document.getElementById('requiredConfirmations').textContent = required;

    // چک دسترسی کاربر
    if (!isOwner) {
        document.getElementById('main').innerHTML = `
            <div class="card">
                <p style="color:var(--danger); text-align:center;">
                    شما صاحب این خزانه نیستید یا دسترسی ندارید.
                </p>
                <p>مالک فعلی: ${ownerAddr}</p>
            </div>
        `;
        return;
    }

    // لیست صاحبان
    const ownersList = document.getElementById('ownersList');
    ownersList.innerHTML = '';
    owners.forEach(owner => {
        const item = document.createElement('div');
        item.className = 'info-item';
        item.innerHTML = `
            <div class="info-label">صاحب</div>
            <div class="info-value">${owner.slice(0,10)}...${owner.slice(-8)}</div>
            ${owner.toLowerCase() === userAddress.toLowerCase() ? '<small style="color:var(--success);">شما</small>' : ''}
        `;
        ownersList.appendChild(item);
    });

    // اگر تک‌مالکی باشه، pending txs رو غیرفعال کن
    if (!multisigAddress) {
        document.querySelector('.card:nth-child(2) h3').textContent = "تراکنش‌های در انتظار (فقط برای Multisig)";
        document.getElementById('pendingTxs').innerHTML = '<p style="opacity:0.7;">این خزانه تک‌مالکی است و نیازی به تأیید چندگانه ندارد. برای برداشت مستقیم استفاده کنید.</p>';
        // می‌تونی اینجا دکمه برداشت مستقیم اضافه کنی اگر بخوای
    } else {
        await loadPendingTransactions();
    }
}

// بقیه کد بدون تغییر (loadPendingTransactions, confirmTx, submitWithdraw, setStatus, particlesJS)
