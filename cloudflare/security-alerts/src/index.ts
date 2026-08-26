interface Env {
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN: string;
}

const ORG = "Avkroken";
const API_VERSION = "2022-11-28";
const ISSUE_SEVERITIES = new Set(["medium", "high", "critical"]);

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(raw: string, signature: string | null, secret: string): Promise<boolean> {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return safeEqual(signature, `sha256=${hex(digest)}`);
}

async function github(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "Avkroken-security-alerts",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response;
}

async function issueExists(env: Env, repo: string, marker: string): Promise<boolean> {
  const query = `repo:${repo} \"${marker}\" in:body`;
  const data = await (await github(env, `/search/issues?q=${encodeURIComponent(query)}&per_page=1`)).json<{ total_count?: number }>();
  return (data.total_count ?? 0) > 0;
}

async function createIssue(env: Env, repo: string, marker: string, title: string, body: string): Promise<"created" | "exists"> {
  if (await issueExists(env, repo, marker)) return "exists";
  await github(env, `/repos/${repo}/issues`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, body: `<!-- ${marker} -->\n${body}` }),
  });
  return "created";
}

async function isMalware(env: Env, repo: string, alertNumber: number): Promise<boolean> {
  let path: string | null = `/repos/${repo}/dependabot/alerts?state=open&classification=malware&per_page=100`;
  while (path) {
    const response = await github(env, path);
    const alerts = await response.json<Array<{ number: number }>>();
    if (alerts.some((alert) => alert.number === alertNumber)) return true;
    const next = (response.headers.get("link") ?? "").split(",").find((part) => part.includes('rel="next"'));
    const match = next?.match(/<https:\/\/api\.github\.com([^>]+)>/);
    path = match?.[1] ?? null;
  }
  return false;
}

function codeScanningIssue(payload: any) {
  const alert = payload.alert ?? {};
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

async function dependabotIssue(env: Env, repo: string, payload: any) {
  const alert = payload.alert ?? {};
  if (alert.state !== "open" || !Number.isSafeInteger(alert.number)) return null;
  const malware = await isMalware(env, repo, alert.number);
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (req.method === "GET" && (path === "/" || path === "/health")) {
      return Response.json({ ok: true, service: "security-alerts" });
    }
    if (req.method !== "POST" || path !== "/webhook") return new Response("Not found", { status: 404 });
    if (!env.GITHUB_WEBHOOK_SECRET || !env.GITHUB_TOKEN) return new Response("Not configured", { status: 503 });

    const raw = await req.text();
    if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256"), env.GITHUB_WEBHOOK_SECRET))) {
      return new Response("Bad signature", { status: 401 });
    }

    const event = req.headers.get("x-github-event") ?? "";
    if (event === "ping") return new Response("pong\n");
    if (event !== "code_scanning_alert" && event !== "dependabot_alert") return new Response("ignored\n", { status: 202 });

    let payload: any;
    try { payload = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
    const repo = String(payload.repository?.full_name ?? "");
    if (!repo.toLowerCase().startsWith(`${ORG.toLowerCase()}/`)) return new Response("Wrong organization", { status: 403 });

    try {
      const issue = event === "code_scanning_alert"
        ? codeScanningIssue(payload)
        : await dependabotIssue(env, repo, payload);
      if (!issue) return new Response("ignored\n", { status: 202 });
      const result = await createIssue(env, repo, issue.marker, issue.title, issue.body);
      return new Response(`${result}\n`, { status: result === "created" ? 201 : 200 });
    } catch (error) {
      console.error("security webhook failed", error instanceof Error ? error.message : String(error));
      return new Response("Upstream error", { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
