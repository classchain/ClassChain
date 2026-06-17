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
        usdtAddress: "0xECa9bC828A3005B9a3b909f2cc5c2a54794DE05F",
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
// ==================== توابع کمکی جدید ====================

function getTokenDecimals(network) {
    const decimalsMap = {
        'amoy': 6, 'CLC': 18, 'polygon': 6, 'ethereum': 6,
        'bsc': 6, 'arbitrum': 6, 'optimism': 6, 'avalanche': 6,
        'solana': 6, 'tron': 6
    };
    return decimalsMap[network] || 6;
}

function optimisticProgressUpdate(donatedAmount) {
    const progressTextEl = document.getElementById('progressText');
    if (!progressTextEl) return;

    let currentText = progressTextEl.innerText || "0";
    let currentRaised = parseFloat(currentText) || 0;
    currentRaised += donatedAmount;

    const targetMatch = currentText.match(/از ([\d,]+)/);
    const target = targetMatch ? parseFloat(targetMatch[1].replace(/,/g, '')) : 100000;

    const percent = Math.min((currentRaised / target) * 100, 100);

    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').innerText = 
        `${currentRaised.toFixed(2)} USDT از ${target.toLocaleString('fa-IR')} USDT جمع شده (${percent.toFixed(1)}%)`;
}

function handleTransactionError(err, approveTxHash, depositTxHash, net) {
    let errorMsg = "خطا در ارسال تراکنش:\n";

    if (err.code === 4001 || err.message?.includes("User denied") || err.message?.includes("denied")) {
        errorMsg += "تراکنش توسط شما لغو شد.";
    } else if (err.message?.includes("insufficient funds")) {
        errorMsg += "موجودی کیف پول (گس یا توکن) کافی نیست.";
    } else if (err.message?.includes("execution reverted")) {
        errorMsg += "تراکنش برگشت خورد. ممکن است قرارداد هنوز فعال نشده یا توکن مجاز نباشد.";
    } else {
        errorMsg += err.message || "خطای نامشخص";
    }

    if (approveTxHash && !depositTxHash) {
        errorMsg += `\n\n✅ Approve موفق بود:\n${net.explorer}/tx/${approveTxHash}\n❌ اما مرحله واریز (Deposit) شکست خورد.`;
    }

    alert(errorMsg);

    document.getElementById('connectBtn').style.display = 'block';
    document.getElementById('successMessage').style.display = 'none';
}

