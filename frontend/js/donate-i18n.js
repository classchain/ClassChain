(function () {
    'use strict';

    const SUPPORTED = ['fa', 'en', 'ar'];
    const cache = {};
    let currentLang = document.documentElement.getAttribute('data-lang') || 'fa';
    const originalAlert = window.alert.bind(window);
    let translating = false;

    function normalizeLang(lang) {
        return SUPPORTED.includes(lang) ? lang : 'fa';
    }

    function getLang() {
        return normalizeLang(currentLang);
    }

    function interpolate(value, vars) {
        if (!vars) return value;
        return String(value).replace(/\{([^}]+)\}/g, (_, key) => vars[key] !== undefined ? vars[key] : _);
    }

    function t(key, vars) {
        const dict = cache[getLang()] || cache.fa || {};
        const value = dict[key] !== undefined ? dict[key] : (cache.fa?.[key] ?? key);
        return interpolate(value, vars);
    }

    function applyAttributes() {
        const dict = cache[getLang()] || cache.fa || {};
        document.documentElement.lang = getLang();
        document.documentElement.dir = dict.dir || (getLang() === 'en' ? 'ltr' : 'rtl');
        document.documentElement.dataset.lang = getLang();
        const langButton = document.getElementById('languageButton');
        if (langButton) {
            langButton.textContent = dict.langName || getLang().toUpperCase();
            langButton.setAttribute('aria-label', dict['language.aria'] || 'Language');
        }
        const menuButton = document.getElementById('mobileMenuButton');
        if (menuButton) menuButton.setAttribute('aria-label', dict['menu.aria'] || 'Menu');
        const brand = document.querySelector('.donate-brand');
        if (brand) brand.setAttribute('aria-label', dict['nav.homeAria'] || 'Home / ClassChain');
        document.title = dict.pageTitle || document.title;
    }

    function applyStatic() {
        const dict = cache[getLang()] || cache.fa || {};
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key] !== undefined) el.textContent = dict[key];
        });
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            if (dict[key] !== undefined) el.innerHTML = dict[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (dict[key] !== undefined) el.placeholder = dict[key];
        });
        document.querySelectorAll('[data-i18n-alt]').forEach(el => {
            const key = el.getAttribute('data-i18n-alt');
            if (dict[key] !== undefined) el.alt = dict[key];
        });
        document.querySelectorAll('[data-i18n-aria]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria');
            if (dict[key] !== undefined) el.setAttribute('aria-label', dict[key]);
        });
        applyAttributes();
    }

    function dynamicText(value) {
        if (!value || typeof value !== 'string') return value;
        let s = value;
        const exact = {
            'پروژه یافت نشد': 'project.notFound',
            'خطا در بارگذاری پروژه': 'project.error',
            'پروژه بدون نام': 'project.noName',
            'در حال خواندن موجودی از زنجیره...': 'progress.reading',
            'خواندن موجودی خزانه امکان‌پذیر نیست.': 'progress.unavailable',
            'در حال بارگذاری...': 'progress.loading',
            'در حال بارگذاری مشارکت‌کنندگان...': 'donors.loading',
            'لطفاً ایمیل معتبر وارد کنید و تأیید را بزنید': 'email.invalid',
            'ایمیل شما ثبت شد! آپدیت‌های پروژه برایتان ارسال خواهد شد ❤️': 'email.saved',
            'شناسه پروژه در URL وجود ندارد': 'dynamic.projectNoId',
            'فایل Projects.json پیدا نشد': 'dynamic.projectsMissing'
        };
        if (exact[s]) return t(exact[s]);
        return s
            .replace(/\(غیرفعال\)/g, `(${t('network.inactive')})`)
            .replace(/هنوز فعال نیست/g, t('payment.inactive'))
            .replace(/خزانه .*? هنوز راه‌اندازی نشده/g, t('payment.notReady'))
            .replace(/کیف پول/g, t('network.wallet'));
    }

    function formatNumber(value) {
        const n = Number(String(value).replace(/,/g, ''));
        if (!Number.isFinite(n)) return value;
        return n.toLocaleString(getLang() === 'en' ? 'en-US' : getLang() === 'ar' ? 'ar-EG' : 'fa-IR', { maximumFractionDigits: 2 });
    }

    function refreshDynamic() {
        if (translating) return;
        translating = true;
        try {
            const desc = document.getElementById('projectDesc');
            if (desc && desc.textContent) {
                const m = desc.textContent.match(/^(.+?)\s*-\s*(.+?)\s*\|\s*([\d٠-٩۰-۹,.]+)\s*(?:کلاس|classes|فصول|فصل)$/i);
                if (m) desc.textContent = t('project.meta', { province: m[1], region: m[2], classes: m[3] });
            }

            const progress = document.getElementById('progressText');
            if (progress && progress.textContent) {
                const m = progress.textContent.match(/([\d٠-٩۰-۹,.]+)\s*USDT.*?([\d٠-٩۰-۹,.]+)\s*USDT.*?([\d٠-٩۰-۹,.]+)\s*%?/);
                if (m) progress.textContent = t('progress.template', {
                    raised: formatNumber(m[1]), target: formatNumber(m[2]), percent: formatNumber(m[3])
                });
                else progress.textContent = dynamicText(progress.textContent);
            }

            const button = document.getElementById('connectBtn');
            const select = document.getElementById('networkSelect');
            if (select) {
                Array.from(select.options).forEach(option => {
                    const isTron = String(option.value).toLowerCase().includes('tron');
                    const wallet = isTron ? 'TronLink' : 'MetaMask';
                    const inactive = option.disabled ? ` (${t('network.inactive')})` : '';
                    option.textContent = `${isTron ? 'TRON' : 'Polygon'} — ${wallet}${inactive}`;
                });
            }
            if (button && !button.disabled) {
                const selected = select?.value || '';
                const isTron = selected.toLowerCase().includes('tron');
                button.textContent = isTron ? (getLang() === 'fa' ? 'اتصال TronLink و پرداخت' : getLang() === 'ar' ? 'اتصال TronLink والدفع' : 'Connect TronLink & pay')
                    : (getLang() === 'fa' ? 'اتصال MetaMask و پرداخت' : getLang() === 'ar' ? 'اتصال MetaMask والدفع' : 'Connect MetaMask & pay');
            }

            document.querySelectorAll('#projectTitle, #paymentStatusTitle, #donorsList, #txHash').forEach(el => {
                if (el.id === 'donorsList' || el.id === 'txHash') el.innerHTML = translateHtml(el.innerHTML);
                else if (el.textContent) el.textContent = dynamicText(el.textContent);
            });
        } finally {
            translating = false;
        }
    }

    function translateHtml(html) {
        if (!html) return html;
        const replacements = [
            ['مرحله ۱ از ۲ — اجازه انتقال کمک', getLang() === 'fa' ? 'مرحله ۱ از ۲ — اجازه انتقال کمک' : getLang() === 'ar' ? 'المرحلة 1 من 2 — السماح بالتحويل' : 'Step 1 of 2 — Allow transfer'],
            ['مرحله ۲ از ۲ — ثبت کمک', getLang() === 'fa' ? 'مرحله ۲ از ۲ — ثبت کمک' : getLang() === 'ar' ? 'المرحلة 2 من 2 — تسجيل المساهمة' : 'Step 2 of 2 — Record contribution'],
            ['در انتظار تأیید شما', t('payment.processing')],
            ['اجازه انتقال صادر شد', t('payment.processing')],
            ['در انتظار تأیید تراکنش واریز...', t('payment.processing')],
            ['پرداخت با موفقیت ثبت شد', t('payment.processing')],
            ['موجودی کافی نیست!', t('errors.insufficient')],
            ['خطا در تراکنش:', t('errors.title')],
            ['❌ شما تراکنش را لغو کردید.', t('errors.cancelled')],
            ['❌ موجودی کیف پول کافی نیست.', t('errors.insufficient')],
            ['❌ خطای نامشخص', t('errors.unknown')]
        ];
        return replacements.reduce((out, [from, to]) => out.split(from).join(to), html);
    }

    function load(lang) {
        lang = normalizeLang(lang);
        if (cache[lang]) return Promise.resolve(cache[lang]);
        return fetch(`../i18n/donate/${lang}.json`, { cache: 'no-store' })
            .then(r => { if (!r.ok) throw new Error(`Failed to load locale ${lang}`); return r.json(); })
            .then(dict => { cache[lang] = dict; return dict; });
    }

    function apply(lang) {
        lang = normalizeLang(lang);
        return load(lang).then(() => load('fa')).then(() => {
            currentLang = lang;
            try { localStorage.setItem('classchain-language', lang); } catch (e) {}
            applyStatic();
            refreshDynamic();
            document.documentElement.classList.add('i18n-ready');
            document.getElementById('languageMenu')?.classList.remove('open');
            document.getElementById('languageButton')?.setAttribute('aria-expanded', 'false');
        }).catch(err => console.error('[Donate i18n] language switch failed:', err));
    }

    window.ClassChainI18n = {
        getLang,
        t,
        apply,
        ready: load(currentLang).then(() => load('fa')).then(() => {
            applyStatic();
            document.documentElement.classList.add('i18n-ready');
            refreshDynamic();
        }).catch(err => {
            console.error('[Donate i18n] initialization failed:', err);
            document.documentElement.classList.add('i18n-ready');
        })
    };

    window.__classChainDonateTranslate = dynamicText;
    window.__classChainDonateTranslateHtml = translateHtml;
    window.alert = message => originalAlert(dynamicText(String(message)));

    const languageButton = document.getElementById('languageButton');
    const languageMenu = document.getElementById('languageMenu');
    languageButton?.addEventListener('click', e => {
        e.stopPropagation();
        const open = languageMenu?.classList.toggle('open');
        languageButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', e => {
        const option = e.target.closest('[data-language]');
        if (option) {
            e.preventDefault();
            e.stopPropagation();
            apply(option.getAttribute('data-language'));
            return;
        }
        if (languageMenu && !languageMenu.contains(e.target) && e.target !== languageButton) {
            languageMenu.classList.remove('open');
            languageButton?.setAttribute('aria-expanded', 'false');
        }
    });

    const mobileButton = document.getElementById('mobileMenuButton');
    const mobileMenu = document.getElementById('mobileMenu');
    mobileButton?.addEventListener('click', e => { e.stopPropagation(); mobileMenu?.classList.toggle('open'); });

    const observer = new MutationObserver(() => {
        if (cache.fa && !translating) refreshDynamic();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
