import assert from "node:assert/strict";
import test from "node:test";

import { accessRoute } from "../app/src/access-routing.ts";

test("canonical admin API paths rewrite to existing handlers", () => {
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

test("legacy privileged APIs redirect into /admin", () => {
  assert.deepEqual(accessRoute("GET", "/api/admin/accounts"), {
    type: "redirect",
    pathname: "/admin/api/accounts",
  });
  assert.deepEqual(accessRoute("POST", "/api/settings/key"), {
    type: "redirect",
    pathname: "/admin/api/settings/key",
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
