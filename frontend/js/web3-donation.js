import { showInPanel } from './ui-controls.js';

const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'; // Polygon Mainnet

export function setupDonationButton(contractAddress) {
    document.getElementById('contributeButton').onclick = () => contribute(contractAddress);
}

export async function contribute(contractAddress) {
    if (!window.ethereum) {
        alert('لطفاً MetaMask را نصب کنید');
        return;
    }

    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        const web3 = new Web3(window.ethereum);
        const accounts = await web3.eth.getAccounts();

        let amount = prompt('مقدار USDT برای مشارکت (مثلاً 10):', '10');
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;

        amount = parseFloat(amount);
        const value = web3.utils.toBN(amount * 1e6); // USDT 6 decimals

        const abi = [{"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"type":"function"}];
        const usdt = new web3.eth.Contract(abi, USDT_ADDRESS);

        const tx = await usdt.methods.transfer(contractAddress, value).send({ from: accounts[0] });
        alert(`تراکنش موفق! Hash: ${tx.transactionHash}`);

        setTimeout(() => loadDonors(contractAddress), 8000);
    } catch (err) {
        console.error(err);
        alert('خطا: ' + (err.message || 'تراکنش لغو شد'));
    }
}

export async function loadDonors(contractAddress) {
    const apiKey = "DYB75BHRNWEGAGAEH73AWJUPQ8EDRKN7RB";
    const usdtContract = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"; // USDT Polygon
    const url = `https://api.polygonscan.com/api?module=account&action=tokentx&contractaddress=${usdtContract}&address=${contractAddress}&sort=desc&apikey=${apiKey}`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.status !== "1" || data.result.length === 0) {
            document.getElementById('donorsList').innerHTML = '<p style="opacity:0.7;">شما اولین حامی باشید</p>';
            return;
        }

        let total = 0;
        const donors = new Map();

        data.result.forEach(tx => {
            if (tx.to.toLowerCase() === contractAddress.toLowerCase()) {
                const amt = parseInt(tx.value) / 1e6;
                total += amt;
                donors.set(tx.from, (donors.get(tx.from) || 0) + amt);
            }
        });

        let html = `<div class="info-item"><span class="info-label">جمع دریافتی:</span><span class="info-value">${total.toFixed(2)} USDT</span></div>`;
        html += '<h4 style="color:#ecf0f1;margin:15px 0 10px;">حامیان</h4>';

        donors.forEach((amt, addr) => {
            html += `
                <div class="info-item" style="font-size:0.9em;background:rgba(255,255,255,0.05);margin:5px 0;padding:8px;border-radius:6px;">
                    <span class="info-value"><a href="https://polygonscan.com/address/${addr}" target="_blank" style="color:#3498db;">${addr.substr(0,8)}...${addr.substr(-6)}</a></span>
                    <span class="info-label">${amt.toFixed(2)} USDT</span>
                </div>
            `;
        });

        const el = document.getElementById('donorsList');
        if (el) el.innerHTML = html;
    } catch (err) {
        console.error(err);
        const el = document.getElementById('donorsList');
        if (el) el.innerHTML = '<p style="color:#e74c3c;">خطا در بارگذاری</p>';
    }
}
