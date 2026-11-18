(() => {
  const DEFAULTS = {
    enabled: true,
    pageMode: true,
    keywords: [
      "gta 6",
      "gta6",
      "gta vi",
      "gtavi",
      "grand theft auto 6",
      "grand theft auto vi",
      "jason",
      "jason duval",
      "lucia",
      "lucia caminos",
      "vice city",
      "leonida",
      "leonida keys",
      "port gellhorn",
      "grassrivers",
      "rockstar",
      "rockstar games"
    ]
  };

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);
  const BLOCK_SELECTOR = [
    "article", '[role="article"]', '[data-testid="tweet"]', '[data-testid="cellInnerDiv"]',
    "ytd-rich-item-renderer", "ytd-video-renderer", "ytd-compact-video-renderer",
    "ytd-grid-video-renderer", "yt-lockup-view-model", "shreddit-post", "shreddit-comment",
    ".thing", "li", "tr", "figure", "p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "dt", "dd"
  ].join(",");
  const FALLBACK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,blockquote,span,a,div";
  const MAX_CONTAINER_TEXT = 1500;

  let cfg = { ...DEFAULTS };
  let regex = null;
  let observerStarted = false;

  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function buildRegex(keywords) {
    const parts = keywords
      .map((k) => norm(String(k)).trim())
      .filter(Boolean)
      .map((k) => k.split(/\s+/).map(escapeRe).join("[\\s\\-_.]*"));
    if (!parts.length) return null;
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join("|")})(?![\\p{L}\\p{N}])`, "iu");
  }

  function findContainer(node) {
    const start = node.nodeType === 3 ? node.parentElement : node;
    if (!start) return null;
    let el = start.closest(BLOCK_SELECTOR) || start;
    if (el === document.body || el === document.documentElement) el = start;
    if (el !== start && (el.textContent || "").length > MAX_CONTAINER_TEXT) {
      el = start.closest(FALLBACK_SELECTOR) || start;
    }
    if (el === document.body || el === document.documentElement) return null;
    return el;
  }

  function shield(el) {
    if (!el) return;
    if (el.hasAttribute("data-gta-revealed")) return;
    if (el.closest("[data-gta-shield]")) return;
    el.setAttribute("data-gta-shield", "1");
  }

  function checkText(textNode) {
    const v = textNode.nodeValue;
    if (!v || v.length < 3) return;
    if (regex.test(norm(v))) shield(findContainer(textNode));
  }

  function checkAttrs(el) {
    for (const a of ["alt", "title", "aria-label"]) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && regex.test(norm(v))) {
        shield(findContainer(el));
        return;
      }
    }
  }

  function scan(root) {
    if (!cfg.enabled || !regex || !root || !root.isConnected) return;
    if (root.nodeType === 3) {
      const p = root.parentElement;
      if (p && !SKIP_TAGS.has(p.tagName) && !p.isContentEditable) checkText(root);
      return;
    }
    if (root.nodeType !== 1) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) checkText(n);
    checkAttrs(root);
    root.querySelectorAll("[alt],[title],[aria-label]").forEach(checkAttrs);
  }

  function clearAll() {
    document.querySelectorAll("[data-gta-shield]").forEach((el) => el.removeAttribute("data-gta-shield"));
    document.querySelectorAll("[data-gta-revealed]").forEach((el) => el.removeAttribute("data-gta-revealed"));
    const ov = document.getElementById("gta-shield-page");
    if (ov) ov.remove();
  }

  // Clic sur un élément masqué : on l'affiche au lieu d'ouvrir le lien
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target instanceof Element ? e.target.closest("[data-gta-shield]") : null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      el.removeAttribute("data-gta-shield");
      el.setAttribute("data-gta-revealed", "1");
    },
    true
  );

  // Mode page : masque toute la page si le titre ou le chemin de l'URL parle du jeu
  function pageGuard() {
    if (!cfg.enabled || !cfg.pageMode || !regex) return;
    if (document.getElementById("gta-shield-page")) return;
    const key = "gta-shield-ok:" + location.origin + location.pathname;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch (_) {}
    let path = location.pathname;
    try { path = decodeURIComponent(path.replace(/\+/g, " ")); } catch (_) {}
    if (!regex.test(norm(document.title + " " + path))) return;
    if (!document.documentElement) return;

    document.querySelectorAll("video,audio").forEach((m) => { try { m.pause(); } catch (_) {} });

    const ov = document.createElement("div");
    ov.id = "gta-shield-page";
    ov.innerHTML =
      "<h1>Page masquée</h1>" +
      "<p>Cette page parle de GTA 6 et pourrait te spoiler.</p>" +
      '<div class="gta-shield-actions">' +
      '<button type="button" class="primary" data-act="back">Retour</button>' +
      '<button type="button" data-act="show">Afficher quand même</button>' +
      "</div>";
    ov.addEventListener("click", (e) => {
      const act = e.target instanceof Element && e.target.getAttribute("data-act");
      if (act === "show") {
        try { sessionStorage.setItem(key, "1"); } catch (_) {}
        ov.remove();
      } else if (act === "back") {
        if (history.length > 1) history.back();
        else window.close();
      }
    });
    document.documentElement.appendChild(ov);
  }

  // Observation des changements du DOM (scroll infini, SPA, etc.)
  const pending = new Set();
  let timer = null;
  function flush() {
    timer = null;
    pending.forEach((n) => scan(n));
    pending.clear();
  }
  function startObserver() {
    if (observerStarted) return;
    observerStarted = true;
    new MutationObserver((muts) => {
      if (!cfg.enabled || !regex) return;
      for (const m of muts) {
        if (m.type === "childList") m.addedNodes.forEach((n) => pending.add(n));
        else if (m.type === "characterData") pending.add(m.target);
      }
      if (!timer) timer = setTimeout(flush, 250);
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    // Titre de page (navigation sans rechargement)
    const watchTitle = () => {
      const t = document.querySelector("title");
      if (t) new MutationObserver(pageGuard).observe(t, { childList: true, characterData: true, subtree: true });
    };
    watchTitle();
    document.addEventListener("DOMContentLoaded", watchTitle);
  }

  function init(newCfg) {
    cfg = { ...DEFAULTS, ...newCfg };
    regex = buildRegex(cfg.keywords || []);
    clearAll();
    if (!cfg.enabled || !regex) return;
    startObserver();
    const run = () => {
      scan(document.body || document.documentElement);
      pageGuard();
    };
    if (document.body) run();
    document.addEventListener("DOMContentLoaded", run, { once: true });
    setTimeout(pageGuard, 1200);
  }

  chrome.storage.sync.get(DEFAULTS, init);
  chrome.storage.onChanged.addListener(() => chrome.storage.sync.get(DEFAULTS, init));
})();
