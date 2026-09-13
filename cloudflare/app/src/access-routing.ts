const ADMIN_API_PREFIX = "/admin/api/";
const CRITICAL_ADMIN_API_PREFIX = "/admin/critical/api/";
const LEGACY_ADMIN_API_PREFIX = "/api/admin/";

export type AccessRoute =
  | { type: "pass"; pathname: string }
  | { type: "rewrite"; pathname: string }
  | { type: "redirect"; pathname: string }
  | { type: "asset"; pathname: string };

function isCriticalLegacyRequest(method: string, pathname: string): boolean {
  const upperMethod = method.toUpperCase();

  if (upperMethod === "POST" && /^\/api\/admin\/accounts\/[^/]+\/role$/.test(pathname)) return true;
  if (upperMethod === "POST" && /^\/api\/admin\/sites\/\d+$/.test(pathname)) return true;
  if (upperMethod === "POST" && pathname === "/api/settings/key") return true;
  if (upperMethod === "DELETE" && /^\/api\/settings\/key\/[^/]+$/.test(pathname)) return true;

  return false;
}

function protectedPrefix(method: string, legacyPathname: string): string {
  return isCriticalLegacyRequest(method, legacyPathname) ? CRITICAL_ADMIN_API_PREFIX : ADMIN_API_PREFIX;
}

function canonicalForLegacy(method: string, pathname: string): string | null {
  const upperMethod = method.toUpperCase();

  if (pathname.startsWith(LEGACY_ADMIN_API_PREFIX)) {
    return `${protectedPrefix(method, pathname)}${pathname.slice(LEGACY_ADMIN_API_PREFIX.length)}`;
  }

  for (const root of ["settings", "upload", "jobs"]) {
    const prefix = `/api/${root}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return `${protectedPrefix(method, pathname)}${pathname.slice("/api/".length)}`;
    }
  }

  if (pathname === "/api/suggestions" && upperMethod === "GET") {
    return `${ADMIN_API_PREFIX}suggestions`;
  }

  if (/^\/api\/suggestions\/[^/]+$/.test(pathname) && upperMethod === "PATCH") {
    return `${ADMIN_API_PREFIX}${pathname.slice("/api/".length)}`;
  }

  return null;
}

function internalForCanonical(method: string, pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;

  const suffix = pathname.slice(prefix.length);
  if (!suffix) return null;

  const root = suffix.split("/", 1)[0];
  if (root === "settings" || root === "upload" || root === "jobs") {
    return `/api/${suffix}`;
  }

  const upperMethod = method.toUpperCase();
  if (root === "suggestions" && (upperMethod === "GET" || upperMethod === "PATCH")) {
    return `/api/${suffix}`;
  }

  return `/api/admin/${suffix}`;
}

function isSpaShellRequest(method: string, pathname: string): boolean {
  const upperMethod = method.toUpperCase();
  if (upperMethod !== "GET" && upperMethod !== "HEAD") return false;

  return pathname === "/"
    || pathname === "/admin"
    || pathname === "/admin/"
    || pathname === "/admin/critical"
    || pathname === "/admin/critical/";
}

export function accessRoute(method: string, pathname: string): AccessRoute {
  if (isSpaShellRequest(method, pathname)) {
    return { type: "asset", pathname: "/index.html" };
  }

  const criticalInternal = internalForCanonical(method, pathname, CRITICAL_ADMIN_API_PREFIX);
  if (criticalInternal) {
    const canonical = canonicalForLegacy(method, criticalInternal);
    if (canonical && canonical.startsWith(CRITICAL_ADMIN_API_PREFIX)) {
      return { type: "rewrite", pathname: criticalInternal };
    }
    if (canonical) return { type: "redirect", pathname: canonical };
  }

  const adminInternal = internalForCanonical(method, pathname, ADMIN_API_PREFIX);
  if (adminInternal) {
    const canonical = canonicalForLegacy(method, adminInternal);
    if (canonical && canonical.startsWith(CRITICAL_ADMIN_API_PREFIX)) {
      return { type: "redirect", pathname: canonical };
    }
    return { type: "rewrite", pathname: adminInternal };
  }

  const canonical = canonicalForLegacy(method, pathname);
  if (canonical) return { type: "redirect", pathname: canonical };

  return { type: "pass", pathname };
}
