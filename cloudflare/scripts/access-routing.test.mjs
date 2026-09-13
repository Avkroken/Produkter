import assert from "node:assert/strict";
import test from "node:test";

import { accessRoute } from "../app/src/access-routing.ts";

test("public and admin shells are served from Workers Assets", () => {
  for (const [method, pathname] of [
    ["GET", "/"],
    ["HEAD", "/"],
    ["GET", "/admin"],
    ["GET", "/admin/"],
    ["HEAD", "/admin"],
  ]) {
    assert.deepEqual(accessRoute(method, pathname), { type: "asset", pathname });
  }
});

test("all canonical admin APIs rewrite to existing handlers", () => {
  const cases = [
    ["GET", "/admin/api/stats", "/api/admin/stats"],
    ["POST", "/admin/api/accounts/abc/role", "/api/admin/accounts/abc/role"],
    ["POST", "/admin/api/sites/42", "/api/admin/sites/42"],
    ["GET", "/admin/api/settings", "/api/settings"],
    ["POST", "/admin/api/settings/key", "/api/settings/key"],
    ["DELETE", "/admin/api/settings/key/openai", "/api/settings/key/openai"],
    ["POST", "/admin/api/upload", "/api/upload"],
    ["GET", "/admin/api/jobs/abc/download", "/api/jobs/abc/download"],
    ["GET", "/admin/api/suggestions", "/api/suggestions"],
    ["PATCH", "/admin/api/suggestions/abc", "/api/suggestions/abc"],
  ];

  for (const [method, pathname, internal] of cases) {
    assert.deepEqual(accessRoute(method, pathname), { type: "rewrite", pathname: internal });
  }
});

test("old critical paths redirect to the single admin namespace", () => {
  assert.deepEqual(accessRoute("GET", "/admin/critical"), {
    type: "redirect",
    pathname: "/admin",
  });
  assert.deepEqual(accessRoute("POST", "/admin/critical/api/accounts/abc/role"), {
    type: "redirect",
    pathname: "/admin/api/accounts/abc/role",
  });
});

test("legacy privileged APIs redirect into /admin/api", () => {
  const cases = [
    ["GET", "/api/admin/accounts", "/admin/api/accounts"],
    ["POST", "/api/settings/key", "/admin/api/settings/key"],
    ["POST", "/api/admin/accounts/abc/role", "/admin/api/accounts/abc/role"],
    ["POST", "/api/admin/sites/42", "/admin/api/sites/42"],
    ["GET", "/api/jobs/abc/download", "/admin/api/jobs/abc/download"],
    ["GET", "/api/suggestions", "/admin/api/suggestions"],
    ["PATCH", "/api/suggestions/abc", "/admin/api/suggestions/abc"],
  ];

  for (const [method, pathname, target] of cases) {
    assert.deepEqual(accessRoute(method, pathname), { type: "redirect", pathname: target });
  }
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
