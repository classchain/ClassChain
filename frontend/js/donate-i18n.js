/* Donate page i18n — aligned with Home (index.html / script.js) pattern */
(function () {
  'use strict';

  const SUPPORTED_LANGS = ['fa', 'en', 'ar'];
  const translations = {};
  let currentLang = 'fa';

  // Elements filled by donate.js — must not be reset by applyLanguage
  const DYNAMIC_IDS = new Set([
    'projectTitle',
    'projectDesc',
    'progressText',
    'progressFill',
    'userAddress',
    'paymentStatusTitle',
    'txHash',
    'donorsList',
    'connectBtn',
    'networkSelect',
    'qrcode',
  ]);

  const languageButton = document.getElementById('languageButton');
  const languageMenu = document.getElementById('languageMenu');

  function interpolate(value, vars) {
    if (!vars || value == null) return value;
    return String(value).replace(/\{([^}]+)\}/g, (_, key) =>
      vars[key] !== undefined ? vars[key] : `{${key}}`
    );
  }

  function t(key, vars) {
    const dict = translations[currentLang] || translations.fa || {};
    const value = dict[key] !== undefined ? dict[key] : (translations.fa && translations.fa[key]) || key;
    return interpolate(value, vars);
  }

  function isDynamic(el) {
    if (!el) return false;
    if (el.hasAttribute('data-i18n-dynamic')) return true;
    if (el.id && DYNAMIC_IDS.has(el.id)) return true;
    // Inside a dynamic container
    if (el.closest && el.closest('#donorsList, #projectDesc, #txHash')) return true;
    return false;
  }

  async function loadTranslations() {
    await Promise.all(
      SUPPORTED_LANGS.map(async (lang) => {
        const res = await fetch(`../i18n/donate/${lang}.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load i18n/donate/${lang}.json`);
        translations[lang] = await res.json();
      })
    );
  }

  function applyLanguage(lang) {
    if (!translations[lang]) lang = 'fa';
    currentLang = lang;
    const dictionary = translations[lang];

    document.documentElement.lang = lang;
    document.documentElement.dir = dictionary.dir || (lang === 'en' ? 'ltr' : 'rtl');
    document.documentElement.setAttribute('data-lang', lang);

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      if (isDynamic(el)) return;
      const key = el.getAttribute('data-i18n');
      if (dictionary[key] === undefined) return;
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = dictionary[key];
      } else {
        el.textContent = dictionary[key];
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      if (isDynamic(el)) return;
      const key = el.getAttribute('data-i18n-placeholder');
      if (dictionary[key] !== undefined) el.placeholder = dictionary[key];
    });

    document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
      const key = el.getAttribute('data-i18n-alt');
      if (dictionary[key] !== undefined) el.alt = dictionary[key];
    });

    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      if (dictionary[key] !== undefined) el.setAttribute('aria-label', dictionary[key]);
    });

    if (languageButton) {
      languageButton.textContent = dictionary.langName || lang.toUpperCase();
      if (dictionary['language.aria']) {
        languageButton.setAttribute('aria-label', dictionary['language.aria']);
      }
    }

    const mobileBtn = document.getElementById('mobileMenuButton');
    if (mobileBtn && dictionary['menu.aria']) {
      mobileBtn.setAttribute('aria-label', dictionary['menu.aria']);
    }

    const brand = document.querySelector('.donate-brand');
    if (brand && dictionary['nav.homeAria']) {
      brand.setAttribute('aria-label', dictionary['nav.homeAria']);
    }

    if (dictionary.pageTitle) {
      document.title = dictionary.pageTitle;
    }

    try {
      localStorage.setItem('classchain-language', lang);
    } catch (e) {}

    document.documentElement.classList.add('i18n-ready');

    if (languageMenu) languageMenu.classList.remove('open');
    if (languageButton) languageButton.setAttribute('aria-expanded', 'false');

    document.dispatchEvent(new CustomEvent('classchain:langchange', { detail: { lang } }));
  }

  function resolveInitialLanguage() {
    try {
      const saved = localStorage.getItem('classchain-language');
      if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
    } catch (e) {}
    const browser = (navigator.language || 'fa').toLowerCase();
    if (browser.startsWith('en')) return 'en';
    if (browser.startsWith('ar')) return 'ar';
    return 'fa';
  }

  function bindUi() {
    document.querySelectorAll('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => applyLanguage(btn.getAttribute('data-lang')));
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

    const mobileMenuButton = document.getElementById('mobileMenuButton');
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenuButton && mobileMenu) {
      mobileMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileMenu.classList.toggle('open');
      });
      mobileMenu.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => mobileMenu.classList.remove('open'));
      });
    }
  }

  window.DonateI18n = {
    t,
    getLang: () => currentLang,
    apply: applyLanguage,
    ready: null,
  };

  window.ClassChainI18n = window.DonateI18n;

  bindUi();

  window.DonateI18n.ready = (async function boot() {
    try {
      await loadTranslations();
      applyLanguage(resolveInitialLanguage());
    } catch (err) {
      console.error('[Donate i18n] load failed:', err);
      document.documentElement.classList.add('i18n-ready');
    }
  })();
})();
