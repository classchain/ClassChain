/* CLASSCHAIN — language loader + UI interactions */

const SUPPORTED_LANGS = ["fa", "en", "ar"];
const translations = {};
let currentLang = "fa";

const languageButton = document.getElementById("languageButton");
const languageMenu = document.getElementById("languageMenu");

async function loadTranslations() {
    const results = await Promise.all(
        SUPPORTED_LANGS.map(async (lang) => {
            const res = await fetch(`i18n/${lang}.json`, { cache: "no-cache" });
            if (!res.ok) throw new Error(`Failed to load i18n/${lang}.json`);
            translations[lang] = await res.json();
            return lang;
        })
    );
    return results;
}

function applyLanguage(lang) {
    if (!translations[lang]) lang = "fa";
    currentLang = lang;
    const dictionary = translations[lang];

    document.documentElement.lang = lang;
    document.documentElement.dir = dictionary.dir || "rtl";

    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.dataset.i18n;
        if (dictionary[key] === undefined) return;
        if (el.hasAttribute("data-i18n-html")) {
            el.innerHTML = dictionary[key];
        } else {
            el.textContent = dictionary[key];
        }
    });

    if (languageButton) languageButton.textContent = dictionary.langName || lang.toUpperCase();
    localStorage.setItem("classchain-language", lang);

    if (languageMenu) languageMenu.classList.remove("open");
    if (languageButton) languageButton.setAttribute("aria-expanded", "false");

    document.title =
        lang === "fa"
            ? "ClassChain | جامعه خیرین دیجیتال"
            : lang === "en"
              ? "ClassChain | Digital Donor Community"
              : "ClassChain | مجتمع المتبرعين الرقمي";

    document.querySelectorAll(".card-more-toggle").forEach((button) => {
        const card = button.closest(".info-card, .process-item");
        if (card && card.classList.contains("is-open")) {
            button.textContent = dictionary["why.less"] || button.textContent;
        } else {
            button.textContent = dictionary["why.more"] || button.textContent;
        }
    });
}

function bindUi() {
    document.querySelectorAll("[data-lang]").forEach((btn) => {
        btn.addEventListener("click", () => applyLanguage(btn.dataset.lang));
    });

    if (languageButton && languageMenu) {
        languageButton.addEventListener("click", (e) => {
            e.stopPropagation();
            const open = languageMenu.classList.toggle("open");
            languageButton.setAttribute("aria-expanded", String(open));
        });
        document.addEventListener("click", () => {
            languageMenu.classList.remove("open");
            languageButton.setAttribute("aria-expanded", "false");
        });
    }

    const mobileMenuButton = document.getElementById("mobileMenuButton");
    const mobileMenu = document.getElementById("mobileMenu");
    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener("click", () => mobileMenu.classList.toggle("open"));
        document.querySelectorAll(".mobile-menu a").forEach((link) => {
            link.addEventListener("click", () => mobileMenu.classList.remove("open"));
        });
    }

    document.querySelectorAll(".card-more-toggle").forEach((button) => {
        button.addEventListener("click", () => {
            const card = button.closest(".info-card, .process-item");
            if (!card) return;
            const panel = card.querySelector(".card-more, .process-more");
            if (!panel) return;
            const isOpen = card.classList.toggle("is-open");
            panel.hidden = !isOpen;
            button.setAttribute("aria-expanded", String(isOpen));
            const dict = translations[currentLang] || translations.fa || {};
            button.textContent = isOpen
                ? dict["why.less"] || "بستن"
                : dict["why.more"] || "بیشتر بدانید";
        });
    });
}

function resolveInitialLanguage() {
    const saved = localStorage.getItem("classchain-language");
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
    const browser = (navigator.language || "fa").toLowerCase();
    if (browser.startsWith("en")) return "en";
    if (browser.startsWith("ar")) return "ar";
    return "fa";
}

function initHeroNetwork() {
    const canvas = document.getElementById("heroNetwork");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let particles = [];
    let animationId = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const isMobile = () => window.innerWidth < 700;

    const config = {
        particleCount: 42,
        connectionDistance: 125,
        particleSpeed: 0.22,
        particleRadius: 2.2,
        lineWidth: 1.05,
        particleColor: "rgba(40, 115, 91, 0.42)",
        particleCore: "rgba(200, 155, 60, 0.55)",
        lineColor: "rgba(23, 72, 58, 0.1)",
        glowColor: "rgba(200, 155, 60, 0.12)",
    };

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (isMobile()) {
            config.particleCount = Math.max(18, Math.floor((width * height) / 28000));
            config.connectionDistance = 95;
            config.particleSpeed = 0.14;
            config.particleRadius = 1.7;
            config.lineWidth = 0.85;
        } else {
            config.particleCount = Math.max(28, Math.min(50, Math.floor((width * height) / 22000)));
            config.connectionDistance = 125;
            config.particleSpeed = 0.22;
            config.particleRadius = 2.2;
            config.lineWidth = 1.05;
        }
        createParticles();
    }

    function createParticles() {
        particles = [];
        for (let i = 0; i < config.particleCount; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * config.particleSpeed,
                vy: (Math.random() - 0.5) * config.particleSpeed,
                r: config.particleRadius * (0.7 + Math.random() * 0.8),
                isAccent: Math.random() < 0.18,
            });
        }
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        const gradient = ctx.createRadialGradient(
            width * 0.85,
            height * 0.15,
            0,
            width * 0.85,
            height * 0.15,
            width * 0.45
        );
        gradient.addColorStop(0, "rgba(234, 217, 168, 0.1)");
        gradient.addColorStop(1, "rgba(234, 217, 168, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const a = particles[i];
                const b = particles[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < config.connectionDistance) {
                    const alpha = 1 - dist / config.connectionDistance;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.strokeStyle = `rgba(23, 72, 58, ${0.06 + alpha * 0.12})`;
                    ctx.lineWidth = config.lineWidth;
                    ctx.stroke();
                }
            }
        }

        for (const p of particles) {
            if (p.isAccent) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * 3.5, 0, Math.PI * 2);
                ctx.fillStyle = config.glowColor;
                ctx.fill();
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.isAccent ? config.particleCore : config.particleColor;
            ctx.fill();
        }
    }

    function update() {
        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > width) p.vx *= -1;
            if (p.y < 0 || p.y > height) p.vy *= -1;
            p.x = Math.max(0, Math.min(width, p.x));
            p.y = Math.max(0, Math.min(height, p.y));
        }
    }

    function loop() {
        update();
        draw();
        animationId = requestAnimationFrame(loop);
    }

    function start() {
        resize();
        if (animationId) cancelAnimationFrame(animationId);
        loop();
    }

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (prefersReduced.matches) {
        resize();
        draw();
    } else {
        start();
        window.addEventListener("resize", () => {
            clearTimeout(window.__heroNetResize);
            window.__heroNetResize = setTimeout(start, 120);
        });
    }
}

(async function boot() {
    bindUi();
    initHeroNetwork();
    try {
        await loadTranslations();
        applyLanguage(resolveInitialLanguage());
    } catch (err) {
        console.error("i18n load failed:", err);
    }
})();
