let selectedAmount = 0;
let selectedNetwork = 'polygon';
let currentContract = null;
let userAddress = null;
let web3 = null;
let projects = {}; // خیلی مهم — برای جلوگیری از بهم ریختگی صفحه

const networks = {
    amoy: {
        name: "Polygon Amoy (تست‌نت)",
        icon: "https://cryptologos.cc/logos/polygon-matic-logo.png",
        addressField: "contractAddress",
        usdtAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",  // USDC رسمی
        chainId: 80002,
        explorer: "https://amoy.polygonscan.com",
    },
    CLC: {
        name: "CLC ClassChain (تست‌نت)",
        icon: "https://cryptologos.cc/logos/polygon-matic-logo.png",
        addressField: "contractAddress",
        usdtAddress: "0x39Af73d2736f6EC94778a38c0C7Ef800e58B13a7",
        chainId: 80002,
        explorer: "https://amoy.polygonscan.com",
    },
    polygon: {
        name: "Polygon Mainnet",
        icon: "https://cryptologos.cc/logos/polygon-matic-logo.png",
        addressField: "contractAddressMainnet",
        usdtAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        chainId: 137,
        explorer: "https://polygonscan.com",
    },
    ethereum: {
        name: "Ethereum",
        icon: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
        addressField: "contractAddressEthereum",
        usdtAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        chainId: 1,
        explorer: "https://etherscan.io",
    },
    bsc: {
        name: "Binance Smart Chain",
        icon: "https://cryptologos.cc/logos/binance-coin-bnb-logo.png",
        addressField: "contractAddressBSC",
        usdtAddress: "0x55d398326f99059ff7754852469993b3197955e7",
        chainId: 56,
        explorer: "https://bscscan.com",
    },
    tron: {
        name: "Tron (TRC-20)",
        icon: "https://cryptologos.cc/logos/tron-trx-logo.png",
        addressField: "contractAddressTron",
        usdtAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        chainId: null,
        explorer: "https://tronscan.org",
    },
    arbitrum: {
        name: "Arbitrum One",
        icon: "https://cryptologos.cc/logos/arbitrum-arb-logo.png",
        addressField: "contractAddressArbitrum",
        usdtAddress: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        chainId: 42161,
        explorer: "https://arbiscan.io",
    },
    optimism: {
        name: "Optimism",
        icon: "https://cryptologos.cc/logos/optimism-ethereum-op-logo.png",
        addressField: "contractAddressOptimism",
        usdtAddress: "0x94b008aa00579c13056b0a762ad3af54ac829873",
        chainId: 10,
        explorer: "https://optimistic.etherscan.io",
    },
    avalanche: {
        name: "Avalanche",
        icon: "https://cryptologos.cc/logos/avalanche-avax-logo.png",
        addressField: "contractAddressAvalanche",
        usdtAddress: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7",
        chainId: 43114,
        explorer: "https://snowtrace.io",
    },
    solana: {
        name: "Solana",
        icon: "https://cryptologos.cc/logos/solana-sol-logo.png",
        addressField: "contractAddressSolana",
        usdtAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        chainId: null,
        explorer: "https://solscan.io",
    }
};

async function loadProject() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');

    if (!projectId) {
        document.getElementById('projectTitle').innerText = "پروژه یافت نشد";
        return;
    }

    const response = await fetch('data/Projects.json');
    const data = await response.json();

    let foundProject = null;
    data.features.forEach(feature => {
        if (feature.attributes.ProjectID === projectId) {
            foundProject = feature.attributes;
        }
    });

    if (!foundProject) {
        document.getElementById('projectTitle').innerText = "پروژه یافت نشد";
        return;
    }

    // ذخیره پروژه برای استفاده در بقیه کدها
    projects = foundProject;

    document.getElementById('projectTitle').innerText = foundProject["نام پروژه"];
    document.getElementById('projectDesc').innerText = `${foundProject.استان} - ${foundProject.منطقه} | ${foundProject["تعداد کلاس"]} کلاس`;

    const target = foundProject["targetAmount(USDT)"] || 0;
    currentContract = foundProject.contractAddress || foundProject.contractAddressTron || null;

    // پر کردن سلکتور شبکه
    const select = document.getElementById('networkSelect');
    select.innerHTML = '';
    Object.keys(networks).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = networks[key].name;
        select.appendChild(opt);
    });

    loadProgress(target);
    loadDonors();
}

document.getElementById('customAmount').oninput = (e) => {
    selectedAmount = parseFloat(e.target.value) || 0;
};

function selectNetwork(network) {
    selectedNetwork = network;
    const net = networks[network];
    currentContract = (network === 'tron') ? projects.contractAddressTron : projects.contractAddress || null;
    document.getElementById('qrSection').style.display = network === 'tron' ? 'block' : 'none';
}

async function loadProgress(target = 100000) {
    const totalRaised = 0; // در آینده از on-chain بخوانید
    const percent = Math.min((totalRaised / target) * 100, 100);

    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').innerText = `${totalRaised.toFixed(2)} USDT از ${target.toLocaleString('fa-IR')} USDT جمع شده (${percent.toFixed(1)}%)`;
}

