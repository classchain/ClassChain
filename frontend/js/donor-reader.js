/**
 * ClassChain — Donor Reader
 *
 * منبع حقیقت:
 *
 *     Official USDT Transfer events
 *
 * تعریف مشارکت:
 *
 *     USDT transfer
 *          from = donor
 *          to   = project Fund
 *
 * بنابراین:
 *
 *     depositToken()
 *     USDT.transfer()
 *
 * هر دو از طریق Transfer event شناسایی می‌شوند.
 *
 * TokensReceived عمداً در این Reader استفاده نمی‌شود.
 */

class ClassChainDonorReader {

    constructor(networkConfig) {

        this.networkConfig =
            networkConfig || {};

        /*
         * keccak256(
         *   "Transfer(address,address,uint256)"
         * )
         */
        this.transferTopic =
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';


        /*
         * حداکثر زمان انتظار هر RPC request
         */
        this.requestTimeout =
            15000;


        /*
         * اندازه اولیه batch.
         *
         * اگر RPC این مقدار را قبول نکند،
         * به صورت خودکار کوچک می‌شود.
         */
        this.initialBatchSize =
            50000;


        /*
         * حداقل batch
         */
        this.minBatchSize =
            1000;


        /*
         * حداکثر batch
         */
        this.maxBatchSize =
            100000;
    }


    /* =====================================================
       MAIN
       ===================================================== */

    async load(project) {
        await this.networkConfig.ready

        if (
            !project ||
            !project.funds
        ) {
            return [];
        }


        const networks =
            Object.values(
                this.networkConfig.NETWORKS || {}
            );


        /*
         * شبکه‌ها را موازی می‌خوانیم.
         *
         * خرابی یک شبکه نباید جلوی شبکه دیگر را بگیرد.
         */
        const results =
            await Promise.allSettled(

                networks.map(
                    async net => {

                        if (
                            net.status !== 'active' ||
                            !net.enabled
                        ) {
                            return [];
                        }


                        const fundAddress =
                            this.getFundAddress(
                                project,
                                net
                            );


                        if (!fundAddress) {
                            return [];
                        }


                        try {

                            console.log(
                                `[DonorReader] شروع ${net.id}`
                            );

                            let records = [];


                            if (
                                net.type === 'EVM'
                            ) {

                                records =
                                    await this.readEVM(
                                        net,
                                        fundAddress,
                                        project
                                    );

                            } else if (
                                net.type === 'TVM'
                            ) {

                                records =
                                    await this.readTRON(
                                        net,
                                        fundAddress,
                                        project
                                    );
                            }


                            console.log(
                                `[DonorReader] ${net.id}: ` +
                                `${records.length} contribution events`
                            );


                            return records;

                        } catch (error) {

                            console.error(
                                `[DonorReader] ${net.id} failed:`,
                                error
                            );

                            /*
                             * شکست یک شبکه نباید
                             * نتیجه شبکه‌های دیگر را حذف کند.
                             */
                            return [];
                        }
                    }
                )
            );


        const records = [];


        for (
            const result of results
        ) {

            if (
                result.status === 'fulfilled' &&
                Array.isArray(result.value)
            ) {

                records.push(
                    ...result.value
                );
            }
        }


        console.log(
            `[DonorReader] total raw records: ${records.length}`
        );


        return this.aggregate(
            records
        );
    }


    /* =====================================================
       FUND
       ===================================================== */

    getFundAddress(
    project,
    net
) {

    const funds =
        project?.funds;

    if (
        !funds ||
        typeof funds !== 'object'
    ) {
        return null;
    }

    const key =
        net.fundsKey;

    if (!key) {
        return null;
    }

    const fund =
        funds[key];

    if (
        !fund ||
        typeof fund !== 'object'
    ) {
        return null;
    }

    if (
        !fund.address ||
        String(fund.address).trim() === ''
    ) {
        return null;
    }

    return String(
        fund.address
    ).trim();
}


    getFundCreatedAt(
    project,
    net
) {

    const funds =
        project?.funds;

    if (
        !funds ||
        typeof funds !== 'object'
    ) {
        return null;
    }

    const key =
        net.fundsKey;

    if (!key) {
        return null;
    }

    const fund =
        funds[key];

    if (!fund?.createdAt) {
        return null;
    }

    const timestamp =
        Date.parse(
            fund.createdAt
        );

    return Number.isFinite(timestamp)
        ? timestamp
        : null;
}


    /* =====================================================
       EVM
       ===================================================== */

