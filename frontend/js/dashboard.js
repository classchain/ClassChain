let userAddress = null;
let userAddressType = null; // 'EVM' | 'TVM'


/*
 * ============================================================
 * ABI فقط برای بررسی مالکیت EVM
 * ============================================================
 */

const fundABI = [
    {
        inputs: [],
        name: "owner",
        outputs: [
            {
                internalType: "address",
                name: "",
                type: "address"
            }
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
            {
                internalType: "address[]",
                name: "",
                type: "address[]"
            }
        ],
        stateMutability: "view",
        type: "function"
    }
];

const tronFundABI = [
    {
        inputs: [],
        name: "owner",
        outputs: [
            {
                internalType: "address",
                name: "",
                type: "address"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "token",
                type: "address"
            }
        ],
        name: "balanceOf",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
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
    }
];
/*
 * ============================================================
 * ابزارهای عمومی
 * ============================================================
 */

function getElement(id) {
    return document.getElementById(id);
}


function normalizeAddress(address) {
    return String(address || "").trim();
}


function sameAddress(a, b) {

    if (!a || !b) {
        return false;
    }

    return (
        normalizeAddress(a).toLowerCase() ===
        normalizeAddress(b).toLowerCase()
    );
}


function shortAddress(address, start = 8, end = 6) {

    const value = normalizeAddress(address);

    if (!value) {
        return "";
    }

    if (value.length <= start + end + 3) {
        return value;
    }

    return (
        value.slice(0, start) +
        "..." +
        value.slice(-end)
    );
}


/*
 * ============================================================
 * MetaMask
 * ============================================================
 */

async function connectMetaMask() {

    console.log("[Dashboard] MetaMask clicked");

    if (
        typeof window.ethereum === "undefined"
    ) {
        alert(
            "لطفاً افزونه MetaMask را نصب کنید."
        );

        return;
    }

    try {

        let accounts =
            await window.ethereum.request({
                method: "eth_accounts"
            });

        if (
            !accounts ||
            accounts.length === 0
        ) {

            accounts =
                await window.ethereum.request({
                    method: "eth_requestAccounts"
                });
        }

        if (
            !accounts ||
            accounts.length === 0
        ) {

            alert(
                "هیچ حسابی انتخاب نشد."
            );

            return;
        }

        userAddress =
            normalizeAddress(accounts[0]);

        userAddressType =
            "EVM";

        const accountDisplay =
            getElement("accountDisplay");

        if (accountDisplay) {

            accountDisplay.textContent =
                `وصل شد (MetaMask): ${shortAddress(
                    userAddress,
                    8,
                    6
                )}`;
        }

        const connectSection =
            getElement("connectSection");

        if (connectSection) {
            connectSection.style.display =
                "none";
        }

        const loading =
            getElement("loading");

        if (loading) {
            loading.style.display =
                "block";
        }

        await loadProjects();

    } catch (error) {

        console.error(
            "[Dashboard] MetaMask error:",
            error
        );

        if (error?.code === 4001) {

            alert(
                "اتصال MetaMask لغو شد."
            );

        } else {

            alert(
                "خطا در اتصال MetaMask: " +
                (
                    error?.message ||
                    "مشکل ناشناخته"
                )
            );
        }
    }
}


/*
 * ============================================================
 * TronLink
 * ============================================================
 */

