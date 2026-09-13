/* ========== Header language + navigation (shared with landing) ========== */
const SUPPORTED_LANGS = ['fa', 'en', 'ar'];
const GIS_I18N = {
    fa: {
        dir: 'rtl',
        langName: 'FA',
        'nav.home': 'خانه',
        'nav.webgis': 'نقشه پروژه‌ها',
        'nav.cta': 'مشارکت'
    },
    en: {
        dir: 'ltr',
        langName: 'EN',
        'nav.home': 'Home',
        'nav.webgis': 'Project Map',
        'nav.cta': 'Contribute'
    },
    ar: {
        dir: 'rtl',
        langName: 'AR',
        'nav.home': 'الرئيسية',
        'nav.webgis': 'خريطة المشاريع',
        'nav.cta': 'ساهم الآن'
    }
};

function resolveGisLanguage() {
    const saved = localStorage.getItem('classchain-language');
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
    const browser = (navigator.language || 'fa').toLowerCase();
    if (browser.startsWith('en')) return 'en';
    if (browser.startsWith('ar')) return 'ar';
    return 'fa';
}

function applyGisLanguage(lang) {
    if (!GIS_I18N[lang]) lang = 'fa';
    const dictionary = GIS_I18N[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = dictionary.dir || 'rtl';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        if (dictionary[key] !== undefined) el.textContent = dictionary[key];
    });
    const languageButton = document.getElementById('languageButton');
    if (languageButton) languageButton.textContent = dictionary.langName || lang.toUpperCase();
    localStorage.setItem('classchain-language', lang);
    const languageMenu = document.getElementById('languageMenu');
    if (languageMenu) languageMenu.classList.remove('open');
    if (languageButton) languageButton.setAttribute('aria-expanded', 'false');
}

function bindGisHeader() {
    const languageButton = document.getElementById('languageButton');
    const languageMenu = document.getElementById('languageMenu');
    const mobileMenuButton = document.getElementById('mobileMenuButton');
    const mobileMenu = document.getElementById('mobileMenu');

    document.querySelectorAll('[data-lang]').forEach((btn) => {
        btn.addEventListener('click', () => applyGisLanguage(btn.dataset.lang));
    });

    if (languageButton && languageMenu) {
        languageButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = languageMenu.classList.toggle('open');
            languageButton.setAttribute('aria-expanded', String(open));
        });
        document.addEventListener('click', () => {
            languageMenu.classList.remove('open');
            languageButton.setAttribute('aria-expanded', 'false');
        });
    }

    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', () => mobileMenu.classList.toggle('open'));
        mobileMenu.querySelectorAll('a, button').forEach((el) => {
            el.addEventListener('click', () => mobileMenu.classList.remove('open'));
        });
    }

    const onMapNav = (e) => {
        e.preventDefault();
        if (typeof zoomToIran === 'function') zoomToIran();
        else if (window.zoomToIran) window.zoomToIran();
    };
    const navMapBtn = document.getElementById('navMapBtn');
    const navMapBtnMobile = document.getElementById('navMapBtnMobile');
    if (navMapBtn) navMapBtn.addEventListener('click', onMapNav);
    if (navMapBtnMobile) navMapBtnMobile.addEventListener('click', onMapNav);

    const syncDonateLinks = () => {
        const id = window.currentProjectId || (typeof currentProjectId !== 'undefined' ? currentProjectId : null);
        const href = id ? ('donate.html?project=' + encodeURIComponent(id)) : 'donate.html';
        ['navDonateLink', 'navDonateLinkMobile'].forEach((nid) => {
            const a = document.getElementById(nid);
            if (a) a.setAttribute('href', href);
        });
    };
    syncDonateLinks();
    setInterval(syncDonateLinks, 800);

    applyGisLanguage(resolveGisLanguage());
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindGisHeader);
} else {
    bindGisHeader();
}
