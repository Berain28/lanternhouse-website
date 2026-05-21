/* =========================================================
   Lanternhouse Services — site script
   - bilingual EN/ID toggle (persists in localStorage)
   - scroll reveals, nav state, accordion, marquee dup
   ========================================================= */

(function () {
  const LS_KEY = "ls-lang";
  const SUPPORTED = ["en", "id"];

  function detectLang() {
    const saved = localStorage.getItem(LS_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
    const nav = (navigator.language || "en").toLowerCase();
    if (nav.startsWith("id")) return "id";
    return "en";
  }

  function applyLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = "en";
    const dict = (window.LS_I18N && window.LS_I18N[lang]) || {};
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (dict[k] !== undefined) el.textContent = dict[k];
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const k = el.getAttribute("data-i18n-html");
      if (dict[k] !== undefined) {
        el.innerHTML = dict[k];
        // re-split words inside if marked for split animation
        if (el.classList.contains("split-words")) {
          delete el.dataset.split;       // force re-split on lang change
          el.classList.remove("is-visible");
          splitWords(el);
        }
      }
    });
    document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      // format: "attr:key, attr:key"
      const spec = el.getAttribute("data-i18n-attr");
      spec.split(",").forEach((pair) => {
        const [attr, key] = pair.split(":").map((s) => s.trim());
        if (dict[key] !== undefined) el.setAttribute(attr, dict[key]);
      });
    });
    // update switch button state
    document.querySelectorAll(".lang-switch button").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.lang === lang);
    });
    localStorage.setItem(LS_KEY, lang);
    // re-observe new split-words (after innerHTML swap)
    observeReveals();
  }

  /* ---------- word-split helper for editorial headings ----------
     Split into per-word inline-block spans so each can rise from below.
     Recurse into inline elements (em, strong) so multi-word emphasis
     still wraps naturally — each word keeps its wrapping tag. */
  function splitWords(el) {
    if (el.dataset.split === "1") return;
    const out = [];
    const processNode = (node, wrapperTag) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parts = child.textContent.split(/(\s+)/);
          parts.forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) {
              out.push(document.createTextNode(p));
            } else {
              const word = document.createElement("span");
              word.className = "word";
              const inner = document.createElement("span");
              if (wrapperTag) {
                const wrap = document.createElement(wrapperTag);
                wrap.textContent = p;
                inner.appendChild(wrap);
              } else {
                inner.textContent = p;
              }
              word.appendChild(inner);
              out.push(word);
            }
          });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          processNode(child, child.tagName.toLowerCase());
        }
      });
    };
    processNode(el, null);
    el.innerHTML = "";
    out.forEach((n) => el.appendChild(n));
    el.dataset.split = "1";
  }

  /* ---------- reveal: IntersectionObserver + scroll fallback ---------- */
  let revealObserver = null;
  let revealNodes = [];

  function markVisible(el) {
    if (el.classList.contains("is-visible")) return;
    el.classList.add("is-visible");
  }

  function manualReveal() {
    const vh = window.innerHeight;
    const threshold = vh * 0.92;
    revealNodes.forEach((el) => {
      if (el.classList.contains("is-visible")) return;
      const r = el.getBoundingClientRect();
      if (r.top < threshold && r.bottom > 0) markVisible(el);
    });
    // garbage-collect
    revealNodes = revealNodes.filter((el) => !el.classList.contains("is-visible"));
  }

  function observeReveals() {
    const fresh = Array.from(document.querySelectorAll(
      ".reveal:not(.is-visible), .reveal-stagger:not(.is-visible), .split-words:not(.is-visible)"
    ));
    fresh.forEach((el) => {
      if (el.classList.contains("split-words")) splitWords(el);
      if (!revealNodes.includes(el)) revealNodes.push(el);
    });

    if ("IntersectionObserver" in window) {
      if (!revealObserver) {
        revealObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                markVisible(entry.target);
                revealObserver.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.1, rootMargin: "0px 0px -5% 0px" }
        );
      }
      fresh.forEach((el) => revealObserver.observe(el));
    }
    // run a manual pass for anything already in view
    manualReveal();
  }

  /* ---------- nav scroll state ---------- */
  function initNav() {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    // Insert a sibling backdrop the drawer can sit above. Sibling rather
    // than child so .nav's stacking context doesn't trap it.
    let backdrop = document.querySelector(".nav-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "nav-backdrop";
      nav.insertAdjacentElement("afterend", backdrop);
    }
    const onScroll = () => {
      nav.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // mobile toggle — keep the body scroll locked while open
    const toggle = nav.querySelector(".nav-toggle");
    const closeDrawer = () => {
      nav.classList.remove("is-open");
      document.body.classList.remove("nav-open");
      document.body.style.overflow = "";
    };
    const openDrawer = () => {
      nav.classList.add("is-open");
      document.body.classList.add("nav-open");
      document.body.style.overflow = "hidden";
    };
    if (toggle) {
      toggle.addEventListener("click", () => {
        nav.classList.contains("is-open") ? closeDrawer() : openDrawer();
      });
      nav.querySelectorAll(".nav-links a").forEach((a) => {
        a.addEventListener("click", closeDrawer);
      });
      backdrop.addEventListener("click", closeDrawer);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && nav.classList.contains("is-open")) closeDrawer();
      });
    }

    // active link based on current page
    const path = location.pathname.split("/").pop() || "index.html";
    nav.querySelectorAll(".nav-links a").forEach((a) => {
      const href = a.getAttribute("href");
      if (href === path || (path === "" && href === "index.html")) {
        a.classList.add("is-active");
      }
    });
  }

  /* ---------- lang switch wiring ---------- */
  function initLangSwitch() {
    document.querySelectorAll(".lang-switch button").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyLang(btn.dataset.lang);
      });
    });
  }

  /* ---------- accordion (services clusters) ---------- */
  function initAccordion() {
    document.querySelectorAll(".cluster").forEach((cluster, i) => {
      const head = cluster.querySelector(".cluster-head");
      if (!head) return;
      head.setAttribute("role", "button");
      head.setAttribute("tabindex", "0");
      const toggle = () => {
        const open = cluster.classList.toggle("is-open");
        head.setAttribute("aria-expanded", open ? "true" : "false");
      };
      head.addEventListener("click", toggle);
      head.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
      // open first by default
      if (i === 0) cluster.classList.add("is-open");
    });
  }

  /* ---------- marquee: duplicate track so it loops seamlessly ---------- */
  function initMarquee() {
    document.querySelectorAll(".marquee-track").forEach((track) => {
      if (track.dataset.dup === "1") return;
      const clone = track.innerHTML;
      track.innerHTML = clone + clone;
      track.dataset.dup = "1";
    });
  }

  /* ---------- light parallax for photo-accent ---------- */
  function initParallax() {
    const els = document.querySelectorAll("[data-parallax]");
    if (!els.length) return;
    let ticking = false;
    const update = () => {
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        if (r.bottom < 0 || r.top > vh) return;
        const factor = parseFloat(el.dataset.parallax) || 0.15;
        const center = r.top + r.height / 2;
        const offset = (center - vh / 2) * -factor;
        el.style.setProperty("--parallax-y", `${offset}px`);
      });
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ---------- boot ---------- */
  function boot() {
    initNav();
    initLangSwitch();
    initAccordion();
    initMarquee();
    initParallax();
    applyLang(detectLang());
    observeReveals();
    // scroll-based fallback for environments where IntersectionObserver
    // doesn't reliably fire (e.g. headless capture, programmatic scroll)
    let scrollPending = false;
    window.addEventListener("scroll", () => {
      if (!scrollPending) {
        scrollPending = true;
        window.requestAnimationFrame(() => {
          manualReveal();
          scrollPending = false;
        });
      }
    }, { passive: true });
    window.addEventListener("resize", manualReveal, { passive: true });
    // final safety net: after 4s, reveal anything still hidden
    setTimeout(() => {
      document.querySelectorAll(".reveal:not(.is-visible), .reveal-stagger:not(.is-visible), .split-words:not(.is-visible)")
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.top < window.innerHeight) markVisible(el);
        });
    }, 4000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