async function connectTronLink() {

    console.log("[Dashboard] TronLink clicked");

    const tronWeb =
        window.tronWeb;

    if (!tronWeb) {

        alert(
            "لطفاً افزونه TronLink را نصب و فعال کنید."
        );

        return;
    }

    try {

        if (
            typeof tronWeb.request ===
            "function"
        ) {

            await tronWeb.request({
                method:
                    "tron_requestAccounts"
            });
        }

        /*
         * TronLink ممکن است بعد از request
         * کمی زمان لازم داشته باشد تا
         * defaultAddress به‌روزرسانی شود.
         */

        await new Promise(
            resolve =>
                setTimeout(resolve, 300)
        );

        const account =
            tronWeb
                .defaultAddress
                ?.base58;

        if (!account) {

            alert(
                "TronLink قفل است یا هیچ حسابی انتخاب نشده است."
            );

            return;
        }

        userAddress =
            normalizeAddress(account);

        userAddressType =
            "TVM";

        const accountDisplay =
            getElement("accountDisplay");

        if (accountDisplay) {

            accountDisplay.textContent =
                `وصل شد (TronLink): ${shortAddress(
                    userAddress,
                    6,
                    4
                )}`;
        }

        const connectSection =
            getElement("connectSection");

        if (connectSection) {
            connectSection.style.display =
                "none";
        }

        const loading =
            getElement("loading");

        if (loading) {
            loading.style.display =
                "block";
        }

        await loadProjects();

    } catch (error) {

        console.error(
            "[Dashboard] TronLink error:",
            error
        );

        if (
            error?.code === 4001 ||
            (
                error?.message &&
                error.message
                    .toLowerCase()
                    .includes("cancel")
            )
        ) {

            alert(
                "اتصال TronLink لغو شد."
            );

        } else {

            alert(
                "خطا در اتصال TronLink: " +
                (
                    error?.message ||
                    "مشکل ناشناخته"
                )
            );
        }
    }
}


/*
 * ============================================================
 * بررسی مالکیت یک خزانه
 *
 * Source of Truth:
 * Projects.json
 *
 * fund:
 * {
 *   address,
 *   owners,
 *   multisigAddress,
 *   requiredSignatures,
 *   ...
 * }
 * ============================================================
 */


