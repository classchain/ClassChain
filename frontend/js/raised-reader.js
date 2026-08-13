/**
 * ClassChain — خواندن مجموع کمک‌ها (موجودی USDT خزانه‌ها) از همه شبکه‌های فعال
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

function collectFundAddresses(
    projectAttributes,
    netCfg
) {

    if (
        !projectAttributes ||
        !netCfg
    ) {
        return [];
    }

    const funds =
        projectAttributes.funds;

    if (
        !funds ||
        typeof funds !== 'object'
    ) {
        return [];
    }

    const fundKey =
        netCfg.fundsKey;

    if (!fundKey) {
        return [];
    }

    const fund =
        funds[fundKey];

    if (
        !fund ||
        typeof fund !== 'object'
    ) {
        return [];
    }

    const address =
        fund.address;

    if (
        !address ||
        String(address).trim() === ''
    ) {
        return [];
    }

    return [
        String(address).trim()
    ];
}
  
  async function readEvmBalance(fundAddress, usdtAddress, rpcUrl, decimals, fallbacks = []) {
    if (typeof Web3 === 'undefined') {
      console.warn('Web3 در صفحه لود نشده');
      return 0;
    }
    const urls = [rpcUrl, ...(fallbacks || [])];
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
        console.warn('RPC fail:', url, e.message || e);
      }
    }
    return 0;
  }

  async function readTronBalance(fundAddress, usdtAddress, fullHost, decimals) {
    try {
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
        console.warn('فرمت آدرس ترون نامعتبر:', address);
        return null;
      }
      const body = hex.slice(2);
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
    for (const c of base58) {
      if (c === '1') hex = '00' + hex;
      else break;
    }
    if (hex.length % 2) hex = '0' + hex;
    if (hex.length >= 50) hex = hex.slice(0, -8);
    return hex.toLowerCase();
  }

/**
 * @param {object} projectAttributes - attributes یک پروژه از Projects.json
 * @returns {Promise<{ total: number, breakdown: Array<{network, networkId, address, amount}> }>}
 */
async function getProjectRaisedUSDT(projectAttributes) {
  if (!projectAttributes) return { total: 0, breakdown: [] };
}
const config =
    window.ClassChainNetworkConfig;

if (!config) {
    console.error(
        'ClassChainNetworkConfig لود نشده است.'
    );

    return {
        total: 0,
        breakdown: []
    };
}

await config.ready;


  const readNetworks = config.getReadNetworks();
  const tasks = [];

  for (const netCfg of readNetworks) {
    const addresses = collectFundAddresses(projectAttributes, netCfg);

    for (const addr of addresses) {
      tasks.push(
        (async () => {
          let amount = 0;

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
               netCfg.tokenDecimals
            );
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
