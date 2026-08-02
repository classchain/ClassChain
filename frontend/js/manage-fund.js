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

    try {
        if (tronWeb.isAddress(address)) {
            return address;
        }
    } catch (_) {}

    try {
        if (tronWeb.address?.fromHex) {
            return tronWeb.address.fromHex(address);
        }
    } catch (_) {}

    return address;
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

        /*
         * اینجا مالکیت واقعی بررسی می‌شود:
         * کاربر باید یکی از ownerهای Multisig باشد.
         */

        isOwner =
            tronMultisigOwners.some(
                owner =>
                    sameAddress(
                        owner,
                        userAddress
                    )
            );

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

        await loadTronPendingTransactions(
            multisigContract
        );

        const withdrawButton =
            getElement("btnWithdraw");

        if (withdrawButton) {
            withdrawButton.onclick =
                submitWithdrawTron;
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

        /*
         * بررسی واقعی Owner بودن کاربر
         * روی Multisig
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
         * ابتدا اطلاعات واقعی خزانه
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
         * owner خزانه باید Multisig باشد
         */
        if (
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

        const tokenAllowed =
            await fundContract
                .allowedTokens(usdt)
                .call();

        if (!tokenAllowed) {
            throw new Error(
                "USDT در قرارداد خزانه مجاز نیست."
            );
        }

        const rawBalance =
            await fundContract
                .balanceOf(usdt)
                .call();

        const balance =
            BigInt(String(rawBalance));

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
         * ABI واقعی withdrawToken را برای
         * ارسال به Multisig encode می‌کنیم.
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

        const encodedData =
            tronWeb.transactionBuilder
                ? tronWeb.transactionBuilder
                : null;

        let parameterData;

        /*
         * TronWeb ABI encoding
         */
        if (
            tronWeb.utils?.abi?.encodeFunctionCall
        ) {
            parameterData =
                tronWeb.utils.abi.encodeFunctionCall(
                    withdrawFunctionABI,
                    [
                        usdt,
                        destination,
                        amount.toString()
                    ]
                );
        } else if (
            tronWeb.utils?.abi?.encodeParams
        ) {
            parameterData =
                "0x" +
                tronWeb.utils.abi
                    .encodeParams(
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
                    )
                    .replace(/^0x/, "");
        } else {
            /*
             * روش مطمئن برای TronWeb:
             * قرارداد Multisig را با ABI کامل باز می‌کنیم
             * و submitTransaction را فراخوانی می‌کنیم.
             *
             * برای data باید selector تابع withdrawToken
             * ساخته شود.
             */
            throw new Error(
                "TronWeb ABI encoder در نسخه فعلی TronLink در دسترس نیست."
            );
        }

        const multisigContract =
            await tronWeb.contract(
                tronMultisigABI,
                multisigAddress
            );

        setStatus(
            "در حال ثبت درخواست برداشت در Multisig...",
            "warning"
        );

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
                setTimeout(resolve, 1500)
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
    return;
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
