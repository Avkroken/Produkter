(() => {
  const nativeFetch = window.fetch.bind(window);
  const adminApiPrefix = "/admin/api/";
  const criticalAdminApiPrefix = "/admin/critical/api/";
  const isAdminPage = () => location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const isCriticalAdminPage = () => location.pathname === "/admin/critical" || location.pathname.startsWith("/admin/critical/");

  function requestMethod(input, init) {
    return String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  }

  function isCriticalLegacyRequest(method, pathname) {
    if (method === "POST" && /^\/api\/admin\/accounts\/[^/]+\/role$/.test(pathname)) return true;
    if (method === "POST" && /^\/api\/admin\/sites\/\d+$/.test(pathname)) return true;
    if (method === "POST" && pathname === "/api/settings/key") return true;
    if (method === "DELETE" && /^\/api\/settings\/key\/[^/]+$/.test(pathname)) return true;
    return false;
  }

  function protectedPrefix(method, legacyPathname) {
    return isCriticalLegacyRequest(method, legacyPathname) ? criticalAdminApiPrefix : adminApiPrefix;
  }

  function canonicalAdminPath(method, pathname) {
    if (pathname.startsWith("/api/admin/")) {
      return `${protectedPrefix(method, pathname)}${pathname.slice("/api/admin/".length)}`;
    }

    for (const root of ["settings", "upload", "jobs"]) {
      const prefix = `/api/${root}`;
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        return `${protectedPrefix(method, pathname)}${pathname.slice("/api/".length)}`;
      }
    }

    if (pathname === "/api/suggestions" && method === "GET") {
      return "/admin/api/suggestions";
    }
    if (/^\/api\/suggestions\/[^/]+$/.test(pathname) && method === "PATCH") {
      return `/admin/api/${pathname.slice("/api/".length)}`;
    }

    return null;
  }

  function navigateAndStop(pathname) {
    location.replace(pathname);
    return new Promise(() => {});
  }

  function enterCriticalAdmin() {
    const target = new URL(location.href);
    target.pathname = "/admin/critical";
    location.assign(target.toString());
    return new Promise(() => {});
  }

  window.fetch = async (input, init) => {
    const method = requestMethod(input, init);
    let url;
    try {
      url = new URL(input instanceof Request ? input.url : String(input), location.href);
    } catch {
      return nativeFetch(input, init);
    }

    if (url.origin === location.origin) {
      const canonical = canonicalAdminPath(method, url.pathname);
      if (canonical) {
        if (canonical.startsWith(criticalAdminApiPrefix) && !isCriticalAdminPage()) {
          return enterCriticalAdmin();
        }
        url.pathname = canonical;
      }
    }

    const rewritten = input instanceof Request
      ? new Request(url.toString(), input)
      : url.toString();
    const response = await nativeFetch(rewritten, init);

    if (url.origin === location.origin && url.pathname === "/api/status" && response.ok) {
      const status = await response.clone().json().catch(() => null);
      if (status?.role === "admin" && !isAdminPage()) {
        return navigateAndStop(`/admin${location.search}`);
      }
      if (status?.role !== "admin" && isAdminPage()) {
        return navigateAndStop("/");
      }
    }

    if (url.origin === location.origin && url.pathname === "/logout" && response.ok && isAdminPage()) {
      return navigateAndStop("/");
    }

    return response;
  };

  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor) return;

    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;

    const canonical = canonicalAdminPath("GET", url.pathname);
    if (!canonical) return;

    event.preventDefault();
    url.pathname = canonical;
    location.href = url.toString();
  });
})();
