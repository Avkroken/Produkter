import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertPortableDeploySafe } from "./guard-portable-deploy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const units = ["app", "engine", "processor"];
const forbiddenProductionKeys = ["routes", "services", "d1_databases", "r2_buckets", "kv_namespaces", "queues", "vars", "triggers"];

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

test("portable config fails closed for production Workers Builds", () => {
  assert.doesNotThrow(() => assertPortableDeploySafe({}));
  assert.doesNotThrow(() => assertPortableDeploySafe({
    WORKERS_CI: "1",
    WORKERS_CI_BRANCH: "codex/example",
  }));
  assert.throws(
    () => assertPortableDeploySafe({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" }),
    /preview-only/,
  );
  assert.throws(
    () => assertPortableDeploySafe({ WORKERS_CI: "1" }),
    /preview-only/,
  );
});

test("app preview config retains only public static assets", () => {
  const configPath = path.join(here, "..", "app", "wrangler.jsonc");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.assets?.directory, "./public");
  assert.equal(config.assets?.binding, "ASSETS");
});
