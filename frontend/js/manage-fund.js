let projectData = {};
let projectId = null;
let selectedNetworkId = null;
let selectedNetCfg = null;
let connection = null;
let fundAddress = null;
let multisigAddress = null;
let isOwner = false;
let tronMultisigOwners = [];
let tronRequiredConfirmations = 0;

const fundABI = [
    {
        inputs: [{ internalType: "address", name: "token", type: "address" }],
        name: "balanceOf",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "owner",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            { internalType: "address", name: "token", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "amount", type: "uint256" }
        ],
        name: "withdrawToken",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    }
];

const tronFundABI = [
    {
        inputs: [{ internalType: "address", name: "token", type: "address" }],
        name: "balanceOf",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "owner",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [{ internalType: "address", name: "", type: "address" }],
        name: "allowedTokens",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            { internalType: "address", name: "token", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "amount", type: "uint256" }
        ],
        name: "withdrawToken",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    }
];

const tronMultisigABI = [
    {
        inputs: [],
        name: "getOwners",
        outputs: [
            {
                internalType: "address[]",
                name: "",
                type: "address[]"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "numConfirmationsRequired",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "_txIndex",
                type: "uint256"
            }
        ],
        name: "getTransaction",
        outputs: [
            {
                internalType: "address",
                name: "to",
                type: "address"
            },
            {
                internalType: "uint256",
                name: "value",
                type: "uint256"
            },
            {
                internalType: "bytes",
                name: "data",
                type: "bytes"
            },
            {
                internalType: "bool",
                name: "executed",
                type: "bool"
            },
            {
                internalType: "uint256",
                name: "numConfirmations",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "getTransactionCount",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "_to",
                type: "address"
            },
            {
                internalType: "uint256",
                name: "_value",
                type: "uint256"
            },
            {
                internalType: "bytes",
                name: "_data",
                type: "bytes"
            }
        ],
        name: "submitTransaction",
        outputs: [
            {
                internalType: "uint256",
                name: "txIndex",
                type: "uint256"
            }
        ],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "_txIndex",
                type: "uint256"
            }
        ],
        name: "confirmTransaction",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "_txIndex",
                type: "uint256"
            }
        ],
        name: "executeTransaction",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    }
];

function getElement(id) {
    return document.getElementById(id);
}

function normalizeAddress(address) {
    return String(address || "").trim();
}

function sameAddress(a, b) {
    if (!a || !b) return false;

    return (
        normalizeAddress(a).toLowerCase() ===
        normalizeAddress(b).toLowerCase()
    );
}

