import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  deployGeneratedProductionConfig,
  migrationChangesSinceParent,
  preparePortableDeploy,
  runPortableBuildHook,
} from "./guard-portable-deploy.mjs";
import {
  buildLiveProductionConfig,
  deploymentUnit,
  PRODUCTION_WORKERS,
  productionWorkers,
  resolveProductionBindings,
} from "./live-production-config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const units = ["app", "engine", "processor"];
const previewWorkers = {
  app: "produkter-preview",
  engine: "produkter-motor-preview",
  processor: "produkter-bearbetare-preview",
};
const outerKeepBindingTypes = [
  "plain_text",
  "json",
  "secret_text",
  "secret_key",
  "d1",
  "service",
  "queue",
  "kv_namespace",
  "r2_bucket",
  "ai",
];
const expectedObservability = {
  enabled: true,
  head_sampling_rate: 0.1,
  redact_query_string: true,
  logs: {
    enabled: true,
    head_sampling_rate: 0.1,
    invocation_logs: true,
    persist: true,
  },
  traces: {
    enabled: true,
    head_sampling_rate: 0.01,
    persist: true,
  },
};
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
  test(unit + " tracked Wrangler config matches the connected production Worker and preserves live state", () => {
    const configPath = path.join(here, "..", unit, "wrangler.jsonc");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(config.name, PRODUCTION_WORKERS[unit], configPath + " must match the connected production Worker");
    assert.equal(
      config.build?.command,
      "node ../scripts/guard-portable-deploy.mjs --require-workers-ci",
    );
    assert.deepEqual(config.previews, {}, configPath + " must declare explicit previews");
    assert.equal(config.keep_vars, true, configPath + " must preserve live vars on the outer main deploy");
    assert.deepEqual(
      config.unsafe?.metadata?.keep_bindings,
      outerKeepBindingTypes,
      configPath + " must preserve all production binding types on the outer main deploy",
    );
    assert.equal(config.unsafe?.bindings, undefined, configPath + " must not name individual live bindings");
    assert.deepEqual(
      config.observability,
      expectedObservability,
      configPath + " must preserve production observability on the outer main deploy",
    );
    for (const key of forbiddenProductionKeys) {
      assert.equal(config[key], undefined, configPath + " must not track concrete production key " + key);
    }

    const previewPath = path.join(here, "..", unit, "wrangler.preview.jsonc");
    const preview = JSON.parse(fs.readFileSync(previewPath, "utf8"));
    assert.equal(preview.name, previewWorkers[unit], previewPath + " must use the isolated preview Worker");
    assert.equal(preview.build, undefined, previewPath + " must not run the production build hook");
    assert.equal(preview.main, config.main);
    assert.deepEqual(preview.observability, expectedObservability);
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

test("production Worker names support environment overrides without duplicating defaults", () => {
  assert.deepEqual(productionWorkers({}), PRODUCTION_WORKERS);
  assert.deepEqual(
    productionWorkers({ CLOUDFLARE_WORKER_APP: "catalog" }),
    {
      app: "catalog",
      engine: "catalog-motor",
      processor: "catalog-bearbetare",
    },
  );
  assert.deepEqual(
    productionWorkers({
      CLOUDFLARE_WORKER_APP: "catalog",
      CLOUDFLARE_WORKER_ENGINE: "describe-worker",
      CLOUDFLARE_WORKER_PROCESSOR: "queue-worker",
    }),
    {
      app: "catalog",
      engine: "describe-worker",
      processor: "queue-worker",
    },
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
    { name: "TURNSTILE_HOSTNAMES", type: "plain_text", text: "produkter.example.test" },
    { name: "TURNSTILE_SITE_KEY", type: "plain_text", text: "public-site-key" },
    { name: "TURNSTILE_SECRET", type: "secret_text", text: "must-not-be-copied" },
  ],
  engine: [
    { name: "AI", type: "ai" },
    { name: "DB", type: "d1", id: "11111111-1111-4111-8111-111111111111" },
    { name: "SCHEDULE_LIMIT", type: "plain_text", text: "200" },
    { name: "DESCRIBE_LIMIT", type: "plain_text", text: "10" },
    { name: "DESCRIBE_WORKERS", type: "plain_text", text: "2" },
    { name: "INGEST_API_KEY", type: "secret_text", text: "must-not-be-copied" },
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

const strippedBindings = {
  app: [
    { name: "ASSETS", type: "assets" },
    { name: "TURNSTILE_SECRET", type: "secret_text", text: "never-copy" },
  ],
  engine: [
    { name: "INGEST_API_KEY", type: "secret_text", text: "never-copy" },
  ],
  processor: [
    { name: "PROVIDER_CONFIG_KEY", type: "secret_text", text: "never-copy" },
  ],
};

function historicalRecoveryFetch(workerName, unit, versions = [
  { id: "broken", number: 42, bindings: strippedBindings[unit] },
  { id: "complete", number: 41, bindings: liveBindings[unit] },
], deploymentVersionIds = ["broken", "complete"]) {
  return async url => {
    const text = String(url);
    if (text.includes("/workers/scripts/" + workerName + "/deployments")) {
      return new Response(JSON.stringify({
        success: true,
        result: {
          deployments: deploymentVersionIds.map(versionId => ({
            versions: [{ version_id: versionId, percentage: 100 }],
          })),
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (text.includes("/workers/workers/" + workerName + "/versions")) {
      return new Response(JSON.stringify({
        success: true,
        result: versions,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: false }), { status: 404 });
  };
}

for (const unit of units) {
  test(unit + " backfills stripped production bindings from the latest complete deployed Worker version", async () => {
    const workerName = PRODUCTION_WORKERS[unit];
    const state = await resolveProductionBindings({
      unit,
      workerName,
      currentBindings: strippedBindings[unit],
      token: "synthetic-token",
      accountId: "account-1",
      fetchImpl: historicalRecoveryFetch(workerName, unit),
    });

    assert.equal(state.source, "historical_deployment_backfill");
    assert.equal(state.versionNumber, 41);
    assert.ok(state.missing.length > 0);
    const serialized = JSON.stringify(state.vars || {});
    assert.equal(serialized.includes("never-copy"), false);

    const config = buildLiveProductionConfig(
      unit,
      state.bindings,
      liveDomains,
      { vars: state.vars },
    );
    assert.equal(JSON.stringify(config).includes("never-copy"), false);
    if (unit === "app") {
      assert.equal(config.vars.PUBLIC_APP_URL, "https://should-not-be-copied.example");
      assert.equal(config.vars.TURNSTILE_SITE_KEY, "public-site-key");
    } else if (unit === "engine") {
      assert.equal(config.vars.SCHEDULE_LIMIT, "200");
      assert.equal(config.vars.DESCRIBE_LIMIT, "10");
    } else {
      assert.equal(config.vars, undefined);
    }
  });
}

test("partial recovery preserves surviving live bindings and vars", async () => {
  const currentDatabaseId = "22222222-2222-4222-8222-222222222222";
  const currentUrl = "https://current.example.test";
  const currentBindings = liveBindings.app
    .filter(binding => binding.name !== "JOB_QUEUE")
    .map(binding => {
      if (binding.name === "DB") return { ...binding, id: currentDatabaseId };
      if (binding.name === "PUBLIC_APP_URL") return { ...binding, text: currentUrl };
      return binding;
    });

  const state = await resolveProductionBindings({
    unit: "app",
    workerName: PRODUCTION_WORKERS.app,
    currentBindings,
    token: "synthetic-token",
    accountId: "account-1",
    fetchImpl: historicalRecoveryFetch(PRODUCTION_WORKERS.app, "app"),
  });

  assert.deepEqual(state.missing, ["JOB_QUEUE (queue)"]);
  assert.equal(
    state.bindings.find(binding => binding.name === "DB" && binding.type === "d1").id,
    currentDatabaseId,
  );
  assert.equal(
    state.bindings.find(binding => binding.name === "PUBLIC_APP_URL").text,
    currentUrl,
  );
  assert.equal(
    state.bindings.find(binding => binding.name === "JOB_QUEUE").queue_name,
    "produkter-jobb",
  );
  assert.equal(state.vars.PUBLIC_APP_URL, currentUrl);
});

test("recovery ignores complete versions that were uploaded but never deployed", async () => {
  const workerName = PRODUCTION_WORKERS.app;
  const versions = [
    { id: "uploaded-only", number: 43, bindings: liveBindings.app },
    { id: "broken-deployed", number: 42, bindings: strippedBindings.app },
    { id: "complete-deployed", number: 41, bindings: liveBindings.app },
  ];
  const state = await resolveProductionBindings({
    unit: "app",
    workerName,
    currentBindings: strippedBindings.app,
    token: "synthetic-token",
    accountId: "account-1",
    fetchImpl: historicalRecoveryFetch(
      workerName,
      "app",
      versions,
      ["broken-deployed", "complete-deployed"],
    ),
  });

  assert.equal(state.versionNumber, 41);
});

test("production binding recovery fails closed when no complete deployed Worker version exists", async () => {
  await assert.rejects(
    resolveProductionBindings({
      unit: "app",
      workerName: "produkter",
      currentBindings: strippedBindings.app,
      token: "synthetic-token",
      accountId: "account-1",
      fetchImpl: historicalRecoveryFetch(
        "produkter",
        "app",
        [{ id: "broken", number: 42, bindings: strippedBindings.app }],
        ["broken"],
      ),
    }),
    /Ingen komplett deployad historisk Worker-version/,
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

test("migration guard repairs a depth-1 checkout with a bounded fetch before diffing", () => {
  const calls = [];
  let parentChecks = 0;
  const runner = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === "cat-file") {
      parentChecks += 1;
      return { status: parentChecks === 1 ? 1 : 0, stdout: "", stderr: "" };
    }
    if (args[0] === "fetch") {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "diff") {
      return {
        status: 0,
        stdout: "cloudflare/migrations/0008_schema.sql\n",
        stderr: "",
      };
    }
    throw new Error("unexpected git call: " + args.join(" "));
  };

  assert.deepEqual(
    migrationChangesSinceParent("/repo/cloudflare/app", "main", runner),
    ["cloudflare/migrations/0008_schema.sql"],
  );
  assert.deepEqual(
    calls.map(call => call.args),
    [
      ["cat-file", "-e", "HEAD^"],
      ["fetch", "--no-tags", "--depth=2", "origin", "main"],
      ["cat-file", "-e", "HEAD^"],
      ["diff", "--name-only", "HEAD^", "HEAD", "--", "cloudflare/migrations"],
    ],
  );
});

test("migration guard remains fail-closed when the shallow parent cannot be fetched", () => {
  const runner = (_command, args) => {
    if (args[0] === "cat-file") return { status: 1, stdout: "", stderr: "" };
    if (args[0] === "fetch") return { status: 1, stdout: "", stderr: "fetch failed" };
    throw new Error("unexpected git call");
  };

  assert.throws(
    () => migrationChangesSinceParent("/repo/cloudflare/app", "main", runner),
    /hämta parent-commit/,
  );
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
