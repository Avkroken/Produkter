import type { D1SessionConstraint } from "../../shared/d1-session";

export function appD1SessionConstraint(method: string, pathname: string): D1SessionConstraint {
  if (method !== "GET") return "first-primary";
  if (pathname === "/api/catalog" || pathname === "/api/categories") return "first-unconstrained";
  if (/^\/api\/produkt\/\d+$/.test(pathname)) return "first-unconstrained";
  return "first-primary";
}
