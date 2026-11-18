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

const $ = (id) => document.getElementById(id);

function render(cfg) {
  $("enabled").checked = cfg.enabled;
  $("pageMode").checked = cfg.pageMode;
  $("keywords").value = cfg.keywords.join("\n");
}

function flash(msg) {
  $("status").textContent = msg;
  setTimeout(() => ($("status").textContent = ""), 1500);
}

chrome.storage.sync.get(DEFAULTS, render);

$("save").addEventListener("click", () => {
  const keywords = $("keywords").value.split("\n").map((s) => s.trim()).filter(Boolean);
  chrome.storage.sync.set(
    { enabled: $("enabled").checked, pageMode: $("pageMode").checked, keywords },
    () => flash("Enregistré ✓")
  );
});

$("reset").addEventListener("click", () => {
  chrome.storage.sync.set(DEFAULTS, () => {
    render(DEFAULTS);
    flash("Réinitialisé ✓");
  });
});
