interface Env {
  SECURITY_ISSUE_WEBHOOK_SECRET: string;
  SECURITY_ISSUE_APP_ID: string;
  SECURITY_ISSUE_APP_PRIVATE_KEY: string;
}

type IssueSpec = { marker: string; title: string; body: string };
type BackfillStats = { scanned: number; eligible: number; created: number; exists: number; errors: number };

const ORG = "Avkroken";
const API_VERSION = "2022-11-28";
const ISSUE_SEVERITIES = new Set(["medium", "high", "critical"]);
const SUPPORTED_EVENTS = new Set(["code_scanning_alert", "dependabot_alert", "secret_scanning_alert"]);

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemBytes(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
}

function configured(env: Env): boolean {
  return Boolean(env.SECURITY_ISSUE_WEBHOOK_SECRET && env.SECURITY_ISSUE_APP_ID && env.SECURITY_ISSUE_APP_PRIVATE_KEY);
}

async function verifySignature(raw: string, signature: string | null, secret: string): Promise<boolean> {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return safeEqual(signature, `sha256=${hex(digest)}`);
}

async function appJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.SECURITY_ISSUE_APP_ID }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(env.SECURITY_ISSUE_APP_PRIVATE_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(signature)}`;
}

async function installationToken(env: Env): Promise<string> {
  const jwt = await appJwt(env);
  const installationResponse = await fetch(`https://api.github.com/orgs/${encodeURIComponent(ORG)}/installation`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${jwt}`, "X-GitHub-Api-Version": API_VERSION, "User-Agent": "Avkroken-security-alerts" },
  });
  if (!installationResponse.ok) throw new Error(`GitHub installation lookup ${installationResponse.status}: ${(await installationResponse.text()).slice(0, 500)}`);
  const installation = await installationResponse.json<{ id?: number }>();
  if (!Number.isSafeInteger(installation.id) || Number(installation.id) <= 0) throw new Error("GitHub installation id missing");

  const response = await fetch(`https://api.github.com/app/installations/${installation.id}/access_tokens`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${jwt}`, "X-GitHub-Api-Version": API_VERSION, "User-Agent": "Avkroken-security-alerts" },
  });
  if (!response.ok) throw new Error(`GitHub installation token ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const data = await response.json<{ token?: string }>();
  if (!data.token) throw new Error("GitHub installation token missing");
  return data.token;
}

async function github(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": API_VERSION, "User-Agent": "Avkroken-security-alerts", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response;
}

async function listAll<T>(token: string, initialPath: string): Promise<T[]> {
  const all: T[] = [];
  let path: string | null = initialPath;
  while (path) {
    const response = await github(token, path);
    all.push(...await response.json<T[]>());
    const next = (response.headers.get("link") ?? "").split(",").find((part) => part.includes('rel="next"'));
    const match = next?.match(/<https:\/\/api\.github\.com([^>]+)>/);
    path = match?.[1] ?? null;
  }
  return all;
}

async function issueExists(token: string, repo: string, marker: string): Promise<boolean> {
  const query = `repo:${repo} \"${marker}\" in:body`;
  const data = await (await github(token, `/search/issues?q=${encodeURIComponent(query)}&per_page=1`)).json<{ total_count?: number }>();
  return (data.total_count ?? 0) > 0;
}

async function createIssue(token: string, repo: string, issue: IssueSpec): Promise<"created" | "exists"> {
  if (await issueExists(token, repo, issue.marker)) return "exists";
  await github(token, `/repos/${repo}/issues`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: issue.title, body: `<!-- ${issue.marker} -->\n${issue.body}` }),
  });
  return "created";
}

async function isMalware(token: string, repo: string, alertNumber: number): Promise<boolean> {
  const alerts = await listAll<{ number: number }>(token, `/repos/${repo}/dependabot/alerts?state=open&classification=malware&per_page=100`);
  return alerts.some((alert) => alert.number === alertNumber);
}

function codeScanningIssue(alert: any): IssueSpec | null {
  if (alert.state !== "open" || !Number.isSafeInteger(alert.number)) return null;
  const severity = String(alert.rule?.security_severity_level ?? "").toLowerCase();
  if (!ISSUE_SEVERITIES.has(severity)) return null;
  const rule = alert.rule?.name ?? alert.rule?.id ?? "Code scanning alert";
  return {
    marker: `security-alert:code-scanning:${alert.number}`,
    title: `[Security][Code scanning][${severity.toUpperCase()}] ${rule}`,
    body: `Automatiskt skapat från ett öppet GitHub Code Scanning-alert.\n\n- **Severity:** ${severity.toUpperCase()}\n- **Rule:** ${rule}\n- **Alert:** ${alert.html_url ?? ""}`,
  };
}

async function dependabotIssue(token: string, repo: string, alert: any): Promise<IssueSpec | null> {
  if (alert.state !== "open" || !Number.isSafeInteger(alert.number)) return null;
  const malware = await isMalware(token, repo, alert.number);
  const severity = String(alert.security_advisory?.severity ?? alert.security_vulnerability?.severity ?? "unknown").toLowerCase();
  if (!malware && !ISSUE_SEVERITIES.has(severity)) return null;
  const level = malware ? "MALWARE" : severity.toUpperCase();
  const pkg = alert.dependency?.package?.name ?? "unknown package";
  const summary = alert.security_advisory?.summary ?? (malware ? "Malicious dependency detected" : "Dependabot alert");
  return {
    marker: `security-alert:dependabot:${alert.number}`,
    title: `[Security][Dependabot][${level}] ${pkg}: ${summary}`,
    body: `Automatiskt skapat från ett öppet GitHub Dependabot-alert. Malware inkluderas alltid; övriga alerts kräver Medium eller högre.\n\n- **Severity/class:** ${level}\n- **Package:** ${pkg}\n- **Summary:** ${summary}\n- **Alert:** ${alert.html_url ?? ""}`,
  };
}

