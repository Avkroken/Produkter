import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  deployGeneratedProductionConfig,
  preparePortableDeploy,
  runPortableBuildHook,
} from "./guard-portable-deploy.mjs";
import {
  buildLiveProductionConfig,
  deploymentUnit,
  PRODUCTION_WORKERS,
} from "./live-production-config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const units = ["app", "engine", "processor"];
const forbiddenProductionKeys = [
  "routes",
  "services",
  "d1_databases",
  "r2_buckets",
  "kv_namespaces",
  "queues",
  "vars",
  "triggers",
];

for (const unit of units) {
  test(unit + " tracked Wrangler config is preview-safe", () => {
    const configPath = path.join(here, "..", unit, "wrangler.jsonc");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.match(config.name, /-preview$/, configPath + " must target a preview-only Worker name");
    assert.equal(config.build?.command, "node ../scripts/guard-portable-deploy.mjs");
    assert.deepEqual(config.previews, {}, configPath + " must declare explicit previews");
    for (const key of forbiddenProductionKeys) {
      assert.equal(config[key], undefined, configPath + " must not track production key " + key);
    }
  });
}

test("portable config remains preview-safe outside main Workers Builds", async () => {
  assert.deepEqual(await preparePortableDeploy({ env: {}, writeConfig: false }), { mode: "local" });
  assert.deepEqual(
    await preparePortableDeploy({
      env: { WORKERS_CI: "1", WORKERS_CI_BRANCH: "codex/example" },
      writeConfig: false,
    }),
    { mode: "preview", branch: "codex/example" },
  );
  await assert.rejects(
    preparePortableDeploy({ env: { WORKERS_CI: "1" }, writeConfig: false }),
    /WORKERS_CI_BRANCH/,
  );
});

const liveBindings = {
  app: [
    { name: "ASSETS", type: "assets" },
    { name: "DB", type: "d1", id: "11111111-1111-4111-8111-111111111111" },
    { name: "ENGINE", type: "service", service: "produkter-motor" },
    { name: "JOB_QUEUE", type: "queue", queue_name: "produkter-jobb" },
    { name: "SESSIONS", type: "kv_namespace", namespace_id: "a".repeat(32) },
    { name: "UPLOADS", type: "r2_bucket", bucket_name: "produkter-uppladdningar" },
    { name: "PUBLIC_APP_URL", type: "plain_text", text: "https://should-not-be-copied.example" },
    { name: "TURNSTILE_SECRET", type: "secret_text" },
  ],
  engine: [
    { name: "AI", type: "ai" },
    { name: "DB", type: "d1", id: "11111111-1111-4111-8111-111111111111" },
    { name: "SCHEDULE_LIMIT", type: "plain_text", text: "200" },
    { name: "INGEST_API_KEY", type: "secret_text" },
  ],
  processor: [
    { name: "DB", type: "d1", id: "11111111-1111-4111-8111-111111111111" },
    { name: "JOB_QUEUE", type: "queue", queue_name: "produkter-jobb" },
    { name: "UPLOADS", type: "r2_bucket", bucket_name: "produkter-uppladdningar" },
    { name: "PROVIDER_CONFIG_KEY", type: "secret_text" },
  ],
};

const liveDomains = [
  { service: "produkter", hostname: "produkter.example.test", environment: "production" },
  { service: "produkter-motor", hostname: "motor.example.test", environment: "production" },
];

for (const unit of units) {
  test(unit + " production config reuses explicit live resources without copying vars or secrets", () => {
    const config = buildLiveProductionConfig(unit, liveBindings[unit], liveDomains);
    assert.equal(config.name, PRODUCTION_WORKERS[unit]);
    assert.equal(config.keep_vars, true);
    assert.equal(config.vars, undefined);
    assert.equal(config.build, undefined);
    assert.equal(JSON.stringify(config).includes("should-not-be-copied"), false);
    assert.equal(JSON.stringify(config).includes("TURNSTILE_SECRET"), false);
    assert.equal(JSON.stringify(config).includes("INGEST_API_KEY"), false);
    assert.equal(JSON.stringify(config).includes("PROVIDER_CONFIG_KEY"), false);

    if (unit === "app") {
      assert.deepEqual(config.routes, [{ pattern: "produkter.example.test", custom_domain: true }]);
    } else if (unit === "engine") {
      assert.deepEqual(config.routes, [{ pattern: "motor.example.test", custom_domain: true }]);
    } else {
      assert.equal(config.routes, undefined);
    }
  });
}

