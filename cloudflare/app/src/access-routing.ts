const ADMIN_API_PREFIX = "/admin/api/";
const LEGACY_ADMIN_API_PREFIX = "/api/admin/";

export type AccessRoute =
  | { type: "pass"; pathname: string }
  | { type: "rewrite"; pathname: string }
  | { type: "redirect"; pathname: string };

function canonicalForLegacy(method: string, pathname: string): string | null {
  const upperMethod = method.toUpperCase();

  if (pathname.startsWith(LEGACY_ADMIN_API_PREFIX)) {
    return `${ADMIN_API_PREFIX}${pathname.slice(LEGACY_ADMIN_API_PREFIX.length)}`;
  }

  for (const root of ["settings", "upload", "jobs"]) {
    const prefix = `/api/${root}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return `${ADMIN_API_PREFIX}${pathname.slice("/api/".length)}`;
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

function internalForCanonical(method: string, pathname: string): string | null {
  if (!pathname.startsWith(ADMIN_API_PREFIX)) return null;

  const suffix = pathname.slice(ADMIN_API_PREFIX.length);
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

export function accessRoute(method: string, pathname: string): AccessRoute {
  const internal = internalForCanonical(method, pathname);
  if (internal) return { type: "rewrite", pathname: internal };

  const canonical = canonicalForLegacy(method, pathname);
  if (canonical) return { type: "redirect", pathname: canonical };

  return { type: "pass", pathname };
}
