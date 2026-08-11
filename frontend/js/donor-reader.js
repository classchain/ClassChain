
/**
 * ClassChain — Donor Reader
 *
 * منبع مشارکت‌ها:
 * فقط Transfer های USDT به آدرس خزانه پروژه
 *
 * بنابراین:
 * Wallet -> USDT -> Fund
 * و
 * Wallet -> depositToken() -> Fund
 *
 * هر دو در نهایت به صورت USDT Transfer دیده می‌شوند.
 */

class ClassChainDonorReader {

    constructor(networkConfig) {
        this.networkConfig = networkConfig;

        /*
         * استاندارد ERC20 / TRC20:
         * keccak256("Transfer(address,address,uint256)")
         */
        this.transferTopic =
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

        /*
         * برای جلوگیری از اسکن بی‌نهایت در RPC
         */
        this.evmBatchSize = 10000;
        this.requestTimeout = 15000;
    }


    /* =====================================================
       MAIN
       ===================================================== */

    async load(project) {

        if (!project?.funds) {
            return [];
        }

        const records = [];

        const networks =
            Object.values(
                this.networkConfig.NETWORKS || {}
            );

        for (const net of networks) {

            /*
             * فقط شبکه‌های فعال
             */
            if (
                net.status !== 'active' ||
                !net.enabled ||
                !net.usdtAddress
            ) {
                continue;
            }

            const fundAddress =
                this.getFundAddress(
                    project,
                    net
                );

            if (!fundAddress) {
                continue;
            }

            try {

                let items = [];

                if (net.type === 'EVM') {

                    items =
                        await this.readEVM(
                            net,
                            fundAddress,
                            project
                        );

                } else if (net.type === 'TVM') {

                    items =
                        await this.readTRON(
                            net,
                            fundAddress,
                            project
                        );
                }

                records.push(...items);

            } catch (error) {

                console.error(
                    `[DonorReader] ${net.id}:`,
                    error
                );
            }
        }

        /*
         * یکی کردن مشارکت‌های یک کیف پول
         */
        return this.aggregate(records);
    }


    /* =====================================================
       FUND ADDRESS
       ===================================================== */

    getFundAddress(project, net) {

        const funds = project?.funds;

        if (
            !funds ||
            typeof funds !== 'object'
        ) {
            return null;
        }

        for (
            const key of
            (net.fundsKeys || [])
        ) {

            const fund = funds[key];

            if (
                fund &&
                typeof fund === 'object' &&
                fund.address
            ) {
                return String(
                    fund.address
                ).trim();
            }
        }

        return null;
    }


    /* =====================================================
       FIND FUND CREATION TIME
       ===================================================== */

    getFundCreatedAt(project, net) {

        const funds = project?.funds;

        if (!funds) {
            return null;
        }

        for (
            const key of
            (net.fundsKeys || [])
        ) {

            const fund = funds[key];

            if (
                fund?.createdAt
            ) {
                const timestamp =
                    Date.parse(
                        fund.createdAt
                    );

                if (
                    Number.isFinite(timestamp)
                ) {
                    return timestamp;
                }
            }
        }

        return null;
    }


    /* =====================================================
       EVM
       ===================================================== */

