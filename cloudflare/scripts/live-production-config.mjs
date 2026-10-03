import { spawnSync } from "node:child_process";
import path from "node:path";

const API_ROOT = "https://api.cloudflare.com/client/v4";
export const PRODUCTION_WORKERS = Object.freeze({
  app: "produkter",
  engine: "produkter-motor",
  processor: "produkter-bearbetare",
});

const REQUIRED_PRODUCTION_BINDINGS = Object.freeze({
  app: Object.freeze([
    ["DB", "d1"],
    ["ENGINE", "service"],
    ["JOB_QUEUE", "queue"],
    ["SESSIONS", "kv_namespace"],
    ["UPLOADS", "r2_bucket"],
    ["PUBLIC_APP_URL", "plain_text"],
    ["TURNSTILE_HOSTNAMES", "plain_text"],
    ["TURNSTILE_SITE_KEY", "plain_text"],
  ]),
  engine: Object.freeze([
    ["AI", "ai"],
    ["DB", "d1"],
    ["SCHEDULE_LIMIT", "plain_text"],
    ["DESCRIBE_LIMIT", "plain_text"],
    ["DESCRIBE_WORKERS", "plain_text"],
  ]),
  processor: Object.freeze([
    ["DB", "d1"],
    ["JOB_QUEUE", "queue"],
    ["UPLOADS", "r2_bucket"],
  ]),
});

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function productionWorkers(env = process.env) {
  const app = optionalString(env.CLOUDFLARE_WORKER_APP) || PRODUCTION_WORKERS.app;
  return {
    app,
    engine: optionalString(env.CLOUDFLARE_WORKER_ENGINE) || (
      app === PRODUCTION_WORKERS.app ? PRODUCTION_WORKERS.engine : `${app}-motor`
    ),
    processor: optionalString(env.CLOUDFLARE_WORKER_PROCESSOR) || (
      app === PRODUCTION_WORKERS.app ? PRODUCTION_WORKERS.processor : `${app}-bearbetare`
    ),
  };
}

export function missingProductionBindings(unit, bindings) {
  const contract = REQUIRED_PRODUCTION_BINDINGS[unit];
  if (!contract) throw new Error(`Okänd deployenhet: ${unit}`);
  const current = Array.isArray(bindings) ? bindings : [];
  return contract
    .filter(([name, type]) => !current.some(binding => binding?.name === name && binding?.type === type))
    .map(([name, type]) => `${name} (${type})`);
}

export function productionBindingsComplete(unit, bindings) {
  return missingProductionBindings(unit, bindings).length === 0;
}

export function plainTextVars(bindings) {
  const vars = {};
  for (const binding of Array.isArray(bindings) ? bindings : []) {
    if (
      binding?.type === "plain_text" &&
      typeof binding?.name === "string" &&
      binding.name &&
      typeof binding?.text === "string"
    ) {
      vars[binding.name] = binding.text;
    }
  }
  return vars;
}