    async readEVM(
        net,
        fundAddress,
        project
    ) {

        if (!net.usdtAddress) {

            throw new Error(
                `USDT address not configured for ${net.id}`
            );
        }


        const rpc =
            await this.findWorkingRPC(
                net
            );


        if (!rpc) {

            throw new Error(
                `No working RPC for ${net.id}`
            );
        }


        /*
         * آخرین بلاک
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
         * اگر createdAt موجود باشد،
         * فقط برای کاهش حجم scan استفاده می‌شود.
         *
         * صحت داده به createdAt وابسته نیست.
         */
        let fromBlock = 0;


        const createdAt =
            this.getFundCreatedAt(
                project,
                net
            );


        if (createdAt) {

            try {

                fromBlock =
                    await this.findBlockByTimestamp(
                        rpc,
                        createdAt
                    );

            } catch (error) {

                console.warn(
                    `[DonorReader] ${net.id}: ` +
                    `timestamp lookup failed; scanning from block 0`
                );

                fromBlock = 0;
            }
        }


        /*
         * اگر fromBlock از latest بزرگ‌تر شد،
         * چیزی برای scan نداریم.
         */
        if (
            fromBlock > latestBlock
        ) {
            return [];
        }


        console.log(
            `[DonorReader] ${net.id}: ` +
            `scanning ${fromBlock} → ${latestBlock}`
        );


        /*
         * Fund address باید در topic[2] باشد:
         *
         * Transfer(
         *     address indexed from,
         *     address indexed to,
         *     uint256 value
         * )
         */

        const paddedFund =
            this.padAddressTopic(
                fundAddress
            );


        return await this.scanEvmLogs({
            rpc,
            tokenAddress:
                net.usdtAddress,
            fromBlock,
            latestBlock,
            topics: [
                this.transferTopic,
                null,
                paddedFund
            ],
            net,
            fundAddress
        });
    }


    /* =====================================================
       EVM LOG SCANNER
       ===================================================== */

    async scanEvmLogs({
        rpc,
        tokenAddress,
        fromBlock,
        latestBlock,
        topics,
        net,
        fundAddress
    }) {

        const records = [];


        let start =
            fromBlock;


        let batchSize =
            this.initialBatchSize;


        while (
            start <= latestBlock
        ) {

            const end =
                Math.min(
                    start + batchSize - 1,
                    latestBlock
                );


            try {

                console.log(
                    `[DonorReader] EVM batch ` +
                    `${start} → ${end}`
                );


                const logs =
                    await this.rpcCall(
                        rpc,
                        'eth_getLogs',
                        [{
                            address:
                                tokenAddress,

                            fromBlock:
                                '0x' +
                                start.toString(16),

                            toBlock:
                                '0x' +
                                end.toString(16),

                            topics
                        }]
                    );


                for (
                    const log of
                    (logs || [])
                ) {

                    const record =
                        this.parseEvmTransfer(
                            log,
                            net,
                            fundAddress
                        );


                    if (record) {

                        records.push(
                            record
                        );
                    }
                }


                /*
                 * اگر batch موفق بود،
                 * کمی بزرگ‌ترش می‌کنیم.
                 */
                if (
                    batchSize <
                    this.maxBatchSize
                ) {

                    batchSize =
                        Math.min(
                            Math.floor(
                                batchSize * 1.5
                            ),
                            this.maxBatchSize
                        );
                }


                start =
                    end + 1;

            } catch (error) {

                console.warn(
                    `[DonorReader] EVM batch failed ` +
                    `${start} → ${end}:`,
                    error
                );


                /*
                 * اگر RPC به خاطر بزرگ بودن
                 * بازه خطا داد، batch را نصف می‌کنیم.
                 */
                if (
                    batchSize >
                    this.minBatchSize
                ) {

                    batchSize =
                        Math.max(
                            Math.floor(
                                batchSize / 2
                            ),
                            this.minBatchSize
                        );


                    console.log(
                        `[DonorReader] reducing batch to ${batchSize}`
                    );

                    continue;
                }


                /*
                 * اگر حتی کوچک‌ترین batch هم
                 * شکست خورد، از آن عبور می‌کنیم
                 * تا صفحه برای همیشه گیر نکند.
                 */
                console.error(
                    `[DonorReader] skipping block range ` +
                    `${start} → ${end}`
                );


                start =
                    end + 1;
            }
        }


        return records;
    }


    /* =====================================================
       EVM TRANSFER PARSER
       ===================================================== */

