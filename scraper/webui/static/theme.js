(() => {
  const themes = new Set(["legacy", "forest", "blackout"]);
  const fallback = "legacy";
  const storageKey = "avkroken.theme";
  const cookieName = "avkroken_theme";
  function savedTheme() {
    const entry = document.cookie.split("; ").find(value => value.startsWith(cookieName + "="));
    const cookie = entry ? entry.slice(cookieName.length + 1) : "";
    if (themes.has(cookie)) return cookie;
    try {
      const shared = localStorage.getItem(storageKey) || "";
      if (themes.has(shared)) return shared;
      const old = localStorage.getItem("theme") || "";
      if (old === "light" || old === "dark") return fallback;
    } catch {}
    return "";
  }
  function sharedCookieDomain() {
    const host = location.hostname.toLowerCase();
    if (!host || host === "localhost" || host.includes(":") || /^\d+(?:\.\d+){3}$/.test(host)) return "";
    const parts = host.split(".").filter(Boolean);
    if (parts.length < 2) return "";
    const commonSecondLevel = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
    const labels = parts.at(-1).length === 2 && commonSecondLevel.has(parts.at(-2)) && parts.length >= 3 ? 3 : 2;
    return "." + parts.slice(-labels).join(".");
  }
  function persist(theme) {
    try { localStorage.setItem(storageKey, theme); } catch {}
    const domain = sharedCookieDomain();
    const secure = location.protocol === "https:" ? "; Secure" : "";
    const base = cookieName + "=" + theme + "; Max-Age=31536000; Path=/; SameSite=Lax";
    if (domain) document.cookie = base + "; Domain=" + domain + secure;
    if (!document.cookie.split("; ").some(value => value.startsWith(cookieName + "="))) {
      document.cookie = base + secure;
    }
  }
  function apply(value, save = false) {
    const theme = themes.has(value) ? value : fallback;
    document.documentElement.dataset.theme = theme;
    document.documentElement.setAttribute("data-bs-theme", "dark");
    document.querySelectorAll("[data-theme-select]").forEach(select => { select.value = theme; });
    if (save) persist(theme);
  }
  const saved = savedTheme();
  apply(saved || fallback, Boolean(saved));
  addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-theme-select]").forEach(select => {
      select.value = document.documentElement.dataset.theme || fallback;
      select.addEventListener("change", () => apply(select.value, true));
    });
  });
})();
