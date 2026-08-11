/* =========================================================
   ClassChain Donor Reader
   Reads successful TokensReceived events from every
   treasury belonging to the current project.
   ========================================================= */

class ClassChainDonorReader {

    constructor() {
        this.eventName = 'TokensReceived';
        this.eventSignature =
            'TokensReceived(address,address,uint256)';
    }

    async load(project, networkConfigs) {

        const donors = [];

        if (!project || !project.funds) {
            return donors;
        }

        const fundEntries = Object.entries(project.funds);

        for (const [networkId, fundAddress] of fundEntries) {

            if (!fundAddress) continue;

            const net = networkConfigs?.[networkId];

            if (!net || net.enabled === false) continue;

            try {

                const networkDonors =
                    await this.loadNetworkDonors(
                        networkId,
                        fundAddress,
                        net
                    );

                donors.push(...networkDonors);

            } catch (error) {

                console.warn(
                    `Unable to read donors from ${networkId}:`,
                    error
                );
            }
        }

        return this.aggregateDonors(donors);
    }


    async loadNetworkDonors(
        networkId,
        fundAddress,
        net
    ) {

        if (net.type === 'TVM') {

            return this.loadTronDonors(
                networkId,
                fundAddress,
                net
            );
        }

        if (net.type === 'EVM') {

            return this.loadEvmDonors(
                networkId,
                fundAddress,
                net
            );
        }

        return [];
    }


    /* =====================================================
       EVM
       ===================================================== */

    async loadEvmDonors(
        networkId,
        fundAddress,
        net
    ) {

        if (typeof Web3 === 'undefined') {
            throw new Error('Web3 is not loaded.');
        }

        const rpc =
            net.rpc ||
            net.rpcFallbacks?.[0];

        if (!rpc) {
            throw new Error(
                `No RPC configured for ${networkId}`
            );
        }

        const web3 = new Web3(rpc);

        const fund = new web3.eth.Contract(
            [
                {
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
                }
            ],
            fundAddress
        );

        const latestBlock =
            await web3.eth.getBlockNumber();

        /*
         * RPC providers معمولاً range بسیار بزرگ را
         * قبول نمی‌کنند؛ بنابراین به batch تقسیم می‌کنیم.
         */
        const batchSize = 50000;

        const result = [];

        for (
            let fromBlock = 0;
            fromBlock <= latestBlock;
            fromBlock += batchSize
        ) {

            const toBlock = Math.min(
                fromBlock + batchSize - 1,
                latestBlock
            );

            const events =
                await fund.getPastEvents(
                    'TokensReceived',
                    {
                        fromBlock,
                        toBlock
                    }
                );

            for (const event of events) {

                result.push({
                    address: event.returnValues.donor,
                    amount: this.formatAmount(
                        event.returnValues.amount,
                        net.tokenDecimals
                    ),
                    rawAmount:
                        event.returnValues.amount,
                    network: net.name || networkId,
                    networkId,
                    txHash:
                        event.transactionHash,
                    timestamp: null
                });
            }
        }

        /*
         * فقط Eventهایی که واقعاً روی زنجیره ثبت شده‌اند
         * در اینجا وارد می‌شوند.
         */
        return result;
    }


    /* =====================================================
       TRON / TVM
       ===================================================== */

    async loadTronDonors(
        networkId,
        fundAddress,
        net
    ) {

        if (
            typeof tronWeb === 'undefined' &&
            typeof window.tronWeb === 'undefined'
        ) {
            throw new Error('TronWeb is not available.');
        }

        const tw =
            window.tronWeb ||
            tronWeb;

        /*
         * getEventResult مستقیماً Eventهای قرارداد را
         * از TronGrid/Node می‌خواند.
         */
        const events =
            await tw.getEventResult(
                fundAddress,
                {
                    eventName: this.eventName,
                    size: 200,
                    onlyConfirmed: true,
                    orderBy:
                        'block_timestamp,desc'
                }
            );

        const result = [];

        for (const event of events || []) {

            /*
             * Event فقط وقتی معتبر است که تراکنش
             * با SUCCESS اجرا شده باشد.
             *
             * این کنترل مخصوصاً برای جلوگیری از ورود
             * Depositهای Revert شده ضروری است.
             */
            if (
                event.result &&
                event.result !== 'SUCCESS'
            ) {
                continue;
            }

            const donor =
                event.result?.donor ||
                event.donor;

            const amount =
                event.result?.amount ||
                event.amount;

            if (!donor || !amount) continue;

            result.push({
                address: donor,

                amount: this.formatAmount(
                    amount,
                    net.tokenDecimals
                ),

                rawAmount: amount,

                network:
                    net.name ||
                    networkId,

                networkId,

                txHash:
                    event.transaction_id ||
                    event.transactionId ||
                    event.txID ||
                    null,

                timestamp:
                    event.block_timestamp ||
                    event.blockTimestamp ||
                    null
            });
        }

        return result;
    }


    /* =====================================================
       Aggregate donors
       ===================================================== */

    aggregateDonors(records) {

        const map = new Map();

        for (const item of records) {

            const key =
                item.address.toLowerCase();

            if (!map.has(key)) {

                map.set(key, {
                    address: item.address,
                    amount: 0,
                    contributions: [],
                    networks: new Set()
                });
            }

            const donor = map.get(key);

            donor.amount +=
                Number(item.amount);

            donor.networks.add(
                item.networkId
            );

            donor.contributions.push({
                network: item.network,
                networkId: item.networkId,
                amount: Number(item.amount),
                txHash: item.txHash,
                timestamp: item.timestamp
            });
        }

        return Array.from(map.values())
            .map(donor => ({
                ...donor,
                networks:
                    Array.from(donor.networks)
            }))
            .sort(
                (a, b) =>
                    b.amount - a.amount
            );
    }


    formatAmount(
        rawAmount,
        decimals = 6
    ) {

        return Number(
            rawAmount
        ) / Math.pow(
            10,
            decimals
        );
    }
}


window.ClassChainDonorReader =
    ClassChainDonorReader;