    parseEvmTransfer(
        log,
        net,
        fundAddress
    ) {

        if (
            !log?.topics ||
            log.topics.length < 3
        ) {
            return null;
        }


        /*
         * topics[1] = from
         * topics[2] = to
         */
        const from =
            this.topicToAddress(
                log.topics[1]
            );


        const to =
            this.topicToAddress(
                log.topics[2]
            );


        /*
         * فقط انتقال به Fund
         */
        if (
            to.toLowerCase() !==
            fundAddress.toLowerCase()
        ) {
            return null;
        }


        /*
         * برداشت از Fund نباید مشارکت محسوب شود.
         */
        if (
            from.toLowerCase() ===
            fundAddress.toLowerCase()
        ) {
            return null;
        }


        /*
         * مقدار USDT
         */
        const rawValue =
            BigInt(
                log.data || '0x0'
            );


        if (
            rawValue <= 0n
        ) {
            return null;
        }


        return {

            address:
                from,

            amount:
                this.toAmount(
                    rawValue,
                    net.tokenDecimals || 6
                ),

            network:
                net.name || net.id,

            networkId:
                net.id,

            txHash:
                log.transactionHash ||
                null,

            logIndex:
                log.logIndex != null
                    ? parseInt(
                        log.logIndex,
                        16
                    )
                    : null,

            blockNumber:
                log.blockNumber
                    ? parseInt(
                        log.blockNumber,
                        16
                    )
                    : 0,

            source:
                'Transfer'
        };
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


        while (
            low < high
        ) {

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

                throw new Error(
                    `Block ${mid} not available`
                );
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

                low =
                    mid + 1;

            } else {

                high =
                    mid;
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

        if (!net.usdtAddress) {

            throw new Error(
                `USDT address not configured for ${net.id}`
            );
        }


        const host =
            net.fullHost ||
            'https://nile.trongrid.io';


        const createdAt =
            this.getFundCreatedAt(
                project,
                net
            );


        const minTimestamp =
            createdAt
                ? String(createdAt)
                : null;


        console.log(
            `[DonorReader] TRON ${net.id}: ` +
            `reading USDT Transfer events`
        );


        return await this.fetchTronTransferEvents({

            host,

            usdtAddress:
                net.usdtAddress,

            fundAddress,

            net,

            minTimestamp
        });
    }


    /* =====================================================
       TRON TRANSFER EVENTS
       ===================================================== */

    async fetchTronTransferEvents({
        host,
        usdtAddress,
        fundAddress,
        net,
        minTimestamp
    }) {

        const records = [];


        let fingerprint =
            null;


        let page =
            0;


        /*
         * safety limit
         */
        const maxPages =
            200;


        do {

            page++;


            if (
                page >
                maxPages
            ) {

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


            if (minTimestamp) {

                params.set(
                    'min_timestamp',
                    minTimestamp
                );
            }


            if (fingerprint) {

                params.set(
                    'fingerprint',
                    fingerprint
                );
            }


            const url =
                `${host}/v1/contracts/` +
                `${usdtAddress}/events?` +
                params.toString();


            console.log(
                `[DonorReader] TRON page ${page}`
            );


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
                Array.isArray(
                    payload?.data
                )
                    ? payload.data
                    : [];


            for (
                const event of events
            ) {

                const record =
                    this.parseTronTransfer(
                        event,
                        net,
                        fundAddress
                    );


                if (record) {

                    records.push(
                        record
                    );
                }
            }


            fingerprint =
                payload?.meta?.fingerprint ||
                null;


            if (
                events.length === 0
            ) {

                fingerprint =
                    null;
            }


        } while (
            fingerprint
        );


        return records;
    }


    /* =====================================================
       TRON TRANSFER PARSER
       ===================================================== */

    parseTronTransfer(
        event,
        net,
        fundAddress
    ) {

        const result =
            event?.result || {};


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
            return null;
        }


        /*
         * فقط انتقال به Fund
         */
        if (
            String(to).trim() !==
            String(fundAddress).trim()
        ) {
            return null;
        }


        /*
         * برداشت از Fund
         */
        if (
            String(from).trim() ===
            String(fundAddress).trim()
        ) {
            return null;
        }


        let rawValue;


        try {

            rawValue =
                BigInt(value);

        } catch (error) {

            console.warn(
                '[DonorReader] invalid TRON value:',
                value
            );

            return null;
        }


        if (
            rawValue <= 0n
        ) {
            return null;
        }


        return {

            address:
                String(from).trim(),

            amount:
                this.toAmount(
                    rawValue,
                    net.tokenDecimals || 6
                ),

            network:
                net.name || net.id,

            networkId:
                net.id,

            txHash:
                event.transaction_id ||
                event.transactionId ||
                null,

            eventIndex:
                event.event_index ??
                event.eventIndex ??
                null,

            blockNumber:
                Number(
                    event.block_number || 0
                ),

            timestamp:
                event.block_timestamp ||
                null,

            source:
                'Transfer'
        };
    }


    /* =====================================================
       RPC
       ===================================================== */

    async findWorkingRPC(net) {

        const rpcList = [
            net.rpcUrl,
            ...(net.rpcFallbacks || [])
        ]
            .filter(Boolean);


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

                    console.log(
                        `[DonorReader] working RPC: ${rpc}`
                    );

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
                        method:
                            'POST',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body:
                            JSON.stringify({
                                jsonrpc:
                                    '2.0',

                                id:
                                    Date.now(),

                                method,

                                params
                            }),

                        signal:
                            controller.signal
                    }
                );


