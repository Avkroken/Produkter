import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cloudflareDir = fileURLToPath(new URL("../", import.meta.url));
const useExample = process.argv.includes("--example");
const sourcePath = path.join(cloudflareDir, useExample ? "deployment.example.json" : "deployment.json");

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Saknar obligatoriskt konfigurationsvärde: ${label}`);
  }
  return value.trim();
}

function publicHttpsUrl(value, label) {
  const raw = requiredString(value, label);
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${label} måste vara ett HTTPS-origin utan path/query, t.ex. https://app.example.com`);
  }
  return url;
}

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

const config = JSON.parse(await readFile(sourcePath, "utf8"));
const appUrl = publicHttpsUrl(config.appUrl, "appUrl");
const engineUrl = publicHttpsUrl(config.engineUrl, "engineUrl");
const appName = requiredString(config.workers?.app, "workers.app");
const engineName = requiredString(config.workers?.engine, "workers.engine");
const processorName = requiredString(config.workers?.processor, "workers.processor");
const d1Name = requiredString(config.d1?.name, "d1.name");
const d1Id = requiredString(config.d1?.id, "d1.id");
const r2Uploads = requiredString(config.r2?.uploads, "r2.uploads");
const sessionsId = requiredString(config.kv?.sessionsId, "kv.sessionsId");
const jobsQueue = requiredString(config.queue?.jobs, "queue.jobs");

const appVars = {
  PUBLIC_APP_URL: appUrl.origin,
  TURNSTILE_HOSTNAMES: appUrl.hostname,
};
for (const [key, value] of Object.entries({
  OAUTH_GOOGLE_CLIENT_ID: optionalString(config.oauth?.googleClientId),
  OAUTH_MICROSOFT_CLIENT_ID: optionalString(config.oauth?.microsoftClientId),
  MAIL_FROM: optionalString(config.mail?.from),
  ADMIN_EMAIL: optionalString(config.mail?.adminEmail),
  GITHUB_ERROR_REPORT_REPOSITORY: optionalString(config.githubErrorReportRepository),
})) {
  if (value) appVars[key] = value;
}

const shared = {
  compatibility_date: "2026-06-01",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: false,
  preview_urls: false,
};

const app = {
  "$schema": "node_modules/wrangler/config-schema.json",
  name: appName,
  main: "src/access-worker.ts",
  ...shared,
  observability: observability(),
  routes: [{ pattern: appUrl.hostname, custom_domain: true, enabled: true, previews_enabled: false }],
  assets: {
    directory: "./public",
    not_found_handling: "single-page-application",
    binding: "ASSETS",
    run_worker_first: ["/", "/api/*", "/signup", "/login", "/logout", "/underlag", "/admin", "/admin/*", "/robots.txt", "/sitemap.xml"],
  },
  services: [{ binding: "ENGINE", service: engineName }],
  d1_databases: [{ binding: "DB", database_name: d1Name, database_id: d1Id }],
  r2_buckets: [{ binding: "UPLOADS", bucket_name: r2Uploads }],
  kv_namespaces: [{ binding: "SESSIONS", id: sessionsId }],
  queues: { producers: [{ queue: jobsQueue, binding: "JOB_QUEUE" }] },
  vars: appVars,
};

const engine = {
  "$schema": "node_modules/wrangler/config-schema.json",
  name: engineName,
  ai: { binding: "AI" },
  main: "src/worker.ts",
  ...shared,
  upload_source_maps: true,
  observability: observability(),
  triggers: { crons: ["*/5 * * * *"] },
  vars: {
    SCHEDULE_LIMIT: "200",
    DESCRIBE_LIMIT: "10",
    DESCRIBE_WORKERS: "2",
    ...(optionalString(config.githubErrorReportRepository)
      ? { GITHUB_ERROR_REPORT_REPOSITORY: config.githubErrorReportRepository.trim() }
      : {}),
  },
  routes: [{ pattern: engineUrl.hostname, custom_domain: true }],
  d1_databases: [{ binding: "DB", database_name: d1Name, database_id: d1Id }],
};

const processor = {
  "$schema": "node_modules/wrangler/config-schema.json",
  name: processorName,
  main: "src/worker.ts",
  ...shared,
  observability: observability(),
  d1_databases: [{ binding: "DB", database_name: d1Name, database_id: d1Id }],
  r2_buckets: [{ binding: "UPLOADS", bucket_name: r2Uploads }],
  queues: {
    consumers: [{ queue: jobsQueue, max_batch_size: 10, max_retries: 10, max_concurrency: 4 }],
    producers: [{ queue: jobsQueue, binding: "JOB_QUEUE" }],
  },
  vars: optionalString(config.githubErrorReportRepository)
    ? { GITHUB_ERROR_REPORT_REPOSITORY: config.githubErrorReportRepository.trim() }
    : {},
};

for (const [name, value] of [["app", app], ["engine", engine], ["processor", processor]]) {
  await writeFile(path.join(cloudflareDir, name, "wrangler.jsonc"), JSON.stringify(value, null, 2) + "\n");
}

console.log(`Genererade Wrangler-konfigurationer från ${path.basename(sourcePath)}.`);
