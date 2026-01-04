let web3;
let userAddress;
let fundContract;
let multisigContract;
let projectData = {};
let fundAddress;
let multisigAddress;

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
    {"inputs":[{"internalType":"address","name":"_to","type":"address"},{"internalType":"uint256","name":"_value","type":"uint256"},{"internalType":"bytes","name":"_","type":"bytes"}],"name":"submitTransaction","outputs":[{"internalType":"uint256","name":"txIndex","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
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
        const resp = await fetch('./data/Projects.json');
        const data = await resp.json();
        const project = data.features.find(f => f.attributes.ProjectID === projectId);

        if (!project) {
            document.getElementById('loading').innerHTML = '<p style="color:var(--danger);">پروژه پیدا نشد.</p>';
            return;
        }

        projectData = project.attributes;
        fundAddress = projectData.contractAddress;
        multisigAddress = projectData.multisigAddress || projectData.contractAddress;

        document.getElementById('projectName').textContent = projectData.نام_پروژه || `پروژه ${projectId}`;

        await connectWallet();
        await loadFundData();

        document.getElementById('loading').style.display = 'none';
        document.getElementById('main').style.display = 'block';

    } catch (err) {
        document.getElementById('loading').innerHTML = '<p style="color:var(--danger);">خطا در بارگذاری اطلاعات پروژه.</p>';
    }
}

async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert("لطفاً MetaMask نصب کنید");
        return;
    }

    await window.ethereum.request({ method: 'eth_requestAccounts' });
    web3 = new Web3(window.ethereum);
    const accounts = await web3.eth.getAccounts();
    userAddress = accounts[0];

    const chainId = await web3.eth.getChainId();
    if (chainId !== 80002) {
        alert("لطفاً به شبکه Polygon Amoy Testnet سوئیچ کنید");
        return;
    }
}

async function loadFundData() {
    fundContract = new web3.eth.Contract(fundABI, fundAddress);
    multisigContract = new web3.eth.Contract(multisigABI, multisigAddress);

    // موجودی USDC
    const balance = await fundContract.methods.balanceOf(USDC_ADDRESS).call();
    const balanceFormatted = (balance / 1e6).toFixed(4);
    document.getElementById('fundBalance').textContent = balanceFormatted;

    // آدرس‌ها
    document.getElementById('fundAddress').textContent = fundAddress.slice(0,10) + "..." + fundAddress.slice(-8);
    document.getElementById('ownerAddress').textContent = multisigAddress.slice(0,10) + "..." + multisigAddress.slice(-8);

    // اطلاعات Multisig
    const owners = await multisigContract.methods.getOwners().call();
    const required = await multisigContract.methods.numConfirmationsRequired().call();

    document.getElementById('requiredConfirmations').textContent = required;

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

    await loadPendingTransactions();
}

async function loadPendingTransactions() {
    const count = await multisigContract.methods.getTransactionCount().call();
    const pendingDiv = document.getElementById('pendingTxs');

    if (count == 0) {
        pendingDiv.innerHTML = '<p>هیچ تراکنش در انتظاری وجود ندارد.</p>';
        return;
    }

    pendingDiv.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const tx = await multisigContract.methods.getTransaction(i).call();
        if (tx.executed) continue;

        const div = document.createElement('div');
        div.className = 'pending-tx';
        div.innerHTML = `
            <p><strong>تراکنش #${i}</strong></p>
            <p>مقصد: ${tx.to.slice(0,10)}...${tx.to.slice(-8)}</p>
            <p>مقدار اتر: ${web3.utils.fromWei(tx.value, 'ether')}</p>
            <p>تأییدها: ${tx.numConfirmations} / ${await multisigContract.methods.numConfirmationsRequired().call()}</p>
            <button onclick="confirmTx(${i})" ${tx.numConfirmations > 0 ? 'class="success"' : ''}>تأیید این تراکنش</button>
        `;
        pendingDiv.appendChild(div);
    }
}

async function confirmTx(txIndex) {
    try {
        setStatus("در حال ارسال تأیید...", "warning");
        await multisigContract.methods.confirmTransaction(txIndex).send({ from: userAddress, gas: 300000 });
        setStatus("تأیید موفق! در حال اجرا...", "success");
        await loadFundData(); // رفرش اطلاعات
    } catch (err) {
        setStatus("خطا در تأیید: " + (err.message || "نامشخص"), "error");
    }
}

async function submitWithdraw() {
    const amountInput = document.getElementById('withdrawAmount').value;
    const toAddress = document.getElementById('withdrawTo').value.trim();

    if (!amountInput || !toAddress || !web3.utils.isAddress(toAddress)) {
        setStatus("مقدار و آدرس معتبر وارد کنید", "error");
        return;
    }

    const amount = web3.utils.toBN(Math.round(parseFloat(amountInput) * 1e6));

    // ساخت encoded data برای withdrawToken
    const withdrawData = web3.eth.abi.encodeFunctionCall({
        name: 'withdrawToken',
        type: 'function',
        inputs: [{type: 'address', name: 'token'}, {type: 'address', name: 'to'}, {type: 'uint256', name: 'amount'}]
    }, [USDC_ADDRESS, toAddress, amount]);

    try {
        setStatus("در حال ثبت درخواست برداشت...", "warning");
        const tx = await multisigContract.methods.submitTransaction(
            fundAddress,
            0,
            withdrawData
        ).send({ from: userAddress, gas: 400000 });

        setStatus(`درخواست برداشت ثبت شد! تراکنش #${tx.events.SubmitTransaction.returnValues.txIndex}`, "success");
        await loadFundData();
    } catch (err) {
        setStatus("خطا در ثبت: " + (err.message || "نامشخص"), "error");
    }
}

function setStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = message;
}

// فعال‌سازی particles
particlesJS("particles-js", {
    "particles": { "number": { "value": 100 }, "color": { "value": ["#4cc9f0", "#8b5cf6", "#7209b7"] }, "shape": { "type": "circle" }, "opacity": { "value": 0.6, "random": true }, "size": { "value": 3, "random": true }, "line_linked": { "enable": true, "distance": 140, "color": "#6366f1", "opacity": 0.3, "width": 1 }, "move": { "enable": true, "speed": 1.5 } },
    "interactivity": { "events": { "onhover": { "enable": true, "mode": "repulse" } } }
});

loadProject();
