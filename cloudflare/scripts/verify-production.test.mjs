import assert from "node:assert/strict";
import test from "node:test";

import {
  productionProfile,
  validateProductionResponse,
} from "./verify-production.mjs";

test("only Workers with public HTTP checks have verification profiles", () => {
  assert.equal(productionProfile("app").name, "produkter");
  assert.equal(productionProfile("engine").name, "produkter-motor");
  assert.throws(() => productionProfile("processor"), /No public production verification profile/);
});

test("status smoke check fails closed", async () => {
  const check = { kind: "status", url: "https://example.invalid/", status: 200 };
  await validateProductionResponse(check, new Response("ok", { status: 200 }));
  await assert.rejects(
    validateProductionResponse(check, new Response("blocked", { status: 403 })),
    /expected 200/,
  );
});

test("JSON health check requires { ok: true }", async () => {
  const check = { kind: "json-ok", url: "https://example.invalid/health", status: 200 };
  await validateProductionResponse(check, new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  }));

  await assert.rejects(
    validateProductionResponse(check, new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })),
    /did not return/,
  );
});
