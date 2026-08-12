/**
 * ClassChain — Donor Reader (v2)
 *
 * منبع اصلی:
 *   event TokensReceived(address indexed token, address indexed donor, uint256 amount)
 *   روی قرارداد SchoolTokenFund
 *
 * منبع ثانویه (fallback):
 *   Transfer USDT با to = fund  (واریز مستقیم بدون depositToken)
 *
 * خروجی:
 *   [{ address, amount, networks, contributions }]
 */

class ClassChainDonorReader {

    constructor(networkConfig) {
        this.networkConfig = networkConfig;

        // keccak256("TokensReceived(address,address,uint256)")
        this.tokensReceivedTopic =
            '0x0af1239547617509a79d1ff0ee4be9ca943bc8410cb0b282dda97d27995a0acd';

        // keccak256("Transfer(address,address,uint256)")
        this.transferTopic =
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

        this.evmBatchSize = 5000;
        this.requestTimeout = 15000;

        // اگر true باشد، Transfer مستقیم USDT هم اضافه می‌شود
        this.includeDirectTransfers = true;
    }

    /* =====================================================
       MAIN
       ===================================================== */

    async load(project) {
        if (!project?.funds) return [];

        const records = [];
        const networks = Object.values(this.networkConfig.NETWORKS || {});

        for (const net of networks) {
            if (net.status !== 'active' || !net.enabled) continue;

            const fundAddress = this.getFundAddress(project, net);
            if (!fundAddress) continue;

            try {
                let items = [];

                if (net.type === 'EVM') {
                    items = await this.readEVM(net, fundAddress, project);
                } else if (net.type === 'TVM') {
                    items = await this.readTRON(net, fundAddress, project);
                }

                records.push(...items);
            } catch (error) {
                console.error(`[DonorReader] ${net.id}:`, error);
            }
        }

        return this.aggregate(records);
    }

    /* =====================================================
       FUND HELPERS
       ===================================================== */

    getFundAddress(project, net) {
        const funds = project?.funds;
        if (!funds || typeof funds !== 'object') return null;

        for (const key of (net.fundsKeys || [])) {
            const fund = funds[key];
            if (fund && typeof fund === 'object' && fund.address) {
                return String(fund.address).trim();
            }
        }
        return null;
    }

    getFundCreatedAt(project, net) {
        const funds = project?.funds;
        if (!funds) return null;

        for (const key of (net.fundsKeys || [])) {
            const fund = funds[key];
            if (fund?.createdAt) {
                const ts = Date.parse(fund.createdAt);
                if (Number.isFinite(ts)) return ts;
            }
        }
        return null;
    }

    /* =====================================================
       EVM
       ===================================================== */

    async readEVM(net, fundAddress, project) {
        const rpc = await this.findWorkingRPC(net);
        if (!rpc) throw new Error(`No working RPC for ${net.id}`);

        const latestHex = await this.rpcCall(rpc, 'eth_blockNumber', []);
        const latestBlock = parseInt(latestHex, 16);

        let fromBlock = 0;
        const createdAt = this.getFundCreatedAt(project, net);
        if (createdAt) {
            fromBlock = await this.findBlockByTimestamp(rpc, createdAt);
        }

        console.log(`[DonorReader] ${net.id}: blocks ${fromBlock} → ${latestBlock}`);

        const records = [];

        // 1) TokensReceived روی خود fund
        const eventRecords = await this.scanEvmLogs({
            rpc,
            address: fundAddress,
            fromBlock,
            latestBlock,
            topics: [this.tokensReceivedTopic],
            parseLog: (log) => this.parseTokensReceivedLog(log, net, fundAddress)
        });
        records.push(...eventRecords);

        // 2) Transfer مستقیم USDT به fund (اختیاری)
        if (this.includeDirectTransfers && net.usdtAddress) {
            const paddedFund =
                '0x' + fundAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');

            const transferRecords = await this.scanEvmLogs({
                rpc,
                address: net.usdtAddress,
                fromBlock,
                latestBlock,
                topics: [this.transferTopic, null, paddedFund],
                parseLog: (log) => this.parseUsdtTransferLog(log, net, fundAddress)
            });

            // dedupe با TokensReceived بر اساس txHash+address
            const seen = new Set(
                records.map(r => `\( {(r.txHash || '').toLowerCase()}: \){(r.address || '').toLowerCase()}`)
            );

            for (const r of transferRecords) {
                const key = `\( {(r.txHash || '').toLowerCase()}: \){(r.address || '').toLowerCase()}`;
                if (!seen.has(key)) {
                    records.push(r);
                    seen.add(key);
                }
            }
        }

        return records;
    }

