(function () {
    'use strict';

    var SUPPORTED = ['fa', 'en', 'ar'];
    var cache = {};
    var currentLang = document.documentElement.getAttribute('data-lang') || 'fa';
    var originalAlert = window.alert.bind(window);

    function normalizeLang(lang) {
        return SUPPORTED.indexOf(lang) !== -1 ? lang : 'fa';
    }

    function getLang() {
        return normalizeLang(currentLang || document.documentElement.getAttribute('data-lang') || 'fa');
    }

    function interpolate(value, vars) {
        if (!vars) return value;
        return String(value).replace(/\{([^}]+)\}/g, function (_, key) {
            return vars[key] !== undefined ? vars[key] : _;
        });
    }

    function t(key, vars) {
        var dict = cache[getLang()] || cache.fa || {};
        var value = dict[key];
        if (value === undefined && cache.fa) value = cache.fa[key];
        return interpolate(value === undefined ? key : value, vars);
    }

    function setLanguageAttributes(lang) {
        currentLang = normalizeLang(lang);
        var dict = cache[currentLang] || cache.fa || {};
        document.documentElement.lang = currentLang;
        document.documentElement.dir = dict.dir || (currentLang === 'en' ? 'ltr' : 'rtl');
        document.documentElement.setAttribute('data-lang', currentLang);
        var button = document.getElementById('languageButton');
        if (button) {
            button.textContent = dict.langName || currentLang.toUpperCase();
            button.setAttribute('aria-label', dict['language.aria'] || 'Language');
        }
        var menuButton = document.getElementById('mobileMenuButton');
        if (menuButton) menuButton.setAttribute('aria-label', dict['menu.aria'] || 'Menu');
        var brand = document.querySelector('.donate-brand');
        if (brand) brand.setAttribute('aria-label', dict['nav.homeAria'] || 'Home / ClassChain');
        document.title = dict.pageTitle || document.title;
    }

    function applyStaticTranslations() {
        var dict = cache[getLang()] || cache.fa || {};
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            if (dict[key] !== undefined) el.textContent = dict[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-placeholder');
            if (dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
        });
        document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-alt');
            if (dict[key] !== undefined) el.setAttribute('alt', dict[key]);
        });
        setLanguageAttributes(getLang());
        document.documentElement.classList.add('i18n-ready');
    }

    function translateDynamicText(value) {
        if (!value || typeof value !== 'string') return value;
        var lang = getLang();
        var result = value;

        var exact = {
            'پروژه یافت نشد': 'project.notFound',
            'خطا در بارگذاری پروژه': 'project.error',
            'پروژه بدون نام': 'project.noName',
            'در حال خواندن موجودی از زنجیره...': 'progress.reading',
            'خواندن موجودی خزانه امکان‌پذیر نیست.': 'progress.unavailable',
            'در حال بارگذاری...': 'progress.loading',
            'لطفاً ایمیل معتبر وارد کنید و تأیید را بزنید': 'email.invalid',
            'ایمیل شما ثبت شد! آپدیت‌های پروژه برایتان ارسال خواهد شد ❤️': 'email.saved'
        };
        if (exact[result]) return t(exact[result]);

        result = result.replace(/\(غیرفعال\)/g, '(' + t('network.inactive') + ')');
        result = result.replace(/هنوز فعال نیست/g, t('payment.inactive'));
        result = result.replace(/خزانه .*? هنوز راه‌اندازی نشده/g, t('payment.notReady'));
        result = result.replace(/کیف پول/g, t('network.wallet'));

        return result;
    }

    function translateHtml(html) {
        if (!html || typeof html !== 'string') return html;
        var result = html;
        var replacements = [
            ['مرحله ۱ از ۲ — اجازه انتقال کمک', 'Step 1'],
            ['مرحله ۲ از ۲ — ثبت کمک', 'Step 2'],
            ['در انتظار تأیید شما', 'payment.processing'],
            ['اجازه انتقال صادر شد', 'payment.processing'],
            ['در انتظار تأیید تراکنش واریز...', 'payment.processing'],
            ['پرداخت با موفقیت ثبت شد', 'payment.processing'],
            ['پرداخت با موفقیت ثبت شد', 'payment.processing'],
            ['لطفاً تراکنش دوم را در', 'payment.processing'],
            ['لطفاً درخواست را در', 'payment.processing'],
            ['مشاهده Approve', 'errors.approved'],
            ['موجودی کافی نیست!', 'errors.insufficient'],
            ['خطا در تراکنش:', 'errors.title'],
            ['❌ شما تراکنش را لغو کردید.', 'errors.cancelled'],
            ['❌ موجودی کیف پول کافی نیست.', 'errors.insufficient'],
            ['❌ خطای نامشخص', 'errors.unknown']
        ];
        replacements.forEach(function (pair) {
            var needle = pair[0];
            var key = pair[1];
            var value = key.indexOf('.') !== -1 ? t(key) : needle;
            if (key === 'Step 1' || key === 'Step 2') {
                value = getLang() === 'fa' ? needle : (getLang() === 'ar' ? (key === 'Step 1' ? 'المرحلة 1 من 2 — السماح بالتحويل' : 'المرحلة 2 من 2 — تسجيل المساهمة') : (key === 'Step 1' ? 'Step 1 of 2 — Allow transfer' : 'Step 2 of 2 — Record contribution'));
            }
            result = result.split(needle).join(value);
        });
        return result;
    }

    function load(lang) {
        lang = normalizeLang(lang);
        if (cache[lang]) return Promise.resolve(cache[lang]);
        return fetch('i18n/donate/' + lang + '.json', { cache: 'no-store' })
            .then(function (response) {
                if (!response.ok) throw new Error('Failed to load Donate locale ' + lang);
                return response.json();
            })
            .then(function (dict) {
                cache[lang] = dict;
                return dict;
            });
    }

    function apply(lang) {
        lang = normalizeLang(lang);
        return load(lang).then(function () {
            return load('fa').then(function () {
                currentLang = lang;
                try { localStorage.setItem('classchain-language', lang); } catch (e) {}
                setLanguageAttributes(lang);
                applyStaticTranslations();
            });
        });
    }

    window.ClassChainI18n = {
        getLang: getLang,
        t: t,
        apply: apply,
        ready: load(currentLang).then(function () { return load('fa'); }).then(function () {
            applyStaticTranslations();
        })
    };

    window.__classChainDonateTranslate = function (value) {
        return translateDynamicText(value);
    };

    window.__classChainDonateTranslateHtml = function (html) {
        return translateHtml(html);
    };

    // Translate alert text emitted by the existing payment logic without changing wallet logic.
    window.alert = function (message) {
        originalAlert(translateDynamicText(String(message)));
    };

    document.addEventListener('click', function (event) {
        var languageButton = event.target.closest('[data-language]');
        if (languageButton) {
            apply(languageButton.getAttribute('data-language'));
        }
    });

    var observer = new MutationObserver(function (mutations) {
        if (!cache.fa) return;
        mutations.forEach(function (mutation) {
            if (mutation.type === 'characterData') {
                var translated = translateDynamicText(mutation.nodeValue);
                if (translated !== mutation.nodeValue) mutation.nodeValue = translated;
            }
            mutation.addedNodes.forEach(function (node) {
                if (node.nodeType !== 1) return;
                if (node.id === 'txHash' || node.id === 'paymentStatusTitle' || node.id === 'progressText' || node.id === 'projectTitle' || node.id === 'donorsList' || node.id === 'connectBtn' || node.id === 'networkSelect') {
                    if (node.id === 'txHash' || node.id === 'donorsList') node.innerHTML = translateHtml(node.innerHTML);
                    else node.textContent = translateDynamicText(node.textContent);
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener('DOMContentLoaded', function () {
        window.ClassChainI18n.ready.then(function () {
            applyStaticTranslations();
        });
    });
})();