function shortAddress(address, start = 10, end = 8) {
    if (!address) return "-";

    const value = String(address);

    if (value.length <= start + end + 3) {
        return value;
    }

    return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function getTronWeb() {
    if (connection?.tronWeb) {
        return connection.tronWeb;
    }

    if (window.tronWeb) {
        return window.tronWeb;
    }

    return null;
}

function getTronBase58(address) {
    const tronWeb = getTronWeb();

    if (!tronWeb || !address) {
        return address;
    }

    const value = String(address).trim();

    // Already Base58
    if (value.startsWith("T")) {
        return value;
    }

    // TRON Hex address
    if (value.startsWith("41") && value.length === 42) {
        try {
            return tronWeb.address.fromHex(value);
        } catch (error) {
            console.error("Failed to convert TRON Hex address to Base58:", error);
            return value;
        }
    }

    return value;
}

function getTronHex(address) {
    const tronWeb = getTronWeb();

    if (!tronWeb || !address) {
        return address;
    }

    try {
        if (String(address).startsWith("41")) {
            return address;
        }
    } catch (_) {}

    try {
        if (tronWeb.address?.toHex) {
            return tronWeb.address.toHex(address);
        }
    } catch (_) {}

    return address;
}

function parseTokenAmount(value, decimals) {
    const input = String(value ?? "").trim();

    if (!input || !/^\d+(\.\d+)?$/.test(input)) {
        throw new Error("مقدار توکن معتبر نیست.");
    }

    const parts = input.split(".");
    const whole = parts[0];
    const fraction = parts[1] || "";

    if (fraction.length > decimals) {
        throw new Error(
            `حداکثر ${decimals} رقم اعشار مجاز است.`
        );
    }

    const paddedFraction =
        (fraction + "0".repeat(decimals)).slice(0, decimals);

    return BigInt(
        `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, "") || "0"
    );
}

function formatTokenAmount(rawValue, decimals = 6) {
    try {
        const raw = BigInt(String(rawValue || "0"));
        const divisor = 10n ** BigInt(decimals);

        const whole = raw / divisor;
        const fraction = raw % divisor;

        if (fraction === 0n) {
            return whole.toString();
        }

        let fractionText =
            fraction.toString().padStart(decimals, "0");

        fractionText = fractionText.replace(/0+$/, "");

        return `${whole}.${fractionText}`;
    } catch (_) {
        return "0";
    }
}

function setStatus(message, type = "") {
    const status = getElement("status");

    if (!status) return;

    status.className = type ? `status ${type}` : "";
    status.innerHTML = message || "";
}

function getReadableError(error) {
    if (!error) {
        return "خطای نامشخص";
    }

    if (error.code === 4001) {
        return "تراکنش توسط کاربر لغو شد.";
    }

    if (
        error.message?.includes("User denied") ||
        error.message?.includes("user rejected")
    ) {
        return "تراکنش توسط کاربر لغو شد.";
    }

    if (error.message?.includes("OUT_OF_ENERGY")) {
        return "Energy کافی برای اجرای قرارداد وجود ندارد.";
    }

    return (
        error.message ||
        error.toString() ||
        "خطای نامشخص"
    );
}

async function init() {
    const urlParams = new URLSearchParams(
        window.location.search
    );

    projectId = urlParams.get("project");

    if (!projectId) {
        showMainError("آیدی پروژه مشخص نشده است.");
        return;
    }

    try {
        const response =
            await fetch("data/Projects.json");

        if (!response.ok) {
            throw new Error(
                "Projects.json قابل بارگذاری نیست."
            );
        }

        const data = await response.json();

        const feature =
            (data.features || []).find(
                feature =>
                    String(feature.attributes?.ProjectID) ===
                    String(projectId)
            );

        projectData =
            feature?.attributes || {};

        if (
            !projectData ||
            Object.keys(projectData).length === 0
        ) {
            showMainError("پروژه پیدا نشد.");
            return;
        }

        const projectName =
            getElement("projectName");

        const projectIdDisplay =
            getElement("projectIdDisplay");

        if (projectName) {
            projectName.textContent =
                projectData["نام پروژه"] ||
                projectData.نام_پروژه ||
                `پروژه ${projectId}`;
        }

        if (projectIdDisplay) {
            projectIdDisplay.textContent =
                projectId;
        }

        await loadTotalRaised();
        populateNetworkSelect();

        const loading =
            getElement("loading");

        const main =
            getElement("main");

        if (loading) {
            loading.style.display = "none";
        }

        if (main) {
            main.style.display = "block";
        }

    } catch (error) {
        console.error("Init error:", error);

        showMainError(
            "خطا در بارگذاری پروژه: " +
            getReadableError(error)
        );
    }
}

function showMainError(message) {
    const loading =
        getElement("loading");

    if (loading) {
        loading.innerHTML =
            `<p style="color:var(--danger);">${message}</p>`;
    }
}

async function loadTotalRaised() {
    try {
        if (!window.ClassChainRaisedReader) {
            return;
        }

        const result =
            await window.ClassChainRaisedReader
                .getProjectRaisedUSDT(projectData);

        const totalRaised =
            getElement("totalRaised");

        if (totalRaised) {
            totalRaised.textContent =
                Number(result.total || 0).toFixed(2) +
                " USDT";
        }

        const breakdownBox =
            getElement("breakdownBox");

        if (
            breakdownBox &&
            result.breakdown &&
            result.breakdown.length
        ) {
            const parts =
                result.breakdown
                    .filter(
                        item =>
                            Number(item.amount || 0) > 0
                    )
                    .map(
                        item =>
                            `${item.network}: ${Number(item.amount).toFixed(2)}`
                    );

            breakdownBox.textContent =
                parts.length
                    ? parts.join(" | ")
                    : "";
        }

    } catch (error) {
        console.warn(
            "خطا در خواندن مجموع:",
            error
        );
    }
}

function populateNetworkSelect() {
    const config =
        window.ClassChainNetworkConfig;

    if (!config) return;

    const select =
        getElement("networkSelect");

    if (!select) return;

    select.innerHTML =
        '<option value="">— ابتدا شبکه را انتخاب کنید —</option>';

    const networks =
        Object.values(config.NETWORKS || {});

    networks.forEach(network => {
        let hasAddress = false;

        (network.addressFields || [])
            .forEach(field => {
                if (
                    projectData[field] &&
                    String(projectData[field]).toLowerCase() !==
                        "null"
                ) {
                    hasAddress = true;
                }
            });

        if (projectData.funds) {
            (network.fundsKeys || [])
                .forEach(key => {
                    if (
                        projectData.funds[key]?.address
                    ) {
                        hasAddress = true;
                    }
                });
        }

        if (!hasAddress) return;

        const option =
            document.createElement("option");

        option.value = network.id;

        option.textContent =
            `${network.name}${
                network.status === "active"
                    ? ""
                    : " (در انتظار)"
            }`;

        option.disabled =
            network.status !== "active";

        select.appendChild(option);
    });

    select.addEventListener(
        "change",
        onNetworkChange
    );
}

function onNetworkChange() {
    selectedNetworkId =
        getElement("networkSelect")?.value || "";

    selectedNetCfg =
        window.ClassChainNetworkConfig?.getNetwork(
            selectedNetworkId
        ) || null;

    connection = null;
    fundAddress = null;
    multisigAddress = null;
    isOwner = false;
    tronMultisigOwners = [];
    tronRequiredConfirmations = 0;

    const fundDetails =
        getElement("fundDetails");

    const noAccessCard =
        getElement("noAccessCard");

    const connectedWalletInfo =
        getElement("connectedWalletInfo");

    if (fundDetails) {
        fundDetails.style.display = "none";
    }

    if (noAccessCard) {
        noAccessCard.style.display = "none";
    }

    if (connectedWalletInfo) {
        connectedWalletInfo.textContent = "";
    }

    setStatus("", "");

    if (!selectedNetCfg) {
        return;
    }

    const button =
        getElement("btnConnectNetwork");

    if (button) {
        button.style.display = "inline-block";

        button.textContent =
            `اتصال ${selectedNetCfg.walletName} (${selectedNetCfg.name})`;

        button.onclick =
            connectSelectedNetwork;
    }
}

async function connectSelectedNetwork() {
    if (!selectedNetCfg) return;

    try {
        setStatus(
            "در حال اتصال به کیف پول...",
            "warning"
        );

        if (window.ClassChainWalletManager) {
            const wm =
                new window.ClassChainWalletManager();

            connection =
                await wm.connect(selectedNetCfg);
        } else {
            if (selectedNetCfg.type === "TVM") {
                if (!window.tronWeb) {
                    throw new Error(
                        "TronLink نصب نیست."
                    );
                }

                try {
                    if (
                        typeof window.tronWeb.request ===
                        "function"
                    ) {
                        await window.tronWeb.request({
                            method:
                                "tron_requestAccounts"
                        });
                    }
                } catch (_) {}

                await new Promise(
                    resolve =>
                        setTimeout(resolve, 500)
                );

                const account =
                    window.tronWeb.defaultAddress?.base58;

                if (!account) {
                    throw new Error(
                        "حساب TronLink یافت نشد."
                    );
                }

                connection = {
                    type: "TVM",
                    account,
                    tronWeb: window.tronWeb,
                    network: selectedNetCfg
                };
            }
        }

        if (!connection) {
            throw new Error(
                "اتصال کیف پول برقرار نشد."
            );
        }

        if (
            selectedNetCfg.type === "TVM"
        ) {
            await verifyTronNileNetwork(
                connection.tronWeb
            );
        }

        const walletInfo =
            getElement("connectedWalletInfo");

        if (walletInfo) {
            walletInfo.textContent =
                `وصل شد: ${shortAddress(
                    connection.account,
                    8,
                    6
                )}`;
        }

        setStatus("", "");

        await loadFundDataForSelectedNetwork();

    } catch (error) {
        console.error(
            "Connection error:",
            error
        );

        setStatus(
            "خطا در اتصال: " +
            getReadableError(error),
            "error"
        );
    }
}

async function verifyTronNileNetwork(tronWeb) {
    if (!tronWeb) {
        throw new Error(
            "TronWeb در دسترس نیست."
        );
    }

    const expectedHost =
        "nile.trongrid.io";

    const hosts = [];

    try {
        if (tronWeb.fullNode?.host) {
            hosts.push(
                tronWeb.fullNode.host
            );
        }
    } catch (_) {}

    try {
        if (tronWeb.solidityNode?.host) {
            hosts.push(
                tronWeb.solidityNode.host
            );
        }
    } catch (_) {}

    const isNile =
        hosts.some(
            host =>
                String(host)
                    .toLowerCase()
                    .includes(expectedHost)
        );

    if (!isNile) {
        throw new Error(
            "TronLink روی Tron Nile نیست. شبکه Nile را انتخاب کنید."
        );
    }

    return true;
}

async function loadFundDataForSelectedNetwork() {
    if (
        !selectedNetCfg ||
        !connection
    ) {
        return;
    }

    fundAddress = null;
    multisigAddress = null;

    if (projectData.funds) {
        for (
            const key of
                selectedNetCfg.fundsKeys || []
        ) {
            const info =
                projectData.funds[key];

            if (info?.address) {
                fundAddress =
                    info.address;

                multisigAddress =
                    info.multisigAddress ||
                    null;

                break;
            }
        }
    }

    if (!fundAddress) {
        for (
            const field of
                selectedNetCfg.addressFields || []
        ) {
            if (
                projectData[field] &&
                String(projectData[field]).toLowerCase() !==
                    "null"
            ) {
                fundAddress =
                    projectData[field];

                break;
            }
        }
    }

    if (!fundAddress) {
        setStatus(
            "آدرس خزانه برای این شبکه پیدا نشد.",
            "error"
        );

        return;
    }

    if (
        selectedNetCfg.type === "TVM"
    ) {
        fundAddress =
            getTronBase58(fundAddress);
    }

    const fundAddressElement =
        getElement("fundAddress");

    const networkName =
        getElement("selectedNetworkName");

    if (fundAddressElement) {
        fundAddressElement.textContent =
            shortAddress(fundAddress);
    }

    if (networkName) {
        networkName.textContent =
            selectedNetCfg.name;
    }

    if (
        selectedNetCfg.type === "TVM" &&
        connection.type === "TVM"
    ) {
        await loadTronFundData();

        return;
    }

    if (
        selectedNetCfg.type === "EVM" &&
        connection.type === "EVM"
    ) {
        await loadEvmFundData();

        return;
    }
}

async function loadTronFundData() {
    if (
        !connection ||
        connection.type !== "TVM"
    ) {
        setStatus(
            "اتصال TronLink معتبر نیست.",
            "error"
        );

        return;
    }

    const tronWeb =
        connection.tronWeb;

    const userAddress =
        getTronBase58(
            connection.account
        );

    await verifyTronNileNetwork(
        tronWeb
    );

    fundAddress =
        getTronBase58(fundAddress);

    const usdt =
        getTronBase58(
            selectedNetCfg.usdtAddress
        );

    const decimals =
        selectedNetCfg.tokenDecimals || 6;

    try {
        const fundContract =
            await tronWeb.contract(
                tronFundABI,
                fundAddress
            );

        const actualOwner =
            getTronBase58(
                await fundContract
                    .owner()
                    .call()
            );

        const rawBalance =
            await fundContract
                .balanceOf(usdt)
                .call();

        const tokenAllowed =
            await fundContract
                .allowedTokens(usdt)
                .call();

        const balance =
            formatTokenAmount(
                rawBalance,
                decimals
            );

        const fundBalance =
            getElement("fundBalance");

        if (fundBalance) {
            fundBalance.textContent =
                Number(balance).toFixed(4) +
                " USDT";
        }

        /*
         * مهم:
         * owner() خزانه باید آدرس TronMultiSigWallet باشد.
         * بنابراین owner() را با account کاربر مقایسه نمی‌کنیم.
         */

        multisigAddress =
            getTronBase58(actualOwner);

        const ownerAddressElement =
            getElement("ownerAddress");

        if (ownerAddressElement) {
            ownerAddressElement.textContent =
                shortAddress(
                    multisigAddress
                );
        }

        const isSingleSig =
            sameAddress(
                actualOwner,
                userAddress
            );

        if (isSingleSig) {

            // -----------------------------
            // Single-Sig Fund
            // -----------------------------

            multisigAddress = null;

            tronMultisigOwners = [
                userAddress
            ];

            tronRequiredConfirmations = 1;

            isOwner = true;

        } else {

            // -----------------------------
            // Multi-Sig Fund
            // -----------------------------

            multisigAddress =
                getTronBase58(actualOwner);

            const multisigContract =
                await tronWeb.contract(
                    tronMultisigABI,
                    multisigAddress
                );

            tronMultisigOwners =
                await multisigContract
                    .getOwners()
                    .call();

            tronRequiredConfirmations =
                Number(
                    await multisigContract
                        .numConfirmationsRequired()
                        .call()
                );

            tronMultisigOwners =
                tronMultisigOwners.map(
                    address =>
                        getTronBase58(address)
                );

            isOwner =
                tronMultisigOwners.some(
                    owner =>
                        sameAddress(
                            owner,
                            userAddress
                        )
                );
        }


        /*
         * اینجا مالکیت واقعی بررسی می‌شود:
         * کاربر باید یکی از ownerهای Multisig باشد.
         */



        const requiredElement =
            getElement(
                "requiredConfirmations"
            );

        if (requiredElement) {
            requiredElement.textContent =
                String(
                    tronRequiredConfirmations
                );
        }

        const ownersList =
            getElement("ownersList");

        if (ownersList) {
            ownersList.innerHTML = "";

            tronMultisigOwners.forEach(
                (owner, index) => {
                    const item =
                        document.createElement(
                            "div"
                        );

                    item.className =
                        "info-item";

                    item.innerHTML = `
                        <div class="info-label">
                            Owner ${index + 1}
                        </div>

                        <div class="info-value">
                            ${shortAddress(owner)}
                        </div>

                        ${
                            sameAddress(
                                owner,
                                userAddress
                            )
                                ? `
                                    <small style="color:var(--success);">
                                        شما
                                    </small>
                                  `
                                : ""
                        }
                    `;

                    ownersList.appendChild(item);
                }
            );
        }

        const pendingTxs =
            getElement("pendingTxs");

        if (pendingTxs) {
            pendingTxs.innerHTML = `
                <p>
                    Multisig:
                    ${shortAddress(multisigAddress)}
                </p>

                <p>
                    تأییدهای لازم:
                    ${tronRequiredConfirmations}
                </p>

                <p>
                    USDT مجاز:
                    ${
                        tokenAllowed
                            ? "✅"
                            : "❌"
                    }
                </p>

                <p>
                    موجودی خزانه:
                    ${balance} USDT
                </p>
            `;
        }

        if (!isOwner) {
            const fundDetails =
                getElement("fundDetails");

            const noAccessCard =
                getElement("noAccessCard");

            if (fundDetails) {
                fundDetails.style.display =
                    "none";
            }

            if (noAccessCard) {
                noAccessCard.style.display =
                    "block";
            }

            setStatus(
                "کیف پول متصل‌شده یکی از Ownerهای Multisig نیست.",
                "error"
            );

            return;
        }

        const noAccessCard =
            getElement("noAccessCard");

        const fundDetails =
            getElement("fundDetails");

        if (noAccessCard) {
            noAccessCard.style.display =
                "none";
        }

        if (fundDetails) {
            fundDetails.style.display =
                "block";
        }

        if (!tokenAllowed) {
            setStatus(
                "USDT در خزانه مجاز نیست.",
                "error"
            );
        } else {
            setStatus("", "");
        }

        // فقط برای Multi-Sig تراکنش‌های Pending را بخوان
        if (multisigAddress) {

            const multisigContract =
                await tronWeb.contract(
                    tronMultisigABI,
                    multisigAddress
                );

            await loadTronPendingTransactions(
                multisigContract
            );
        }

    } catch (error) {
        console.error(
            "loadTronFundData error:",
            error
        );

        setStatus(
            "خطا در خواندن اطلاعات خزانه Tron: " +
            getReadableError(error),
            "error"
        );
    }
}

async function loadTronPendingTransactions(
    multisigContract
) {
    const pendingDiv =
        getElement("pendingTxs");

    if (!pendingDiv) return;

    try {
        const count =
            Number(
                await multisigContract
                    .getTransactionCount()
                    .call()
            );

        let html = "";

        for (
            let i = 0;
            i < count;
            i++
        ) {
            const tx =
                await multisigContract
                    .getTransaction(i)
                    .call();

            const executed =
                tx.executed;

            const confirmations =
                Number(
                    tx.numConfirmations
                );

            if (executed) {
                continue;
            }

            const confirmedByUser =
                await getTronConfirmationStatus(
                    multisigContract,
                    i,
                    connection.account
                );

            html += `
                <div class="pending-tx"
                     style="
                        margin-top:12px;
                        padding:12px;
                        border:1px solid rgba(255,255,255,.1);
                        border-radius:8px;
                     ">

                    <p>
                        <strong>
                            تراکنش #${i}
                        </strong>
                    </p>

                    <p>
                        مقصد:
                        ${shortAddress(
                            getTronBase58(tx.to)
                        )}
                    </p>

                    <p>
                        تأییدها:
                        ${confirmations}
                        /
                        ${tronRequiredConfirmations}
                    </p>

                    <p>
                        وضعیت شما:
                        ${
                            confirmedByUser
                                ? "✅ تأیید کرده‌اید"
                                : "⏳ نیاز به تأیید شما"
                        }
                    </p>

                    ${
                        !confirmedByUser
                            ? `
                                <button
                                    type="button"
                                    onclick="confirmTronTransaction(${i})">
                                    تأیید تراکنش #${i}
                                </button>
                              `
                            : ""
                    }
                </div>
            `;
        }

        if (!html) {
            html =
                "<p>هیچ تراکنش در انتظار تأییدی وجود ندارد.</p>";
        }

        pendingDiv.innerHTML =
            html;

    } catch (error) {
        console.warn(
            "Pending transaction error:",
            error
        );

        pendingDiv.innerHTML =
            `<p>
                خطا در خواندن تراکنش‌های Multisig:
                ${getReadableError(error)}
            </p>`;
    }
}

async function getTronConfirmationStatus(
    multisigContract,
    txIndex,
    ownerAddress
) {
    try {
        /*
         * isConfirmed(uint256,address)
         */
        const contractWithMappingABI =
            [
                ...tronMultisigABI,
                {
                    inputs: [
                        {
                            internalType:
                                "uint256",
                            name: "",
                            type: "uint256"
                        },
                        {
                            internalType:
                                "address",
                            name: "",
                            type: "address"
                        }
                    ],
                    name: "isConfirmed",
                    outputs: [
                        {
                            internalType:
                                "bool",
                            name: "",
                            type: "bool"
                        }
                    ],
                    stateMutability: "view",
                    type: "function"
                }
            ];

        const tronWeb =
            connection.tronWeb;

        const contract =
            await tronWeb.contract(
                contractWithMappingABI,
                multisigAddress
            );

        return Boolean(
            await contract
                .isConfirmed(
                    txIndex,
                    getTronBase58(ownerAddress)
                )
                .call()
        );

    } catch (error) {
        console.warn(
            "isConfirmed read error:",
            error
        );

        return false;
    }
}

async function confirmTronTransaction(
    txIndex
) {
    if (
        !connection ||
        connection.type !== "TVM" ||
        !multisigAddress
    ) {
        setStatus(
            "اتصال Multisig برقرار نیست.",
            "error"
        );

        return;
    }

    const tronWeb =
        connection.tronWeb;

    try {
        await verifyTronNileNetwork(
            tronWeb
        );

        const userAddress =
            getTronBase58(
                connection.account
            );

        const isMultisigOwner =
            tronMultisigOwners.some(
                owner =>
                    sameAddress(
                        owner,
                        userAddress
                    )
            );

        if (!isMultisigOwner) {
            throw new Error(
                "کیف پول شما Owner این Multisig نیست."
            );
        }

        const multisigContract =
            await tronWeb.contract(
                tronMultisigABI,
                multisigAddress
            );

        const alreadyConfirmed =
            await getTronConfirmationStatus(
                multisigContract,
                txIndex,
                userAddress
            );

        if (alreadyConfirmed) {
            setStatus(
                "این کیف پول قبلاً این تراکنش را تأیید کرده است.",
                "warning"
            );

            return;
        }

        setStatus(
            "در حال ارسال تأیید به TronLink...",
            "warning"
        );

        const result =
            await multisigContract
                .confirmTransaction(
                    txIndex
                )
                .send({
                    feeLimit: 150000000,
                    callValue: 0,
                    shouldPollResponse: true
                });

        const txId =
            typeof result === "string"
                ? result
                : (
                    result?.txid ||
                    result?.txID ||
                    result?.transaction?.txID ||
                    null
                );

        if (txId) {
            await waitForTronTransaction(
                tronWeb,
                txId,
                30,
                2000
            );
        }

        setStatus(
            "تأیید تراکنش با موفقیت انجام شد.",
            "success"
        );

        await new Promise(
            resolve =>
                setTimeout(resolve, 1500)
        );

        await loadTronFundData();

    } catch (error) {
        console.error(
            "confirmTronTransaction error:",
            error
        );

        setStatus(
            "خطا در تأیید تراکنش: " +
            getReadableError(error),
            "error"
        );
    }
}

async function submitWithdrawTron() {
    if (
        !connection ||
        connection.type !== "TVM"
    ) {
        setStatus(
            "ابتدا به Tron Nile متصل شوید.",
            "error"
        );

        return;
    }

    const tronWeb =
        connection.tronWeb;

    try {
        await verifyTronNileNetwork(
            tronWeb
        );

        const userAddress =
            getTronBase58(
                connection.account
            );

        const amountInput =
            getElement("withdrawAmount")
                ?.value
                .trim();

        const destinationInput =
            getElement("withdrawTo")
                ?.value
                .trim();

        if (
            !amountInput ||
            Number(amountInput) <= 0
        ) {
            throw new Error(
                "مبلغ برداشت معتبر نیست."
            );
        }

        if (!destinationInput) {
            throw new Error(
                "آدرس مقصد وارد نشده است."
            );
        }

        const destination =
            getTronBase58(
                destinationInput
            );

        if (
            !tronWeb.isAddress(
                destination
            )
        ) {
            throw new Error(
                "آدرس مقصد Tron معتبر نیست."
            );
        }

        const usdt =
            getTronBase58(
                selectedNetCfg.usdtAddress
            );

        const fund =
            getTronBase58(
                fundAddress
            );

        const decimals =
            selectedNetCfg.tokenDecimals || 6;

        const amount =
            parseTokenAmount(
                amountInput,
                decimals
            );

        /*
         * ==========================================
         * خواندن اطلاعات واقعی قرارداد خزانه
         * ==========================================
         */

        const fundContract =
            await tronWeb.contract(
                tronFundABI,
                fund
            );

        const actualOwner =
            getTronBase58(
                await fundContract
                    .owner()
                    .call()
            );

        /*
         * ==========================================
         * تشخیص Single-Sig یا Multi-Sig
         *
         * Single-Sig:
         * owner() == کیف پول متصل‌شده
         *
         * Multi-Sig:
         * owner() == آدرس قرارداد Multisig
         * ==========================================
         */

        const isSingleSig =
            sameAddress(
                actualOwner,
                userAddress
            );

        /*
         * ==========================================
         * بررسی مالکیت
         * ==========================================
         */

        if (isSingleSig) {

            /*
             * Single-Sig:
             * مالک قرارداد همان کیف پول متصل است.
             * بنابراین نیازی به Multisig نیست.
             */

            isOwner = true;

        } else {

            /*
             * Multi-Sig:
             * کاربر باید یکی از Ownerهای Multisig باشد.
             */

            const isMultisigOwner =
                tronMultisigOwners.some(
                    owner =>
                        sameAddress(
                            owner,
                            userAddress
                        )
                );

            if (!isMultisigOwner) {
                throw new Error(
                    "کیف پول شما Owner این Multisig نیست."
                );
            }

            /*
             * owner خزانه باید همان Multisig
             * ثبت‌شده باشد.
             */

            if (
                !multisigAddress ||
                !sameAddress(
                    actualOwner,
                    multisigAddress
                )
            ) {
                throw new Error(
                    `مالک قرارداد خزانه با Multisig ثبت‌شده مطابقت ندارد.
Owner خزانه: ${actualOwner}
Multisig: ${multisigAddress}`
                );
            }

            isOwner = true;
        }

        /*
         * ==========================================
         * بررسی مجاز بودن USDT
         * ==========================================
         */


        /*
         * ==========================================
         * بررسی موجودی خزانه
         * ==========================================
         */

        const rawBalance =
            await fundContract
                .balanceOf(usdt)
                .call();

        const balance =
            BigInt(
                String(rawBalance)
            );

        if (balance < amount) {
            throw new Error(
                `موجودی خزانه کافی نیست.
موجودی: ${formatTokenAmount(
                    balance,
                    decimals
                )} USDT
درخواست: ${amountInput} USDT`
            );
        }

        /*
         * ==========================================
         * SINGLE-SIG
         *
         * در این حالت مستقیماً withdrawToken()
         * روی قرارداد خزانه اجرا می‌شود.
         *
         * هیچ submitTransaction یا
         * confirmTransaction وجود ندارد.
         * ==========================================
         */

        if (isSingleSig) {

            setStatus(
                "در حال ارسال درخواست برداشت به TronLink...",
                "warning"
            );

            const result =
                await fundContract
                    .withdrawToken(
                        usdt,
                        destination,
                        amount.toString()
                    )
                    .send({
                        feeLimit: 150000000,
                        callValue: 0,
                        shouldPollResponse: true
                    });

            const txId =
                typeof result === "string"
                    ? result
                    : (
                        result?.txid ||
                        result?.txID ||
                        result?.transaction?.txID ||
                        null
                    );

            if (txId) {
                await waitForTronTransaction(
                    tronWeb,
                    txId,
                    30,
                    2000
                );
            }

            setStatus(
                "برداشت با موفقیت انجام شد.",
                "success"
            );

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        1500
                    )
            );

            await loadTronFundData();
            await loadTotalRaised();

            return;
        }

        /*
         * ==========================================
         * MULTI-SIG
         *
         * در این حالت withdrawToken مستقیماً
         * اجرا نمی‌شود.
         *
         * ابتدا calldata ساخته شده و به
         * TronMultiSigWallet ارسال می‌شود.
         * ==========================================
         */

        const withdrawFunctionABI = {
            name: "withdrawToken",
            type: "function",
            inputs: [
                {
                    type: "address",
                    name: "token"
                },
                {
                    type: "address",
                    name: "to"
                },
                {
                    type: "uint256",
                    name: "amount"
                }
            ]
        };

        let parameterData;

        /*
         * TronWeb ABI encoding
         */

        /*
         * ==========================================
         * Encode withdrawToken(address,address,uint256)
         * برای ارسال به TronMultiSigWallet
         * ==========================================
         *
         * Function selector:
         * withdrawToken(address,address,uint256)
         * = 0x01e33667
         */

        const functionSelector =
            "01e33667";

        const encodedParams =
            tronWeb.utils.abi.encodeParams(
                [
                    "address",
                    "address",
                    "uint256"
                ],
                [
                    getTronHex(usdt),
                    getTronHex(destination),
                    amount.toString()
                ]
            );

        parameterData =
            "0x" +
            functionSelector +
            encodedParams.replace(
                /^0x/,
                ""
            );

        /*
         * ==========================================
         * ساخت قرارداد Multisig
         * ==========================================
         */

        const multisigContract =
            await tronWeb.contract(
                tronMultisigABI,
                multisigAddress
            );

        setStatus(
            "در حال ثبت درخواست برداشت در Multisig...",
            "warning"
        );

        /*
         * ==========================================
         * ثبت Transaction در Multisig
         * ==========================================
         */

        const result =
            await multisigContract
                .submitTransaction(
                    fund,
                    0,
                    parameterData
                )
                .send({
                    feeLimit: 150000000,
                    callValue: 0,
                    shouldPollResponse: true
                });

        const txId =
            typeof result === "string"
                ? result
                : (
                    result?.txid ||
                    result?.txID ||
                    result?.transaction?.txID ||
                    null
                );

        if (txId) {
            await waitForTronTransaction(
                tronWeb,
                txId,
                30,
                2000
            );
        }

        setStatus(
            `درخواست برداشت ثبت شد.
            <br>
            اکنون Owner دوم باید آن را تأیید کند.`,
            "success"
        );

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    1500
                )
        );

        await loadTronFundData();
        await loadTotalRaised();

    } catch (error) {

        console.error(
            "Tron withdrawal error:",
            error
        );

        setStatus(
            "خطا در ثبت برداشت: " +
            getReadableError(error),
            "error"
        );
    }
}

async function waitForTronTransaction(
    tronWeb,
    txId,
    maxAttempts = 30,
    delayMs = 2000
) {
    for (
        let attempt = 0;
        attempt < maxAttempts;
        attempt++
    ) {
        try {
            const info =
                await tronWeb.trx
                    .getTransactionInfo(
                        txId
                    );

            if (
                info &&
                info.receipt
            ) {
                const result =
                    info.receipt.result;

                if (result === "SUCCESS") {
                    return info;
                }

                if (
                    result &&
                    result !== "SUCCESS"
                ) {
                    throw new Error(
                        `تراکنش شکست خورد: ${
                            info.resMessage ||
                            result
                        }`
                    );
                }
            }
        } catch (error) {
            if (
                error.message?.includes(
                    "تراکنش شکست خورد"
                )
            ) {
                throw error;
            }
        }

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    delayMs
                )
        );
    }

    throw new Error(
        "تراکنش در بازه زمانی تعیین‌شده تأیید نشد."
    );
}

async function loadEvmFundData() {
    if (
        !connection ||
        connection.type !== "EVM" ||
        !connection.web3
    ) {
        setStatus(
            "اتصال MetaMask معتبر نیست.",
            "error"
        );
        return;
    }

    const web3 = connection.web3;
    const userAddress = connection.account;
    const decimals =
        selectedNetCfg.tokenDecimals || 6;

    try {

        // ======================================
        // 1. بررسی شبکه
        // ======================================

        const currentChainId =
            Number(
                await web3.eth.getChainId()
            );

        const expectedChainId =
            Number(
                selectedNetCfg.chainId
            );

        if (
            currentChainId !==
            expectedChainId
        ) {
            throw new Error(
                `شبکه MetaMask صحیح نیست.
Chain ID فعلی: ${currentChainId}
مورد انتظار: ${expectedChainId}`
            );
        }

        // ======================================
        // 2. قرارداد خزانه
        // ======================================

        const fundContract =
            new web3.eth.Contract(
                fundABI,
                fundAddress
            );

        // ======================================
        // 3. Owner واقعی Fund
        // ======================================

        const actualOwner =
            await fundContract.methods
                .owner()
                .call();

        // ======================================
        // 4. موجودی USDT
        // ======================================

        const rawBalance =
            await fundContract.methods
                .balanceOf(
                    selectedNetCfg.usdtAddress
                )
                .call();

        const balance =
            formatTokenAmount(
                rawBalance,
                decimals
            );

        // ======================================
        // 5. نمایش موجودی
        // ======================================

        const fundBalance =
            getElement("fundBalance");

        if (fundBalance) {
            fundBalance.textContent =
                Number(balance).toFixed(4) +
                " USDT";
        }

        // ======================================
        // 6. نمایش Owner
        // ======================================

        const ownerAddressElement =
            getElement("ownerAddress");

        if (ownerAddressElement) {
            ownerAddressElement.textContent =
                shortAddress(actualOwner);
        }

        // ======================================
        // 7. تشخیص Single-Sig
        // ======================================

        const isSingleSig =
            sameAddress(
                actualOwner,
                userAddress
            );

        // ======================================
        // 8. Single-Sig
        // ======================================

        if (isSingleSig) {

            isOwner = true;

            multisigAddress = null;

            tronMultisigOwners = [
                userAddress
            ];

            tronRequiredConfirmations = 1;

            // ------------------------------
            // Required confirmations
            // ------------------------------

            const requiredElement =
                getElement(
                    "requiredConfirmations"
                );

            if (requiredElement) {
                requiredElement.textContent =
                    "1";
            }

            // ------------------------------
            // Owners
            // ------------------------------

            const ownersList =
                getElement("ownersList");

            if (ownersList) {
                ownersList.innerHTML = `
                    <div class="info-item">

                        <div class="info-label">
                            Owner
                        </div>

                        <div class="info-value">
                            ${shortAddress(userAddress)}
                        </div>

                        <small style="color:var(--success);">
                            شما
                        </small>

                    </div>
                `;
            }

            // ------------------------------
            // Pending area
            // ------------------------------

            const pendingTxs =
                getElement("pendingTxs");

            if (pendingTxs) {
                pendingTxs.innerHTML = `
                    <p>
                        نوع خزانه:
                        Single-Sig
                    </p>

                    <p>
                        Owner:
                        ${shortAddress(actualOwner)}
                    </p>

                    <p>
                        موجودی خزانه:
                        ${balance} USDT
                    </p>
                `;
            }

            // ------------------------------
            // نمایش پنل
            // ------------------------------

            const noAccessCard =
                getElement("noAccessCard");

            const fundDetails =
                getElement("fundDetails");

            if (noAccessCard) {
                noAccessCard.style.display =
                    "none";
            }

            if (fundDetails) {
                fundDetails.style.display =
                    "block";
            }

            setStatus("", "");

            // ------------------------------
            // اتصال دکمه برداشت
            // ------------------------------

            const withdrawButton =
                getElement("btnWithdraw");

            if (withdrawButton) {
                withdrawButton.onclick =
                    submitWithdrawEvm;
            }

            return;
        }

        // ======================================
        // 9. Multi-Sig ABI
        // ======================================

        /*
         * این ABI علاوه بر اطلاعات مالکیت،
         * توابع لازم برای خواندن تراکنش‌های
         * Pending را نیز دارد.
         */

        const multisigAbi = [
            {
                "inputs": [],
                "name": "getOwners",
                "outputs": [
                    {
                        "internalType":
                            "address[]",
                        "name": "",
                        "type": "address[]"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },

            {
                "inputs": [],
                "name":
                    "numConfirmationsRequired",
                "outputs": [
                    {
                        "internalType":
                            "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },

            {
                "inputs": [
                    {
                        "internalType":
                            "address",
                        "name": "",
                        "type": "address"
                    }
                ],
                "name": "isOwner",
                "outputs": [
                    {
                        "internalType":
                            "bool",
                        "name": "",
                        "type": "bool"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },

            {
                "inputs": [],
                "name":
                    "getTransactionCount",
                "outputs": [
                    {
                        "internalType":
                            "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },

            {
                "inputs": [
                    {
                        "internalType":
                            "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "name":
                    "getTransaction",
                "outputs": [
                    {
                        "internalType":
                            "address",
                        "name": "to",
                        "type": "address"
                    },
                    {
                        "internalType":
                            "uint256",
                        "name": "value",
                        "type": "uint256"
                    },
                    {
                        "internalType":
                            "bytes",
                        "name": "data",
                        "type": "bytes"
                    },
                    {
                        "internalType":
                            "bool",
                        "name": "executed",
                        "type": "bool"
                    },
                    {
                        "internalType":
                            "uint256",
                        "name":
                            "numConfirmations",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },

            {
                "inputs": [
                    {
                        "internalType":
                            "uint256",
                        "name": "",
                        "type": "uint256"
                    },
                    {
                        "internalType":
                            "address",
                        "name": "",
                        "type": "address"
                    }
                ],
                "name": "isConfirmed",
                "outputs": [
                    {
                        "internalType":
                            "bool",
                        "name": "",
                        "type": "bool"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            }
        ];

        // ======================================
        // 10. ساخت قرارداد Multi-Sig
        // ======================================

        const multisigContract =
            new web3.eth.Contract(
                multisigAbi,
                actualOwner
            );

        // ======================================
        // 11. خواندن Owners
        // ======================================

        let owners;

        try {

            owners =
                await multisigContract.methods
                    .getOwners()
                    .call();

        } catch (error) {

            console.warn(
                "Owner خزانه Multisig نیست:",
                error
            );

            isOwner = false;
            multisigAddress = null;

            const fundDetails =
                getElement("fundDetails");

            const noAccessCard =
                getElement("noAccessCard");

            if (fundDetails) {
                fundDetails.style.display =
                    "none";
            }

            if (noAccessCard) {
                noAccessCard.style.display =
                    "block";
            }

            setStatus(
                "شما صاحب این خزانه در شبکه انتخاب‌شده نیستید.",
                "error"
            );

            return;
        }

        // ======================================
        // 12. حد نصاب
        // ======================================

        const requiredConfirmations =
            Number(
                await multisigContract.methods
                    .numConfirmationsRequired()
                    .call()
            );

        // ======================================
        // 13. آیا کاربر Owner است؟
        // ======================================

        const userIsMultisigOwner =
            owners.some(
                owner =>
                    sameAddress(
                        owner,
                        userAddress
                    )
            );

        if (!userIsMultisigOwner) {

            isOwner = false;

            multisigAddress =
                actualOwner;

            const fundDetails =
                getElement("fundDetails");

            const noAccessCard =
                getElement("noAccessCard");

            if (fundDetails) {
                fundDetails.style.display =
                    "none";
            }

            if (noAccessCard) {
                noAccessCard.style.display =
                    "block";
            }

            setStatus(
                "شما صاحب این خزانه در شبکه انتخاب‌شده نیستید.",
                "error"
            );

            return;
        }

        // ======================================
        // 14. Multi-Sig تأیید شد
        // ======================================

        isOwner = true;

        multisigAddress =
            actualOwner;

        /*
         * توجه:
         * اسم این متغیرها در پروژه فعلی
         * برای TRON انتخاب شده،
         * اما در EVM نیز برای نگهداری
         * Owners و Required استفاده می‌کنیم.
         */

        tronMultisigOwners =
            owners;

        tronRequiredConfirmations =
            requiredConfirmations;

        // ======================================
        // 15. نمایش Required
        // ======================================

        const requiredElement =
            getElement(
                "requiredConfirmations"
            );

        if (requiredElement) {
            requiredElement.textContent =
                requiredConfirmations;
        }

        // ======================================
        // 16. نمایش Owners
        // ======================================

        const ownersList =
            getElement("ownersList");

        if (ownersList) {

            ownersList.innerHTML =
                owners
                    .map(
                        owner => `
                            <div class="info-item">

                                <div class="info-label">
                                    Owner
                                </div>

                                <div class="info-value">
                                    ${shortAddress(owner)}
                                </div>

                                ${
                                    sameAddress(
                                        owner,
                                        userAddress
                                    )
                                    ? `
                                        <small style="color:var(--success);">
                                            شما
                                        </small>
                                      `
                                    : ""
                                }

                            </div>
                        `
                    )
                    .join("");
        }

        // ======================================
        // 17. تعداد تراکنش‌ها
        // ======================================

        const txCount =
            Number(
                await multisigContract.methods
                    .getTransactionCount()
                    .call()
            );

        console.log(
            "EVM Multisig transaction count:",
            txCount
        );

        // ======================================
        // 18. نمایش پنل
        // ======================================

        const noAccessCard =
            getElement("noAccessCard");

        const fundDetails =
            getElement("fundDetails");

        if (noAccessCard) {
            noAccessCard.style.display =
                "none";
        }

        if (fundDetails) {
            fundDetails.style.display =
                "block";
        }

        setStatus("", "");

        // ======================================
        // 19. اتصال دکمه برداشت
        // ======================================

        const withdrawButton =
            getElement("btnWithdraw");

        if (withdrawButton) {
            withdrawButton.onclick =
                submitWithdrawEvm;
        }

        // ======================================
        // 20. خواندن Pending Transactions
        // ======================================

        /*
         * این بخش تفاوت اصلی با نسخه قبلی است.
         *
         * حالا Owner دوم که وارد می‌شود:
         *
         * getTransactionCount()
         *       ↓
         * getTransaction(i)
         *       ↓
         * isConfirmed(i, user)
         *       ↓
         * نمایش دکمه Confirm
         */

        await loadEvmPendingTransactions(
            multisigContract
        );

    } catch (error) {

        console.error(
            "loadEvmFundData error:",
            error
        );

        setStatus(
            "خطا در خواندن اطلاعات خزانه Polygon: " +
            getReadableError(error),
            "error"
        );
    }
}

async function submitWithdrawEvm() {

    if (
        !connection ||
        connection.type !== "EVM" ||
        !connection.web3
    ) {
        setStatus(
            "ابتدا به Polygon Amoy متصل شوید.",
            "error"
        );
        return;
    }

    const web3 =
        connection.web3;

    const userAddress =
        connection.account;

    try {

        // ======================================
        // 1. بررسی شبکه
        // ======================================

        const currentChainId =
            Number(
                await web3.eth.getChainId()
            );

        const expectedChainId =
            Number(
                selectedNetCfg.chainId
            );

        if (
            currentChainId !==
            expectedChainId
        ) {
            throw new Error(
                `شبکه MetaMask صحیح نیست.
Chain ID فعلی: ${currentChainId}
مورد انتظار: ${expectedChainId}`
            );
        }

        // ======================================
        // 2. ورودی‌ها
        // ======================================

        const amountInput =
            getElement("withdrawAmount")
                ?.value
                .trim();

        const destinationInput =
            getElement("withdrawTo")
                ?.value
                .trim();

        if (
            !amountInput ||
            Number(amountInput) <= 0
        ) {
            throw new Error(
                "مبلغ برداشت معتبر نیست."
            );
        }

        if (!destinationInput) {
            throw new Error(
                "آدرس مقصد وارد نشده است."
            );
        }

        // ======================================
        // 3. آدرس مقصد
        // ======================================

        if (
            !web3.utils.isAddress(
                destinationInput
            )
        ) {
            throw new Error(
                "آدرس مقصد Polygon معتبر نیست."
            );
        }

        const destination =
            web3.utils.toChecksumAddress(
                destinationInput
            );

        const fund =
            web3.utils.toChecksumAddress(
                fundAddress
            );

        const usdt =
            web3.utils.toChecksumAddress(
                selectedNetCfg.usdtAddress
            );

        // ======================================
        // 4. مقدار
        // ======================================

        const decimals =
            selectedNetCfg.tokenDecimals || 6;

        const amount =
            parseTokenAmount(
                amountInput,
                decimals
            );

        // ======================================
        // 5. Fund Contract
        // ======================================

        const fundContract =
            new web3.eth.Contract(
                fundABI,
                fund
            );

        // ======================================
        // 6. Owner
        // ======================================

        const actualOwner =
            await fundContract.methods
                .owner()
                .call();

        const isSingleSig =
            sameAddress(
                actualOwner,
                userAddress
            );

        // ======================================
        // 7. موجودی
        // ======================================

        const rawBalance =
            await fundContract.methods
                .balanceOf(usdt)
                .call();

        const balance =
            BigInt(
                String(rawBalance)
            );

        if (balance < amount) {

            throw new Error(
                `موجودی خزانه کافی نیست.
موجودی: ${formatTokenAmount(
                    balance,
                    decimals
                )} USDT
درخواست: ${amountInput} USDT`
            );
        }

        // ======================================
        // 8. Multi-Sig
        // ======================================

        if (!isSingleSig) {

            if (
                !multisigAddress ||
                !sameAddress(
                    actualOwner,
                    multisigAddress
                )
            ) {
                throw new Error(
                    `مالک قرارداد خزانه با Multisig ثبت‌شده مطابقت ندارد.
Owner خزانه: ${actualOwner}
Multisig: ${multisigAddress}`
                );
            }

            const isMultisigOwner =
                tronMultisigOwners.some(
                    owner =>
                        sameAddress(
                            owner,
                            userAddress
                        )
                );

            if (!isMultisigOwner) {
                throw new Error(
                    "کیف پول متصل‌شده Owner این Multisig نیست."
                );
            }

            await submitWithdrawEvmMultiSig(
                usdt,
                destination,
                amount
            );

            return;
        }

        // ======================================
        // 9. Single-Sig
        // ======================================

        setStatus(
            "در حال ارسال درخواست برداشت به MetaMask...",
            "warning"
        );

        const gasPrice =
            await web3.eth.getGasPrice();

        const gasEstimate =
            await fundContract.methods
                .withdrawToken(
                    usdt,
                    destination,
                    amount.toString()
                )
                .estimateGas({
                    from: userAddress
                });

        const gasLimit =
            Math.ceil(
                Number(gasEstimate) * 1.2
            );

        console.log(
            "EVM Single-Sig withdrawal:",
            {
                fund,
                usdt,
                destination,
                amount:
                    amount.toString(),
                gasEstimate,
                gasLimit,
                gasPrice
            }
        );

        const tx =
            await fundContract.methods
                .withdrawToken(
                    usdt,
                    destination,
                    amount.toString()
                )
                .send({
                    from: userAddress,
                    gas: gasLimit,
                    gasPrice
                });

        const txHash =
            tx?.transactionHash ||
            null;

        setStatus(
            `برداشت با موفقیت انجام شد.${
                txHash
                    ? `<br>TX: ${txHash}`
                    : ""
            }`,
            "success"
        );

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    1500
                )
        );

        await loadEvmFundData();

        await loadTotalRaised();

    } catch (error) {

        console.error(
            "EVM withdrawal error:",
            error
        );

        setStatus(
            "خطا در ثبت برداشت: " +
            getReadableError(error),
            "error"
        );
    }
}

async function submitWithdrawEvmMultiSig(
    usdt,
    destination,
    amount
) {

    if (
        !connection ||
        connection.type !== "EVM" ||
        !connection.web3
    ) {
        throw new Error(
            "ابتدا به Polygon Amoy متصل شوید."
        );
    }

    if (!multisigAddress) {
        throw new Error(
            "آدرس Multisig مشخص نیست."
        );
    }

    const web3 =
        connection.web3;

    const userAddress =
        connection.account;

    try {

        // ======================================
        // 1. Multisig Contract
        // ======================================

        const multisigABI = [
            {
                "inputs": [
                    {
                        "internalType":
                            "address",
                        "name": "_to",
                        "type": "address"
                    },
                    {
                        "internalType":
                            "uint256",
                        "name": "_value",
                        "type": "uint256"
                    },
                    {
                        "internalType":
                            "bytes",
                        "name": "_data",
                        "type": "bytes"
                    }
                ],
                "name":
                    "submitTransaction",
                "outputs": [],
                "stateMutability":
                    "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType":
                            "address",
                        "name": "",
                        "type": "address"
                    }
                ],
                "name": "isOwner",
                "outputs": [
                    {
                        "internalType":
                            "bool",
                        "name": "",
                        "type": "bool"
                    }
                ],
                "stateMutability":
                    "view",
                "type": "function"
            }
        ];

        const multisigContract =
            new web3.eth.Contract(
                multisigABI,
                multisigAddress
            );

        // ======================================
        // 2. Owner Check
        // ======================================

        const isMultisigOwner =
            await multisigContract.methods
                .isOwner(userAddress)
                .call();

        if (!isMultisigOwner) {
            throw new Error(
                "کیف پول متصل‌شده Owner این Multisig نیست."
            );
        }

        // ======================================
        // 3. ABI برای Encode
        // ======================================

        const fundABIForEncoding = [
            {
                "inputs": [
                    {
                        "internalType":
                            "address",
                        "name": "token",
                        "type": "address"
                    },
                    {
                        "internalType":
                            "address",
                        "name": "to",
                        "type": "address"
                    },
                    {
                        "internalType":
                            "uint256",
                        "name": "amount",
                        "type": "uint256"
                    }
                ],
                "name":
                    "withdrawToken",
                "outputs": [],
                "stateMutability":
                    "nonpayable",
                "type": "function"
            }
        ];

        const fundEncoder =
            new web3.eth.Contract(
                fundABIForEncoding
            );

        // ======================================
        // 4. ساخت calldata
        // ======================================

        const parameterData =
            fundEncoder.methods
                .withdrawToken(
                    usdt,
                    destination,
                    amount.toString()
                )
                .encodeABI();

        console.log(
            "EVM MultiSig submit:",
            {
                multisig:
                    multisigAddress,

                fund:
                    fundAddress,

                usdt,

                destination,

                amount:
                    amount.toString(),

                data:
                    parameterData
            }
        );

        // ======================================
        // 5. Estimate Gas
        // ======================================

        const gasEstimate =
            await multisigContract.methods
                .submitTransaction(
                    fundAddress,
                    "0",
                    parameterData
                )
                .estimateGas({
                    from:
                        userAddress
                });

        const gasLimit =
            Math.ceil(
                Number(gasEstimate) * 1.2
            );

        const gasPrice =
            await web3.eth.getGasPrice();

        // ======================================
        // 6. Submit
        // ======================================

        setStatus(
            "در حال ثبت درخواست برداشت در Multisig...",
            "warning"
        );

        const result =
            await multisigContract.methods
                .submitTransaction(
                    fundAddress,
                    "0",
                    parameterData
                )
                .send({
                    from:
                        userAddress,

                    gas:
                        gasLimit,

                    gasPrice:
                        gasPrice
                });

        const txHash =
            result?.transactionHash ||
            null;

        console.log(
            "EVM MultiSig submit TX:",
            txHash
        );

        // ======================================
        // 7. موفقیت
        // ======================================

        setStatus(
            `درخواست برداشت با موفقیت ثبت شد.${
                txHash
                    ? `<br>TX: ${txHash}`
                    : ""
            }`,
            "success"
        );

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    1500
                )
        );

        await loadEvmFundData();

        await loadTotalRaised();

    } catch (error) {

        console.error(
            "submitWithdrawEvmMultiSig error:",
            error
        );

        throw error;
    }
}

async function loadEvmPendingTransactions(
    multisigContract
) {
    const pendingDiv =
        getElement("pendingTxs");

    if (!pendingDiv) {
        return;
    }

    try {

        const count =
            Number(
                await multisigContract.methods
                    .getTransactionCount()
                    .call()
            );

        let html = "";

        for (
            let i = 0;
            i < count;
            i++
        ) {

            const tx =
                await multisigContract.methods
                    .getTransaction(i)
                    .call();

            const executed =
                Boolean(tx.executed);

            const confirmations =
                Number(
                    tx.numConfirmations
                );

            // تراکنش اجراشده را نمایش نده
            if (executed) {
                continue;
            }

            const confirmedByUser =
                await getEvmConfirmationStatus(
                    multisigContract,
                    i,
                    connection.account
                );

            html += `
                <div
                    class="pending-tx"
                    style="
                        margin-top:12px;
                        padding:12px;
                        border:1px solid rgba(255,255,255,.1);
                        border-radius:8px;
                    "
                >

                    <p>
                        <strong>
                            تراکنش #${i}
                        </strong>
                    </p>

                    <p>
                        مقصد:
                        ${shortAddress(tx.to)}
                    </p>

                    <p>
                        تأییدها:
                        ${confirmations}
                        /
                        ${tronRequiredConfirmations}
                    </p>

                    <p>
                        وضعیت شما:
                        ${
                            confirmedByUser
                                ? "✅ تأیید کرده‌اید"
                                : "⏳ نیاز به تأیید شما"
                        }
                    </p>

                    ${
                        !confirmedByUser
                            ? `
                                <button
                                    type="button"
                                    onclick="confirmEvmTransaction(${i})"
                                >
                                    تأیید تراکنش #${i}
                                </button>
                              `
                            : ""
                    }

                </div>
            `;
        }

        if (!html) {

            html =
                "<p>هیچ تراکنش در انتظار تأییدی وجود ندارد.</p>";
        }

        pendingDiv.innerHTML =
            html;

    } catch (error) {

        console.warn(
            "EVM pending transaction error:",
            error
        );

        pendingDiv.innerHTML =
            `<p>
                خطا در خواندن تراکنش‌های Multisig:
                ${getReadableError(error)}
            </p>`;
    }
}

async function getEvmConfirmationStatus(
    multisigContract,
    txIndex,
    ownerAddress
) {
    try {

        /*
         * isConfirmed(uint256,address)
         *
         * این تابع در قرارداد MultiSigWallet
         * به صورت public mapping وجود دارد.
         */

        const contractWithMappingABI = [
            {
                inputs: [
                    {
                        internalType:
                            "uint256",
                        name: "",
                        type: "uint256"
                    },
                    {
                        internalType:
                            "address",
                        name: "",
                        type: "address"
                    }
                ],
                name: "isConfirmed",
                outputs: [
                    {
                        internalType:
                            "bool",
                        name: "",
                        type: "bool"
                    }
                ],
                stateMutability:
                    "view",
                type: "function"
            }
        ];

        const web3 =
            connection.web3;

        const contract =
            new web3.eth.Contract(
                contractWithMappingABI,
                multisigAddress
            );

        return Boolean(
            await contract.methods
                .isConfirmed(
                    txIndex,
                    ownerAddress
                )
                .call()
        );

    } catch (error) {

        console.warn(
            "EVM isConfirmed read error:",
            error
        );

        return false;
    }
}

async function confirmEvmTransaction(
    txIndex
) {

    if (
        !connection ||
        connection.type !== "EVM" ||
        !connection.web3 ||
        !multisigAddress
    ) {

        setStatus(
            "اتصال Multisig برقرار نیست.",
            "error"
        );

        return;
    }

    const web3 =
        connection.web3;

    const userAddress =
        connection.account;

    try {

        // ======================================
        // 1. بررسی شبکه
        // ======================================

        const currentChainId =
            Number(
                await web3.eth.getChainId()
            );

        const expectedChainId =
            Number(
                selectedNetCfg.chainId
            );

        if (
            currentChainId !==
            expectedChainId
        ) {

            throw new Error(
                `شبکه MetaMask صحیح نیست.
Chain ID فعلی: ${currentChainId}
مورد انتظار: ${expectedChainId}`
            );
        }

        // ======================================
        // 2. ABI
        // ======================================

        const multisigABI = [
            {
                inputs: [
                    {
                        internalType:
                            "uint256",
                        name: "_txIndex",
                        type: "uint256"
                    }
                ],
                name:
                    "confirmTransaction",
                outputs: [],
                stateMutability:
                    "nonpayable",
                type: "function"
            },
            {
                inputs: [
                    {
                        internalType:
                            "address",
                        name: "",
                        type: "address"
                    }
                ],
                name:
                    "isOwner",
                outputs: [
                    {
                        internalType:
                            "bool",
                        name: "",
                        type: "bool"
                    }
                ],
                stateMutability:
                    "view",
                type: "function"
            },
            {
                inputs: [
                    {
                        internalType:
                            "uint256",
                        name: "",
                        type: "uint256"
                    },
                    {
                        internalType:
                            "address",
                        name: "",
                        type: "address"
                    }
                ],
                name:
                    "isConfirmed",
                outputs: [
                    {
                        internalType:
                            "bool",
                        name: "",
                        type: "bool"
                    }
                ],
                stateMutability:
                    "view",
                type: "function"
            },
            {
                inputs: [],
                name:
                    "numConfirmationsRequired",
                outputs: [
                    {
                        internalType:
                            "uint256",
                        name: "",
                        type: "uint256"
                    }
                ],
                stateMutability:
                    "view",
                type: "function"
            }
        ];

        const multisigContract =
            new web3.eth.Contract(
                multisigABI,
                multisigAddress
            );

        // ======================================
        // 3. بررسی Owner
        // ======================================

        const isMultisigOwner =
            await multisigContract.methods
                .isOwner(userAddress)
                .call();

        if (!isMultisigOwner) {

            throw new Error(
                "کیف پول شما Owner این Multisig نیست."
            );
        }

        // ======================================
        // 4. بررسی اینکه قبلاً تأیید نکرده
        // ======================================

        const alreadyConfirmed =
            await getEvmConfirmationStatus(
                multisigContract,
                txIndex,
                userAddress
            );

        if (alreadyConfirmed) {

            setStatus(
                "این کیف پول قبلاً این تراکنش را تأیید کرده است.",
                "warning"
            );

            return;
        }

        // ======================================
        // 5. Estimate Gas
        // ======================================

        const gasEstimate =
            await multisigContract.methods
                .confirmTransaction(
                    txIndex
                )
                .estimateGas({
                    from:
                        userAddress
                });

        const gasLimit =
            Math.ceil(
                Number(gasEstimate) * 1.2
            );

        const gasPrice =
            await web3.eth.getGasPrice();

        // ======================================
        // 6. ارسال Confirmation
        // ======================================

        setStatus(
            "در حال ارسال تأیید به MetaMask...",
            "warning"
        );

        const result =
            await multisigContract.methods
                .confirmTransaction(
                    txIndex
                )
                .send({
                    from:
                        userAddress,
                    gas:
                        gasLimit,
                    gasPrice:
                        gasPrice
                });

        const txHash =
            result?.transactionHash ||
            null;

        console.log(
            "EVM confirmation TX:",
            txHash
        );

        // ======================================
        // 7. موفقیت
        // ======================================

        setStatus(
            `تأیید تراکنش با موفقیت انجام شد.${
                txHash
                    ? `<br>TX: ${txHash}`
                    : ""
            }`,
            "success"
        );

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    2000
                )
        );

        // ======================================
        // 8. Refresh
        // ======================================

        await loadEvmFundData();

        await loadTotalRaised();

    } catch (error) {

        console.error(
            "confirmEvmTransaction error:",
            error
        );

        setStatus(
            "خطا در تأیید تراکنش: " +
            getReadableError(error),
            "error"
        );
    }
}

if (
    typeof particlesJS ===
    "function"
) {
    particlesJS(
        "particles-js",
        {
            particles: {
                number: {
                    value: 80
                },
                color: {
                    value: [
                        "#4cc9f0",
                        "#8b5cf6",
                        "#7209b7"
                    ]
                },
                shape: {
                    type: "circle"
                },
                opacity: {
                    value: 0.5,
                    random: true
                },
                size: {
                    value: 3,
                    random: true
                },
                line_linked: {
                    enable: true,
                    distance: 140,
                    color: "#6366f1",
                    opacity: 0.25,
                    width: 1
                },
                move: {
                    enable: true,
                    speed: 1.2
                }
            },
            interactivity: {
                events: {
                    onhover: {
                        enable: true,
                        mode: "repulse"
                    }
                }
            }
        }
    );
}

document.addEventListener(
    "DOMContentLoaded",
    init
);
