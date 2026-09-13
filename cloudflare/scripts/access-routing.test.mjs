import assert from "node:assert/strict";
import test from "node:test";

import { accessRoute } from "../app/src/access-routing.ts";

test("public and admin shells are served from Workers Assets without index redirect", () => {
  for (const [method, pathname] of [
    ["GET", "/"],
    ["HEAD", "/"],
    ["GET", "/admin"],
    ["GET", "/admin/"],
    ["HEAD", "/admin"],
    ["GET", "/admin/critical"],
    ["GET", "/admin/critical/"],
    ["HEAD", "/admin/critical"],
  ]) {
    assert.deepEqual(accessRoute(method, pathname), {
      type: "asset",
      pathname,
    });
  }
});

test("ordinary canonical admin API paths rewrite to existing handlers", () => {
  assert.deepEqual(accessRoute("GET", "/admin/api/stats"), {
    type: "rewrite",
    pathname: "/api/admin/stats",
  });
  assert.deepEqual(accessRoute("GET", "/admin/api/settings"), {
    type: "rewrite",
    pathname: "/api/settings",
  });
  assert.deepEqual(accessRoute("POST", "/admin/api/upload"), {
    type: "rewrite",
    pathname: "/api/upload",
  });
  assert.deepEqual(accessRoute("GET", "/admin/api/jobs/abc/download"), {
    type: "rewrite",
    pathname: "/api/jobs/abc/download",
  });
  assert.deepEqual(accessRoute("GET", "/admin/api/suggestions"), {
    type: "rewrite",
    pathname: "/api/suggestions",
  });
  assert.deepEqual(accessRoute("PATCH", "/admin/api/suggestions/abc"), {
    type: "rewrite",
    pathname: "/api/suggestions/abc",
  });
});

test("critical admin mutations are forced into /admin/critical", () => {
  const cases = [
    ["POST", "/admin/api/accounts/abc/role", "/admin/critical/api/accounts/abc/role"],
    ["POST", "/admin/api/sites/42", "/admin/critical/api/sites/42"],
    ["POST", "/admin/api/settings/key", "/admin/critical/api/settings/key"],
    ["DELETE", "/admin/api/settings/key/openai", "/admin/critical/api/settings/key/openai"],
  ];

  for (const [method, pathname, target] of cases) {
    assert.deepEqual(accessRoute(method, pathname), {
      type: "redirect",
      pathname: target,
    });
  }
});

test("critical canonical APIs rewrite to existing internal handlers", () => {
  assert.deepEqual(accessRoute("POST", "/admin/critical/api/accounts/abc/role"), {
    type: "rewrite",
    pathname: "/api/admin/accounts/abc/role",
  });
  assert.deepEqual(accessRoute("POST", "/admin/critical/api/sites/42"), {
    type: "rewrite",
    pathname: "/api/admin/sites/42",
  });
  assert.deepEqual(accessRoute("POST", "/admin/critical/api/settings/key"), {
    type: "rewrite",
    pathname: "/api/settings/key",
  });
  assert.deepEqual(accessRoute("DELETE", "/admin/critical/api/settings/key/openai"), {
    type: "rewrite",
    pathname: "/api/settings/key/openai",
  });
});

test("ordinary operations cannot remain in the critical namespace", () => {
  assert.deepEqual(accessRoute("GET", "/admin/critical/api/stats"), {
    type: "redirect",
    pathname: "/admin/api/stats",
  });
  assert.deepEqual(accessRoute("GET", "/admin/critical/api/settings"), {
    type: "redirect",
    pathname: "/admin/api/settings",
  });
});

test("legacy privileged APIs redirect into the correct Access namespace", () => {
  assert.deepEqual(accessRoute("GET", "/api/admin/accounts"), {
    type: "redirect",
    pathname: "/admin/api/accounts",
  });
  assert.deepEqual(accessRoute("POST", "/api/settings/key"), {
    type: "redirect",
    pathname: "/admin/critical/api/settings/key",
  });
  assert.deepEqual(accessRoute("POST", "/api/admin/accounts/abc/role"), {
    type: "redirect",
    pathname: "/admin/critical/api/accounts/abc/role",
  });
  assert.deepEqual(accessRoute("POST", "/api/admin/sites/42"), {
    type: "redirect",
    pathname: "/admin/critical/api/sites/42",
  });
  assert.deepEqual(accessRoute("GET", "/api/jobs/abc/download"), {
    type: "redirect",
    pathname: "/admin/api/jobs/abc/download",
  });
  assert.deepEqual(accessRoute("GET", "/api/suggestions"), {
    type: "redirect",
    pathname: "/admin/api/suggestions",
  });
  assert.deepEqual(accessRoute("PATCH", "/api/suggestions/abc"), {
    type: "redirect",
    pathname: "/admin/api/suggestions/abc",
  });
});

test("public and normal signed-in APIs stay outside the admin namespace", () => {
  for (const [method, pathname] of [
    ["POST", "/api/suggestions"],
    ["GET", "/api/catalog"],
    ["POST", "/api/produkt/42/describe"],
    ["GET", "/api/status"],
    ["GET", "/api/oauth/google"],
    ["GET", "/underlag"],
  ]) {
    assert.deepEqual(accessRoute(method, pathname), { type: "pass", pathname });
  }
});
