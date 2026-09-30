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
  function persist(theme) {
    try { localStorage.setItem(storageKey, theme); } catch {}
    const denied = location.hostname === "denied.se" || location.hostname.endsWith(".denied.se");
    const domain = denied ? "; Domain=.denied.se" : "";
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = cookieName + "=" + theme + "; Max-Age=31536000; Path=/; SameSite=Lax" + domain + secure;
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
