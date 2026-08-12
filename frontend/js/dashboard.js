// ==================== بارگذاری اطلاعات پایه پروژه ====================

async function loadProjectData() {

    const urlParams =
        new URLSearchParams(window.location.search);

    const projectId =
        urlParams.get('project');

    if (!projectId) {

        const title =
            document.getElementById('projectTitle');

        if (title) {
            title.innerText =
                'پروژه یافت نشد';
        }

        throw new Error(
            'شناسه پروژه در URL وجود ندارد'
        );
    }

    try {

        const response =
            await fetch('data/Projects.json');

        if (!response.ok) {

            throw new Error(
                'فایل Projects.json پیدا نشد'
            );
        }

        const data =
            await response.json();

        let foundProject = null;

        if (
            data.features &&
            Array.isArray(data.features)
        ) {

            for (
                const feature of data.features
            ) {

                if (
                    feature.attributes &&
                    String(
                        feature.attributes.ProjectID
                    ) === String(projectId)
                ) {

                    foundProject =
                        feature.attributes;

                    break;
                }
            }
        }

        if (!foundProject) {

            const title =
                document.getElementById(
                    'projectTitle'
                );

            if (title) {
                title.innerText =
                    'پروژه یافت نشد';
            }

            throw new Error(
                `پروژه ${projectId} پیدا نشد`
            );
        }

        /*
         * این متغیر منبع مشترک هر دو مسیر است.
         *
         * مسیر مالی:
         *     projects -> Fund addresses -> Balance
         *
         * مسیر مشارکت:
         *     projects -> Fund addresses -> DonorReader
         */
        projects =
            foundProject;


        // ============================
        // اطلاعات اصلی پروژه
        // ============================

        const titleEl =
            document.getElementById(
                'projectTitle'
            );

        if (titleEl) {

            titleEl.innerText =
                foundProject['نام پروژه'] ||
                'پروژه بدون نام';
        }


        const descEl =
            document.getElementById(
                'projectDesc'
            );

        if (descEl) {

            descEl.innerText =
                `${foundProject.استان || ''} - ` +
                `${foundProject.منطقه || ''} | ` +
                `${foundProject['تعداد کلاس'] || 0} کلاس`;
        }


        // ============================
        // Target
        // ============================

        const target =
            Number(
                foundProject[
                    'targetAmount(USDT)'
                ]
            ) || 0;


        // ============================
        // شبکه‌ها
        // ============================

        const select =
            document.getElementById(
                'networkSelect'
            );

        if (select) {

            select.innerHTML = '';

            const donationNetworks =
                networkConfig
                    .getDonationNetworks();

            donationNetworks.forEach(
                net => {

                    const opt =
                        document.createElement(
                            'option'
                        );

                    opt.value =
                        net.id;

                    const hasFund =
                        projectHasFundOnNetwork(
                            foundProject,
                            net
                        );

                    const isActive =
                        net.status === 'active' &&
                        net.enabled;

                    opt.textContent =
                        `${net.name} — ` +
                        `${net.walletName || 'کیف پول'}` +
                        `${
                            isActive && hasFund
                                ? ''
                                : ' (غیرفعال)'
                        }`;

                    opt.disabled =
                        !isActive ||
                        !hasFund;

                    select.appendChild(
                        opt
                    );
                }
            );


            /*
             * ترتیب انتخاب پیش‌فرض
             */
            const preferred =
                [
                    'amoy',
                    'tron',
                    'polygon'
                ].find(
                    id => {

                        const net =
                            networks[id];

                        if (!net) {
                            return false;
                        }

                        return (
                            net.status === 'active' &&
                            net.enabled &&
                            projectHasFundOnNetwork(
                                foundProject,
                                net
                            )
                        );
                    }
                );


            const firstEnabled =
                Array.from(
                    select.options
                ).find(
                    option =>
                        !option.disabled
                );


            const initialNetwork =
                preferred ||
                firstEnabled?.value ||
                null;


            if (initialNetwork) {

                select.value =
                    initialNetwork;

                selectNetwork(
                    initialNetwork
                );

            } else {

                selectedNetwork =
                    null;

                currentContract =
                    null;

                updateButtonState();
            }
        }


        return {
            project: foundProject,
            target: target
        };

    } catch (error) {

        console.error(
            '[Donate] خطا در بارگذاری اطلاعات پروژه:',
            error
        );

        const title =
            document.getElementById(
                'projectTitle'
            );

        if (title) {

            title.innerText =
                'خطا در بارگذاری پروژه';
        }

        throw error;
    }
}