document.getElementById('connectBtn').onclick = async () => {
    if (!currentContract) {
        alert("خزانه هوشمند برای این شبکه هنوز راه‌اندازی نشده");
        return;
    }

    if (selectedAmount <= 0) {
        alert("لطفاً مقدار معتبر وارد کنید");
        return;
    }

    const net = networks[selectedNetwork];

    /* =========================
       شاخه TRON — بدون تغییر
       ========================= */
    if (selectedNetwork === 'tron') {
        if (!isTronReady()) {
            alert("لطفاً TronLink را نصب و فعال کنید");
            return;
        }

        try {
            const tronWeb = window.tronWeb;
            const userAddress = tronWeb.defaultAddress.base58;

            const usdtContract = await tronWeb.contract().at(net.usdtAddress);
            const amount = Math.floor(selectedAmount * 1_000_000);

            const tx = await usdtContract
                .transfer(currentContract, amount)
                .send();

            document.getElementById('txHash').innerHTML =
                `تراکنش با موفقیت ارسال شد!<br>
                <a href="${net.explorer}/transaction/${tx}" target="_blank">
                مشاهده در Tronscan
                </a>`;

            document.getElementById('successMessage').style.display = 'block';
            document.getElementById('connectBtn').style.display = 'none';

            loadProgress();

        } catch (err) {
            alert("خطا در ارسال تراکنش ترون: " + (err.message || "نامشخص"));
        }

        return;
    }

    /* =========================
       شاخه EVM — با approve + depositToken (رفع شکست تراکنش)
       ========================= */

    if (typeof window.ethereum === 'undefined') {
        alert("لطفاً MetaMask یا کیف پول سازگار نصب کنید");
        return;
    }

    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        web3 = new Web3(window.ethereum);
        const accounts = await web3.eth.getAccounts();
        userAddress = accounts[0];

        const tokenABI = [
            {
                "inputs": [{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],
                "name":"approve",
                "outputs":[{"name":"","type":"bool"}],
                "type":"function"
            }
        ];

        const fundABI = [
            {
                "inputs": [{"name":"token","type":"address"},{"name":"amount","type":"uint256"}],
                "name":"depositToken",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            }
        ];

        const tokenContract = new web3.eth.Contract(tokenABI, net.usdtAddress);
        const fundContract = new web3.eth.Contract(fundABI, currentContract);

        // محاسبه مقدار — USDT/USDC = 6 decimals، CLC = 18 decimals
        const decimals = (selectedNetwork === 'CLC') ? 18 : 6;
        const amount = web3.utils.toBN(selectedAmount * (10 ** decimals));

        // مرحله ۱: Approve
        await tokenContract.methods
            .approve(currentContract, amount)
            .send({ from: userAddress });

        // مرحله ۲: Deposit
        const tx = await fundContract.methods
            .depositToken(net.usdtAddress, amount)
            .send({ from: userAddress });

        document.getElementById('txHash').innerHTML =
            `کمک با موفقیت ثبت شد! ❤️<br>
            <a href="${net.explorer}/tx/${tx.transactionHash}" target="_blank">
            مشاهده در اکسپلورر
            </a>`;

        document.getElementById('successMessage').style.display = 'block';
        document.getElementById('connectBtn').style.display = 'none';

        loadProgress();

    } catch (err) {
        if (err.code === 4001) {
            alert("تراکنش توسط کاربر لغو شد");
        } else {
            alert("خطا در ارسال تراکنش: " + (err.message || "نامشخص"));
        }
    }
};

// فعال کردن دکمه با تیک چک‌باکس
document.getElementById('termsConsent').addEventListener('change', function() {
    document.getElementById('connectBtn').disabled = !this.checked;
});

function saveEmail() {
    const email = document.getElementById('donorEmail').value.trim();
    if (!email || !document.getElementById('consent').checked) {
        alert("لطفاً ایمیل معتبر وارد کنید و تأیید را بزنید");
        return;
    }
    alert("ایمیل شما ثبت شد! آپدیت‌های پروژه برایتان ارسال خواهد شد ❤️");
}

// فعال‌سازی particles
particlesJS("particles-js", {
    "particles": {
        "number": { "value": 100 },
        "color": { "value": ["#4cc9f0", "#8b5cf6", "#7209b7"] },
        "shape": { "type": "circle" },
        "opacity": { "value": 0.6, "random": true },
        "size": { "value": 3, "random": true },
        "line_linked": {
            "enable": true,
            "distance": 140,
            "color": "#6366f1",
            "opacity": 0.3,
            "width": 1
        },
        "move": { "enable": true, "speed": 1.5 }
    },
    "interactivity": {
        "events": { "onhover": { "enable": true, "mode": "repulse" } }
    }
});

function isTronReady() {
    return window.tronWeb && window.tronWeb.defaultAddress.base58;
}

// اجرای اولیه
loadProject();