    async readEVM(
        net,
        fundAddress,
        project
    ) {

        const rpc =
            await this.findWorkingRPC(
                net
            );

        if (!rpc) {
            throw new Error(
                `No working RPC for ${net.id}`
            );
        }

        const latestHex =
            await this.rpcCall(
                rpc,
                'eth_blockNumber',
                []
            );

        const latestBlock =
            parseInt(
                latestHex,
                16
            );

        /*
         * createdAt خزانه از Projects.json
         *
         * به جای 500,000 بلاک،
         * از زمان ایجاد خزانه شروع می‌کنیم.
         */
        const createdAt =
            this.getFundCreatedAt(
                project,
                net
            );

        let fromBlock = 0;

        if (createdAt) {

            fromBlock =
                await this.findBlockByTimestamp(
                    rpc,
                    createdAt
                );
        }

        console.log(
            `[DonorReader] ${net.id}: ${fromBlock} → ${latestBlock}`
        );


        /*
         * آدرس خزانه به topic indexed تبدیل می‌شود
         */
        const paddedFund =
            '0x' +
            fundAddress
                .toLowerCase()
                .replace(/^0x/, '')
                .padStart(64, '0');


        const records = [];


        /*
         * فقط USDT Transfer هایی که
         * مقصدشان Fund است.
         */
        for (
            let start = fromBlock;
            start <= latestBlock;
            start += this.evmBatchSize
        ) {

            const end =
                Math.min(
                    start +
                    this.evmBatchSize -
                    1,
                    latestBlock
                );

            try {

                const logs =
                    await this.rpcCall(
                        rpc,
                        'eth_getLogs',
                        [{
                            address:
                                net.usdtAddress,

                            fromBlock:
                                '0x' +
                                start.toString(16),

                            toBlock:
                                '0x' +
                                end.toString(16),

                            topics: [
                                this.transferTopic,
                                null,
                                paddedFund
                            ]
                        }]
                    );


                for (
                    const log of
                    (logs || [])
                ) {

                    if (
                        !log.topics ||
                        log.topics.length < 3
                    ) {
                        continue;
                    }


                    /*
                     * topic[1] = from
                     * topic[2] = to
                     */
                    const from =
                        '0x' +
                        log.topics[1]
                            .slice(-40);

                    const to =
                        '0x' +
                        log.topics[2]
                            .slice(-40);


                    /*
                     * کنترل نهایی مقصد
                     */
                    if (
                        to.toLowerCase() !==
                        fundAddress.toLowerCase()
                    ) {
                        continue;
                    }


                    /*
                     * اگر خزانه خودش انتقال داده،
                     * مشارکت محسوب نمی‌شود.
                     */
                    if (
                        from.toLowerCase() ===
                        fundAddress.toLowerCase()
                    ) {
                        continue;
                    }


                    const rawValue =
                        BigInt(log.data);


                    records.push({

                        address:
                            from,

                        amount:
                            this.toAmount(
                                rawValue,
                                net.tokenDecimals
                            ),

                        network:
                            net.name ||
                            net.id,

                        networkId:
                            net.id,

                        txHash:
                            log.transactionHash,

                        blockNumber:
                            parseInt(
                                log.blockNumber,
                                16
                            )
                    });
                }

            } catch (error) {

                console.warn(
                    `[DonorReader] ${net.id} batch ${start}-${end}:`,
                    error
                );
            }
        }

        return records;
    }


    /* =====================================================
       FIND BLOCK BY TIMESTAMP
       ===================================================== */