    async scanEvmLogs({ rpc, address, fromBlock, latestBlock, topics, parseLog }) {
        const records = [];

        for (let start = fromBlock; start <= latestBlock; start += this.evmBatchSize) {
            const end = Math.min(start + this.evmBatchSize - 1, latestBlock);

            try {
                const logs = await this.rpcCall(rpc, 'eth_getLogs', [{
                    address,
                    fromBlock: '0x' + start.toString(16),
                    toBlock: '0x' + end.toString(16),
                    topics
                }]);

                for (const log of (logs || [])) {
                    const parsed = parseLog(log);
                    if (parsed) records.push(parsed);
                }
            } catch (error) {
                console.warn(`[DonorReader] batch \( {start}- \){end}:`, error);
            }
        }

        return records;
    }

    /**
     * TokensReceived(token indexed, donor indexed, amount)
     * topics[1] = token, topics[2] = donor, data = amount
     */
    parseTokensReceivedLog(log, net, fundAddress) {
        if (!log.topics || log.topics.length < 3) return null;

        const donor = '0x' + log.topics[2].slice(-40);
        const token = '0x' + log.topics[1].slice(-40);

        // فقط USDT (اگر تعریف شده)
        if (net.usdtAddress && token.toLowerCase() !== net.usdtAddress.toLowerCase()) {
            return null;
        }

        if (donor.toLowerCase() === fundAddress.toLowerCase()) return null;

        const rawValue = BigInt(log.data || '0x0');

        return {
            address: donor,
            amount: this.toAmount(rawValue, net.tokenDecimals),
            network: net.name || net.id,
            networkId: net.id,
            txHash: log.transactionHash,
            blockNumber: parseInt(log.blockNumber, 16),
            source: 'TokensReceived'
        };
    }

    /**
     * Transfer(from indexed, to indexed, value)
     * topics[1] = from, topics[2] = to
     */
    parseUsdtTransferLog(log, net, fundAddress) {
        if (!log.topics || log.topics.length < 3) return null;

        const from = '0x' + log.topics[1].slice(-40);
        const to = '0x' + log.topics[2].slice(-40);

        if (to.toLowerCase() !== fundAddress.toLowerCase()) return null;
        if (from.toLowerCase() === fundAddress.toLowerCase()) return null;

        const rawValue = BigInt(log.data || '0x0');

        return {
            address: from,
            amount: this.toAmount(rawValue, net.tokenDecimals),
            network: net.name || net.id,
            networkId: net.id,
            txHash: log.transactionHash,
            blockNumber: parseInt(log.blockNumber, 16),
            source: 'Transfer'
        };
    }

    /* =====================================================
       FIND BLOCK BY TIMESTAMP
       ===================================================== */

    async findBlockByTimestamp(rpc, targetTimestamp) {
        let latest = parseInt(
            await this.rpcCall(rpc, 'eth_blockNumber', []),
            16
        );

        let low = 0;
        let high = latest;

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            const block = await this.rpcCall(
                rpc,
                'eth_getBlockByNumber',
                ['0x' + mid.toString(16), false]
            );

            if (!block) break;

            const timestamp = parseInt(block.timestamp, 16) * 1000;

            if (timestamp < targetTimestamp) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return low;
    }

    /* =====================================================
       TRON
       ===================================================== */

    async readTRON(net, fundAddress, project) {
        const host = net.fullHost || 'https://nile.trongrid.io';
        const records = [];

        // 1) TokensReceived روی fund
        const eventRecords = await this.fetchTronEvents({
            host,
            contract: fundAddress,
            eventName: 'TokensReceived',
            project,
            net,
            filter: (event) => this.parseTronTokensReceived(event, net, fundAddress)
        });
        records.push(...eventRecords);

        // 2) Transfer مستقیم USDT
        if (this.includeDirectTransfers && net.usdtAddress) {
            const transferRecords = await this.fetchTronEvents({
                host,
                contract: net.usdtAddress,
                eventName: 'Transfer',
                project,
                net,
                filter: (event) => this.parseTronUsdtTransfer(event, net, fundAddress)
            });

            const seen = new Set(
                records.map(r => `\( {(r.txHash || '').toLowerCase()}: \){(r.address || '').toLowerCase()}`)
            );

            for (const r of transferRecords) {
                const key = `\( {(r.txHash || '').toLowerCase()}: \){(r.address || '').toLowerCase()}`;
                if (!seen.has(key)) {
                    records.push(r);
                    seen.add(key);
                }
            }
        }

        return records;
    }

