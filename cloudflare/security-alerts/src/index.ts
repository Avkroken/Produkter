import { createRemoteJWKSet, jwtVerify } from "jose";

interface Env { DB: D1Database }
interface Alert {
  number: number; tool?: string | null; rule_id?: string | null; rule_name?: string | null;
  severity?: string | null; created_at?: string | null; updated_at?: string | null;
  url?: string | null; ref?: string | null; category?: string | null; file?: string | null;
  start_line?: number | null; end_line?: number | null;
}

const AUD = "politiker-security-alerts";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const ALLOWED = new Set([
  "avkroken/produkter", "avkroken/politiker", "avkroken/bastion",
  "avkroken/klarsprak", "avkroken/pastebinit", "avkroken/docker-idempotent-update",
  "avkroken/routines-relay",
]);

async function authenticatedRepo(req: Request): Promise<string> {
  const token = req.headers.get("X-GitHub-OIDC") ?? "";
  if (!token) throw new Error("missing OIDC token");
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: "https://token.actions.githubusercontent.com",
    audience: AUD,
  });
  const repo = typeof payload.repository === "string" ? payload.repository : "";
  if (!ALLOWED.has(repo.toLowerCase())) throw new Error("repo not allowed");
  // Jämför skiftlägesokänsligt: GitHub bevarar kontots skiftläge i OIDC-claimen,
  // och ett kontonamnbyte får inte tysta ingesten igen.
  const owner = typeof payload.repository_owner === "string" ? payload.repository_owner : "";
  if (owner.toLowerCase() !== "avkroken") throw new Error("owner not allowed");
  if (payload.ref !== "refs/heads/main") throw new Error("main required");
  if (payload.workflow_ref !== `${repo}/.github/workflows/security-alert-snapshot.yml@refs/heads/main`) {
    throw new Error("unexpected workflow");
  }
  if (payload.event_name !== "schedule" && payload.event_name !== "workflow_dispatch") {
    throw new Error("unexpected event");
  }
  return repo;
}

async function ensureSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS code_scanning_alerts (
    repo TEXT NOT NULL, alert_number INTEGER NOT NULL, tool TEXT, rule_id TEXT, rule_name TEXT,
    severity TEXT, created_at TEXT, updated_at TEXT, html_url TEXT, git_ref TEXT, category TEXT,
    file_path TEXT, start_line INTEGER, end_line INTEGER, snapshot_at INTEGER NOT NULL,
    PRIMARY KEY (repo, alert_number)
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_code_scanning_alerts_severity ON code_scanning_alerts(severity)").run();
}

async function replaceSnapshot(db: D1Database, repo: string, alerts: Alert[]) {
  await ensureSchema(db);
  const now = Date.now();
  const statements = [db.prepare("DELETE FROM code_scanning_alerts WHERE repo = ?").bind(repo)];
  for (const a of alerts) {
    if (!Number.isSafeInteger(a.number) || a.number < 1) throw new Error("invalid alert number");
    statements.push(db.prepare(`INSERT INTO code_scanning_alerts (
      repo, alert_number, tool, rule_id, rule_name, severity, created_at, updated_at,
      html_url, git_ref, category, file_path, start_line, end_line, snapshot_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(repo, a.number, a.tool ?? null, a.rule_id ?? null, a.rule_name ?? null,
        a.severity ?? null, a.created_at ?? null, a.updated_at ?? null, a.url ?? null,
        a.ref ?? null, a.category ?? null, a.file ?? null, a.start_line ?? null,
        a.end_line ?? null, now));
  }
  await db.batch(statements);
}

async function readSnapshot(db: D1Database, repo: string): Promise<Alert[]> {
  await ensureSchema(db);
  const result = await db.prepare(`SELECT
    alert_number AS number, tool, rule_id, rule_name, severity, created_at, updated_at,
    html_url AS url, git_ref AS ref, category, file_path AS file, start_line, end_line
    FROM code_scanning_alerts WHERE repo = ? ORDER BY alert_number`).bind(repo).all<Alert>();
  return result.results ?? [];
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (req.method === "GET" && path === "/health") return Response.json({ ok: true });
    if (path !== "/v1/code-scanning" || (req.method !== "POST" && req.method !== "GET")) {
      return new Response("Not found", { status: 404 });
    }
    try {
      const repo = await authenticatedRepo(req);
      if (req.method === "GET") return Response.json({ ok: true, repo, alerts: await readSnapshot(env.DB, repo) });
      const body = await req.json<{ alerts?: Alert[] }>();
      if (!Array.isArray(body.alerts) || body.alerts.length > 2000) return new Response("Invalid payload", { status: 400 });
      await replaceSnapshot(env.DB, repo, body.alerts);
      return Response.json({ ok: true, repo, alerts: body.alerts.length });
    } catch (err) {
      console.error("security alert request rejected", err instanceof Error ? err.message : "unknown");
      return new Response("Unauthorized", { status: 401 });
    }
  },
} satisfies ExportedHandler<Env>;