async function checkOwnershipOnNetwork(
    projectAttributes,
    netCfg,
    userAddr,
    addrType
) {
    if (!projectAttributes || !netCfg || !userAddr) {
        return { isOwner: false };
    }

    const funds = projectAttributes.funds;

    if (!funds || typeof funds !== "object") {
        return { isOwner: false };
    }

    const fundEntries = [];

    // ============================================================
    // 1. ابتدا Projects.json
    //    این اطلاعات Canonical هستند
    // ============================================================

    for (const key of (netCfg.fundsKeys || [])) {
        const fundInfo = funds[key];

        if (
            !fundInfo ||
            typeof fundInfo !== "object" ||
            !fundInfo.address ||
            String(fundInfo.address).trim() === "" ||
            String(fundInfo.address).toLowerCase() === "null"
        ) {
            continue;
        }

        fundEntries.push({
            key,
            fundInfo
        });

        const owners = Array.isArray(fundInfo.owners)
            ? fundInfo.owners
            : [];

        const isOwner = owners.some(owner =>
            String(owner).trim().toLowerCase() ===
            String(userAddr).trim().toLowerCase()
        );

        if (isOwner) {
            return {
                isOwner: true,
                fundAddress: fundInfo.address,
                multisigAddress: fundInfo.multisigAddress || null,
                requiredSignatures:
                    fundInfo.requiredSignatures || 1,
                source: "projects-json"
            };
        }
    }

    // ============================================================
    // 2. EVM on-chain fallback
    // ============================================================

    if (
        addrType === "EVM" &&
        netCfg.type === "EVM" &&
        (netCfg.rpcUrl || netCfg.rpc)
    ) {
        for (const { fundInfo } of fundEntries) {
            const fundAddr = fundInfo.address;

            try {
                const web3 = new Web3(netCfg.rpcUrl || netCfg.rpc);

                const fundContract =
                    new web3.eth.Contract(
                        fundABI,
                        fundAddr
                    );

                const owner =
                    await fundContract.methods
                        .owner()
                        .call();

                if (
                    owner &&
                    owner.toLowerCase() ===
                    userAddr.toLowerCase()
                ) {
                    return {
                        isOwner: true,
                        fundAddress: fundAddr,
                        multisigAddress: null,
                        requiredSignatures: 1,
                        source: "contract"
                    };
                }

                // اگر owner خود Multisig باشد
                if (owner) {
                    try {
                        const multisig =
                            new web3.eth.Contract(
                                multisigABI,
                                owner
                            );

                        const owners =
                            await multisig.methods
                                .getOwners()
                                .call();

                        if (
                            Array.isArray(owners) &&
                            owners.some(o =>
                                o.toLowerCase() ===
                                userAddr.toLowerCase()
                            )
                        ) {
                            return {
                                isOwner: true,
                                fundAddress: fundAddr,
                                multisigAddress: owner,
                                requiredSignatures:
                                    fundInfo.requiredSignatures || 1,
                                source: "contract-multisig"
                            };
                        }
                    } catch (e) {
                        console.warn(
                            "EVM multisig check failed:",
                            e.message
                        );
                    }
                }

            } catch (e) {
                console.warn(
                    `EVM ownership check failed ${netCfg.id}/${fundAddr}:`,
                    e.message
                );
            }
        }
    }

    // ============================================================
    // 3. TRON / TVM on-chain fallback
    // ============================================================

    if (
        addrType === "TVM" &&
        netCfg.type === "TVM"
    ) {
        const tronWeb = window.tronWeb;

        if (!tronWeb) {
            console.warn(
                "TronWeb موجود نیست."
            );

            return {
                isOwner: false
            };
        }

        for (const { fundInfo } of fundEntries) {
            const fundAddr = fundInfo.address;

            try {
                // ------------------------------------------------
                // ساخت صحیح قرارداد TRON
                // ------------------------------------------------
                const fundContract =
                    await tronWeb.contract(
                        tronFundABI,
                        fundAddr
                    );

                if (
                    !fundContract ||
                    typeof fundContract.owner !== "function"
                ) {
                    console.warn(
                        "قرارداد TRON متد owner ندارد:",
                        fundAddr
                    );

                    continue;
                }

                const actualOwner =
                    await fundContract
                        .owner()
                        .call();

                // ------------------------------------------------
                // مالک مستقیم خزانه
                // ------------------------------------------------
                if (
                    actualOwner &&
                    String(actualOwner)
                        .trim()
                        .toLowerCase() ===
                    String(userAddr)
                        .trim()
                        .toLowerCase()
                ) {
                    return {
                        isOwner: true,
                        fundAddress: fundAddr,
                        multisigAddress: null,
                        requiredSignatures:
                            fundInfo.requiredSignatures || 1,
                        source: "tron-contract"
                    };
                }

                // ------------------------------------------------
                // اگر owner خزانه یک Multisig باشد
                // ------------------------------------------------
                if (actualOwner) {
                    try {
                        const multisigContract =
                            await tronWeb.contract(
                                tronMultisigABI,
                                actualOwner
                            );

                        if (
                            multisigContract &&
                            typeof multisigContract.getOwners ===
                                "function"
                        ) {
                            const owners =
                                await multisigContract
                                    .getOwners()
                                    .call();

                            if (
                                Array.isArray(owners) &&
                                owners.some(owner =>
                                    String(owner)
                                        .trim()
                                        .toLowerCase() ===
                                    String(userAddr)
                                        .trim()
                                        .toLowerCase()
                                )
                            ) {
                                return {
                                    isOwner: true,
                                    fundAddress: fundAddr,
                                    multisigAddress: actualOwner,
                                    requiredSignatures:
                                        fundInfo.requiredSignatures || 1,
                                    source:
                                        "tron-contract-multisig"
                                };
                            }
                        }

                    } catch (multisigError) {
                        console.warn(
                            `TRON multisig check failed ${actualOwner}:`,
                            multisigError.message
                        );
                    }
                }

            } catch (e) {
                console.warn(
                    `TRON ownership check failed ${netCfg.id}/${fundAddr}:`,
                    e.message
                );
            }
        }
    }

    return {
        isOwner: false
    };
}
