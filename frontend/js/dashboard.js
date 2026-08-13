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

    if (
        !projectAttributes ||
        !netCfg ||
        !userAddr
    ) {
        return {
            isOwner: false
        };
    }


    /*
     * شبکه باید با نوع کیف پول سازگار باشد.
     */

    if (
        netCfg.type === "EVM" &&
        addrType !== "EVM"
    ) {

        return {
            isOwner: false
        };
    }

    if (
        netCfg.type === "TVM" &&
        addrType !== "TVM"
    ) {

        return {
            isOwner: false
        };
    }


    const funds =
        projectAttributes.funds;

    if (
        !funds ||
        typeof funds !== "object"
    ) {

        return {
            isOwner: false
        };
    }


    /*
     * Canonical key
     *
     * network-config.js:
     * fundsKey === networkId
     */

    const fundKey =
        netCfg.fundsKey;

    if (!fundKey) {

        return {
            isOwner: false
        };
    }


    const fund =
        funds[fundKey];

    if (
        !fund ||
        typeof fund !== "object"
    ) {

        return {
            isOwner: false
        };
    }


    const fundAddress =
        normalizeAddress(
            fund.address
        );

    if (!fundAddress) {

        return {
            isOwner: false
        };
    }


    /*
     * ========================================================
     * مرحله اول:
     * مالکیت ثبت‌شده در Projects.json
     * ========================================================
     */

    const owners =
        Array.isArray(fund.owners)
            ? fund.owners
            : [];


    const ownerFound =
        owners.some(
            owner =>
                sameAddress(
                    owner,
                    userAddr
                )
        );


    if (ownerFound) {

        return {

            isOwner: true,

            fundAddress:

                fundAddress,

            multisigAddress:

                fund.multisigAddress ||
                null,

            requiredSignatures:

                Number(
                    fund.requiredSignatures
                ) || 1,

            source:
                "projects-json"
        };
    }


    /*
     * ========================================================
     * مرحله دوم:
     *
     * فقط EVM
     *
     * اگر owners در Projects.json نبود،
     * مالکیت قرارداد را مستقیماً بررسی می‌کنیم.
     *
     * این fallback فقط برای EVM است.
     * ========================================================
     */

    if (
        addrType === "EVM" &&
        netCfg.type === "EVM"
    ) {

        const rpcUrl =
            netCfg.rpcUrl;

        if (!rpcUrl) {

            return {
                isOwner: false
            };
        }


        try {

            const web3 =
                new Web3(
                    rpcUrl
                );


            /*
             * owner خزانه
             */

            const fundContract =
                new web3.eth.Contract(
                    fundABI,
                    fundAddress
                );


            const owner =
                await fundContract
                    .methods
                    .owner()
                    .call();


            if (
                sameAddress(
                    owner,
                    userAddr
                )
            ) {

                return {

                    isOwner: true,

                    fundAddress:
                        fundAddress,

                    multisigAddress:
                        null,

                    requiredSignatures:
                        1,

                    source:
                        "contract"
                };
            }


            /*
             * اگر owner خزانه یک Multisig باشد،
             * اعضای آن را بررسی می‌کنیم.
             */

            if (owner) {

                try {

                    const multisig =
                        new web3.eth.Contract(
                            multisigABI,
                            owner
                        );


                    const multisigOwners =
                        await multisig
                            .methods
                            .getOwners()
                            .call();


                    if (
                        Array.isArray(
                            multisigOwners
                        ) &&
                        multisigOwners.some(
                            item =>
                                sameAddress(
                                    item,
                                    userAddr
                                )
                        )
                    ) {

                        return {

                            isOwner: true,

                            fundAddress:
                                fundAddress,

                            multisigAddress:
                                owner,

                            requiredSignatures:
                                Number(
                                    fund.requiredSignatures
                                ) || 1,

                            source:
                                "contract-multisig"
                        };
                    }

                } catch (multisigError) {

                    console.warn(
                        "[Dashboard] Multisig ownership check failed:",
                        multisigError
                    );
                }
            }

        } catch (error) {

            console.warn(
                `[Dashboard] EVM ownership check failed: ${netCfg.id}`,
                error
            );
        }
    }


    return {
        isOwner: false
    };
}


/*
 * ============================================================
 * بررسی اینکه پروژه روی حداقل یک شبکه خزانه دارد
 * ============================================================
 */

function projectHasFundOnNetwork(
    projectAttributes,
    netCfg
) {

    if (
        !projectAttributes ||
        !netCfg
    ) {
        return false;
    }


    const funds =
        projectAttributes.funds;

    if (
        !funds ||
        typeof funds !== "object"
    ) {
        return false;
    }


    const fundKey =
        netCfg.fundsKey;

    if (!fundKey) {
        return false;
    }


    const fund =
        funds[fundKey];

    if (
        !fund ||
        typeof fund !== "object"
    ) {
        return false;
    }


    const address =
        normalizeAddress(
            fund.address
        );


    return (
        address !== "" &&
        address.toLowerCase() !==
            "null"
    );
}


