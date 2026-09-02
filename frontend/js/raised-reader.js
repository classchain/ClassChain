/**
 * ClassChain — خواندن موجودی USDT خزانه‌ها از همه شبکه‌های فعال
 * وابستگی: باید بعد از network-config.js لود شود
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

  function normalizeAddress(value) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s || s === 'null' || s === 'undefined') return null;
    return s;
  }

  /**
   * آدرس خزانه برای یک شبکه را از funds (و در صورت نیاز legacy) برمی‌گرداند.
   * مقیاس‌پذیر: با افزودن networkId به shared config و کلید متناظر در project.funds کار می‌کند.
   */
  function collectFundAddresses(projectAttributes, netCfg) {
    if (!projectAttributes || !netCfg) return [];

    const found = [];
    const push = (addr) => {
      const a = normalizeAddress(addr);
      if (a && !found.includes(a)) found.push(a);
    };

    const funds = projectAttributes.funds && typeof projectAttributes.funds === 'object'
      ? projectAttributes.funds
      : null;

    const keys = [];
    if (netCfg.fundsKey) keys.push(netCfg.fundsKey);
    if (Array.isArray(netCfg.fundsKeys)) {
      for (const k of netCfg.fundsKeys) if (k && !keys.includes(k)) keys.push(k);
    }
    if (netCfg.id && !keys.includes(netCfg.id)) keys.push(netCfg.id);

    if (funds) {
      for (const key of keys) {
        const entry = funds[key];
        if (entry && typeof entry === 'object') push(entry.address);
        else if (typeof entry === 'string') push(entry);
      }
    }

    // سازگاری با فیلدهای قدیمی
    if (netCfg.type === 'EVM' && (netCfg.id === 'polygon_amoy' || netCfg.fundsKey === 'polygon_amoy')) {
      push(projectAttributes.contractAddress);
    }
    if (netCfg.type === 'TVM') {
      push(projectAttributes.contractAddressTron);
    }

    return found;
  }

  async function readEvmBalance(fundAddress, usdtAddress, rpcUrl, decimals, fallbacks = []) {
    if (typeof Web3 === 'undefined') {
      console.warn('[RaisedReader] Web3 در صفحه لود نشده');
      return 0;
    }
    const urls = [rpcUrl, ...(fallbacks || [])].filter(Boolean);
    for (const url of urls) {
      try {
        const web3 = new Web3(url);
        const token = new web3.eth.Contract(ERC20_BALANCE_ABI, usdtAddress);
        const raw = await Promise.race([
          token.methods.balanceOf(fundAddress).call(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))
        ]);
        return toReadable(raw, decimals);
      } catch (e) {
        console.warn('[RaisedReader] EVM RPC fail:', url, e.message || e);
      }
    }
    return 0;
  }

  function tronHosts(fullHost, fallbacks) {
    const list = [fullHost, ...(fallbacks || [])]
      .filter(Boolean)
      .map((h) => String(h).replace(/\/$/, ''));
    // پیش‌فرض Nile / Main اگر چیزی نبود
    return [...new Set(list)];
  }

  /** روش پایدار: موجودی TRC20 از TronGrid account API */
  async function readTronBalanceViaAccountApi(fundAddress, usdtAddress, host, decimals) {
    const url = `${host}/v1/accounts/${encodeURIComponent(fundAddress)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`account API HTTP ${res.status}`);
    const data = await res.json();
    const account = Array.isArray(data?.data) ? data.data[0] : data?.data || data;
    if (!account) return null;

    const trc20 = account.trc20;
    if (!Array.isArray(trc20)) return null;

    for (const item of trc20) {
      if (!item || typeof item !== 'object') continue;
      if (Object.prototype.hasOwnProperty.call(item, usdtAddress)) {
        return toReadable(item[usdtAddress], decimals);
      }
      // گاهی کلید با حروف کوچک/بزرگ متفاوت است
      for (const [k, v] of Object.entries(item)) {
        if (String(k).toLowerCase() === String(usdtAddress).toLowerCase()) {
          return toReadable(v, decimals);
        }
      }
    }
    // حساب وجود دارد ولی این توکن را ندارد → موجودی صفر معتبر
    return 0;
  }

  /** روش پشتیبان: balanceOf از طریق triggerconstantcontract */
  async function readTronBalanceViaContract(fundAddress, usdtAddress, host, decimals) {
    const param = encodeTronAddressParam(fundAddress);
    if (!param) throw new Error('encodeTronAddressParam failed');

    const res = await fetch(`${host}/wallet/triggerconstantcontract`, {
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
    if (data?.result?.result === false) {
      throw new Error(data?.result?.message || 'triggerconstantcontract failed');
    }
    let hex = data?.constant_result?.[0];
    if (!hex) throw new Error('empty constant_result');
    hex = String(hex).replace(/^0x/i, '');
    const raw = BigInt('0x' + hex);
    return toReadable(raw.toString(), decimals);
  }

  async function readTronBalance(fundAddress, usdtAddress, fullHost, decimals, fallbacks = []) {
    const hosts = tronHosts(fullHost, fallbacks);
    let lastErr = null;

    for (const host of hosts) {
      try {
        const viaApi = await readTronBalanceViaAccountApi(fundAddress, usdtAddress, host, decimals);
        if (viaApi != null) return viaApi;
      } catch (e) {
        lastErr = e;
        console.warn('[RaisedReader] Tron account API fail:', host, e.message || e);
      }

      try {
        return await readTronBalanceViaContract(fundAddress, usdtAddress, host, decimals);
      } catch (e) {
        lastErr = e;
        console.warn('[RaisedReader] Tron contract call fail:', host, e.message || e);
      }
    }

    console.warn('[RaisedReader] Tron balance ultimately failed:', fundAddress, lastErr && (lastErr.message || lastErr));
    return 0;
  }

  function encodeTronAddressParam(address) {
    try {
      let hex = '';
      if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
        hex = base58ToHexAddress(address);
      } else if (address.startsWith('41') && address.length === 42) {
        hex = address.toLowerCase();
      } else if (address.startsWith('0x') && address.length === 42) {
        hex = '41' + address.slice(2).toLowerCase();
      } else {
        console.warn('[RaisedReader] فرمت آدرس ترون نامعتبر:', address);
        return null;
      }
      const body = hex.slice(2);
      return body.padStart(64, '0');
    } catch (e) {
      console.warn('[RaisedReader] encodeTronAddressParam:', e);
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
    for (const c of base58) {
      if (c === '1') hex = '00' + hex;
      else break;
    }
    if (hex.length % 2) hex = '0' + hex;
    // حذف checksum چهار بایتی
    if (hex.length >= 50) hex = hex.slice(0, -8);
    return hex.toLowerCase();
  }

  /**
   * @param {object} projectAttributes - attributes یک پروژه از Projects.json
   * @returns {Promise<{ total: number, breakdown: Array<{network, networkId, address, amount}> }>}
   */
  async function getProjectRaisedUSDT(projectAttributes) {
    if (!projectAttributes) {
      return { total: 0, breakdown: [] };
    }

    const config = window.ClassChainNetworkConfig;
    if (!config) {
      console.error('[RaisedReader] ClassChainNetworkConfig لود نشده است.');
      return { total: 0, breakdown: [] };
    }

    try {
      await config.ready;
    } catch (e) {
      console.error('[RaisedReader] NetworkConfig ready failed:', e);
      return { total: 0, breakdown: [] };
    }

    const readNetworks = config.getReadNetworks();
    const tasks = [];

    for (const netCfg of readNetworks) {
      const addresses = collectFundAddresses(projectAttributes, netCfg);
      for (const addr of addresses) {
        tasks.push(
          (async () => {
            let amount = 0;
            try {
              if (netCfg.type === 'EVM') {
                amount = await readEvmBalance(
                  addr,
                  netCfg.usdtAddress,
                  netCfg.rpcUrl,
                  netCfg.tokenDecimals,
                  netCfg.rpcFallbacks || []
                );
              } else if (netCfg.type === 'TVM') {
                amount = await readTronBalance(
                  addr,
                  netCfg.usdtAddress,
                  netCfg.rpcUrl,
                  netCfg.tokenDecimals,
                  netCfg.rpcFallbacks || []
                );
              }
            } catch (e) {
              console.warn('[RaisedReader] balance task failed:', netCfg.id, addr, e.message || e);
            }
            return {
              network: netCfg.name,
              networkId: netCfg.id,
              address: addr,
              amount
            };
          })()
        );
      }
    }

    const results = await Promise.all(tasks);
    let total = 0;
    const breakdown = [];
    results.forEach((result) => {
      total += result.amount;
      breakdown.push(result);
    });
    return { total, breakdown };
  }

  window.ClassChainRaisedReader = {
    getProjectRaisedUSDT
  };
})();
