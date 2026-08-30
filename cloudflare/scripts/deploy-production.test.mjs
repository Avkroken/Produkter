import assert from "node:assert/strict";
import test from "node:test";

import {
  checkProduction,
  validateProductionResponse,
  workerFromCwd,
  workersBuildMetadata,
} from "./deploy-production.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";

test("Workers Builds production metadata requires main and a full commit SHA", () => {
  assert.deepEqual(workersBuildMetadata({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main", WORKERS_CI_COMMIT_SHA: SHA }), {
    commitSha: SHA,
  });
  assert.throws(
    () => workersBuildMetadata({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "dev", WORKERS_CI_COMMIT_SHA: SHA }),
    /expected main/,
  );
  assert.throws(
    () => workersBuildMetadata({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main", WORKERS_CI_COMMIT_SHA: "short" }),
    /valid WORKERS_CI_COMMIT_SHA/,
  );
});

test("manual deploy remains available outside Workers Builds", () => {
  assert.deepEqual(workersBuildMetadata({}), { commitSha: null });
});

test("Worker root selects the repository-specific production profile", () => {
  assert.equal(workerFromCwd("/repo/cloudflare/app").name, "produkter");
  assert.equal(workerFromCwd("/repo/cloudflare/engine").name, "produkter-motor");
  assert.equal(workerFromCwd("/repo/cloudflare/processor").name, "produkter-bearbetare");
  assert.throws(() => workerFromCwd("/repo/cloudflare/unknown"), /Unknown Worker root/);
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

test("queue-only processor does not invent a public health endpoint", async () => {
  let fetched = false;
  await checkProduction(workerFromCwd("/repo/cloudflare/processor"), {
    fetchImpl: async () => {
      fetched = true;
      throw new Error("should not fetch");
    },
    sleep: async () => {},
  });
  assert.equal(fetched, false);
});