function requiredBinding(bindings, name, type) {
  const value = bindings.find(binding => binding?.name === name && binding?.type === type);
  if (!value) throw new Error(`Saknar live-binding ${name} (${type}). Avbryter production-deploy.`);
  return value;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Saknar live resource-reference: ${label}. Avbryter production-deploy.`);
  }
  return value.trim();
}

function observability() {
  return {
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
}

function common(name) {
  return {
    "$schema": "node_modules/wrangler/config-schema.json",
    name,
    compatibility_date: "2026-06-01",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    previews: {},
    keep_vars: true,
    observability: observability(),
  };
}

function d1Binding(bindings) {
  const binding = requiredBinding(bindings, "DB", "d1");
  return {
    binding: "DB",
    database_id: requiredString(binding.database_id || binding.id, "DB.database_id"),
  };
}

function r2Binding(bindings) {
  const binding = requiredBinding(bindings, "UPLOADS", "r2_bucket");
  return {
    binding: "UPLOADS",
    bucket_name: requiredString(binding.bucket_name, "UPLOADS.bucket_name"),
  };
}

function queueBinding(bindings) {
  const binding = requiredBinding(bindings, "JOB_QUEUE", "queue");
  return requiredString(binding.queue_name, "JOB_QUEUE.queue_name");
}

function productionRoute(domains, workerName, required) {
  if (!Array.isArray(domains)) throw new Error("Live Worker domains saknas.");
  const matching = domains.filter(record =>
    record?.service === workerName &&
    (record?.environment == null || record.environment === "production") &&
    typeof record?.hostname === "string" &&
    record.hostname.trim()
  );
  if (!required) {
    if (matching.length > 0) {
      throw new Error(`Worker ${workerName} ska inte ha custom domain i generated config.`);
    }
    return [];
  }
  if (matching.length !== 1) {
    throw new Error(
      `Förväntade exakt en production custom domain för ${workerName}, hittade ${matching.length}.`,
    );
  }
  return [{
    pattern: matching[0].hostname.trim(),
    custom_domain: true,
  }];
}

export function buildLiveProductionConfig(unit, bindings, domains = [], options = {}) {
  if (!Array.isArray(bindings)) throw new Error("Live Worker settings saknar bindings.");
  const workers = options.workers || PRODUCTION_WORKERS;
  const workerName = workers[unit];
  if (!workerName) throw new Error(`Okänd deployenhet: ${unit}`);
  const recoveredVars = options.vars && Object.keys(options.vars).length > 0
    ? { vars: options.vars }
    : {};

  if (unit === "app") {
    const service = requiredBinding(bindings, "ENGINE", "service");
    const sessions = requiredBinding(bindings, "SESSIONS", "kv_namespace");
    return {
      ...common(workerName),
      ...recoveredVars,
      main: "src/access-worker.ts",
      assets: {
        directory: "./public",
        not_found_handling: "single-page-application",
        binding: "ASSETS",
        run_worker_first: [
          "/",
          "/api/*",
          "/signup",
          "/login",
          "/logout",
          "/underlag",
          "/admin",
          "/admin/*",
          "/forgot-password",
          "/forgot-password.html",
          "/robots.txt",
          "/sitemap.xml",
        ],
      },
      services: [{
        binding: "ENGINE",
        service: requiredString(service.service, "ENGINE.service"),
      }],
      routes: productionRoute(domains, workerName, true),
      d1_databases: [d1Binding(bindings)],
      r2_buckets: [r2Binding(bindings)],
      kv_namespaces: [{
        binding: "SESSIONS",
        id: requiredString(sessions.namespace_id, "SESSIONS.namespace_id"),
      }],
      queues: {
        producers: [{ queue: queueBinding(bindings), binding: "JOB_QUEUE" }],
      },
    };
  }

  if (unit === "engine") {
    requiredBinding(bindings, "AI", "ai");
    return {
      ...common(workerName),
      ...recoveredVars,
      main: "src/worker.ts",
      upload_source_maps: true,
      ai: { binding: "AI" },
      routes: productionRoute(domains, workerName, true),
      triggers: { crons: ["*/5 * * * *"] },
      d1_databases: [d1Binding(bindings)],
    };
  }

  const queue = queueBinding(bindings);
  productionRoute(domains, workerName, false);
  return {
    ...common(workerName),
    ...recoveredVars,
    main: "src/worker.ts",
    d1_databases: [d1Binding(bindings)],
    r2_buckets: [r2Binding(bindings)],
    queues: {
      consumers: [{
        queue,
        max_batch_size: 10,
        max_retries: 10,
        max_concurrency: 4,
      }],
      producers: [{ queue, binding: "JOB_QUEUE" }],
    },
  };
}

async function apiJson(url, token, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function accountIds(token, fetchImpl) {
  const { response, payload } = await apiJson(`${API_ROOT}/accounts?per_page=50`, token, fetchImpl);
  if (!response.ok || payload?.success !== true || !Array.isArray(payload?.result)) {
    throw new Error(`Cloudflare account lookup misslyckades (HTTP ${response.status}).`);
  }
  return payload.result
    .map(account => account?.id)
    .filter(id => typeof id === "string" && id);
}

export async function readLiveCustomDomains({
  accountId,
  token,
  fetchImpl = fetch,
}) {
  const url = `${API_ROOT}/accounts/${encodeURIComponent(accountId)}/workers/domains/records`;
  const { response, payload } = await apiJson(url, token, fetchImpl);
  if (!response.ok || payload?.success !== true || !Array.isArray(payload?.result)) {
    throw new Error(`Kunde inte läsa live custom domains (HTTP ${response.status}).`);
  }
  return payload.result;
}

export async function readLiveWorkerSettings({
  workerName,
  token,
  accountId,
  fetchImpl = fetch,
}) {
  const candidates = accountId ? [accountId] : await accountIds(token, fetchImpl);
  const matches = [];

  for (const candidate of candidates) {
    const url = `${API_ROOT}/accounts/${encodeURIComponent(candidate)}/workers/scripts/${encodeURIComponent(workerName)}/settings`;
    const { response, payload } = await apiJson(url, token, fetchImpl);
    if (response.ok && payload?.success === true && payload?.result) {
      matches.push({ accountId: candidate, settings: payload.result });
    } else if (accountId) {
      throw new Error(`Kunde inte läsa live settings för ${workerName} (HTTP ${response.status}).`);
    }
  }

  if (matches.length !== 1) {
    throw new Error(
      `Förväntade exakt en läsbar live Worker ${workerName}, hittade ${matches.length}. Avbryter.`,
    );
  }
  return matches[0];
}

export async function readLatestCompleteWorkerVersion({
  unit,
  workerName,
  token,
  accountId,
  fetchImpl = fetch,
  perPage = 100,
}) {
  const url =
    `${API_ROOT}/accounts/${encodeURIComponent(accountId)}` +
    `/workers/workers/${encodeURIComponent(workerName)}/versions` +
    `?per_page=${encodeURIComponent(String(perPage))}`;
  const { response, payload } = await apiJson(url, token, fetchImpl);
  const versions = Array.isArray(payload?.result)
    ? payload.result
    : Array.isArray(payload?.result?.items)
      ? payload.result.items
      : [];
  if (!response.ok || payload?.success !== true || versions.length === 0) {
    throw new Error(
      `Kunde inte läsa Worker-versioner för ${workerName} (HTTP ${response.status}).`,
    );
  }

  const version = [...versions]
    .sort((left, right) => Number(right?.number || 0) - Number(left?.number || 0))
    .find(candidate => productionBindingsComplete(unit, candidate?.bindings));
  if (!version) {
    throw new Error(
      `Ingen komplett historisk Worker-version hittades för ${workerName}.`,
    );
  }

  return {
    id: version.id,
    number: version.number,
    bindings: version.bindings,
  };
}

export async function resolveProductionBindings({
  unit,
  workerName,
  currentBindings,
  token,
  accountId,
  fetchImpl = fetch,
}) {
  if (productionBindingsComplete(unit, currentBindings)) {
    return {
      source: "live",
      bindings: currentBindings,
      vars: undefined,
      versionNumber: undefined,
      missing: [],
    };
  }

  const missing = missingProductionBindings(unit, currentBindings);
  const recovered = await readLatestCompleteWorkerVersion({
    unit,
    workerName,
    token,
    accountId,
    fetchImpl,
  });

  return {
    source: "historical_version",
    bindings: recovered.bindings,
    vars: plainTextVars(recovered.bindings),
    versionNumber: recovered.number,
    missing,
  };
}

export function tokenFromWrangler(cwd = process.cwd()) {
  const result = spawnSync("npx", ["wrangler", "auth", "token", "--json"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error("Kunde inte läsa befintlig Wrangler-auth för production-build.");
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error("Wrangler-auth gav inte giltig JSON.");
  }
  const token = parsed?.token || parsed?.access_token || parsed?.accessToken;
  if (typeof token !== "string" || !token) {
    throw new Error("Wrangler-auth saknar läsbart tokenfält.");
  }
  return token;
}

export function deploymentUnit(cwd = process.cwd(), workers = PRODUCTION_WORKERS) {
  const unit = path.basename(path.resolve(cwd));
  if (!workers[unit]) {
    throw new Error(`Workers Builds kör från oväntad root directory: ${unit}`);
  }
  return unit;
}
