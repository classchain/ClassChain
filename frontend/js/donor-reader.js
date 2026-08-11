/**
 * ClassChain — Donor Reader
 *
 * مشارکت‌کنندگان از Transfer Event خود USDT خوانده می‌شوند.
 *
 * نکته مهم:
 * - فقط Transfer هایی که مقصدشان Fund پروژه است بررسی می‌شوند.
 * - از Block 0 شروع نمی‌کنیم.
 * - برای جلوگیری از گیر کردن صفحه، فقط بازه اخیر شبکه بررسی می‌شود.
 * - EVM و TRON پشتیبانی می‌شوند.
 */

class ClassChainDonorReader {

    constructor(networkConfig) {
        this.networkConfig = networkConfig;

        /*
         * تعداد بلاک‌هایی که برای پیدا کردن مشارکت‌کنندگان
         * بررسی می‌کنیم.
         *
         * برای تست فعلی مقدار مناسبی است.
         */
        this.lookbackBlocks = 500000;

        this.transferTopic =
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a2df523b3ef';
    }


    /* =====================================================
       MAIN
       ===================================================== */

    async load(project) {

        if (!project || !project.funds) {
            console.warn(
                '[DonorReader] Project has no funds'
            );
            return [];
        }

        const records = [];

        const networks =
            Object.values(
                this.networkConfig.NETWORKS || {}
            );

        for (const net of networks) {

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

            console.log(
                `[DonorReader] Reading ${net.id}`,
                fundAddress
            );

            try {

                let items = [];

                if (net.type === 'EVM') {

                    items =
                        await this.readEVM(
                            net,
                            fundAddress
                        );

                } else if (net.type === 'TVM') {

                    items =
                        await this.readTRON(
                            net,
                            fundAddress
                        );
                }

                records.push(...items);

            } catch (error) {

                /*
                 * خطای یک شبکه نباید کل صفحه را متوقف کند.
                 */
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

        const funds =
            project?.funds;

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

            const fund =
                funds[key];

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
       EVM
       ===================================================== */

    async readEVM(
        net,
        fundAddress
    ) {

        const rpcList = [
            net.rpc,
            ...(net.rpcFallbacks || [])
        ].filter(Boolean);

        let rpc = null;

        /*
         * پیدا کردن RPC سالم
         */
        for (const candidate of rpcList) {

            try {

                const controller =
                    new AbortController();

                const timer =
                    setTimeout(
                        () => controller.abort(),
                        10000
                    );

                const response =
                    await fetch(
                        candidate,
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json'
                            },

                            body: JSON.stringify({

                                jsonrpc: '2.0',
                                id: 1,
                                method:
                                    'eth_blockNumber',
                                params: []

                            }),

                            signal:
                                controller.signal
                        }
                    );

                clearTimeout(timer);

                if (!response.ok) {
                    continue;
                }

                const data =
                    await response.json();

                if (data.result) {

                    rpc = candidate;

                    console.log(
                        `[DonorReader] EVM RPC OK: ${candidate}`
                    );

                    break;
                }

            } catch (error) {

                console.warn(
                    `[DonorReader] RPC failed: ${candidate}`,
                    error
                );
            }
        }

        if (!rpc) {

            throw new Error(
                `No working RPC for ${net.id}`
            );
        }


        /*
         * آخرین Block
         */
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
         * فقط آخرین 500,000 بلاک
         *
         * دیگر از Block 0 شروع نمی‌کنیم.
         */
        const fromBlock =
            Math.max(
                0,
                latestBlock -
                this.lookbackBlocks
            );


        console.log(
            `[DonorReader] ${net.id}: scanning ${fromBlock} → ${latestBlock}`
        );


        /*
         * Transfer(address,address,uint256)
         *
         * topic0 = keccak256 signature
         *
         * topic2 = آدرس مقصد
         */
        const paddedFund =
            '0x' +
            String(fundAddress)
                .toLowerCase()
                .replace(/^0x/, '')
                .padStart(
                    64,
                    '0'
                );


        const records = [];

        /*
         * بازه‌های کوچک‌تر برای RPC
         */
        const batchSize = 10000;

        for (
            let start = fromBlock;
            start <= latestBlock;
            start += batchSize
        ) {

            const end =
                Math.min(
                    start +
                    batchSize -
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


                if (
                    Array.isArray(logs) &&
                    logs.length
                ) {

                    console.log(
                        `[DonorReader] ${net.id}: ${logs.length} transfer(s) found in ${start}-${end}`
                    );
                }


                for (
                    const log of
                    (logs || [])
                ) {

                    /*
                     * topic1 = from
                     * topic2 = to
                     */
                    if (
                        !log.topics ||
                        log.topics.length < 3
                    ) {
                        continue;
                    }


                    const from =
                        '0x' +
                        log.topics[1]
                            .slice(-40);


                    const to =
                        '0x' +
                        log.topics[2]
                            .slice(-40);


                    /*
                     * مقدار USDT در data
                     */
                    const rawValue =
                        BigInt(
                            log.data
                        );


                    if (
                        from.toLowerCase() ===
                        fundAddress.toLowerCase()
                    ) {
                        continue;
                    }


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

                /*
                 * اگر یک batch خطا داد،
                 * بقیه batch ها ادامه پیدا می‌کنند.
                 */
                console.warn(
                    `[DonorReader] ${net.id} batch ${start}-${end} failed:`,
                    error
                );
            }
        }

        return records;
    }


    /* =====================================================
       TRON
       ===================================================== */

    async readTRON(
        net,
        fundAddress
    ) {

        const host =
            net.fullHost ||
            'https://nile.trongrid.io';

        const records = [];

        let fingerprint = null;

        /*
         * جلوگیری از pagination بی‌نهایت
         */
        let pageCount = 0;

        const maxPages = 20;


        do {

            pageCount++;

            if (
                pageCount >
                maxPages
            ) {

                console.warn(
                    '[DonorReader] TRON pagination limit reached'
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


            if (fingerprint) {

                params.set(
                    'fingerprint',
                    fingerprint
                );
            }


            const url =
                `${host}/v1/contracts/${net.usdtAddress}/events?${params.toString()}`;


            console.log(
                `[DonorReader] TRON page ${pageCount}`
            );


            const controller =
                new AbortController();

            const timer =
                setTimeout(
                    () => controller.abort(),
                    15000
                );


            let response;

            try {

                response =
                    await fetch(
                        url,
                        {
                            signal:
                                controller.signal
                        }
                    );

            } finally {

                clearTimeout(timer);
            }


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
                 * فقط انتقال به خزانه پروژه
                 */
                if (
                    String(to).trim() !==
                    String(fundAddress).trim()
                ) {
                    continue;
                }


                /*
                 * انتقال خزانه به خودش
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


            /*
             * اگر صفحه خالی بود،
             * pagination تمام شده است.
             */
            if (!events.length) {
                fingerprint = null;
            }


        } while (fingerprint);


        return records;
    }


    /* =====================================================
       JSON RPC
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
                15000
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
                    `RPC error: ${method}`
                );
            }


            return data.result;

        } finally {

            clearTimeout(timer);
        }
    }


    /* =====================================================
       AGGREGATE
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

                        amount: 0,

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
       AMOUNT
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


        /*
         * تبدیل بدون Number برای جلوگیری
         * از خطای دقت در اعداد بزرگ
         */
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


/* =========================================================
   GLOBAL
   ========================================================= */

window.ClassChainDonorReader =
    ClassChainDonorReader;