    async findBlockByTimestamp(
        rpc,
        targetTimestamp
    ) {

        let latest =
            parseInt(
                await this.rpcCall(
                    rpc,
                    'eth_blockNumber',
                    []
                ),
                16
            );

        let low = 0;
        let high = latest;


        /*
         * Binary Search
         *
         * هدف:
         * پیدا کردن اولین بلاکی که timestamp
         * آن >= زمان ایجاد خزانه است.
         */
        while (low < high) {

            const mid =
                Math.floor(
                    (low + high) / 2
                );

            const block =
                await this.rpcCall(
                    rpc,
                    'eth_getBlockByNumber',
                    [
                        '0x' +
                        mid.toString(16),
                        false
                    ]
                );

            if (!block) {
                break;
            }

            const timestamp =
                parseInt(
                    block.timestamp,
                    16
                ) * 1000;


            if (
                timestamp <
                targetTimestamp
            ) {
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

    async readTRON(
        net,
        fundAddress,
        project
    ) {

        const host =
            net.fullHost ||
            'https://nile.trongrid.io';

        const records = [];

        let fingerprint = null;

        let page = 0;

        const maxPages = 100;


        do {

            page++;

            if (page > maxPages) {
                console.warn(
                    '[DonorReader] TRON page limit reached'
                );
                break;
            }


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


            /*
             * از زمان ایجاد خزانه شروع کن.
             */
            const createdAt =
                this.getFundCreatedAt(
                    project,
                    net
                );

            if (createdAt) {

                params.set(
                    'min_timestamp',
                    String(createdAt)
                );
            }


            if (fingerprint) {

                params.set(
                    'fingerprint',
                    fingerprint
                );
            }


            const url =
                `${host}/v1/contracts/${net.usdtAddress}/events?${params.toString()}`;


            const response =
                await this.fetchWithTimeout(
                    url
                );


            if (!response.ok) {

                throw new Error(
                    `TRON API ${response.status}`
                );
            }


            const payload =
                await response.json();

            const events =
                payload?.data || [];


            for (
                const event of events
            ) {

                const result =
                    event.result || {};


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
                 * فقط واریز به خزانه
                 */
                if (
                    String(to).trim() !==
                    String(fundAddress).trim()
                ) {
                    continue;
                }


                /*
                 * برداشت از خزانه مشارکت نیست
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
                            BigInt(value),
                            net.tokenDecimals
                        ),

                    network:
                        net.name ||
                        net.id,

                    networkId:
                        net.id,

                    txHash:
                        event.transaction_id ||
                        event.transactionId ||
                        null,

                    blockNumber:
                        Number(
                            event.block_number ||
                            0
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
       FIND WORKING RPC
       ===================================================== */

    async findWorkingRPC(net) {

        const rpcList = [
            net.rpc,
            ...(net.rpcFallbacks || [])
        ].filter(Boolean);


        for (
            const rpc of rpcList
        ) {

            try {

                const result =
                    await this.rpcCall(
                        rpc,
                        'eth_blockNumber',
                        []
                    );

                if (result) {
                    return rpc;
                }

            } catch (error) {

                console.warn(
                    `[DonorReader] RPC failed: ${rpc}`
                );
            }
        }

        return null;
    }


    /* =====================================================
       RPC CALL
       ===================================================== */

    async rpcCall(
        rpc,
        method,
        params
    ) {

        const controller =
            new AbortController();

        const timer =
            setTimeout(
                () => controller.abort(),
                this.requestTimeout
            );


        try {

            const response =
                await fetch(
                    rpc,
                    {
                        method: 'POST',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body: JSON.stringify({

                            jsonrpc: '2.0',

                            id:
                                Date.now(),

                            method,

                            params
                        }),

                        signal:
                            controller.signal
                    }
                );


            if (!response.ok) {

                throw new Error(
                    `RPC HTTP ${response.status}`
                );
            }


            const data =
                await response.json();


            if (data.error) {

                throw new Error(
                    data.error.message ||
                    'RPC error'
                );
            }


            return data.result;

        } finally {

            clearTimeout(timer);
        }
    }


    /* =====================================================
       FETCH WITH TIMEOUT
       ===================================================== */

    async fetchWithTimeout(url) {

        const controller =
            new AbortController();

        const timer =
            setTimeout(
                () => controller.abort(),
                this.requestTimeout
            );


        try {

            return await fetch(
                url,
                {
                    signal:
                        controller.signal
                }
            );

        } finally {

            clearTimeout(timer);
        }
    }


    /* =====================================================
       AGGREGATE DONORS
       ===================================================== */

    aggregate(records) {

        const donors =
            new Map();


        for (
            const record of records
        ) {

            if (!record.address) {
                continue;
            }


            /*
             * EVM case-insensitive
             *
             * TRON نیز به صورت رشته‌ای
             * به عنوان آدرس یکتا نگه داشته می‌شود.
             */
            const key =
                String(
                    record.address
                ).toLowerCase();


            if (!donors.has(key)) {

                donors.set(
                    key,
                    {
                        address:
                            record.address,

                        amount:
                            0,

                        networks:
                            new Set(),

                        contributions:
                            []
                    }
                );
            }


            const donor =
                donors.get(key);


            donor.amount +=
                Number(
                    record.amount
                ) || 0;


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
                b.amount -
                a.amount
        );
    }


    /* =====================================================
       TOKEN AMOUNT
       ===================================================== */

    toAmount(
        value,
        decimals = 6
    ) {

        const raw =
            typeof value === 'bigint'
                ? value
                : BigInt(value);


        const divisor =
            10n **
            BigInt(decimals);


        const whole =
            raw / divisor;

        const fraction =
            raw % divisor;


        const fractionText =
            fraction
                .toString()
                .padStart(
                    decimals,
                    '0'
                )
                .replace(
                    /0+$/,
                    ''
                );


        if (!fractionText) {
            return Number(whole);
        }


        return Number(
            `${whole}.${fractionText}`
        );
    }
}


/*
 * Global
 */
window.ClassChainDonorReader =
    ClassChainDonorReader;

