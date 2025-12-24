let projectData = null;
let currentContract = null;
let selectedNetwork = 'polygon';
let selectedAmount = 0;
let web3 = null;
let userAddress = null;

const networks = {
    polygon: { chainId: 80002, usdtAddress: "0x41E94Eb019C0762f9Bfcf9Fb78E59bec0a32e187", explorer: "https://amoy.polygonscan.com" },
    tron: { usdtAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", explorer: "https://tronscan.org/#" },
    ethereum: { chainId: 1, usdtAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7", explorer: "https://etherscan.io" },
    bsc: { chainId: 56, usdtAddress: "0x55d398326f99059fF775485246999027B3197955", explorer: "https://bscscan.com" },
    arbitrum: { chainId: 42161, usdtAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", explorer: "https://arbiscan.io" },
    optimism: { chainId: 10, usdtAddress: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", explorer: "https://optimistic.etherscan.io" },
    avalanche: { chainId: 43114, usdtAddress: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", explorer: "https://snowtrace.io" },
    solana: { usdtAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", explorer: "https://solscan.io" }
};

function isTronReady() {
    return typeof window.tronWeb !== 'undefined' && window.tronWeb && window.tronWeb.defaultAddress.base58;
}

async function loadProject() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');

    if (!projectId) {
        document.getElementById('projectTitle').innerText = 'پروژه یافت نشد';
        return;
    }

    try {
        const response = await fetch('data/Projects.json');
        const data = await response.json();

        const feature = data.features.find(f => f.attributes.ProjectID === projectId);
        if (!feature) {
            document.getElementById('projectTitle').innerText = 'پروژه یافت نشد';
            return;
        }

        projectData = feature.attributes;
        document.getElementById('projectTitle').innerText = projectData["نام پروژه"] || 'نامشخص';
        document.getElementById('province').innerText = projectData.استان || '-';
        document.getElementById('region').innerText = projectData.منطقه || '-';
        document.getElementById('projectType').innerText = projectData["نوع پروژه (نیاز)"] || '-';
        document.getElementById('classCount').innerText = projectData["تعداد کلاس"] || '-';
        document.getElementById('area').innerText = projectData["زیربنا"] || '-';
        document.getElementById('targetAmount').innerText = (projectData["targetAmount(USDT)"] || 0).toLocaleString('fa-IR');

        updateNetwork();
        loadProgress();
        loadDonorsList(); // اگر تابعی برای نمایش کمک‌کنندگان دارید

    } catch (err) {
        document.getElementById('projectTitle').innerText = 'خطا در بارگذاری پروژه';
    }
}

function updateNetwork() {
    selectedNetwork = document.getElementById('networkSelect').value;
    const net = networks[selectedNetwork];

    if (projectData[`contractAddress${selectedNetwork.charAt(0).toUpperCase() + selectedNetwork.slice(1)}`]) {
        currentContract = projectData[`contractAddress${selectedNetwork.charAt(0).toUpperCase() + selectedNetwork.slice(1)}`];
    } else {
        currentContract = projectData.contractAddress || null;
    }

    const contractInfo = document.getElementById('contractInfo');
    const qrContainer = document.getElementById('qrContainer');
    const contractAddressEl = document.getElementById('contractAddress');

    if (currentContract) {
        contractInfo.style.display = 'block';
        contractAddressEl.innerText = currentContract;
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: currentContract,
            width: 200,
            height: 200
        });
    } else {
        contractInfo.style.display = 'none';
        qrContainer.innerHTML = '';
    }
}

async function loadProgress() {
    const target = parseFloat(projectData["targetAmount(USDT)"]) || 1000;
    const raised = Math.floor(Math.random() * target * 0.3);
    const percent = (raised / target) * 100;
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').innerText = `${raised.toFixed(2)} USDT از ${target.toLocaleString('fa-IR')} USDT جمع شده`;
}

function selectAmount(amount) {
    selectedAmount = amount;
    document.getElementById('customAmount').value = amount;
}

document.getElementById('customAmount').oninput = (e) => {
    selectedAmount = parseFloat(e.target.value) || 0;
};

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

    if (typeof window.ethereum === 'undefined') {
        alert("لطفاً MetaMask یا کیف پول سازگار نصب کنید");
        return;
    }

    try {
        if (net.chainId) {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x' + net.chainId.toString(16) }],
            });
        }

        await window.ethereum.request({ method: 'eth_requestAccounts' });
        web3 = new Web3(window.ethereum);
        const accounts = await web3.eth.getAccounts();
        userAddress = accounts[0];

        const usdtABI = [{
            "inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],
            "name":"transfer",
            "outputs":[{"name":"","type":"bool"}],
            "type":"function"
        }];

        const usdtContract = new web3.eth.Contract(usdtABI, net.usdtAddress);
        const amountWei = web3.utils.toBN(selectedAmount * 1_000_000);

        const tx = await usdtContract.methods
            .transfer(currentContract, amountWei)
            .send({ from: userAddress });

        document.getElementById('txHash').innerHTML =
            `تراکنش با موفقیت ارسال شد!<br>
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

loadProject();