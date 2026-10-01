import { spawnSync } from "node:child_process";
import path from "node:path";

const API_ROOT = "https://api.cloudflare.com/client/v4";
export const PRODUCTION_WORKERS = {
  app: "produkter",
  engine: "produkter-motor",
  processor: "produkter-bearbetare",
};

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

export function buildLiveProductionConfig(unit, bindings, domains = []) {
  if (!Array.isArray(bindings)) throw new Error("Live Worker settings saknar bindings.");
  const workerName = PRODUCTION_WORKERS[unit];
  if (!workerName) throw new Error(`Okänd deployenhet: ${unit}`);

  if (unit === "app") {
    const service = requiredBinding(bindings, "ENGINE", "service");
    const sessions = requiredBinding(bindings, "SESSIONS", "kv_namespace");
    return {
      ...common(workerName),
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

export function deploymentUnit(cwd = process.cwd()) {
  const unit = path.basename(path.resolve(cwd));
  if (!PRODUCTION_WORKERS[unit]) {
    throw new Error(`Workers Builds kör från oväntad root directory: ${unit}`);
  }
  return unit;
}