/*
 * ============================================================
 * بارگذاری پروژه‌ها
 * ============================================================
 */

async function loadProjects() {

    const loading =
        getElement("loading");

    try {

        const config =
            window.ClassChainNetworkConfig;

        if (!config) {

            throw new Error(
                "network-config.js لود نشده است."
            );
        }


        await config.ready;


        if (
            config.status !==
            "ready"
        ) {

            throw new Error(
                "تنظیمات شبکه آماده نیست."
            );
        }


        if (!userAddress) {

            throw new Error(
                "آدرس کیف پول مشخص نیست."
            );
        }


        if (loading) {

            loading.style.display =
                "block";

            loading.innerHTML =
                "<p>در حال بررسی پروژه‌ها...</p>";
        }


        /*
         * Projects.json
         */

        const response =
            await fetch(
                "data/Projects.json"
            );

        if (!response.ok) {

            throw new Error(
                "فایل Projects.json لود نشد."
            );
        }


        const data =
            await response.json();


        const features =
            Array.isArray(
                data.features
            )
                ? data.features
                : [];


        /*
         * فقط شبکه‌های active
         */

        const activeNetworks =
            config.getActiveNetworks();


        const myProjects = [];

        let checkedCount = 0;


        /*
         * ====================================================
         * بررسی پروژه‌ها
         * ====================================================
         */

        for (
            const feature of features
        ) {

            const attributes =
                feature?.attributes;


            if (!attributes) {
                continue;
            }


            const hasFund =
                activeNetworks.some(
                    net =>
                        projectHasFundOnNetwork(
                            attributes,
                            net
                        )
                );


            if (!hasFund) {
                continue;
            }


            checkedCount++;


            /*
             * شبکه‌هایی که این کاربر
             * مالک خزانه آن‌هاست.
             */

            const ownedNetworks = [];


            for (
                const net of activeNetworks
            ) {

                /*
                 * جلوگیری از بررسی شبکه
                 * نامرتبط با کیف پول
                 */

                if (
                    net.type === "EVM" &&
                    userAddressType !== "EVM"
                ) {
                    continue;
                }


                if (
                    net.type === "TVM" &&
                    userAddressType !== "TVM"
                ) {
                    continue;
                }


                const ownership =
                    await checkOwnershipOnNetwork(
                        attributes,
                        net,
                        userAddress,
                        userAddressType
                    );


                if (
                    ownership.isOwner
                ) {

                    ownedNetworks.push({

                        networkId:
                            net.id,

                        networkName:
                            net.name,

                        fundAddress:
                            ownership.fundAddress,

                        multisigAddress:
                            ownership.multisigAddress,

                        requiredSignatures:
                            ownership.requiredSignatures

                    });
                }
            }


            /*
             * این پروژه متعلق به این کیف پول نیست.
             */

            if (
                ownedNetworks.length === 0
            ) {
                continue;
            }


            /*
             * =================================================
             * موجودی
             *
             * فقط Reader مشترک
             * =================================================
             */

            let totalRaised = 0;
            let breakdown = [];


            if (
                window.ClassChainRaisedReader
            ) {

                try {

                    const result =
                        await window
                            .ClassChainRaisedReader
                            .getProjectRaisedUSDT(
                                attributes
                            );


                    totalRaised =
                        Number(
                            result?.total
                        ) || 0;


                    breakdown =
                        Array.isArray(
                            result?.breakdown
                        )
                            ? result.breakdown
                            : [];

                } catch (error) {

                    console.warn(
                        "[Dashboard] Raised reader failed:",
                        attributes.ProjectID,
                        error
                    );
                }

            } else {

                console.warn(
                    "[Dashboard] ClassChainRaisedReader لود نشده است."
                );
            }


            myProjects.push({

                id:
                    attributes.ProjectID,

                name:
                    attributes["نام پروژه"] ||
                    attributes.نام_پروژه ||
                    `پروژه ${attributes.ProjectID}`,

                totalRaised,

                breakdown,

                ownedNetworks,

                attributes

            });
        }


        /*
         * نمایش نتیجه
         */

        displayProjects(
            myProjects
        );


        /*
         * هیچ پروژه‌ای پیدا نشد
         */

        if (
            myProjects.length === 0
        ) {

            if (loading) {
                loading.style.display =
                    "none";
            }


            const noAccess =
                getElement("noAccess");


            if (noAccess) {

                noAccess.style.display =
                    "block";


                noAccess.innerHTML = `

                    <p>
                        هیچ پروژه‌ای پیدا نشد که
                        شما مالک خزانه آن باشید.
                    </p>

                    <p>
                        تعداد پروژه‌های دارای خزانه فعال بررسی‌شده:
                        ${checkedCount}
                    </p>

                    <p style="font-size:0.85em;opacity:0.7;">
                        آدرس کیف پول:
                        ${userAddress}
                    </p>

                `;
            }
        }


    } catch (error) {

        console.error(
            "[Dashboard] loadProjects error:",
            error
        );


        if (loading) {

            loading.style.display =
                "block";


            loading.innerHTML = `

                <p style="color:var(--danger);">
                    خطا در بارگذاری پروژه‌ها:
                </p>

                <p>
                    ${
                        error?.message ||
                        "مشکل ناشناخته"
                    }
                </p>

            `;
        }
    }
}


