/* =========================================================
   ClassChain Donor Reader
   Reads successful TokensReceived events from every
   treasury configured for the current project.
   ========================================================= */

class ClassChainDonorReader {

    constructor() {
        this.eventName = 'TokensReceived';

        this.eventABI = {
            anonymous: false,
            inputs: [
                {
                    indexed: true,
                    name: 'token',
                    type: 'address'
                },
                {
                    indexed: true,
                    name: 'donor',
                    type: 'address'
                },
                {
                    indexed: false,
                    name: 'amount',
                    type: 'uint256'
                }
            ],
            name: 'TokensReceived',
            type: 'event'
        };
    }


    /* =====================================================
       Main
       ===================================================== */

    async load(project, networkConfigs) {

        const records = [];

        if (!project?.funds) {
            return [];
        }

        /*
         * funds مدل فعلی:
         *
         * project.funds[fundKey] = {
         *     address: "...",
         *     ...
         * }
         */

        for (const [fundKey, fund] of Object.entries(project.funds)) {

            if (!fund || typeof fund !== 'object') {
                continue;
            }

            const fundAddress =
                fund.address;

            if (!fundAddress) {
                continue;
            }

            const net =
                networkConfigs?.getNetworkByFundsKey
                    ? networkConfigs.getNetworkByFundsKey(fundKey)
                    : this.findNetworkByFundsKey(
                        fundKey,
                        networkConfigs
                    );

            if (!net) {
                console.warn(
                    `Network not found for fund key: ${fundKey}`
                );
                continue;
            }

            if (
                net.status !== 'active' ||
                net.enabled === false
            ) {
                continue;
            }

            try {

                const networkRecords =
                    await this.loadNetworkDonors(
                        net,
                        fundAddress
                    );

                records.push(
                    ...networkRecords
                );

            } catch (error) {

                console.error(
                    `Donor reader failed for ${net.id}:`,
                    error
                );
            }
        }

        return this.aggregateDonors(records);
    }


    /* =====================================================
       Network resolver fallback
       ===================================================== */

    findNetworkByFundsKey(
        fundKey,
        networks
    ) {

        const key =
            String(fundKey).toLowerCase();

        return Object.values(networks || {})
            .find(net =>
                (net.fundsKeys || [])
                    .some(
                        fk =>
                            String(fk).toLowerCase() === key
                    )
            ) || null;
    }


    /* =====================================================
       Network dispatcher
       ===================================================== */

    async loadNetworkDonors(
        net,
        fundAddress
    ) {

        if (net.type === 'EVM') {

            return this.loadEvmDonors(
                net,
                fundAddress
            );
        }

        if (net.type === 'TVM') {

            return this.loadTronDonors(
                net,
                fundAddress
            );
        }

        return [];
    }


    /* =====================================================
       EVM
       ===================================================== */

    async loadEvmDonors(
        net,
        fundAddress
    ) {

        if (typeof Web3 === 'undefined') {
            throw new Error(
                'Web3 is not loaded.'
            );
        }

        const rpcList = [
            net.rpc,
            ...(net.rpcFallbacks || [])
        ].filter(Boolean);

        let web3 = null;

        for (const rpc of rpcList) {

            try {

                const candidate =
                    new Web3(rpc);

                await candidate.eth.getBlockNumber();

                web3 = candidate;

                break;

            } catch (error) {

                console.warn(
                    `EVM RPC failed: ${rpc}`,
                    error
                );
            }
        }

        if (!web3) {
            throw new Error(
                `No working RPC for ${net.id}`
            );
        }

        const fund =
            new web3.eth.Contract(
                [this.eventABI],
                fundAddress
            );

        const latestBlock =
            await web3.eth.getBlockNumber();

        /*
         * اگر deploymentBlock در configuration
         * وجود داشته باشد از آن استفاده می‌کنیم.
         */
        const startBlock =
            Number(net.deploymentBlock || 0);

        const batchSize =
            Number(
                net.eventQueryBatchSize || 50000
            );

        const records = [];

        for (
            let fromBlock = startBlock;
            fromBlock <= latestBlock;
            fromBlock += batchSize
        ) {

            const toBlock =
                Math.min(
                    fromBlock + batchSize - 1,
                    latestBlock
                );

            const events =
                await fund.getPastEvents(
                    this.eventName,
                    {
                        fromBlock,
                        toBlock
                    }
                );

            for (const event of events) {

                const donor =
                    event.returnValues?.donor;

                const amount =
                    event.returnValues?.amount;

                if (!donor || !amount) {
                    continue;
                }

                records.push({

                    address: donor,

                    rawAmount: amount,

                    amount:
                        this.formatAmount(
                            amount,
                            net.tokenDecimals
                        ),

                    network:
                        net.name || net.id,

                    networkId:
                        net.id,

                    txHash:
                        event.transactionHash,

                    blockNumber:
                        Number(
                            event.blockNumber || 0
                        )
                });
            }
        }

        return records;
    }