function secretScanningIssue(alert: any): IssueSpec | null {
  if (alert.state !== "open" || !Number.isSafeInteger(alert.number)) return null;
  const secretType = alert.secret_type_display_name ?? alert.secret_type ?? "Secret detected";
  return {
    marker: `security-alert:secret-scanning:${alert.number}`,
    title: `[Security][Secret scanning] ${secretType}`,
    body: `Automatiskt skapat från ett öppet GitHub Secret Scanning-alert. Själva hemligheten inkluderas avsiktligt inte i issuet.\n\n- **Type:** ${secretType}\n- **Validity:** ${alert.validity ?? "unknown"}\n- **Alert:** ${alert.html_url ?? ""}`,
  };
}

function repoFromAlert(alert: any): string {
  return String(alert.repository?.full_name ?? "");
}

function validOrgRepo(repo: string): boolean {
  return repo.toLowerCase().startsWith(`${ORG.toLowerCase()}/`);
}

async function backfillType(
  token: string,
  type: string,
  path: string,
  makeIssue: (repo: string, alert: any) => Promise<IssueSpec | null>,
): Promise<BackfillStats> {
  const stats: BackfillStats = { scanned: 0, eligible: 0, created: 0, exists: 0, errors: 0 };
  const alerts = await listAll<any>(token, path);
  stats.scanned = alerts.length;

  for (const alert of alerts) {
    const repo = repoFromAlert(alert);
    if (!validOrgRepo(repo)) continue;
    try {
      const issue = await makeIssue(repo, alert);
      if (!issue) continue;
      stats.eligible += 1;
      const result = await createIssue(token, repo, issue);
      stats[result] += 1;
    } catch (error) {
      stats.errors += 1;
      console.error("security backfill alert failed", { type, repo, alertNumber: alert.number ?? null, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return stats;
}

async function runBackfill(env: Env): Promise<void> {
  if (!configured(env)) throw new Error("Security alerts Worker is not configured");
  const token = await installationToken(env);
  const code = await backfillType(
    token,
    "code_scanning",
    `/orgs/${encodeURIComponent(ORG)}/code-scanning/alerts?state=open&per_page=100`,
    async (_repo, alert) => codeScanningIssue(alert),
  );
  const dependabot = await backfillType(
    token,
    "dependabot",
    `/orgs/${encodeURIComponent(ORG)}/dependabot/alerts?state=open&per_page=100`,
    async (repo, alert) => dependabotIssue(token, repo, alert),
  );
  const secret = await backfillType(
    token,
    "secret_scanning",
    `/orgs/${encodeURIComponent(ORG)}/secret-scanning/alerts?state=open&per_page=100`,
    async (_repo, alert) => secretScanningIssue(alert),
  );
  console.log("security backfill complete", { code, dependabot, secret });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (req.method === "GET" && (path === "/" || path === "/health")) return Response.json({ ok: true, service: "security-alerts" });
    if (req.method !== "POST" || path !== "/webhook") return new Response("Not found", { status: 404 });
    if (!configured(env)) {
      console.error("security webhook not configured");
      return new Response("Not configured", { status: 503 });
    }

    const raw = await req.text();
    const delivery = req.headers.get("x-github-delivery") ?? "";
    const event = req.headers.get("x-github-event") ?? "";

    if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256"), env.SECURITY_ISSUE_WEBHOOK_SECRET))) {
      console.warn("security webhook bad signature", { delivery, event });
      return new Response("Bad signature", { status: 401 });
    }

    if (event === "ping") {
      console.log("security webhook ping", { delivery });
      ctx.waitUntil(runBackfill(env).catch((error) => console.error("security ping backfill failed", error instanceof Error ? error.message : String(error))));
      return new Response("pong\n");
    }

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      console.warn("security webhook bad json", { delivery, event });
      return new Response("Bad JSON", { status: 400 });
    }

    const repo = String(payload.repository?.full_name ?? "");
    const action = String(payload.action ?? "");
    console.log("security webhook received", { delivery, event, action, repo });

    if (!SUPPORTED_EVENTS.has(event)) {
      console.log("security webhook ignored unsupported event", { delivery, event, action, repo });
      return new Response("ignored\n", { status: 202 });
    }
    if (!validOrgRepo(repo)) return new Response("Wrong organization", { status: 403 });

    try {
      const token = await installationToken(env);
      const alert = payload.alert ?? {};
      const issue = event === "code_scanning_alert"
        ? codeScanningIssue(alert)
        : event === "dependabot_alert"
          ? await dependabotIssue(token, repo, alert)
          : (action === "created" || action === "reopened") ? secretScanningIssue({ ...alert, state: "open" }) : null;

      if (!issue) {
        console.log("security webhook ignored alert", { delivery, event, action, repo, alertNumber: alert.number ?? null });
        return new Response("ignored\n", { status: 202 });
      }

      const result = await createIssue(token, repo, issue);
      console.log("security webhook issue result", { delivery, event, action, repo, alertNumber: alert.number ?? null, result });
      return new Response(`${result}\n`, { status: result === "created" ? 201 : 200 });
    } catch (error) {
      console.error("security webhook failed", { delivery, event, action, repo, error: error instanceof Error ? error.message : String(error) });
      return new Response("Upstream error", { status: 502 });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBackfill(env).catch((error) => console.error("security scheduled backfill failed", error instanceof Error ? error.message : String(error))));
  },
} satisfies ExportedHandler<Env>;
