/**
 * ClassChain — Donor Reader
 *
 * منبع تشخیص مشارکت‌کنندگان:
 *   USDT Transfer events
 *
 * مزیت:
 *   - انتقال از طریق depositToken قابل شناسایی است
 *   - انتقال مستقیم USDT به خزانه نیز قابل شناسایی است
 *   - وابسته به TokensReceived قرارداد خزانه نیست
 */

class ClassChainDonorReader {

    constructor(networkConfig) {
        this.networkConfig = networkConfig;

        // استاندارد ERC20 / TRC20
        this.transferEventABI = {
            anonymous: false,
            inputs: [
                {
                    indexed: true,
                    name: 'from',
                    type: 'address'
                },
                {
                    indexed: true,
                    name: 'to',
                    type: 'address'
                },
                {
                    indexed: false,
                    name: 'value',
                    type: 'uint256'
                }
            ],
            name: 'Transfer',
            type: 'event'
        };
    }


    /* =====================================================
       MAIN
       ===================================================== */

    async load(project) {

        if (!project?.funds) {
            console.warn('[DonorReader] Project has no funds');
            return [];
        }

        const records = [];

        for (const net of Object.values(
            this.networkConfig.NETWORKS || {}
        )) {

            if (net.status !== 'active') {
                continue;
            }

            if (!net.usdtAddress) {
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

                } else if (net.type === 'TVM') {

                    items = await this.readTRON(
                        net,
                        fundAddress
                    );
                }

                records.push(...items);

            } catch (error) {

                console.error(
                    `[DonorReader] ${net.id} failed:`,
                    error
                );
            }
        }

        return this.aggregate(records);
    }


    /* =====================================================
       FUND ADDRESS
       ===================================================== */

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
                return String(fund.address).trim();
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

        /*
         * پیدا کردن RPC سالم
         */
        for (const rpc of rpcList) {

            try {

                const candidate =
                    new Web3(rpc);

                await candidate.eth.getBlockNumber();

                web3 = candidate;

                console.log(
                    `[DonorReader] EVM RPC OK: ${rpc}`
                );

                break;

            } catch (error) {

                console.warn(
                    `[DonorReader] EVM RPC failed: ${rpc}`,
                    error
                );
            }
        }

        if (!web3) {
            throw new Error(
                `No working RPC for ${net.id}`
            );
        }


        /*
         * نکته بسیار مهم:
         *
         * Event روی قرارداد USDT خوانده می‌شود،
         * نه روی Fund Contract.
         *
         * بنابراین انتقال مستقیم USDT هم پیدا می‌شود.
         */
        const usdtContract =
            new web3.eth.Contract(
                [this.transferEventABI],
                net.usdtAddress
            );


        const latestBlock =
            await web3.eth.getBlockNumber();


        /*
         * اگر deploymentBlock تعریف نشده باشد
         * از صفر شروع می‌کنیم.
         */
        let fromBlock =
            Number(net.deploymentBlock || 0);


        /*
         * برای جلوگیری از محدودیت RPC
         */
        const batchSize = 5000;

        const records = [];


        while (fromBlock <= latestBlock) {

            const toBlock =
                Math.min(
                    fromBlock + batchSize - 1,
                    latestBlock
                );

            console.log(
                `[DonorReader] ${net.id}: blocks ${fromBlock} → ${toBlock}`
            );


            /*
             * فقط Transfer های USDT
             */
            const events =
                await usdtContract.getPastEvents(
                    'Transfer',
                    {
                        fromBlock,
                        toBlock
                    }
                );


            for (const event of events) {

                const values =
                    event.returnValues || {};

                const from =
                    values.from;

                const to =
                    values.to;

                const value =
                    values.value;


                if (!from || !to || value == null) {
                    continue;
                }


                /*
                 * فقط انتقال‌هایی که مقصدشان
                 * خزانه همین پروژه است.
                 */
                if (
                    String(to).toLowerCase() !==
                    String(fundAddress).toLowerCase()
                ) {
                    continue;
                }


                /*
                 * انتقال از خود خزانه به خودش
                 * مشارکت محسوب نمی‌شود.
                 */
                if (
                    String(from).toLowerCase() ===
                    String(fundAddress).toLowerCase()
                ) {
                    continue;
                }


                records.push({

                    address: from,

                    amount:
                        this.toAmount(
                            value,
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
            'https://nile.trongrid.io';


        const records = [];

        let fingerprint = null;


        /*
         * بسیار مهم:
         *
         * Event از قرارداد USDT خوانده می‌شود،
         * نه از قرارداد Fund.
         */
        do {

            const params =
                new URLSearchParams();


            params.set(
                'event_name',
                'Transfer'
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
                `${host}/v1/contracts/${net.usdtAddress}/events?${params.toString()}`;


            console.log(
                '[DonorReader] TRON events:',
                url
            );


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


                /*
                 * در TRON معمولاً آدرس‌ها
                 * به صورت Base58 برمی‌گردند.
                 */
                const from =
                    result.from ??
                    event.from;


                const to =
                    result.to ??
                    event.to;


                const value =
                    result.value ??
                    event.value;


                if (
                    !from ||
                    !to ||
                    value == null
                ) {
                    continue;
                }


                /*
                 * فقط انتقال‌هایی که مقصدشان
                 * خزانه پروژه است.
                 */
                if (
                    String(to).trim() !==
                    String(fundAddress).trim()
                ) {
                    continue;
                }


                /*
                 * انتقال از خود خزانه به خودش
                 * مشارکت محسوب نمی‌شود.
                 */
                if (
                    String(from).trim() ===
                    String(fundAddress).trim()
                ) {
                    continue;
                }


                records.push({

                    address:
                        from,

                    amount:
                        this.toAmount(
                            value,
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
       AGGREGATE
       ===================================================== */

    aggregate(records) {

        const donors =
            new Map();


        for (const record of records) {

            if (!record.address) {
                continue;
            }


            /*
             * برای EVM حروف بزرگ/کوچک مهم نیست.
             *
             * برای TRON بهتر است همان آدرس اصلی
             * نگه داشته شود، ولی کلید Map
             * case-insensitive باشد.
             */
            const key =
                String(
                    record.address
                ).toLowerCase();


            if (!donors.has(key)) {

                donors.set(key, {

                    address:
                        record.address,

                    amount: 0,

                    networks:
                        new Set(),

                    contributions: []
                });
            }


            const donor =
                donors.get(key);


            donor.amount +=
                Number(record.amount) || 0;


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


    /* =====================================================
       DECIMALS
       ===================================================== */

    toAmount(
        value,
        decimals = 6
    ) {

        /*
         * برای مقادیر معمول USDT امن است.
         */
        return Number(value) /
            Math.pow(
                10,
                Number(decimals)
            );
    }
}


/*
 * Global
 */
window.ClassChainDonorReader =
    ClassChainDonorReader;

