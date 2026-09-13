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
    document.documentElement.classList.add('i18n-ready');
    document.documentElement.setAttribute('data-lang', lang);
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
            languageButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }

    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileMenu.classList.toggle('open');
        });
    }

    document.addEventListener('click', () => {
        if (languageMenu) languageMenu.classList.remove('open');
        if (languageButton) languageButton.setAttribute('aria-expanded', 'false');
    });

    const zoomToIran = () => {
        if (typeof window.zoomToIran === 'function') {
            window.zoomToIran();
            return;
        }
        // Fallback if Script-GIS not yet ready
        if (window.map && typeof window.map.setView === 'function') {
            window.map.setView([32.5, 53.5], 5);
        }
    };

    const mapBtn = document.getElementById('navMapBtn');
    const mapBtnMobile = document.getElementById('navMapBtnMobile');
    if (mapBtn) mapBtn.addEventListener('click', zoomToIran);
    if (mapBtnMobile) {
        mapBtnMobile.addEventListener('click', () => {
            zoomToIran();
            if (mobileMenu) mobileMenu.classList.remove('open');
        });
    }
}

(function bootGisHeader() {
    applyGisLanguage(resolveGisLanguage());
    bindGisHeader();
})();
