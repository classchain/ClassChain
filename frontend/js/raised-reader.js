/**
 * ClassChain — خواندن مجموع کمک‌ها (موجودی USDT خزانه‌ها) از همه شبکه‌ها
 * استفاده: window.ClassChainRaisedReader.getProjectRaisedUSDT(projectAttributes)
 */
(function () {
  const ERC20_BALANCE_ABI = [
    {
      constant: true,
      inputs: [{ name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: '', type: 'uint256' }],
      type: 'function'
    }
  ];

  // RPC و USDT برای شبکه‌های فعال فعلی
  // در صورت اضافه شدن شبکه، همین‌جا یک ردیف اضافه کن
  const READ_NETWORKS = {
    amoy: {
      id: 'amoy',
      type: 'EVM',
      name: 'Polygon Amoy',
      rpc: 'https://rpc-amoy.polygon.technology',
      usdt: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
      decimals: 6,
      // فیلدهای آدرس خزانه در Projects.json
      addressFields: ['contractAddress'],
      fundsKeys: ['polygon_amoy', 'amoy']
    },
    tron_nile: {
      id: 'tron_nile',
      type: 'TVM',
      name: 'Tron Nile',
      // FullNode Nile
      fullHost: 'https://nile.trongrid.io',
      // USDT Nile — Base58 (مهم: نه 0x)
      usdt: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
      decimals: 6,
      addressFields: ['contractAddressTron'],
      fundsKeys: ['tron_nile', 'tron']
    }
    // مثال برای بعد:
    // polygon: { type:'EVM', rpc:'https://polygon-rpc.com', usdt:'0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals:6, addressFields:['contractAddressMainnet'], fundsKeys:['polygon'] }
  };

  function toReadable(amountRaw, decimals) {
    if (!amountRaw && amountRaw !== 0) return 0;
    const s = amountRaw.toString();
    const neg = s.startsWith('-');
    const digits = neg ? s.slice(1) : s;
    const padded = digits.padStart(decimals + 1, '0');
    const whole = padded.slice(0, -decimals) || '0';
    const frac = padded.slice(-decimals).replace(/0+$/, '');
    const num = frac ? `${whole}.${frac}` : whole;
    return parseFloat(neg ? `-${num}` : num);
  }

  function collectFundAddresses(project, netCfg) {
    const set = new Set();
    (netCfg.addressFields || []).forEach((f) => {
      const v = project[f];
      if (v && v !== 'null' && String(v).trim()) set.add(String(v).trim());
    });
    if (project.funds && typeof project.funds === 'object') {
      (netCfg.fundsKeys || []).forEach((k) => {
        const addr = project.funds[k]?.address;
        if (addr && String(addr).trim()) set.add(String(addr).trim());
      });
    }
    return Array.from(set);
  }

  async function readEvmBalance(fundAddress, usdtAddress, rpcUrl, decimals) {
    if (typeof Web3 === 'undefined') {
      console.warn('Web3 در صفحه لود نشده');
      return 0;
    }
    try {
      const web3 = new Web3(rpcUrl);
      const token = new web3.eth.Contract(ERC20_BALANCE_ABI, usdtAddress);
      const raw = await token.methods.balanceOf(fundAddress).call();
      return toReadable(raw, decimals);
    } catch (e) {
      console.warn('خطا در خواندن موجودی EVM:', fundAddress, e.message || e);
      return 0;
    }
  }

  /**
   * خواندن balanceOf TRC20 از طریق TronGrid (بدون نیاز به TronLink)
   */
  async function readTronBalance(fundAddress, usdtAddress, fullHost, decimals) {
    try {
      // پارامتر address برای balanceOf → 32 بایت
      const param = encodeTronAddressParam(fundAddress);
      if (!param) return 0;

      const res = await fetch(`${fullHost}/wallet/triggerconstantcontract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_address: fundAddress,
          contract_address: usdtAddress,
          function_selector: 'balanceOf(address)',
          parameter: param,
          visible: true
        })
      });
      const data = await res.json();
      const hex = data?.constant_result?.[0];
      if (!hex) {
        console.warn('پاسخ خالی از TronGrid:', data);
        return 0;
      }
      const raw = BigInt('0x' + hex);
      return toReadable(raw.toString(), decimals);
    } catch (e) {
      console.warn('خطا در خواندن موجودی Tron:', fundAddress, e.message || e);
      return 0;
    }
  }

  // تبدیل آدرس Base58/hex ترون به 32 بایت hex برای پارامتر تابع
  function encodeTronAddressParam(address) {
    try {
      let hex = '';
      if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
        // decode Base58Check بدون وابستگی به TronWeb
        hex = base58ToHexAddress(address);
      } else if (address.startsWith('41') && address.length === 42) {
        hex = address.toLowerCase();
      } else if (address.startsWith('0x') && address.length === 42) {
        hex = '41' + address.slice(2).toLowerCase();
      } else {
        console.warn('فرمت آدرس ترون نامعتبر:', address);
        return null;
      }
      // 20 بایت آخر (بدون 41) → pad به 32 بایت
      const body = hex.slice(2); // 40 hex chars
      return body.padStart(64, '0');
    } catch (e) {
      console.warn('encodeTronAddressParam:', e);
      return null;
    }
  }

  function base58ToHexAddress(base58) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = 0n;
    for (const c of base58) {
      const idx = ALPHABET.indexOf(c);
      if (idx < 0) throw new Error('invalid base58');
      num = num * 58n + BigInt(idx);
    }
    let hex = num.toString(16);
    // leading zeros in base58
    for (const c of base58) {
      if (c === '1') hex = '00' + hex;
      else break;
    }
    if (hex.length % 2) hex = '0' + hex;
    // 21 byte address + 4 byte checksum → برداشتن checksum
    if (hex.length >= 50) hex = hex.slice(0, -8);
    return hex.toLowerCase();
  }

  /**
   * @param {object} project - attributes یک پروژه از Projects.json
   * @returns {Promise<{ total: number, breakdown: Array<{network, address, amount}> }>}
   */
  async function getProjectRaisedUSDT(project) {
    if (!project) return { total: 0, breakdown: [] };

    const tasks = [];
    const breakdown = [];

    for (const netCfg of Object.values(READ_NETWORKS)) {
      const addresses = collectFundAddresses(project, netCfg);
      for (const addr of addresses) {
        tasks.push(
          (async () => {
            let amount = 0;
            if (netCfg.type === 'EVM') {
              amount = await readEvmBalance(addr, netCfg.usdt, netCfg.rpc, netCfg.decimals);
            } else if (netCfg.type === 'TVM') {
              amount = await readTronBalance(addr, netCfg.usdt, netCfg.fullHost, netCfg.decimals);
            }
            return { network: netCfg.name, networkId: netCfg.id, address: addr, amount };
          })()
        );
      }
    }

    const results = await Promise.all(tasks);
    let total = 0;
    results.forEach((r) => {
      total += r.amount;
      breakdown.push(r);
    });

    return { total, breakdown };
  }

  window.ClassChainRaisedReader = {
    getProjectRaisedUSDT,
    READ_NETWORKS
  };
})();
