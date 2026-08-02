let projectData = {};
let projectId = null;
let selectedNetworkId = null;
let selectedNetCfg = null;
let connection = null;
let fundAddress = null;
let multisigAddress = null;
let isOwner = false;

const fundABI = [
    {
        inputs: [
            { internalType: "address", name: "token", type: "address" }
        ],
        name: "balanceOf",
        outputs: [
            { internalType: "uint256", name: "", type: "uint256" }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "owner",
        outputs: [
            { internalType: "address", name: "", type: "address" }
        ],
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
        inputs: [
            { internalType: "address", name: "token", type: "address" }
        ],
        name: "balanceOf",
        outputs: [
            { internalType: "uint256", name: "", type: "uint256" }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "owner",
        outputs: [
            { internalType: "address", name: "", type: "address" }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            { internalType: "address", name: "", type: "address" }
        ],
        name: "allowedTokens",
        outputs: [
            { internalType: "bool", name: "", type: "bool" }
        ],
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

const tronTokenABI = [
    {
        inputs: [
            { internalType: "address", name: "account", type: "address" }
        ],
        name: "balanceOf",
        outputs: [
            { internalType: "uint256", name: "", type: "uint256" }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            { internalType: "address", name: "spender", type: "address" }
        ],
        name: "allowance",
        outputs: [
            { internalType: "uint256", name: "", type: "uint256" }
        ],
        stateMutability: "view",
        type: "function"
    }
];

const multisigABI = [
    {
        inputs: [],
        name: "getOwners",
        outputs: [
            { internalType: "address[]", name: "", type: "address[]" }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "numConfirmationsRequired",
        outputs: [
            { internalType: "uint256", name: "", type: "uint256" }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            { internalType: "uint256", name: "_txIndex", type: "uint256" }
        ],
        name: "getTransaction",
        outputs: [
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "value", type: "uint256" },
            { internalType: "bytes", name: "data", type: "bytes" },
            { internalType: "bool", name: "executed", type: "bool" },
            { internalType: "uint256", name: "numConfirmations", type: "uint256" }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "getTransactionCount",
        outputs: [
            { internalType: "uint256", name: "", type: "uint256" }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            { internalType: "address", name: "_to", type: "address" },
            { internalType: "uint256", name: "_value", type: "uint256" },
            { internalType: "bytes", name: "_data", type: "bytes" }
        ],
        name: "submitTransaction",
        outputs: [
            { internalType: "uint256", name: "txIndex", type: "uint256" }
        ],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            { internalType: "uint256", name: "_txIndex", type: "uint256" }
        ],
        name: "confirmTransaction",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            { internalType: "uint256", name: "_txIndex", type: "uint256" }
        ],
        name: "executeTransaction",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    }
];

const walletManager = new (window.ClassChainWalletManager || function () {})();

function getElement(id) {
    return document.getElementById(id);
}

function shortAddress(address, start = 10, end = 8) {
    if (!address) return "-";
    const value = String(address);
    if (value.length <= start + end + 3) return value;
    return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function normalizeAddress(address) {
    return String(address || "").trim();
}

function sameAddress(a, b) {
    if (!a || !b) return false;
    return normalizeAddress(a).toLowerCase() === normalizeAddress(b).toLowerCase();
}

function getTronWeb() {
    if (connection?.tronWeb) return connection.tronWeb;
    if (window.tronWeb) return window.tronWeb;
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
            return String(address);
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

    const [whole, fraction = ""] = input.split(".");
    const fractionPadded = (fraction + "0".repeat(decimals)).slice(0, decimals);

    if (fraction.length > decimals) {
        throw new Error(`حداکثر ${decimals} رقم اعشار مجاز است.`);
    }

    const raw = `${whole}${fractionPadded}`.replace(/^0+(?=\d)/, "");

    return BigInt(raw || "0");
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

        let fractionText = fraction.toString().padStart(decimals, "0");
        fractionText = fractionText.replace(/0+$/, "");

        return `${whole.toString()}.${fractionText}`;
    } catch (_) {
        return "0";
    }
}

function setStatus(message, type) {
    const statusDiv = getElement("status");
    if (!statusDiv) return;

    statusDiv.className = type ? `status ${type}` : "";
    statusDiv.innerHTML = message || "";
}

function showMainError(message) {
    const loading = getElement("loading");

    if (loading) {
        loading.innerHTML = `<p style="color:var(--danger);">${message}</p>`;
    }
}

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    projectId = urlParams.get("project");

    if (!projectId) {
        showMainError("آیدی پروژه مشخص نشده است.");
        return;
    }

    try {
        const resp = await fetch("data/Projects.json");

        if (!resp.ok) {
            throw new Error("Projects.json قابل بارگذاری نیست.");
        }

        const data = await resp.json();

        const feature = (data.features || []).find(
            f => String(f.attributes?.ProjectID) === String(projectId)
        );

        projectData = feature?.attributes || {};

        if (!projectData || Object.keys(projectData).length === 0) {
            showMainError("پروژه پیدا نشد.");
            return;
        }

        const projectName = getElement("projectName");
        const projectIdDisplay = getElement("projectIdDisplay");

        if (projectName) {
            projectName.textContent =
                projectData["نام پروژه"] ||
                projectData.نام_پروژه ||
                `پروژه ${projectId}`;
        }

        if (projectIdDisplay) {
            projectIdDisplay.textContent = projectId;
        }

        await loadTotalRaised();
        populateNetworkSelect();

        const loading = getElement("loading");
        const main = getElement("main");

        if (loading) loading.style.display = "none";
        if (main) main.style.display = "block";

    } catch (err) {
        console.error("Init error:", err);

        showMainError(
            "خطا در بارگذاری پروژه: " +
            (err.message || "نامشخص")
        );
    }
}

async function loadTotalRaised() {
    try {
        if (!window.ClassChainRaisedReader) return;

        const result =
            await window.ClassChainRaisedReader.getProjectRaisedUSDT(projectData);

        const totalRaised = getElement("totalRaised");

        if (totalRaised) {
            totalRaised.textContent =
                Number(result.total || 0).toFixed(2) + " USDT";
        }

        const box = getElement("breakdownBox");

        if (box && result.breakdown && result.breakdown.length) {
            const parts = result.breakdown
                .filter(b => Number(b.amount || 0) > 0)
                .map(b =>
                    `${b.network}: ${Number(b.amount).toFixed(2)}`
                );

            box.textContent = parts.length
                ? parts.join("  |  ")
                : "";
        }

    } catch (e) {
        console.warn("خطا در خواندن مجموع:", e);
    }
}

function populateNetworkSelect() {
    const config = window.ClassChainNetworkConfig;

    if (!config) return;

    const select = getElement("networkSelect");

    if (!select) return;

    select.innerHTML =
        '<option value="">— ابتدا شبکه را انتخاب کنید —</option>';

    const allNets = Object.values(config.NETWORKS || {});

    allNets.forEach(net => {
        let hasAddress = false;

        (net.addressFields || []).forEach(field => {
            if (
                projectData[field] &&
                String(projectData[field]).toLowerCase() !== "null"
            ) {
                hasAddress = true;
            }
        });

        if (projectData.funds) {
            (net.fundsKeys || []).forEach(key => {
                if (projectData.funds[key]?.address) {
                    hasAddress = true;
                }
            });
        }

        if (!hasAddress) return;

        const opt = document.createElement("option");

        opt.value = net.id;
        opt.textContent =
            `${net.name}${net.status === "active" ? "" : " (در انتظار)"}`;

        opt.disabled = net.status !== "active";

        select.appendChild(opt);
    });

    select.addEventListener("change", onNetworkChange);
}

function onNetworkChange() {
    selectedNetworkId = getElement("networkSelect")?.value || "";

    selectedNetCfg =
        window.ClassChainNetworkConfig?.getNetwork(selectedNetworkId) ||
        null;

    connection = null;
    fundAddress = null;
    multisigAddress = null;
    isOwner = false;

    const fundDetails = getElement("fundDetails");
    const noAccessCard = getElement("noAccessCard");
    const connectedWalletInfo = getElement("connectedWalletInfo");
    const status = getElement("status");
    const connectButton = getElement("btnConnectNetwork");

    if (fundDetails) fundDetails.style.display = "none";
    if (noAccessCard) noAccessCard.style.display = "none";
    if (connectedWalletInfo) connectedWalletInfo.textContent = "";
    if (status) status.innerHTML = "";

    if (!selectedNetCfg) {
        if (connectButton) connectButton.style.display = "none";
        return;
    }

    if (connectButton) {
        connectButton.style.display = "inline-block";
        connectButton.textContent =
            `اتصال ${selectedNetCfg.walletName} (${selectedNetCfg.name})`;
        connectButton.onclick = connectSelectedNetwork;
    }
}

async function connectSelectedNetwork() {
    if (!selectedNetCfg) return;

    try {
        setStatus("در حال اتصال به کیف پول...", "warning");

        if (window.ClassChainWalletManager) {
            const wm = new window.ClassChainWalletManager();

            connection = await wm.connect(selectedNetCfg);
        } else {
            if (selectedNetCfg.type === "EVM") {
                if (!window.ethereum) {
                    throw new Error("MetaMask نصب نیست.");
                }

                await window.ethereum.request({
                    method: "eth_requestAccounts"
                });

                const web3 = new Web3(window.ethereum);

                let chainId = Number(
                    await web3.eth.getChainId()
                );

                if (
                    selectedNetCfg.chainId &&
                    chainId !== Number(selectedNetCfg.chainId)
                ) {
                    await window.ethereum.request({
                        method: "wallet_switchEthereumChain",
                        params: [
                            {
                                chainId:
                                    "0x" +
                                    Number(selectedNetCfg.chainId)
                                        .toString(16)
                            }
                        ]
                    });

                    chainId = Number(
                        await web3.eth.getChainId()
                    );
                }

                const accounts = await web3.eth.getAccounts();

                if (!accounts.length) {
                    throw new Error("حساب MetaMask یافت نشد.");
                }

                connection = {
                    type: "EVM",
                    account: accounts[0],
                    web3,
                    network: selectedNetCfg
                };

            } else if (selectedNetCfg.type === "TVM") {
                if (!window.tronWeb) {
                    throw new Error("TronLink نصب نیست.");
                }

                if (
                    typeof window.tronWeb.request === "function"
                ) {
                    try {
                        await window.tronWeb.request({
                            method: "tron_requestAccounts"
                        });
                    } catch (_) {}
                }

                await new Promise(resolve => setTimeout(resolve, 500));

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
            throw new Error("اتصال کیف پول برقرار نشد.");
        }

        if (selectedNetCfg.type === "TVM") {
            await verifyTronNileNetwork(connection.tronWeb);
        }

        const walletInfo = getElement("connectedWalletInfo");

        if (walletInfo) {
            walletInfo.textContent =
                `وصل شد: ${shortAddress(connection.account, 8, 6)}`;
        }

        setStatus("", "");

        await loadFundDataForSelectedNetwork();

    } catch (err) {
        console.error("Connection error:", err);

        setStatus(
            "خطا در اتصال: " +
            getReadableError(err),
            "error"
        );
    }
}

async function verifyTronNileNetwork(tronWeb) {
    if (!tronWeb) {
        throw new Error("TronWeb در دسترس نیست.");
    }

    const expectedHost = "nile.trongrid.io";

    const hosts = [];

    try {
        if (tronWeb.fullNode?.host) {
            hosts.push(tronWeb.fullNode.host);
        }
    } catch (_) {}

    try {
        if (tronWeb.solidityNode?.host) {
            hosts.push(tronWeb.solidityNode.host);
        }
    } catch (_) {}

    const normalizedHosts = hosts.map(h =>
        String(h).toLowerCase()
    );

    const isNile = normalizedHosts.some(
        h => h.includes(expectedHost)
    );

    if (!isNile) {
        throw new Error(
            "TronLink روی Tron Nile نیست. شبکه Nile را در TronLink انتخاب کنید و دوباره تلاش کنید."
        );
    }

    return true;
}

async function loadFundDataForSelectedNetwork() {
    if (!selectedNetCfg || !connection) return;

    fundAddress = null;
    multisigAddress = null;

    if (projectData.funds) {
        for (const key of selectedNetCfg.fundsKeys || []) {
            const info = projectData.funds[key];

            if (info?.address) {
                fundAddress = info.address;
                multisigAddress =
                    info.multisigAddress || null;
                break;
            }
        }
    }

    if (!fundAddress) {
        for (const field of selectedNetCfg.addressFields || []) {
            if (
                projectData[field] &&
                String(projectData[field]).toLowerCase() !== "null"
            ) {
                fundAddress = projectData[field];
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

    if (selectedNetCfg.type === "TVM") {
        fundAddress = getTronBase58(fundAddress);
    }

    const networkName = getElement("selectedNetworkName");
    const fundAddressElement = getElement("fundAddress");

    if (networkName) {
        networkName.textContent = selectedNetCfg.name;
    }

    if (fundAddressElement) {
        fundAddressElement.textContent =
            shortAddress(fundAddress);
    }

    if (
        selectedNetCfg.type === "EVM" &&
        connection.type === "EVM"
    ) {
        await loadEvmFundData();
        return;
    }

    if (
        selectedNetCfg.type === "TVM" &&
        connection.type === "TVM"
    ) {
        await loadTronFundData();
        return;
    }

    setStatus(
        "نوع کیف پول با شبکه انتخاب‌شده سازگار نیست.",
        "error"
    );
}

async function loadEvmFundData() {
    const web3 = connection.web3;
    const userAddress = connection.account;
    const usdt = selectedNetCfg.usdtAddress;
    const decimals = selectedNetCfg.tokenDecimals || 6;

    const fundContract =
        new web3.eth.Contract(
            fundABI,
            fundAddress
        );

    let balanceFormatted = "0.0000";

    try {
        if (selectedNetCfg.rpc) {
            const readWeb3 =
                new Web3(selectedNetCfg.rpc);

            const token =
                new readWeb3.eth.Contract(
                    [
                        {
                            constant: true,
                            inputs: [
                                {
                                    name: "account",
                                    type: "address"
                                }
                            ],
                            name: "balanceOf",
                            outputs: [
                                {
                                    name: "",
                                    type: "uint256"
                                }
                            ],
                            type: "function"
                        }
                    ],
                    usdt
                );

            const raw =
                await token.methods
                    .balanceOf(fundAddress)
                    .call();

            balanceFormatted =
                formatTokenAmount(raw, decimals);
        }
    } catch (e) {
        console.warn(
            "خطا در خواندن موجودی EVM:",
            e
        );
    }

    const fundBalance = getElement("fundBalance");

    if (fundBalance) {
        fundBalance.textContent =
            Number(balanceFormatted).toFixed(4) +
            " USDT";
    }

    let ownerAddr = "-";
    let required = "1";
    let owners = [];

    isOwner = false;
    multisigAddress = null;

    try {
        const owner =
            await fundContract.methods
                .owner()
                .call();

        ownerAddr = owner;

        if (sameAddress(owner, userAddress)) {
            isOwner = true;
            owners = [userAddress];
            required = "1 (تک‌مالکی)";
        } else {
            try {
                const multisigContract =
                    new web3.eth.Contract(
                        multisigABI,
                        owner
                    );

                required =
                    await multisigContract.methods
                        .numConfirmationsRequired()
                        .call();

                owners =
                    await multisigContract.methods
                        .getOwners()
                        .call();

                isOwner = owners.some(
                    o => sameAddress(o, userAddress)
                );

                multisigAddress = owner;

            } catch (e) {
                console.warn(
                    "مالک خزانه Multisig نیست یا ABI متفاوت است:",
                    e
                );
            }
        }

    } catch (e) {
        console.warn(
            "خطا در خواندن owner:",
            e
        );
    }

    const ownerAddressElement =
        getElement("ownerAddress");

    const requiredElement =
        getElement("requiredConfirmations");

    if (ownerAddressElement) {
        ownerAddressElement.textContent =
            shortAddress(ownerAddr);
    }

    if (requiredElement) {
        requiredElement.textContent = required;
    }

    if (!isOwner) {
        const fundDetails =
            getElement("fundDetails");

        const noAccessCard =
            getElement("noAccessCard");

        if (fundDetails) fundDetails.style.display = "none";
        if (noAccessCard) noAccessCard.style.display = "block";

        return;
    }

    const noAccessCard =
        getElement("noAccessCard");

    const fundDetails =
        getElement("fundDetails");

    if (noAccessCard) {
        noAccessCard.style.display = "none";
    }

    if (fundDetails) {
        fundDetails.style.display = "block";
    }

    const ownersList =
        getElement("ownersList");

    if (ownersList) {
        ownersList.innerHTML = "";

        owners.forEach(o => {
            const item =
                document.createElement("div");

            item.className = "info-item";

            item.innerHTML = `
                <div class="info-label">صاحب</div>
                <div class="info-value">
                    ${shortAddress(o)}
                </div>
                ${
                    sameAddress(o, userAddress)
                        ? '<small style="color:var(--success);">شما</small>'
                        : ""
                }
            `;

            ownersList.appendChild(item);
        });
    }

    if (!multisigAddress) {
        const pendingTxs =
            getElement("pendingTxs");

        if (pendingTxs) {
            pendingTxs.innerHTML =
                '<p style="opacity:0.7;">این خزانه تک‌مالکی است. برداشت مستقیم انجام می‌شود.</p>';
        }
    } else {
        await loadPendingTransactions(
            web3,
            userAddress
        );
    }

    const withdrawButton =
        getElement("btnWithdraw");

    if (withdrawButton) {
        withdrawButton.onclick = () =>
            submitWithdrawEvm(
                web3,
                userAddress,
                usdt,
                decimals
            );
    }
}

async function loadPendingTransactions(
    web3,
    userAddress
) {
    const pendingDiv =
        getElement("pendingTxs");

    if (!pendingDiv) return;

    try {
        const multisigContract =
            new web3.eth.Contract(
                multisigABI,
                multisigAddress
            );

        const count =
            await multisigContract.methods
                .getTransactionCount()
                .call();

        if (Number(count) === 0) {
            pendingDiv.innerHTML =
                "<p>هیچ تراکنش در انتظاری وجود ندارد.</p>";
            return;
        }

        pendingDiv.innerHTML = "";

        const required =
            await multisigContract.methods
                .numConfirmationsRequired()
                .call();

        for (
            let i = 0;
            i < Number(count);
            i++
        ) {
            const tx =
                await multisigContract.methods
                    .getTransaction(i)
                    .call();

            if (tx.executed) continue;

            const div =
                document.createElement("div");

            div.className = "pending-tx";

            div.innerHTML = `
                <p><strong>تراکنش #${i}</strong></p>
                <p>مقصد: ${shortAddress(tx.to)}</p>
                <p>
                    تأییدها:
                    ${tx.numConfirmations} / ${required}
                </p>
                <button onclick="confirmTx(${i})">
                    تأیید این تراکنش
                </button>
            `;

            pendingDiv.appendChild(div);
        }

    } catch (e) {
        pendingDiv.innerHTML =
            "<p>خطا در خواندن تراکنش‌های در انتظار.</p>";

        console.warn(e);
    }
}

async function confirmTx(txIndex) {
    if (!connection || !multisigAddress) {
        return;
    }

    try {
        setStatus(
            "در حال ارسال تأیید...",
            "warning"
        );

        const multisigContract =
            new connection.web3.eth.Contract(
                multisigABI,
                multisigAddress
            );

        await multisigContract.methods
            .confirmTransaction(txIndex)
            .send({
                from: connection.account,
                gas: 300000
            });

        setStatus(
            "تأیید موفق!",
            "success"
        );

        await loadFundDataForSelectedNetwork();

    } catch (err) {
        setStatus(
            "خطا در تأیید: " +
            getReadableError(err),
            "error"
        );
    }
}

async function submitWithdrawEvm(
    web3,
    userAddress,
    usdt,
    decimals
) {
    const amountInput =
        getElement("withdrawAmount")?.value;

    const toAddress =
        getElement("withdrawTo")?.value.trim();

    if (
        !amountInput ||
        !toAddress ||
        !web3.utils.isAddress(toAddress)
    ) {
        setStatus(
            "مقدار و آدرس معتبر وارد کنید.",
            "error"
        );
        return;
    }

    let amount;

    try {
        amount =
            parseTokenAmount(
                amountInput,
                decimals
            );
    } catch (e) {
        setStatus(
            e.message,
            "error"
        );
        return;
    }

    const fundContract =
        new web3.eth.Contract(
            fundABI,
            fundAddress
        );

    try {
        setStatus(
            "در حال ارسال تراکنش...",
            "warning"
        );

        if (!multisigAddress) {
            const gasEstimate =
                await fundContract.methods
                    .withdrawToken(
                        usdt,
                        toAddress,
                        amount.toString()
                    )
                    .estimateGas({
                        from: userAddress
                    });

            const tx =
                await fundContract.methods
                    .withdrawToken(
                        usdt,
                        toAddress,
                        amount.toString()
                    )
                    .send({
                        from: userAddress,
                        gas: Math.floor(
                            Number(gasEstimate) * 1.25
                        )
                    });

            setStatus(
                `برداشت موفق!
                <a href="${selectedNetCfg.explorer}/tx/${tx.transactionHash}" target="_blank">
                    مشاهده
                </a>`,
                "success"
            );

        } else {
            const withdrawData =
                web3.eth.abi.encodeFunctionCall(
                    {
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
                    },
                    [
                        usdt,
                        toAddress,
                        amount.toString()
                    ]
                );

            const multisigContract =
                new web3.eth.Contract(
                    multisigABI,
                    multisigAddress
                );

            const tx =
                await multisigContract.methods
                    .submitTransaction(
                        fundAddress,
                        0,
                        withdrawData
                    )
                    .send({
                        from: userAddress,
                        gas: 400000
                    });

            setStatus(
                `درخواست ثبت شد.
                <a href="${selectedNetCfg.explorer}/tx/${tx.transactionHash}" target="_blank">
                    مشاهده
                </a>`,
                "success"
            );
        }

        await loadFundDataForSelectedNetwork();
        await loadTotalRaised();

    } catch (err) {
        console.error(
            "EVM withdrawal error:",
            err
        );

        setStatus(
            "خطا در برداشت: " +
            getReadableError(err),
            "error"
        );
    }
}

async function loadTronFundData() {
    if (!connection || connection.type !== "TVM") {
        setStatus(
            "اتصال TronLink معتبر نیست.",
            "error"
        );
        return;
    }

    const tronWeb = connection.tronWeb;
    const userAddress = connection.account;

    await verifyTronNileNetwork(tronWeb);

    const decimals =
        selectedNetCfg.tokenDecimals || 6;

    const usdt =
        getTronBase58(
            selectedNetCfg.usdtAddress
        );

    fundAddress =
        getTronBase58(fundAddress);

    let rawFundBalance = "0";
    let ownerAddress = null;
    let tokenAllowed = false;

    try {
        const fundContract =
            await tronWeb.contract(
                tronFundABI,
                fundAddress
            );

        rawFundBalance =
            await fundContract
                .balanceOf(usdt)
                .call();

        ownerAddress =
            await fundContract
                .owner()
                .call();

        tokenAllowed =
            await fundContract
                .allowedTokens(usdt)
                .call();

    } catch (e) {
        console.error(
            "خطا در خواندن اطلاعات خزانه Tron:",
            e
        );

        setStatus(
            "خطا در خواندن قرارداد خزانه Tron: " +
            getReadableError(e),
            "error"
        );

        return;
    }

    const balanceFormatted =
        formatTokenAmount(
            rawFundBalance,
            decimals
        );

    const fundBalance =
        getElement("fundBalance");

    if (fundBalance) {
        fundBalance.textContent =
            Number(balanceFormatted).toFixed(4) +
            " USDT";
    }

    isOwner =
        sameAddress(
            getTronBase58(ownerAddress),
            userAddress
        );

    multisigAddress = null;

    const ownerElement =
        getElement("ownerAddress");

    const requiredElement =
        getElement("requiredConfirmations");

    if (ownerElement) {
        ownerElement.textContent =
            shortAddress(
                getTronBase58(ownerAddress)
            );
    }

    if (requiredElement) {
        requiredElement.textContent =
            isOwner
                ? "1 (تک‌مالکی)"
                : "1";
    }

    const ownersList =
        getElement("ownersList");

    if (ownersList) {
        ownersList.innerHTML = "";

        const item =
            document.createElement("div");

        item.className = "info-item";

        item.innerHTML = `
            <div class="info-label">Owner واقعی قرارداد</div>
            <div class="info-value">
                ${shortAddress(getTronBase58(ownerAddress))}
            </div>
            ${
                isOwner
                    ? '<small style="color:var(--success);">شما</small>'
                    : '<small style="color:var(--danger);">این حساب Owner نیست</small>'
            }
        `;

        ownersList.appendChild(item);
    }

    const pendingTxs =
        getElement("pendingTxs");

    if (pendingTxs) {
        pendingTxs.innerHTML =
            `<p style="opacity:0.8;">
                شبکه: Tron Nile<br>
                توکن مجاز: ${
                    tokenAllowed
                        ? "✅ USDT مجاز است"
                        : "❌ USDT در قرارداد مجاز نیست"
                }<br>
                موجودی واقعی خزانه: ${balanceFormatted} USDT
            </p>`;
    }

    if (!isOwner) {
        const fundDetails =
            getElement("fundDetails");

        const noAccessCard =
            getElement("noAccessCard");

        if (fundDetails) {
            fundDetails.style.display = "none";
        }

        if (noAccessCard) {
            noAccessCard.style.display = "block";
        }

        setStatus(
            "حساب متصل‌شده Owner واقعی قرارداد نیست.",
            "error"
        );

        return;
    }

    const noAccessCard =
        getElement("noAccessCard");

    const fundDetails =
        getElement("fundDetails");

    if (noAccessCard) {
        noAccessCard.style.display = "none";
    }

    if (fundDetails) {
        fundDetails.style.display = "block";
    }

    const withdrawButton =
        getElement("btnWithdraw");

    if (withdrawButton) {
        withdrawButton.onclick =
            () => submitWithdrawTron();
    }

    if (!tokenAllowed) {
        setStatus(
            "USDT در قرارداد خزانه مجاز نیست؛ برداشت انجام ندهید.",
            "error"
        );
    }
}

async function submitWithdrawTron() {
    if (
        !connection ||
        connection.type !== "TVM" ||
        !selectedNetCfg
    ) {
        setStatus(
            "ابتدا با TronLink به Tron Nile وصل شوید.",
            "error"
        );
        return;
    }

    const tronWeb =
        connection.tronWeb;

    try {
        await verifyTronNileNetwork(tronWeb);
    } catch (e) {
        setStatus(
            e.message,
            "error"
        );
        return;
    }

    const amountInput =
        getElement("withdrawAmount")?.value.trim();

    const toAddress =
        getElement("withdrawTo")?.value.trim();

    if (
        !amountInput ||
        Number(amountInput) <= 0
    ) {
        setStatus(
            "مقدار معتبر وارد کنید.",
            "error"
        );
        return;
    }

    if (!toAddress) {
        setStatus(
            "آدرس مقصد را وارد کنید.",
            "error"
        );
        return;
    }

    let validDestination = false;

    try {
        validDestination =
            tronWeb.isAddress(toAddress);
    } catch (_) {
        validDestination =
            /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(
                toAddress
            );
    }

    if (!validDestination) {
        setStatus(
            "آدرس مقصد Tron معتبر نیست.",
            "error"
        );
        return;
    }

    if (!fundAddress) {
        setStatus(
            "آدرس خزانه پیدا نشد.",
            "error"
        );
        return;
    }

    const decimals =
        selectedNetCfg.tokenDecimals || 6;

    const usdt =
        getTronBase58(
            selectedNetCfg.usdtAddress
        );

    const fund =
        getTronBase58(fundAddress);

    const destination =
        getTronBase58(toAddress);

    let amount;

    try {
        amount =
            parseTokenAmount(
                amountInput,
                decimals
            );
    } catch (e) {
        setStatus(
            e.message,
            "error"
        );
        return;
    }

    if (amount <= 0n) {
        setStatus(
            "مبلغ برداشت باید بزرگ‌تر از صفر باشد.",
            "error"
        );
        return;
    }

    try {
        setStatus(
            "در حال بررسی Owner و موجودی خزانه...",
            "warning"
        );

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

        if (
            !sameAddress(
                actualOwner,
                connection.account
            )
        ) {
            throw new Error(
                `حساب متصل‌شده Owner نیست.\nOwner واقعی: ${actualOwner}`
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
                `موجودی خزانه کافی نیست.\nموجودی: ${formatTokenAmount(balance, decimals)} USDT\nدرخواست: ${amountInput} USDT`
            );
        }

        setStatus(
            "بررسی‌ها موفق بود. در حال ارسال تراکنش به TronLink...",
            "warning"
        );

        const txBuilder =
            fundContract.withdrawToken(
                usdt,
                destination,
                amount.toString()
            );

        const tx =
            await txBuilder.send({
                feeLimit: 150000000,
                callValue: 0,
                shouldPollResponse: true
            });

        const txId =
            typeof tx === "string"
                ? tx
                : (
                    tx?.txid ||
                    tx?.transaction?.txID ||
                    tx?.transaction?.txid ||
                    tx?.txID ||
                    null
                );

        if (!txId) {
            throw new Error(
                "تراکنش ارسال شد اما شناسه تراکنش از TronLink دریافت نشد."
            );
        }

        let confirmed = false;

        try {
            await waitForTronTransaction(
                tronWeb,
                txId,
                30,
                2000
            );

            confirmed = true;

        } catch (confirmError) {
            console.warn(
                "Confirmation warning:",
                confirmError
            );
        }

        const explorerBase =
            selectedNetCfg.explorer ||
            "https://nile.tronscan.org";

        const explorerUrl =
            `${explorerBase}/#/transaction/${txId}`;

        if (confirmed) {
            setStatus(
                `برداشت با موفقیت تأیید شد.
                <br>
                <a href="${explorerUrl}" target="_blank">
                    مشاهده تراکنش در Nile Tronscan
                </a>`,
                "success"
            );
        } else {
            setStatus(
                `تراکنش ارسال شد، اما تأیید نهایی هنوز دریافت نشده است.
                <br>
                <a href="${explorerUrl}" target="_blank">
                    مشاهده تراکنش
                </a>`,
                "warning"
            );
        }

        await new Promise(
            resolve => setTimeout(resolve, 2500)
        );

        await loadFundDataForSelectedNetwork();
        await loadTotalRaised();

    } catch (err) {
        console.error(
            "Tron withdrawal error:",
            err
        );

        const detailedMessage =
            await extractTronError(
                err,
                tronWeb
            );

        setStatus(
            "خطا در برداشت Tron: " +
            detailedMessage,
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
        let info = null;

        try {
            info =
                await tronWeb.trx.getTransactionInfo(
                    txId
                );
        } catch (_) {}

        if (
            info &&
            info.id === txId
        ) {
            if (
                info.receipt?.result === "SUCCESS"
            ) {
                return info;
            }

            if (
                info.receipt?.result &&
                info.receipt.result !== "SUCCESS"
            ) {
                const reason =
                    info.resMessage
                        ? decodeHexMessage(
                            info.resMessage
                        )
                        : info.receipt.result;

                throw new Error(
                    `تراکنش در شبکه شکست خورد: ${reason}`
                );
            }
        }

        await new Promise(
            resolve => setTimeout(resolve, delayMs)
        );
    }

    throw new Error(
        "تراکنش در بازه زمانی تعیین‌شده تأیید نشد."
    );
}

async function extractTronError(
    err,
    tronWeb
) {
    let message =
        err?.message ||
        err?.toString() ||
        "خطای نامشخص";

    if (
        typeof message === "string" &&
        message.includes("User denied")
    ) {
        return "تراکنش توسط کاربر لغو شد.";
    }

    if (
        typeof message === "string" &&
        (
            message.includes("cancel") ||
            message.includes("Cancel")
        )
    ) {
        return "تراکنش توسط کاربر لغو شد.";
    }

    if (
        message.includes("OUT_OF_ENERGY")
    ) {
        return "Energy کافی برای اجرای قرارداد وجود ندارد.";
    }

    if (
        message.includes("REVERT")
    ) {
        return decodeHexMessage(message);
    }

    if (
        message.includes("owner")
    ) {
        return "حساب متصل‌شده Owner قرارداد نیست.";
    }

    if (
        message.includes("Insufficient balance")
    ) {
        return "موجودی USDT خزانه برای برداشت کافی نیست.";
    }

    if (
        message.includes("not allowed") ||
        message.includes("Token not allowed")
    ) {
        return "USDT در قرارداد خزانه مجاز نیست.";
    }

    if (
        message.includes("Transfer failed")
    ) {
        return "انتقال USDT توسط قرارداد توکن شکست خورد. موجودی، مجازبودن USDT و وضعیت قرارداد توکن باید بررسی شود.";
    }

    if (
        tronWeb &&
        message.includes("transaction")
    ) {
        try {
            return decodeHexMessage(message);
        } catch (_) {}
    }

    return message;
}

function decodeHexMessage(message) {
    if (!message) return "خطای نامشخص";

    let result = String(message);

    try {
        const hexMatches =
            result.match(
                /(?:0x|41)?[0-9a-fA-F]{8,}/g
            );

        if (hexMatches?.length) {
            for (const hex of hexMatches) {
                const clean =
                    hex.replace(/^0x/, "");

                if (
                    clean.length % 2 === 0
                ) {
                    let text = "";

                    for (
                        let i = 0;
                        i < clean.length;
                        i += 2
                    ) {
                        const code =
                            parseInt(
                                clean.slice(i, i + 2),
                                16
                            );

                        if (
                            code >= 32 &&
                            code <= 126
                        ) {
                            text +=
                                String.fromCharCode(
                                    code
                                );
                        } else {
                            text += " ";
                        }
                    }

                    const cleaned =
                        text
                            .replace(/\s+/g, " ")
                            .trim();

                    if (
                        cleaned.length >= 3 &&
                        /[A-Za-z]/.test(cleaned)
                    ) {
                        result +=
                            ` (${cleaned})`;
                    }
                }
            }
        }
    } catch (_) {}

    return result;
}

function getReadableError(err) {
    if (!err) {
        return "خطای نامشخص";
    }

    if (err.code === 4001) {
        return "تراکنش توسط کاربر لغو شد.";
    }

    if (err.code === "ACTION_REJECTED") {
        return "تراکنش توسط کاربر لغو شد.";
    }

    if (
        err.message?.includes("User denied")
    ) {
        return "تراکنش توسط کاربر لغو شد.";
    }

    if (
        err.message?.includes("insufficient funds")
    ) {
        return "موجودی کیف پول برای پرداخت هزینه تراکنش کافی نیست.";
    }

    return err.message ||
        err.toString() ||
        "خطای نامشخص";
}

if (typeof particlesJS === "function") {
    particlesJS("particles-js", {
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
    });
}

document.addEventListener(
    "DOMContentLoaded",
    init
);