    /* =====================================================
       TRON / TVM
       بدون نیاز به اتصال TronLink
       ===================================================== */

    async loadTronDonors(
        net,
        fundAddress
    ) {

        const host =
            net.fullHost ||
            'https://api.trongrid.io';

        const url =
            `${host}/v1/contracts/${fundAddress}/events` +
            `?event_name=${encodeURIComponent(this.eventName)}` +
            `&only_confirmed=true` +
            `&limit=200` +
            `&order_by=block_timestamp,desc`;

        const response =
            await fetch(url);

        if (!response.ok) {

            throw new Error(
                `TRON event API error: ${response.status}`
            );
        }

        const payload =
            await response.json();

        const events =
            payload?.data || [];

        const records = [];

        for (const event of events) {

            /*
             * فقط Eventهای واقعی قرارداد را قبول می‌کنیم.
             *
             * Event TokensReceived فقط در اجرای موفق
             * depositToken ایجاد می‌شود؛ بنابراین
             * Depositهای Revert شده Event ندارند.
             */

            const result =
                event.result || {};

            const donor =
                result.donor ||
                event.donor;

            const amount =
                result.amount ||
                event.amount;

            if (!donor || amount == null) {
                continue;
            }

            records.push({

                address:
                    donor,

                rawAmount:
                    amount,

                amount:
                    this.formatAmount(
                        amount,
                        net.tokenDecimals
                    ),

                network:
                    net.name || net.id,

                networkId:
                    net.id,

                txHash:
                    event.transaction_id ||
                    event.transactionId ||
                    event.txID ||
                    null,

                blockNumber:
                    Number(
                        event.block_number ||
                        event.blockNumber ||
                        0
                    ),

                timestamp:
                    event.block_timestamp ||
                    event.blockTimestamp ||
                    null
            });
        }

        return records;
    }


    /* =====================================================
       Aggregate
       ===================================================== */

    aggregateDonors(records) {

        const map = new Map();

        for (const item of records) {

            if (!item.address) {
                continue;
            }

            const key =
                item.address.toLowerCase();

            if (!map.has(key)) {

                map.set(key, {

                    address:
                        item.address,

                    amount: 0,

                    networks:
                        new Set(),

                    contributions:
                        []
                });
            }

            const donor =
                map.get(key);

            donor.amount +=
                Number(item.amount);

            donor.networks.add(
                item.networkId
            );

            donor.contributions.push({

                network:
                    item.network,

                networkId:
                    item.networkId,

                amount:
                    Number(item.amount),

                txHash:
                    item.txHash,

                blockNumber:
                    item.blockNumber,

                timestamp:
                    item.timestamp
            });
        }

        return Array.from(
            map.values()
        )
        .map(donor => ({

            address:
                donor.address,

            amount:
                donor.amount,

            networks:
                Array.from(
                    donor.networks
                ),

            contributions:
                donor.contributions

        }))
        .sort(
            (a, b) =>
                b.amount - a.amount
        );
    }


    /* =====================================================
       Amount formatter
       ===================================================== */

    formatAmount(
        rawAmount,
        decimals = 6
    ) {

        return Number(rawAmount) /
            Math.pow(
                10,
                Number(decimals)
            );
    }
}


window.ClassChainDonorReader =
    ClassChainDonorReader;
