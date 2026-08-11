class ClassChainDonorReader {

    constructor(networkConfig) {
        this.networkConfig = networkConfig;
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

    async load(project) {

        if (!project?.funds) {
            return [];
        }

        const records = [];

        for (const net of Object.values(
            this.networkConfig.NETWORKS || {}
        )) {

            if (net.status !== 'active') {
                continue;
            }

            const fundAddress =
                this.getFundAddress(project, net);

            if (!fundAddress) {
                continue;
            }

            try {

                let items = [];

                if (net.type === 'EVM') {
                    items = await this.readEVM(
                        net,
                        fundAddress
                    );
                }

                if (net.type === 'TVM') {
                    items = await this.readTRON(
                        net,
                        fundAddress
                    );
                }

                records.push(...items);

            } catch (error) {

                console.error(
                    `[DonorReader] ${net.id}`,
                    error
                );
            }
        }

        return this.aggregate(records);
    }


    getFundAddress(project, net) {

        for (const fundKey of (
            net.fundsKeys || []
        )) {

            const fund =
                project.funds?.[fundKey];

            if (
                fund &&
                typeof fund === 'object' &&
                fund.address
            ) {
                return fund.address;
            }
        }

        return null;
    }


    /* =====================================================
       EVM
       ===================================================== */

    async readEVM(net, fundAddress) {

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
                    `[DonorReader] RPC failed: ${rpc}`
                );
            }
        }

        if (!web3) {
            throw new Error(
                `No working RPC for ${net.id}`
            );
        }

        const contract =
            new web3.eth.Contract(
                [this.eventABI],
                fundAddress
            );

        const latestBlock =
            await web3.eth.getBlockNumber();

        /*
         * از block مربوط به deployment استفاده می‌کنیم
         * اگر configuration آن را داشته باشد.
         * در غیر این صورت از صفر شروع می‌کنیم.
         */
        let fromBlock =
            Number(net.deploymentBlock || 0);

        const batchSize = 5000;

        const records = [];

        while (fromBlock <= latestBlock) {

            const toBlock =
                Math.min(
                    fromBlock + batchSize - 1,
                    latestBlock
                );

            const events =
                await contract.getPastEvents(
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

                if (!donor || amount == null) {
                    continue;
                }

                records.push({

                    address: donor,

                    amount:
                        this.toAmount(
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

            fromBlock =
                toBlock + 1;
        }

        return records;
    }


    /* =====================================================
       TRON
       ===================================================== */

    async readTRON(net, fundAddress) {

        const host =
            net.fullHost ||
            'https://api.nileex.io';

        let fingerprint = null;

        const records = [];

        do {

            const params = new URLSearchParams();

            params.set(
                'event_name',
                this.eventName
            );

            params.set(
                'only_confirmed',
                'true'
            );

            params.set(
                'limit',
                '200'
            );

            params.set(
                'order_by',
                'block_timestamp,asc'
            );

            if (fingerprint) {
                params.set(
                    'fingerprint',
                    fingerprint
                );
            }

            const url =
                `${host}/v1/contracts/${fundAddress}/events?${params.toString()}`;

            const response =
                await fetch(url);

            if (!response.ok) {

                throw new Error(
                    `TRON API ${response.status}`
                );
            }

            const payload =
                await response.json();

            const events =
                payload?.data || [];

            for (const event of events) {

                const result =
                    event.result || {};

                const donor =
                    result.donor ??
                    event.donor;

                const amount =
                    result.amount ??
                    event.amount;

                if (!donor || amount == null) {
                    continue;
                }

                records.push({

                    address:
                        donor,

                    amount:
                        this.toAmount(
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
                        null,

                    blockNumber:
                        Number(
                            event.block_number || 0
                        ),

                    timestamp:
                        event.block_timestamp ||
                        null
                });
            }

            fingerprint =
                payload?.meta?.fingerprint ||
                null;

            if (!events.length) {
                fingerprint = null;
            }

        } while (fingerprint);

        return records;
    }


    /* =====================================================
       Aggregate by wallet
       ===================================================== */

    aggregate(records) {

        const donors =
            new Map();

        for (const record of records) {

            const key =
                record.address.toLowerCase();

            if (!donors.has(key)) {

                donors.set(key, {

                    address:
                        record.address,

                    amount: 0,

                    networks: new Set(),

                    contributions: []
                });
            }

            const donor =
                donors.get(key);

            donor.amount +=
                Number(record.amount);

            donor.networks.add(
                record.networkId
            );

            donor.contributions.push(
                record
            );
        }

        return Array.from(
            donors.values()
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


    toAmount(value, decimals = 6) {

        return Number(value) /
            Math.pow(
                10,
                Number(decimals)
            );
    }
}


window.ClassChainDonorReader =
    ClassChainDonorReader;