test("production config fails closed when live resources or domains are incomplete", () => {
  assert.throws(
    () => buildLiveProductionConfig(
      "app",
      liveBindings.app.filter(binding => binding.name !== "SESSIONS"),
      liveDomains,
    ),
    /SESSIONS/,
  );
  assert.throws(
    () => buildLiveProductionConfig(
      "processor",
      liveBindings.processor.filter(binding => binding.name !== "DB"),
      liveDomains,
    ),
    /DB/,
  );
  assert.throws(
    () => buildLiveProductionConfig(
      "app",
      liveBindings.app,
      liveDomains.filter(domain => domain.service !== "produkter"),
    ),
    /custom domain/,
  );
  assert.throws(
    () => buildLiveProductionConfig(
      "processor",
      liveBindings.processor,
      [...liveDomains, { service: "produkter-bearbetare", hostname: "processor.example.test" }],
    ),
    /ska inte ha custom domain/,
  );
});

function syntheticFetch(url) {
  const text = String(url);
  if (text.includes("/accounts?")) {
    return Promise.resolve(new Response(JSON.stringify({
      success: true,
      result: [{ id: "account-1" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  }
  if (text.endsWith("/workers/scripts/produkter/settings")) {
    return Promise.resolve(new Response(JSON.stringify({
      success: true,
      result: { bindings: liveBindings.app },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  }
  if (text.endsWith("/workers/domains/records")) {
    return Promise.resolve(new Response(JSON.stringify({
      success: true,
      result: liveDomains,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  }
  return Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 404 }));
}

test("main Workers Build generates production config from live state", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "produkter-live-config-"));
  const cwd = path.join(root, "app");
  fs.mkdirSync(cwd, { recursive: true });

  const result = await preparePortableDeploy({
    env: { WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" },
    cwd,
    fetchImpl: syntheticFetch,
    tokenResolver: () => "synthetic-token",
    migrationChangesResolver: () => [],
  });

  assert.equal(result.mode, "production");
  assert.equal(result.unit, "app");
  assert.equal(result.workerName, "produkter");

  const config = JSON.parse(fs.readFileSync(path.join(cwd, "wrangler.production.jsonc"), "utf8"));
  assert.equal(config.name, "produkter");
  assert.equal(config.keep_vars, true);
  assert.deepEqual(config.routes, [{ pattern: "produkter.example.test", custom_domain: true }]);
  assert.equal(fs.existsSync(path.join(cwd, ".wrangler/deploy/config.json")), false);
});

test("main Workers Build rejects D1 migration changes before provider reads", async () => {
  await assert.rejects(
    preparePortableDeploy({
      env: { WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" },
      cwd: "/repo/cloudflare/app",
      fetchImpl: async () => {
        throw new Error("provider read should not run");
      },
      tokenResolver: () => "synthetic-token",
      migrationChangesResolver: () => ["cloudflare/migrations/0008_schema.sql"],
      writeConfig: false,
    }),
    /D1-migrationsändringar/,
  );
});

test("main build hook deploys generated production config before outer preview deploy", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "produkter-live-deploy-"));
  const cwd = path.join(root, "app");
  fs.mkdirSync(cwd, { recursive: true });
  const calls = [];

  const result = await runPortableBuildHook({
    env: { WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" },
    cwd,
    fetchImpl: syntheticFetch,
    tokenResolver: () => "synthetic-token",
    migrationChangesResolver: () => [],
    deployRunner: args => calls.push(args),
  });

  assert.equal(result.mode, "production");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cwd, cwd);
  assert.equal(calls[0].productionConfigPath, path.join(cwd, "wrangler.production.jsonc"));
  assert.equal(calls[0].accountId, "account-1");
});

test("production deploy runner uses only generated config and fails closed on child failure", () => {
  let seen;
  deployGeneratedProductionConfig({
    cwd: "/repo/cloudflare/app",
    productionConfigPath: "/repo/cloudflare/app/wrangler.production.jsonc",
    env: { WORKERS_CI: "1" },
    accountId: "account-1",
    runner: (command, args, options) => {
      seen = { command, args, options };
      return { status: 0 };
    },
  });

  assert.equal(seen.command, "npx");
  assert.deepEqual(seen.args, [
    "wrangler",
    "deploy",
    "--config",
    "/repo/cloudflare/app/wrangler.production.jsonc",
  ]);
  assert.equal(seen.options.env.CLOUDFLARE_ACCOUNT_ID, "account-1");

  assert.throws(
    () => deployGeneratedProductionConfig({
      cwd: "/repo/cloudflare/app",
      productionConfigPath: "/repo/cloudflare/app/wrangler.production.jsonc",
      accountId: "account-1",
      runner: () => ({ status: 1 }),
    }),
    /production-deploy misslyckades/,
  );
});

test("deploy root must be one of the three Cloudflare units", () => {
  assert.equal(deploymentUnit("/repo/cloudflare/app"), "app");
  assert.equal(deploymentUnit("/repo/cloudflare/engine"), "engine");
  assert.equal(deploymentUnit("/repo/cloudflare/processor"), "processor");
  assert.throws(() => deploymentUnit("/repo/cloudflare/unknown"), /oväntad root directory/);
});

test("app preview config retains only public static assets", () => {
  const configPath = path.join(here, "..", "app", "wrangler.jsonc");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.assets?.directory, "./public");
  assert.equal(config.assets?.binding, "ASSETS");
});
