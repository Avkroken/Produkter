import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildLiveProductionConfig,
  deploymentUnit,
  PRODUCTION_WORKERS,
  readLiveCustomDomains,
  readLiveWorkerSettings,
  tokenFromWrangler,
} from "./live-production-config.mjs";

function runGit(repositoryRoot, args, runner) {
  return runner("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function migrationChangesSinceParent(
  cwd = process.cwd(),
  branch = "main",
  runner = spawnSync,
) {
  const repositoryRoot = path.resolve(cwd, "..", "..");

  let parent = runGit(repositoryRoot, ["cat-file", "-e", "HEAD^"], runner);
  if (parent.error || parent.status !== 0) {
    const fetch = runGit(
      repositoryRoot,
      ["fetch", "--no-tags", "--depth=2", "origin", branch],
      runner,
    );
    if (fetch.error || fetch.status !== 0) {
      throw new Error("Kunde inte hämta parent-commit för D1-migrationskontroll.");
    }
    parent = runGit(repositoryRoot, ["cat-file", "-e", "HEAD^"], runner);
  }

  if (parent.error || parent.status !== 0) {
    throw new Error("Parent-commit saknas efter bounded fetch. Avbryter production-deploy.");
  }

  const result = runGit(
    repositoryRoot,
    ["diff", "--name-only", "HEAD^", "HEAD", "--", "cloudflare/migrations"],
    runner,
  );
  if (result.error || result.status !== 0) {
    throw new Error("Kunde inte verifiera D1-migrationsdiff före production-deploy.");
  }

  return result.stdout
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean);
}

export function deployGeneratedProductionConfig({
  cwd,
  productionConfigPath,
  env = process.env,
  accountId,
  runner = spawnSync,
}) {
  const childEnv = {
    ...env,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  };
  const result = runner(
    "npx",
    ["wrangler", "deploy", "--config", productionConfigPath],
    {
      cwd,
      env: childEnv,
      stdio: "inherit",
    },
  );
  if (result?.error || result?.status !== 0) {
    throw new Error("Generated production-deploy misslyckades. Outer preview-deploy avbryts.");
  }
}

export async function preparePortableDeploy({
  env = process.env,
  cwd = process.cwd(),
  fetchImpl = fetch,
  tokenResolver = tokenFromWrangler,
  migrationChangesResolver = migrationChangesSinceParent,
  writeConfig = true,
} = {}) {
  if (env.WORKERS_CI !== "1") return { mode: "local" };

  const branch = env.WORKERS_CI_BRANCH?.trim();
  if (!branch) {
    throw new Error("Workers Builds saknar WORKERS_CI_BRANCH. Avbryter fail-closed.");
  }
  if (branch !== "main") return { mode: "preview", branch };

  const migrationChanges = migrationChangesResolver(cwd, branch);
  if (!Array.isArray(migrationChanges)) {
    throw new Error("D1-migrationskontrollen gav ogiltigt resultat.");
  }
  if (migrationChanges.length > 0) {
    throw new Error(
      "Main-build innehåller D1-migrationsändringar och får inte auto-deployas: " +
      migrationChanges.join(", ") +
      ". Använd explicit D1-capable releaseväg.",
    );
  }

  const unit = deploymentUnit(cwd);
  const workerName = PRODUCTION_WORKERS[unit];
  const token = typeof env.CLOUDFLARE_API_TOKEN === "string" && env.CLOUDFLARE_API_TOKEN.trim()
    ? env.CLOUDFLARE_API_TOKEN.trim()
    : tokenResolver(cwd);

  const live = await readLiveWorkerSettings({
    workerName,
    token,
    accountId: env.CLOUDFLARE_ACCOUNT_ID?.trim() || undefined,
    fetchImpl,
  });
  const domains = await readLiveCustomDomains({
    accountId: live.accountId,
    token,
    fetchImpl,
  });
  const config = buildLiveProductionConfig(unit, live.settings.bindings, domains);

  const productionConfigPath = path.join(cwd, "wrangler.production.jsonc");
  if (writeConfig) {
    writeFileSync(productionConfigPath, JSON.stringify(config, null, 2) + "\n");
  }

  return {
    mode: "production",
    branch,
    unit,
    workerName,
    accountId: live.accountId,
    productionConfigPath,
    config,
  };
}

export async function runPortableBuildHook({
  deployRunner = deployGeneratedProductionConfig,
  ...options
} = {}) {
  const prepared = await preparePortableDeploy(options);
  if (prepared.mode !== "production") return prepared;

  deployRunner({
    cwd: options.cwd || process.cwd(),
    productionConfigPath: prepared.productionConfigPath,
    env: options.env || process.env,
    accountId: prepared.accountId,
  });
  return prepared;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runPortableBuildHook();
  if (result.mode === "production") {
    console.log(
      `Deployed ${result.workerName} from generated live production config; outer deploy remains preview-only.`,
    );
  }
}
