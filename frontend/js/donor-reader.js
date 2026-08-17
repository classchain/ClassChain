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
        this.initialBatchSize = 50000;

        /*
         * حداقل بازه‌ای که eth_getLogs باید بتواند بخواند.
         * اگر حتی این مقدار هم fail شود، Scan را متوقف می‌کنیم.
         */
        this.minBatchSize = 1;

        /*
         * سقف داخلی؛ سقف واقعی RPC در زمان انتخاب RPC
         * تعیین می‌شود.
         */
        this.maxBatchSize = 100000;
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
                                `[DonorReader] ${net.id} FAILED:`,
                                error
                            );
                        
                            return {
                                __networkError: true,
                                network: net.id,
                                error: error
                            };
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

    const latestBlock =
        await this.rpcCall(
            rpc,
            'eth_blockNumber',
            []
        );

    const latest =
        parseInt(
            latestBlock,
            16
        );

    if (!Number.isFinite(latest)) {
        throw new Error(
            `latestBlock نامعتبر است: ${latestBlock}`
        );
    }

    /*
     * از زمان ایجاد خزانه شروع می‌کنیم.
     * این قسمت فقط برای کم کردن حجم Scan است.
     */
    let fromBlock = 0;

    const createdAt =
        this.getFundCreatedAt(
            project,
            net
        );

    if (createdAt) {
        fromBlock =
            await this.findBlockByTimestamp(
                rpc,
                createdAt,
                latest
            );
    }

    if (fromBlock > latest) {
        throw new Error(
            `[DonorReader] fromBlock (${fromBlock}) > latest (${latest})`
        );
    }

    console.log(
        `[DonorReader] EVM ${net.id}: ` +
        `from=${fromBlock}, latest=${latest}`
    );

    const paddedFund =
        this.padAddressTopic(
            fundAddress
        );

    /*
     * فقط Transferهای USDT که مقصدشان Fund است.
     */
    return await this.scanEvmLogs({
        rpc,
        tokenAddress:
            net.usdtAddress,

        fromBlock,

        latestBlock:
            latest,

        /*
         * شروع با batch بزرگ.
         * اگر RPC قبول نکرد، scanEvmLogs خودش کاهش می‌دهد.
         */
        maxLogRange:
            50000,

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
    maxLogRange,
    topics,
    net,
    fundAddress
}) {

    const records = [];

    let start =
        fromBlock;

    /*
     * شروع بزرگ.
     * در صورت خطا نصف می‌شود.
     */
    let batchSize =
        Number(maxLogRange) || 50000;

    batchSize =
        Math.max(
            1000,
            batchSize
        );

    while (
        start <= latestBlock
    ) {

        const end =
            Math.min(
                start +
                    batchSize -
                    1,

                latestBlock
            );

        try {

            console.log(
                `[DonorReader] EVM ${net.id}: ` +
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

            if (
                Array.isArray(logs)
            ) {

                for (
                    const log of logs
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
            }

            /*
             * batch موفق بود.
             */
            start =
                end + 1;

        } catch (error) {

            console.warn(
                `[DonorReader] EVM batch failed ` +
                `${start} → ${end}`,
                error
            );

            const rpcLimit =
                this.extractLogRangeLimit(
                    error
                );

            if (
                rpcLimit &&
                rpcLimit < batchSize
            ) {

                batchSize =
                    Math.max(
                        1000,
                        rpcLimit
                    );

                continue;
            }

            /*
             * اگر محدودیت مشخص نبود،
             * batch را نصف می‌کنیم.
             */
            if (
                batchSize > 1000
            ) {

                batchSize =
                    Math.max(
                        1000,
                        Math.floor(
                            batchSize / 2
                        )
                    );

                continue;
            }

            /*
             * اینجا خطای واقعی RPC است.
             * دیگر آن را Skip نمی‌کنیم.
             */
            const fatalError =
                new Error(
                    `[DonorReader] eth_getLogs ` +
                    `در ${net.id} شکست خورد.`
                );

            fatalError.cause =
                error;

            fatalError.rpc =
                rpc;

            fatalError.tokenAddress =
                tokenAddress;

            fatalError.fundAddress =
                fundAddress;

            fatalError.fromBlock =
                start;

            fatalError.toBlock =
                end;

            throw fatalError;
        }
    }

    console.log(
        `[DonorReader] ${net.id}: ` +
        `${records.length} raw Transfer events`
    );

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
    targetTimestamp,
    latestBlock
) {

    if (
        !Number.isFinite(
            targetTimestamp
        )
    ) {

        throw new Error(
            `targetTimestamp نامعتبر است: ${targetTimestamp}`
        );
    }


    /*
     * --------------------------------------------------------
     * timestamp بلاک latest
     * --------------------------------------------------------
     */

    const latestBlockData =
        await this.rpcCall(
            rpc,
            'eth_getBlockByNumber',
            [
                '0x' +
                latestBlock.toString(16),

                false
            ]
        );


    if (
        !latestBlockData ||
        !latestBlockData.timestamp
    ) {

        throw new Error(
            'timestamp بلاک latest قابل خواندن نیست.'
        );
    }


    const latestTimestamp =
        parseInt(
            latestBlockData.timestamp,
            16
        ) * 1000;


    /*
     * اگر Fund بعد از latest ایجاد شده باشد
     */
    if (
        targetTimestamp >
        latestTimestamp
    ) {

        throw new Error(
            `createdAt پروژه (${targetTimestamp}) ` +
            `بعد از latest block (${latestTimestamp}) است.`
        );
    }


    /*
     * اگر دقیقاً بعد از latest باشد.
     */
    if (
        targetTimestamp ===
        latestTimestamp
    ) {

        return latestBlock;
    }


    /*
     * --------------------------------------------------------
     * یک نمونه قدیمی‌تر برای تخمین block time
     *
     * به‌جای Binary Search از Block 0،
     * ابتدا محدوده تقریبی را پیدا می‌کنیم.
     * --------------------------------------------------------
     */

    const sampleDistance =
        Math.min(
            5000,
            latestBlock
        );


    const sampleBlockNumber =
        latestBlock -
        sampleDistance;


    const sampleBlock =
        await this.rpcCall(
            rpc,
            'eth_getBlockByNumber',
            [
                '0x' +
                sampleBlockNumber.toString(16),

                false
            ]
        );


    if (
        !sampleBlock ||
        !sampleBlock.timestamp
    ) {

        throw new Error(
            `timestamp بلاک نمونه ${sampleBlockNumber} قابل خواندن نیست.`
        );
    }


    const sampleTimestamp =
        parseInt(
            sampleBlock.timestamp,
            16
        ) * 1000;


    const elapsedMs =
        latestTimestamp -
        sampleTimestamp;


    if (
        elapsedMs <= 0
    ) {

        throw new Error(
            'اختلاف timestamp بلاک‌ها معتبر نیست.'
        );
    }


    const msPerBlock =
        elapsedMs /
        sampleDistance;


    /*
     * --------------------------------------------------------
     * تخمین Block
     * --------------------------------------------------------
     */

    const estimatedOffset =
        Math.max(
            0,
            Math.round(
                (
                    latestTimestamp -
                    targetTimestamp
                ) /
                msPerBlock
            )
        );


    let estimatedBlock =
        latestBlock -
        estimatedOffset;


    estimatedBlock =
        Math.max(
            0,
            Math.min(
                latestBlock,
                estimatedBlock
            )
        );


    console.log(
        `[DonorReader] timestamp → block estimate: ` +
        `${estimatedBlock}`
    );


    /*
     * --------------------------------------------------------
     * اطراف تخمین را می‌خوانیم تا یک bracket واقعی بسازیم.
     * --------------------------------------------------------
     */

    const windowSize =
        Math.max(
            1000,
            Math.ceil(
                sampleDistance * 2
            )
        );


    let low =
        Math.max(
            0,
            estimatedBlock -
            windowSize
        );


    let high =
        Math.min(
            latestBlock,
            estimatedBlock +
            windowSize
        );


    /*
     * Timestamp بلاک low
     */
    let lowBlock =
        await this.rpcCall(
            rpc,
            'eth_getBlockByNumber',
            [
                '0x' +
                low.toString(16),

                false
            ]
        );


    /*
     * اگر low هنوز بعد از target بود،
     * محدوده را به سمت عقب گسترش می‌دهیم.
     */

    while (
        low > 0 &&
        lowBlock?.timestamp &&
        (
            parseInt(
                lowBlock.timestamp,
                16
            ) * 1000
        ) >
        targetTimestamp
    ) {

        const distance =
            Math.max(
                1000,
                high - low
            );


        high =
            low;

        low =
            Math.max(
                0,
                low - distance
            );


        lowBlock =
            await this.rpcCall(
                rpc,
                'eth_getBlockByNumber',
                [
                    '0x' +
                    low.toString(16),

                    false
                ]
            );
    }


    /*
     * Timestamp بلاک high
     */
    let highBlock =
        await this.rpcCall(
            rpc,
            'eth_getBlockByNumber',
            [
                '0x' +
                high.toString(16),

                false
            ]
        );


    /*
     * اگر high هنوز قبل از target بود،
     * محدوده را به سمت جلو گسترش می‌دهیم.
     */

    while (
        high < latestBlock &&
        highBlock?.timestamp &&
        (
            parseInt(
                highBlock.timestamp,
                16
            ) * 1000
        ) <
        targetTimestamp
    ) {

        const distance =
            Math.max(
                1000,
                high - low
            );


        low =
            high;

        high =
            Math.min(
                latestBlock,
                high + distance
            );


        highBlock =
            await this.rpcCall(
                rpc,
                'eth_getBlockByNumber',
                [
                    '0x' +
                    high.toString(16),

                    false
                ]
            );
    }


    /*
     * --------------------------------------------------------
     * اکنون Binary Search روی یک محدوده کوچک انجام می‌شود.
     * --------------------------------------------------------
     */

    while (
        low < high
    ) {

        const mid =
            Math.floor(
                (
                    low +
                    high
                ) / 2
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


        if (
            !block ||
            !block.timestamp
        ) {

            throw new Error(
                `Block ${mid} timestamp قابل خواندن نیست.`
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
            net.rpcUrl;

        if (!host) {

            throw new Error(
                `RPC URL برای شبکه ${net.id} در network-config تعریف نشده است.`
            );
        }

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
                `${host}/v1/accounts/` +
                `${fundAddress}/transactions/trc20?` +
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
   TRON ADDRESS NORMALIZATION
   ===================================================== */

base58ToTronHex(address) {

    if (
        typeof address !== 'string' ||
        !address.startsWith('T')
    ) {
        return null;
    }


    const alphabet =
        '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';


    let value = 0n;


    for (
        const char of address
    ) {

        const index =
            alphabet.indexOf(char);


        if (index < 0) {

            return null;
        }


        value =
            value * 58n +
            BigInt(index);
    }


    let hex =
        value.toString(16);


    /*
     * TRON Base58Check payload:
     *
     * 41 + 20 byte address + 4 byte checksum
     *
     * We only need:
     *
     * 41 + 20 byte address
     */


    if (
        hex.length < 50
    ) {

        return null;
    }


    /*
     * The decoded TRON payload is
     * always 21 bytes before checksum.
     */

    return hex
        .slice(0, 42)
        .toLowerCase();
}


normalizeTronAddress(address) {

    if (!address) {

        return null;
    }


    const value =
        String(address).trim();


    /*
     * TronGrid event API returns:
     *
     * 0x + 40 hex characters
     */

    if (
        /^0x[0-9a-fA-F]{40}$/.test(value)
    ) {

        return (
            '41' +
            value
                .slice(2)
                .toLowerCase()
        );
    }


    /*
     * Raw TRON hexadecimal address:
     *
     * 41 + 40 hex characters
     */

    if (
        /^41[0-9a-fA-F]{40}$/.test(value)
    ) {

        return value.toLowerCase();
    }


    /*
     * TRON Base58 address:
     *
     * T...
     */

    if (
        value.startsWith('T')
    ) {

        return this.base58ToTronHex(
            value
        );
    }


    return null;
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
     * =====================================================
     * Normalize TRON addresses
     *
     * API:
     *
     *     0x...
     *
     * Project:
     *
     *     T...
     *
     * هر دو را به:
     *
     *     41...
     *
     * تبدیل می‌کنیم.
     * =====================================================
     */

    const normalizedFrom =
        this.normalizeTronAddress(
            from
        );


    const normalizedTo =
        this.normalizeTronAddress(
            to
        );


    const normalizedFund =
        this.normalizeTronAddress(
            fundAddress
        );


    if (
        !normalizedFrom ||
        !normalizedTo ||
        !normalizedFund
    ) {

        console.warn(
            '[DonorReader] invalid TRON address:',
            {
                from,
                to,
                fundAddress,
                normalizedFrom,
                normalizedTo,
                normalizedFund
            }
        );

        return null;
    }


    /*
     * =====================================================
     * فقط انتقال به Fund
     * =====================================================
     */

    if (
        normalizedTo !==
        normalizedFund
    ) {

        return null;
    }


    /*
     * =====================================================
     * برداشت از Fund
     * مشارکت محسوب نمی‌شود.
     * =====================================================
     */

    if (
        normalizedFrom ===
        normalizedFund
    ) {

        return null;
    }


    /*
     * =====================================================
     * USDT amount
     * =====================================================
     */

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

        /*
         * آدرس اصلی مشارکت‌کننده.
         *
         * همان فرمت API نگه داشته می‌شود.
         */

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

    if (rpcList.length === 0) {
        throw new Error(
            `[DonorReader] هیچ RPC برای ${net.id} تعریف نشده است.`
        );
    }

    for (const rpc of rpcList) {

        try {

            /*
             * تست اصلی:
             * فقط blockNumber
             */
            const latestHex =
                await this.rpcCall(
                    rpc,
                    'eth_blockNumber',
                    []
                );

            const latest =
                parseInt(
                    latestHex,
                    16
                );

            if (
                !Number.isFinite(latest)
            ) {
                throw new Error(
                    'eth_blockNumber نامعتبر است.'
                );
            }

            /*
             * تست eth_getLogs روی یک block.
             *
             * این تست فقط برای اطمینان از پشتیبانی RPC است.
             */
            await this.rpcCall(
                rpc,
                'eth_getLogs',
                [{
                    address:
                        net.usdtAddress,

                    fromBlock:
                        '0x' +
                        latest.toString(16),

                    toBlock:
                        '0x' +
                        latest.toString(16),

                    topics: [
                        this.transferTopic
                    ]
                }]
            );

            console.log(
                `[DonorReader] RPC انتخاب شد: ${rpc}`
            );

            return rpc;

        } catch (error) {

            console.warn(
                `[DonorReader] RPC failed: ${rpc}`,
                error
            );
        }
    }

    throw new Error(
        `[DonorReader] هیچ RPC قابل استفاده‌ای برای ${net.id} پیدا نشد.`
    );
}

async detectMaxLogRange(
    rpc,
    tokenAddress,
    paddedFund,
    latestBlock
) {

    /*
     * از یک بازه بزرگ شروع می‌کنیم.
     *
     * اگر RPC اعلام کند مثلاً:
     *
     * Maximum allowed number of requested blocks is 1000
     *
     * همان مقدار را مستقیماً استخراج می‌کنیم.
     */

    let high =
        Math.min(
            this.initialBatchSize,
            latestBlock + 1
        );


    let low = 1;

    let lastWorking =
        null;


    while (
        low <= high
    ) {

        const mid =
            Math.floor(
                (low + high) / 2
            );


        const end =
            latestBlock;

        const start =
            Math.max(
                0,
                end - mid + 1
            );


        try {

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

                    topics: [
                        this.transferTopic,
                        null,
                        paddedFund
                    ]
                }]
            );


            /*
             * این بازه کار کرد.
             */
            lastWorking =
                mid;

            low =
                mid + 1;


        } catch (error) {

            const rpcLimit =
                this.extractLogRangeLimit(
                    error
                );


            /*
             * اگر خود RPC سقف را گفته،
             * بهتر است همان را استفاده کنیم.
             */
            if (
                rpcLimit &&
                Number.isFinite(
                    rpcLimit
                )
            ) {

                return Math.max(
                    1,
                    rpcLimit
                );
            }


            high =
                mid - 1;
        }
    }


    if (
        lastWorking &&
        lastWorking > 0
    ) {

        return lastWorking;
    }


    /*
     * حتی یک Block هم قابل خواندن نیست.
     */
    throw new Error(
        `[DonorReader] eth_getLogs حتی برای یک Block نیز قابل استفاده نیست.`
    );
}

extractLogRangeLimit(
    error
) {

    const message =
        String(
            error?.message ||
            error ||
            ''
        );


    /*
     * نمونه:
     *
     * Maximum allowed number of requested blocks is 1000
     */

    const match =
        message.match(
            /maximum allowed number of requested blocks(?: is|:)?\s*(\d+)/i
        );


    if (
        match &&
        match[1]
    ) {

        const value =
            Number(
                match[1]
            );


        if (
            Number.isFinite(
                value
            ) &&
            value > 0
        ) {

            console.log(
                `[DonorReader] RPC reported max log range: ${value}`
            );

            return value;
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
