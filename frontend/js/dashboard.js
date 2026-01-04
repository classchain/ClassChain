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
        alert("لطفاً افزونه MetaMask را نصب کنید یا از کیف پول سازگار استفاده کنید.");
        return;
    }

    try {
        // اول سعی کن حساب‌ها رو بگیر (اگر قبلاً وصل شده باشه)
        let accounts = await window.ethereum.request({ method: 'eth_accounts' });

        if (accounts.length === 0) {
            // اگر حساب وصل نباشه، درخواست اتصال بده
            accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
            });
        }

        web3 = new Web3(window.ethereum);
        userAddress = accounts[0];

        // چک شبکه
        const chainId = await web3.eth.getChainId();
        if (chainId !== 80002) {
            alert(`لطفاً شبکه کیف پول را به Polygon Amoy Testnet تغییر دهید (Chain ID: 80002)`);
            return;
        }

        document.getElementById('accountDisplay').textContent = 
            `وصل شد: ${userAddress.slice(0,8)}...${userAddress.slice(-6)}`;

        document.getElementById('connectSection').style.display = 'none';
        document.getElementById('loading').style.display = 'block';

        await loadProjects(); // حالا پروژه‌ها رو بارگذاری کن

    } catch (err) {
        console.error("خطا در اتصال به کیف پول:", err);
        if (err.code === 4001) {
            alert("اتصال به کیف پول لغو شد. لطفاً دوباره امتحان کنید.");
        } else {
            alert("خطا در اتصال به کیف پول: " + (err.message || "مشکل ناشناخته"));
        }
    }
}

async function loadProjects() {
    try {
        document.getElementById('loading').innerHTML = '<p>در حال بارگذاری لیست پروژه‌ها...</p>';

        const resp = await fetch('data/Projects.json');
        if (!resp.ok) throw new Error("فایل Projects.json لود نشد");
        const data = await resp.json();

        const myProjects = [];
        let checkedCount = 0;
        const totalProjects = data.features.filter(f => f.attributes.contractAddress).length;

        for (const feature of data.features) {
            const attr = feature.attributes;
            if (!attr.contractAddress) continue;

            checkedCount++;

            // داخل لوپ for... پروژه‌ها، این بخش رو جایگزین کن:

            try {
                const fundContract = new web3.eth.Contract(fundABI, attr.contractAddress);

                // اول موجودی USDC رو بخون
                let balance = 0;
                try {
                    balance = await fundContract.methods.balanceOf(USDC_ADDRESS).call();
                } catch (e) {
                    console.warn("موجودی پروژه", attr.ProjectID, "لود نشد");
                }
                const balanceFormatted = (balance / 1e6).toFixed(4);

                // چک مالکیت — اصلاح‌شده برای هر دو نوع
                let isOwner = false;
                try {
                    const owner = await fundContract.methods.owner().call();

                    // اگر owner مستقیم آدرس کاربر باشه → تک‌مالکی
                    if (owner.toLowerCase() === userAddress.toLowerCase()) {
                        isOwner = true;
                    } else {
                        // اگر owner یک قرارداد (Multisig) باشه → چک owners
                        try {
                            const multisigContract = new web3.eth.Contract(multisigABI, owner);
                            const owners = await multisigContract.methods.getOwners().call();
                            isOwner = owners.some(o => o.toLowerCase() === userAddress.toLowerCase());
                        } catch (e) {
                            // اگر Multisig نباشه یا خطا بده، isOwner = false
                            console.warn("چک Multisig برای پروژه", attr.ProjectID, "ناموفق");
                        }
                    }
                } catch (e) {
                    console.warn("خطا در خواندن owner پروژه", attr.ProjectID, e);
                }

                if (isOwner) {
                    myProjects.push({
                        id: attr.ProjectID,
                        name: attr.نام_پروژه || `پروژه ${attr.ProjectID}`,
                        fundAddress: attr.contractAddress,
                        balance: balanceFormatted
                    });
                }

            } catch (e) {
                console.warn("خطا در پردازش پروژه", attr.ProjectID, e);
            }
        }

        displayProjects(myProjects);

        if (myProjects.length === 0) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('noAccess').style.display = 'block';
            document.getElementById('noAccess').innerHTML = `
                <p>هیچ پروژه‌ای پیدا نشد که شما صاحب خزانه آن باشید.</p>
                <p>تعداد پروژه‌های بررسی‌شده: ${checkedCount}</p>
            `;
        }

    } catch (err) {
        console.error("خطای کلی در لود پروژه‌ها:", err);
        document.getElementById('loading').innerHTML = `
            <p style="color:var(--danger);">خطا در بارگذاری پروژه‌ها:</p>
            <p>${err.message || "مشکل ناشناخته"}</p>
            <p>لطفاً صفحه را رفرش کنید یا اتصال کیف پول را چک کنید.</p>
        `;
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
