let web3;
let userAddress;
let projects = [];

const USDC_ADDRESS = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";

const fundABI = [
    {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}
];

const multisigABI = [
    {"inputs":[],"name":"getOwners","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"}
];

async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert("لطفاً MetaMask نصب کنید");
        return;
    }

    await window.ethereum.request({ method: 'eth_requestAccounts' });
    web3 = new Web3(window.ethereum);
    const accounts = await web3.eth.getAccounts();
    userAddress = accounts[0];

    document.getElementById('accountDisplay').textContent = `وصل شد: ${userAddress.slice(0,8)}...${userAddress.slice(-6)}`;

    const chainId = await web3.eth.getChainId();
    if (chainId !== 80002) {
        alert("لطفاً به شبکه Polygon Amoy Testnet سوئیچ کنید");
        return;
    }

    document.getElementById('connectSection').style.display = 'none';
    document.getElementById('loading').style.display = 'block';

    await loadProjects();
}

async function loadProjects() {
    try {
        const resp = await fetch('../data/Projects.json');
        const data = await resp.json();

        const myProjects = [];

        for (const feature of data.features) {
            const attr = feature.attributes;
            if (!attr.contractAddress) continue;

            const fundContract = new web3.eth.Contract(fundABI, attr.contractAddress);

            try {
                const owner = await fundContract.methods.owner().call();

                let isOwner = false;

                if (web3.utils.isAddress(owner)) {
                    // چک Multisig owners
                    try {
                        const multisigContract = new web3.eth.Contract(multisigABI, owner);
                        const owners = await multisigContract.methods.getOwners().call();
                        isOwner = owners.some(o => o.toLowerCase() === userAddress.toLowerCase());
                    } catch (e) {
                        // اگر owner Multisig نباشه، مستقیم چک کن
                        isOwner = owner.toLowerCase() === userAddress.toLowerCase();
                    }
                }

                if (isOwner) {
                    const balance = await fundContract.methods.balanceOf(USDC_ADDRESS).call();
                    const balanceFormatted = (balance / 1e6).toFixed(4);

                    myProjects.push({
                        id: attr.ProjectID,
                        name: attr.نام_پروژه || `پروژه ${attr.ProjectID}`,
                        fundAddress: attr.contractAddress,
                        balance: balanceFormatted
                    });
                }
            } catch (e) {
                console.warn("خطا در چک مالکیت پروژه", attr.ProjectID, e);
            }
        }

        displayProjects(myProjects);

    } catch (err) {
        console.error(err);
        document.getElementById('loading').innerHTML = '<p style="color:var(--danger);">خطا در بارگذاری پروژه‌ها</p>';
    }
}

function displayProjects(projectsList) {
    document.getElementById('loading').style.display = 'none';

    const container = document.getElementById('projectsList');

    if (projectsList.length === 0) {
        document.getElementById('noAccess').style.display = 'block';
        return;
    }

    container.innerHTML = '';

    projectsList.forEach(proj => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
            <div class="project-title">${proj.name}</div>
            <div class="project-info">آیدی: ${proj.id}</div>
            <div class="project-info">آدرس خزانه: ${proj.fundAddress.slice(0,10)}...${proj.fundAddress.slice(-8)}</div>
            <div class="project-balance">${proj.balance} USDC</div>
            <a href="manage-fund.html?project=${proj.id}" class="manage-btn">مدیریت خزانه</a>
        `;
        container.appendChild(card);
    });
}

// particles
particlesJS("particles-js", {
    "particles": { "number": { "value": 100 }, "color": { "value": ["#4cc9f0", "#8b5cf6", "#7209b7"] }, "shape": { "type": "circle" }, "opacity": { "value": 0.6, "random": true }, "size": { "value": 3, "random": true }, "line_linked": { "enable": true, "distance": 140, "color": "#6366f1", "opacity": 0.3, "width": 1 }, "move": { "enable": true, "speed": 1.5 } },
    "interactivity": { "events": { "onhover": { "enable": true, "mode": "repulse" } } }
});