/*
 * ============================================================
 * نمایش پروژه‌ها
 * ============================================================
 */

function displayProjects(
    projectsList
) {

    const loading =
        getElement("loading");

    const container =
        getElement("projectsList");

    const noAccess =
        getElement("noAccess");


    if (loading) {
        loading.style.display =
            "none";
    }


    if (noAccess) {
        noAccess.style.display =
            "none";
    }


    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (
        !Array.isArray(
            projectsList
        ) ||
        projectsList.length === 0
    ) {

        if (noAccess) {
            noAccess.style.display =
                "block";
        }

        return;
    }


    projectsList.forEach(
        project => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "project-card";


            /*
             * Breakdown شبکه‌ها
             */

            let breakdownHtml =
                "";


            if (
                Array.isArray(
                    project.breakdown
                )
            ) {

                const parts =
                    project.breakdown
                        .filter(
                            item =>
                                Number(
                                    item?.amount
                                ) > 0
                        )
                        .map(
                            item =>
                                `<span style="font-size:0.8em;opacity:0.85;">` +
                                `${item.network}: ` +
                                `${Number(item.amount).toFixed(2)}` +
                                `</span>`
                        );


                if (
                    parts.length > 0
                ) {

                    breakdownHtml =
                        `
                        <div
                            class="project-info"
                            style="margin-top:4px;"
                        >
                            ${parts.join(" | ")}
                        </div>
                        `;
                }
            }


            /*
             * شبکه‌های تحت مالکیت
             */

            const networksLabel =
                project.ownedNetworks
                    .map(
                        network =>
                            network.networkName
                    )
                    .join("، ");


            card.innerHTML = `

                <div class="project-title">
                    ${project.name}
                </div>

                <div class="project-info">
                    آیدی: ${project.id}
                </div>

                <div class="project-info">
                    شبکه‌های تحت مالکیت شما:
                    ${networksLabel}
                </div>

                <div class="project-balance">
                    ${Number(
                        project.totalRaised
                    ).toFixed(2)}
                    USDT
                    (مجموع همه شبکه‌ها)
                </div>

                ${breakdownHtml}

                <a
                    href="manage-fund.html?project=${project.id}"
                    class="manage-btn"
                >
                    مدیریت خزانه‌ها
                </a>

            `;


            container.appendChild(
                card
            );
        }
    );
}


/*
 * ============================================================
 * اتصال دکمه‌ها
 * ============================================================
 */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const btnMeta =
            getElement(
                "btnMetaMask"
            );

        const btnTron =
            getElement(
                "btnTronLink"
            );


        if (btnMeta) {

            btnMeta.addEventListener(
                "click",
                connectMetaMask
            );
        }


        if (btnTron) {

            btnTron.addEventListener(
                "click",
                connectTronLink
            );
        }


        console.log(
            "[Dashboard] آماده شد."
        );
    }
);


/*
 * ============================================================
 * particles.js
 * ============================================================
 */

if (
    typeof particlesJS ===
    "function"
) {

    particlesJS(
        "particles-js",
        {
            "particles": {
                "number": {
                    "value": 100
                },

                "color": {
                    "value": [
                        "#4cc9f0",
                        "#8b5cf6",
                        "#7209b7"
                    ]
                },

                "shape": {
                    "type": "circle"
                },

                "opacity": {
                    "value": 0.5
                },

                "size": {
                    "value": 3
                },

                "line_linked": {
                    "enable": true,
                    "distance": 150,
                    "color": "#4cc9f0",
                    "opacity": 0.3,
                    "width": 1
                },

                "move": {
                    "enable": true,
                    "speed": 2
                }
            },

            "interactivity": {
                "detect_on": "canvas",

                "events": {
                    "onhover": {
                        "enable": true,
                        "mode": "grab"
                    },

                    "onclick": {
                        "enable": true,
                        "mode": "push"
                    }
                },

                "modes": {
                    "grab": {
                        "distance": 140,
                        "line_linked": {
                            "opacity": 0.7
                        }
                    },

                    "push": {
                        "particles_nb": 4
                    }
                }
            },

            "retina_detect": true
        }
    );
}