function updateButtonState() {
    const termsChecked = document.getElementById('termsConsent').checked;
    document.getElementById('connectBtn').disabled = !termsChecked;
}
// ==================== تابع اصلی Donate (بهبود یافته) ====================

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
	const isInfinite = document.getElementById('infiniteApprove')?.checked || false;
	
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

			optimisticProgressUpdate(selectedAmount);
			
            //loadProgress();
        } 
		catch (err) {
		    let userMessage = 'خطا در تراکنش:\n';
		    if (err.code === 4001) userMessage += '❌ شما تراکنش را لغو کردید.';
		    else if (err.message.includes('insufficient funds')) userMessage += '❌ موجودی کیف پول کافی نیست.';
		    else if (err.message.includes('execution reverted')) userMessage += '❌ تراکنش برگشت خورد. ممکن است توکن مجاز نباشد.';
		    else userMessage += err.message;
		    alert(userMessage);
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
	let approveTxHash = null;
	let depositTxHash = null;
    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        web3 = new Web3(window.ethereum);
        const accounts = await web3.eth.getAccounts();
        userAddress = accounts[0];

		const chainId = await web3.eth.getChainId();
		if (chainId !== net.chainId) {
			alert(`لطفاً شبکه را به ${net.name} تغییر دهید (Chain ID: ${net.chainId})`);
			return;
		}
				
		const decimals = getTokenDecimals(selectedNetwork);
        const amount = web3.utils.toBN(selectedAmount * (10 ** decimals));

		const balanceABI = [{
            "constant": true,
            "inputs": [{"name": "_owner", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "balance", "type": "uint256"}],
            "type": "function"
        }];
		const tokenContractForBalance = new web3.eth.Contract(balanceABI, net.usdtAddress);
        const userBalance = await tokenContractForBalance.methods.balanceOf(userAddress).call();

		if (web3.utils.toBN(userBalance).lt(amount)) {
            const balanceMain = (Number(userBalance) / (10 ** decimals)).toFixed(2);
            alert(`⚠️ موجودی کافی نیست!\n\nموجودی شما: ${balanceMain} USDT\nمبلغ درخواستی: ${selectedAmount} USDT`);
            return;
        }
		//const decimals = (selectedNetwork === 'CLC') ? 18 : 6;
		//const tokenDecimals = {
		//    'amoy': 6,
		//    'CLC': 18,
		//    'polygon': 6,
		//    'ethereum': 6,
		//    'bsc': 6,
		//    'arbitrum': 6,
		//    'optimism': 6,
		//    'avalanche': 6,
		//    'solana': 6,
		//    'tron': 6
		//};
		//const decimals = tokenDecimals[selectedNetwork] || 6;
		
		//const tokenABI = [
  		//  {
		//        "constant": true,
		//        "inputs": [{"name": "_owner", "type": "address"}],
		//        "name": "balanceOf",
		//        "outputs": [{"name": "balance", "type": "uint256"}],
		//        "type": "function"
		//    },
		//    {
		//        "inputs": [
		//            {"name": "spender", "type": "address"},
		//            {"name": "amount", "type": "uint256"}
		//        ],
 		//       "name": "approve",
		//        "outputs": [{"name": "", "type": "bool"}],
		//        "type": "function"
		//    }
		//];
		// ABI کامل
        const tokenABI = [
            {
                "inputs": [{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],
                "name":"approve",
                "outputs":[{"name":"","type":"bool"}],
                "type":"function"
            },
            {
                "constant": true,
                "inputs": [{"name": "_owner", "type": "address"}],
                "name": "balanceOf",
                "outputs": [{"name": "balance", "type": "uint256"}],
                "type": "function"
            }
        ];
        //const tokenABI = [{ "inputs": [{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}], "name":"approve", "outputs":[{"name":"","type":"bool"}], "type":"function" }];
        //const fundABI = [{ "inputs": [{"name":"token","type":"address"},{"name":"amount","type":"uint256"}], "name":"depositToken", "outputs": [], "stateMutability": "nonpayable", "type": "function" }];
		const fundABI = [{
            "inputs": [{"name":"token","type":"address"},{"name":"amount","type":"uint256"}],
            "name":"depositToken",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        }];
		
        const tokenContract = new web3.eth.Contract(tokenABI, net.usdtAddress);
        const fundContract = new web3.eth.Contract(fundABI, currentContract);
		
		// نمایش وضعیت
        document.getElementById('successMessage').style.display = 'block';
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('txHash').innerHTML = `<p><strong>در حال آماده‌سازی تراکنش...</strong></p>`;
		//-------------- تغییرات جدید -----------------
		// مرحله ۱: Approve
        const approveAmount = isInfinite 
            ? web3.utils.toBN('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
            : amount;

        document.getElementById('txHash').innerHTML = `
            <p><strong>مرحله ۱ از ۲:</strong> ${isInfinite ? 'اجازه دائمی برداشت' : 'تأیید برداشت'} (Approve)</p>
        `;

        const approveGas = await tokenContract.methods
            .approve(currentContract, approveAmount)
            .estimateGas({ from: userAddress });
		const approveTx = await tokenContract.methods
            .approve(currentContract, approveAmount)
            .send({ 
                from: userAddress,
                gas: Math.floor(approveGas * 1.25),
                gasPrice: await web3.eth.getGasPrice()
            });

        approveTxHash = approveTx.transactionHash;

        document.getElementById('txHash').innerHTML = `
            <p style="color: green;">✅ مرحله ۱ موفق: ${isInfinite ? 'اجازه دائمی' : 'اجازه برداشت'} صادر شد!</p>
            <p><a href="${net.explorer}/tx/${approveTxHash}" target="_blank">مشاهده Approve</a></p>
            <hr>
            <p><strong>مرحله ۲ از ۲:</strong> واریز به خزانه (Deposit)</p>
        `;
		// مرحله ۲: Deposit
        const depositGas = await fundContract.methods
            .depositToken(net.usdtAddress, amount)
            .estimateGas({ from: userAddress });

        const depositTx = await fundContract.methods
            .depositToken(net.usdtAddress, amount)
            .send({ 
                from: userAddress,
                gas: Math.floor(depositGas * 1.3),
                gasPrice: await web3.eth.getGasPrice()
            });

        depositTxHash = depositTx.transactionHash;

        // موفقیت نهایی
        document.getElementById('txHash').innerHTML = `
            <p style="color: green; font-size: 1.15em;">🎉 کمک شما با موفقیت ثبت شد! ❤️</p>
            <p>مبلغ: <strong>${selectedAmount} USDT</strong></p>
            ${isInfinite ? '<p style="color:#10b981">✅ اجازه دائمی فعال شد — دفعات بعدی خیلی سریع‌تر خواهد بود.</p>' : ''}
            <p><strong>Approve Tx:</strong> <a href="${net.explorer}/tx/${approveTxHash}" target="_blank">مشاهده</a></p>
            <p><strong>Deposit Tx:</strong> <a href="${net.explorer}/tx/${depositTxHash}" target="_blank">مشاهده</a></p>
            <p>از حمایت گرم شما صمیمانه سپاسگزاریم.</p>
        `;
		optimisticProgressUpdate(selectedAmount);
	} catch (err) {
        console.error("خطا در تراکنش:", err);
        handleTransactionError(err, approveTxHash, depositTxHash, net);
    }		
};


		//--------------------------- از اینجا حذف شد------------------------------------
	    //// ✅ مرحله 1: بررسی موجودی
//	    console.log(`🔍 بررسی موجودی کاربر ${userAddress} برای توکن ${net.usdtAddress}`);
//		const userBalance = await tokenContract.methods.balanceOf(userAddress).call();
//	    console.log(`💰 موجودی کاربر: ${userBalance} (واحدهای کوچک)`);
//	    console.log(`💰 موجودی مورد نیاز: ${amount} (واحدهای کوچک)`);

	    // مقایسه موجودی با مقدار درخواستی
//	    if (web3.utils.toBN(userBalance).lt(amount)) {
        // محاسبه موجودی به واحد اصلی برای نمایش بهتر
//			const balanceInMainUnit = userBalance / (10 ** decimals);
			//const amountInMainUnit = selectedAmount;
        
//	        alert(`⚠️ موجودی کافی نیست!\n\n` +
//	              `موجودی شما: ${balanceInMainUnit} ${net.name === 'CLC' ? 'CLC' : 'USDT'}\n` +
//	              `مبلغ مورد نیاز: ${amountInMainUnit} ${net.name === 'CLC' ? 'CLC' : 'USDT'}\n\n` +
//	              `لطفاً کیف پول خود را شارژ کنید.`);
//	        return; // 🛑 توقف اجرا
//	    }

//	    console.log('✅ موجودی کافی است، ادامه فرآیند...');

    // مرحله ۲: Approve
        // نمایش وضعیت اولیه
//        document.getElementById('txHash').innerHTML = `
//            <p><strong>مرحله ۱ از ۲:</strong> تأیید اجازه برداشت (Approve)</p>
//            <p>در حال ارسال تراکنش اجازه به متامسک...</p>
//        `;
//        document.getElementById('successMessage').style.display = 'block';
//        document.getElementById('connectBtn').style.display = 'none';

        // مرحله ۱: Approve با گس بالاتر
//        const approveTx = await tokenContract.methods
//            .approve(currentContract, amount)
//            .send({ 
//                from: userAddress,
//                gas: 100000,           // گس بالاتر برای اطمینان
//                gasPrice: await web3.eth.getGasPrice()
//            });

//        approveTxHash = approveTx.transactionHash;

//        document.getElementById('txHash').innerHTML = `
//            <p style="color: green;">✅ مرحله ۱ موفق: اجازه برداشت تأیید شد!</p>
//            <p><a href="${net.explorer}/tx/${approveTxHash}" target="_blank">مشاهده Approve در اکسپلورر</a></p>
//            <hr>
//            <p><strong>مرحله ۲ از ۲:</strong> واریز به خزانه (Deposit)</p>
//            <p>تراکنش دوم را در متامسک تأیید کنید...</p>
//        `;

        // مرحله ۲: Deposit با گس بالاتر
//		const depositGas = await fundContract.methods
//            .depositToken(net.usdtAddress, amount)
//            .estimateGas({ from: userAddress });
		
//        const depositTx = await fundContract.methods
//            .depositToken(net.usdtAddress, amount)
//            .send({ 
//                from: userAddress,
//                gas: Math.floor(depositGas * 1.25),
//                gasPrice: await web3.eth.getGasPrice()
//            });

//        depositTxHash = depositTx.transactionHash;

//        document.getElementById('txHash').innerHTML = `
//            <p style="color: green;">🎉 کمک شما با موفقیت به خزانه واریز شد! ❤️</p>
//            <p><strong>تراکنش Approve:</strong> <a href="${net.explorer}/tx/${approveTxHash}" target="_blank">مشاهده</a></p>
//            <p><strong>تراکنش Deposit:</strong> <a href="${net.explorer}/tx/${depositTxHash}" target="_blank">مشاهده</a></p>
//            <p>ممنون از حمایت شما! پروژه به هدف نزدیک‌تر شد.</p>
//        `;

//loadProgress(); // به‌روزرسانی پیشرفت (در آینده on-chain می‌شود)

//  } catch (err) {
 //      console.error("خطا در تراکنش:", err);

//        let errorMsg = "خطا در ارسال تراکنش: ";

//        if (err.code === 4001) {
//            errorMsg += "تراکنش توسط شما لغو شد.";
//        } else if (err.message.includes("User denied")) {
//            errorMsg += "تراکنش لغو شد.";
//        } else if (err.message.includes("insufficient funds")) {
//            errorMsg += "موجودی کافی نیست (گس یا توکن).";
//        } else if (err.message.includes("execution reverted")) {
//            errorMsg += "تراکنش برگشت خورد. ممکن است توکن مجاز نباشد یا خزانه مشکل داشته باشد.";
//        } else {
//            errorMsg += err.message || "نامشخص";
//        }

        // اگر approve موفق بود ولی deposit شکست خورد
//        if (approveTxHash && !depositTxHash) {
//			errorMsg += `\n\n✅ Approve موفق بود: ${net.explorer}/tx/${approveTxHash}\n❌ اما Deposit شکست خورد. دوباره امتحان کنید.`;        
//		}

//        alert(errorMsg);
        
//        // برگرداندن دکمه برای تلاش دوباره
//        document.getElementById('connectBtn').style.display = 'block';
//        document.getElementById('successMessage').style.display = 'none';
//    }
//};

//-------------------------------------------------------------------------------------

document.getElementById('customAmount').oninput = (e) => {
    selectedAmount = parseFloat(e.target.value) || 0;
};
document.getElementById('termsConsent').addEventListener('change', updateButtonState);

document.getElementById('infiniteApprove') && document.getElementById('infiniteApprove').addEventListener('change', () => {});

function selectNetwork(network) {
    selectedNetwork = network;
    const net = networks[network];
    currentContract = (network === 'tron') ? projects.contractAddressTron : projects.contractAddress || null;
    document.getElementById('qrSection').style.display = network === 'tron' ? 'block' : 'none';
}

// فعال کردن دکمه با تیک چک‌باکس
document.getElementById('termsConsent').addEventListener('change', function() {
    document.getElementById('connectBtn').disabled = !this.checked;
});


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


async function loadProgress(target = 100000) {
    const totalRaised = 0; // در آینده از on-chain بخوانید
    const percent = Math.min((totalRaised / target) * 100, 100);

    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').innerText = `${totalRaised.toFixed(2)} USDT از ${target.toLocaleString('fa-IR')} USDT جمع شده (${percent.toFixed(1)}%)`;
}

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
updateButtonState(); // برای حالت اولیه