    async fetchTronEvents({ host, contract, eventName, project, net, filter }) {
        const records = [];
        let fingerprint = null;
        let page = 0;
        const maxPages = 100;

        const createdAt = this.getFundCreatedAt(project, net);

        do {
            page++;
            if (page > maxPages) {
                console.warn('[DonorReader] TRON page limit reached');
                break;
            }

            const params = new URLSearchParams();
            params.set('event_name', eventName);
            params.set('only_confirmed', 'true');
            params.set('limit', '200');
            params.set('order_by', 'block_timestamp,asc');

            if (createdAt) {
                params.set('min_timestamp', String(createdAt));
            }
            if (fingerprint) {
                params.set('fingerprint', fingerprint);
            }

            const url = `\( {host}/v1/contracts/ \){contract}/events?${params.toString()}`;
            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                throw new Error(`TRON API ${response.status}`);
            }

            const payload = await response.json();
            const events = payload?.data || [];

            for (const event of events) {
                const parsed = filter(event);
                if (parsed) records.push(parsed);
            }

            fingerprint = payload?.meta?.fingerprint || null;
            if (!events.length) fingerprint = null;

        } while (fingerprint);

        return records;
    }

    parseTronTokensReceived(event, net, fundAddress) {
        const result = event.result || {};
        const donor = result.donor ?? result[1];
        const token = result.token ?? result[0];
        const value = result.amount ?? result[2] ?? result.value;

        if (!donor || value == null) return null;

        if (
            net.usdtAddress &&
            token &&
            String(token).trim() !== String(net.usdtAddress).trim()
        ) {
            return null;
        }

        if (String(donor).trim() === String(fundAddress).trim()) return null;

        return {
            address: donor,
            amount: this.toAmount(BigInt(value), net.tokenDecimals),
            network: net.name || net.id,
            networkId: net.id,
            txHash: event.transaction_id || event.transactionId || null,
            blockNumber: Number(event.block_number || 0),
            timestamp: event.block_timestamp || null,
            source: 'TokensReceived'
        };
    }

    parseTronUsdtTransfer(event, net, fundAddress) {
        const result = event.result || {};
        const from = result.from ?? event.from;
        const to = result.to ?? event.to;
        const value = result.value ?? event.value;

        if (!from || !to || value == null) return null;
        if (String(to).trim() !== String(fundAddress).trim()) return null;
        if (String(from).trim() === String(fundAddress).trim()) return null;

        return {
            address: from,
            amount: this.toAmount(BigInt(value), net.tokenDecimals),
            network: net.name || net.id,
            networkId: net.id,
            txHash: event.transaction_id || event.transactionId || null,
            blockNumber: Number(event.block_number || 0),
            timestamp: event.block_timestamp || null,
            source: 'Transfer'
        };
    }

    /* =====================================================
       RPC / FETCH
       ===================================================== */

    async findWorkingRPC(net) {
        const rpcList = [net.rpc, ...(net.rpcFallbacks || [])].filter(Boolean);

        for (const rpc of rpcList) {
            try {
                const result = await this.rpcCall(rpc, 'eth_blockNumber', []);
                if (result) return rpc;
            } catch (error) {
                console.warn(`[DonorReader] RPC failed: ${rpc}`);
            }
        }
        return null;
    }

    async rpcCall(rpc, method, params) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.requestTimeout);

        try {
            const response = await fetch(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method,
                    params
                }),
                signal: controller.signal
            });

            if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || 'RPC error');

            return data.result;
        } finally {
            clearTimeout(timer);
        }
    }

    async fetchWithTimeout(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.requestTimeout);

        try {
            return await fetch(url, { signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    /* =====================================================
       AGGREGATE
       ===================================================== */

    aggregate(records) {
        const donors = new Map();

        for (const record of records) {
            if (!record.address) continue;

            const key = String(record.address).toLowerCase();

            if (!donors.has(key)) {
                donors.set(key, {
                    address: record.address,
                    amount: 0,
                    networks: new Set(),
                    contributions: []
                });
            }

            const donor = donors.get(key);
            donor.amount += Number(record.amount) || 0;
            donor.networks.add(record.networkId);
            donor.contributions.push(record);
        }

        return Array.from(donors.values())
            .map(donor => ({
                address: donor.address,
                amount: donor.amount,
                networks: Array.from(donor.networks),
                contributions: donor.contributions
            }))
            .sort((a, b) => b.amount - a.amount);
    }

    /* =====================================================
       AMOUNT
       ===================================================== */

    toAmount(value, decimals = 6) {
        const raw = typeof value === 'bigint' ? value : BigInt(value);
        const divisor = 10n ** BigInt(decimals);
        const whole = raw / divisor;
        const fraction = raw % divisor;

        const fractionText = fraction
            .toString()
            .padStart(decimals, '0')
            .replace(/0+$/, '');

        if (!fractionText) return Number(whole);
        return Number(`\( {whole}. \){fractionText}`);
    }
}

window.ClassChainDonorReader = ClassChainDonorReader;