            if (
                !response.ok
            ) {

                throw new Error(
                    `RPC HTTP ${response.status}`
                );
            }


            const data =
                await response.json();


            if (
                data.error
            ) {

                throw new Error(
                    data.error.message ||
                    'RPC error'
                );
            }


            return data.result;

        } finally {

            clearTimeout(
                timer
            );
        }
    }


    /* =====================================================
       TRON / HTTP
       ===================================================== */

    async fetchWithTimeout(
        url
    ) {

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

            clearTimeout(
                timer
            );
        }
    }


    /* =====================================================
       AGGREGATE
       ===================================================== */

    aggregate(records) {

        /*
         * اول eventهای تکراری را حذف می‌کنیم.
         *
         * EVM:
         *     networkId + txHash + logIndex
         *
         * TRON:
         *     networkId + txHash + eventIndex
         *
         * اگر index موجود نباشد،
         * fallback به txHash + address + amount
         */
        const unique =
            new Map();


        for (
            const record of records
        ) {

            if (
                !record ||
                !record.address
            ) {
                continue;
            }


            const network =
                String(
                    record.networkId ||
                    ''
                ).toLowerCase();


            const txHash =
                String(
                    record.txHash ||
                    ''
                ).toLowerCase();


            let eventIndex =
                '';


            if (
                record.logIndex != null
            ) {

                eventIndex =
                    `log:${record.logIndex}`;

            } else if (
                record.eventIndex != null
            ) {

                eventIndex =
                    `event:${record.eventIndex}`;
            }


            const fallback =
                [
                    String(
                        record.address
                    ).toLowerCase(),

                    String(
                        record.amount
                    )
                ].join(':');


            const key =
                [
                    network,
                    txHash,
                    eventIndex ||
                    fallback
                ].join(':');


            if (
                !unique.has(key)
            ) {

                unique.set(
                    key,
                    record
                );
            }
        }


        /*
         * سپس مشارکت‌ها را
         * بر اساس wallet aggregate می‌کنیم.
         */
        const donors =
            new Map();


        for (
            const record of
            unique.values()
        ) {

            const addressKey =
                String(
                    record.address
                ).toLowerCase();


            if (
                !donors.has(
                    addressKey
                )
            ) {

                donors.set(
                    addressKey,
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
                donors.get(
                    addressKey
                );


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


        return Array
            .from(
                donors.values()
            )
            .map(
                donor => ({
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
                })
            )
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
            raw /
            divisor;


        const fraction =
            raw %
            divisor;


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


        /*
         * برای UI مقدار decimal برمی‌گردانیم.
         *
         * در مرحله بعد می‌توانیم
         * aggregation را نیز BigInt کنیم.
         */
        if (
            !fractionText
        ) {

            return Number(
                whole
            );
        }


        return Number(
            `${whole}.${fractionText}`
        );
    }


    /* =====================================================
       ADDRESS HELPERS
       ===================================================== */

    topicToAddress(
        topic
    ) {

        return (
            '0x' +
            String(topic)
                .slice(-40)
        );
    }


    padAddressTopic(
        address
    ) {

        return (
            '0x' +
            String(address)
                .replace(
                    /^0x/,
                    ''
                )
                .toLowerCase()
                .padStart(
                    64,
                    '0'
                )
        );
    }
}


/*
 * Export global
 */
window.ClassChainDonorReader =
    ClassChainDonorReader;
