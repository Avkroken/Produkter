// produkter-motor — hjärnan i den enhetliga arkitekturen (se DESIGN.md).
//
// Cloudflare blir sanningskälla; servern krymps till en statslös Playwright-
// fetcher som BARA gör utgående HTTPS. Den här Workern gör två saker:
//
//  A) HTTP-endpoints som fetchern anropar (Fas 1).
//  B) EN cron-handler (Fas 4) som driver hela katalog-loopen mot D1.
//
// Endpoints fetchern behöver:
//
//   POST /jobs/lease        — leasa N render-jobb (lease/ack, ersätter Queues)
//   POST /jobs/:id/result   — rapportera resultat: upsert produkt + prishistorik,
//                             list-jobb skapar detail-jobb för upptäckta länkar
//   POST /ingest            — bulk-upsert produkter (migrering + list-resultat)
//   GET  /health            — opfri hälsokoll
//
// Auth: X-API-Key mot secret INGEST_API_KEY (operatörsnyckel), samma mönster
// som dagens scraper-API. Inget per konto — katalogen är operatörs-ägd.

import {
  ProviderChain,
  AllProvidersExhausted,
  DEFAULT_MODELS,
  type ProviderSpec,
  type ProviderName,
} from "../../shared/providers";
import { buildSystemPrompt, userMessage } from "../../shared/prompts";
import { reportErrorToGitHub, type GitHubReportEnv } from "../../shared/github-report";

interface Env extends GitHubReportEnv {
  DB: D1Database;
  INGEST_API_KEY: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  AZURE_OPENAI_DEPLOYMENT?: string;
  SCHEDULE_LIMIT?: string;
  DESCRIBE_LIMIT?: string;
  DESCRIBE_WORKERS?: string;
  ALERT_MIN_DROP_PCT?: string;
  ALERT_MIN_DROP_KR?: string;
  ALERT_COOLDOWN_HOURS?: string;
}

export interface RenderKoEnv {
  DB: D1Database;
}

const REPO = "Avkroken/produkter";
const LEASE_MS = 120_000;
const LIST_LEASE_MS = 900_000;
const MAX_ATTEMPTS = 5;
const MAX_LEASE = 50;

export interface LeasedJob {
  id: number;
  url: string;
  type: string;
  site_id: number | null;
  detail_selector: string;
  use_stealth: number;
  base_url?: string;
  product_selector?: string;
  title_selector?: string;
  price_selector?: string;
  link_selector?: string;
  pagination_type?: string;
  max_pages?: number;
  exclude_link_pattern?: string;
  url_scope?: string;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

function authorized(req: Request, env: Env): boolean {
  const key = req.headers.get("X-API-Key");
  return !!env.INGEST_API_KEY && key === env.INGEST_API_KEY;
}

export async function leasaRenderJobb(env: RenderKoEnv, antal = 10): Promise<LeasedJob[]> {
  const n = Math.min(Math.max(1, antal), MAX_LEASE);
  const now = Date.now();
  const leased = await env.DB.prepare(
    `UPDATE render_jobs
       SET status = 'leased',
           lease_until = ?1 + CASE type WHEN 'list' THEN ?4 ELSE ?5 END,
           attempts = attempts + 1, updated_at = ?1
     WHERE id IN (
       SELECT id FROM render_jobs
       WHERE status = 'pending' OR (status = 'leased' AND lease_until < ?2)
       ORDER BY CASE type WHEN 'list' THEN 0 ELSE 1 END, id LIMIT ?3
     )
     RETURNING id, url, type, site_id`,
  )
    .bind(now, now, n, LIST_LEASE_MS, LEASE_MS)
    .all<{ id: number; url: string; type: string; site_id: number | null }>();

  const rows = leased.results ?? [];
  if (rows.length === 0) return [];

  const sites = await env.DB.prepare(
    `SELECT id, base_url, detail_selector, product_selector, title_selector, price_selector,
            link_selector, pagination_type, max_pages, exclude_link_pattern, url_scope, use_stealth
     FROM sites`,
  ).all<{
    id: number;
    base_url: string;
    detail_selector: string;
    product_selector: string;
    title_selector: string;
    price_selector: string;
    link_selector: string;
    pagination_type: string;
    max_pages: number;
    exclude_link_pattern: string;
    url_scope: string;
    use_stealth: number;
  }>();
  const siteMap = new Map((sites.results ?? []).map((s) => [s.id, s]));
  return rows.map((r) => {
    const site = r.site_id != null ? siteMap.get(r.site_id) : undefined;
    const base: LeasedJob = {
      id: r.id,
      url: r.url,
      type: r.type,
      site_id: r.site_id,
      detail_selector: site?.detail_selector ?? "",
      use_stealth: site?.use_stealth ?? 0,
    };
    if (r.type === "list" && site) {
      base.base_url = site.base_url;
      base.product_selector = site.product_selector;
      base.title_selector = site.title_selector;
      base.price_selector = site.price_selector;
      base.link_selector = site.link_selector;
      base.pagination_type = site.pagination_type;
      base.max_pages = site.max_pages;
      base.exclude_link_pattern = site.exclude_link_pattern;
      base.url_scope = site.url_scope;
    }
    return base;
  });
}

async function leaseJobs(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { n?: number };
  return json({ jobs: await leasaRenderJobb(env, body.n ?? 10) });
}

export interface ResultBody {
  error?: string;
  title?: string | null;
  price?: number | null;
  source_text?: string;
  category?: string | null;
  links?: string[];
  items?: { url: string; title?: string | null; price?: number | null; category?: string | null }[];
}

export async function rapporteraRenderResultat(id: number, body: ResultBody, env: RenderKoEnv): Promise<Response> {
  const now = Date.now();
  const job = await env.DB.prepare(
    "SELECT id, url, type, site_id, attempts FROM render_jobs WHERE id = ?1",
  )
    .bind(id)
    .first<{ id: number; url: string; type: string; site_id: number | null; attempts: number }>();
  if (!job) return json({ error: "okänt jobb" }, 404);

  if (body.error) {
    const dead = job.attempts >= MAX_ATTEMPTS;
    await env.DB.prepare(
      "UPDATE render_jobs SET status = ?1, last_error = ?2, updated_at = ?3 WHERE id = ?4",
    )
      .bind(dead ? "error" : "pending", body.error.slice(0, 500), now, id)
      .run();
    return json({ ok: true, retried: !dead });
  }

  const stmts: D1PreparedStatement[] = [];

  // En AI-beskrivning är härledd från source_text. Om en ny detail-render ger
  // annat underlag ska den gamla beskrivningen inte ligga kvar som giltig cache.
  if (body.source_text != null) {
    stmts.push(
      env.DB.prepare(
        `UPDATE products
         SET description = NULL, description_why = NULL, description_updated_at = NULL
         WHERE url = ?1 AND source_text IS NOT ?2`,
      ).bind(job.url, body.source_text),
    );
  }

  if (body.title != null || body.price != null || body.source_text != null || body.category != null) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO products (url, site_id, title, current_price, source_text, category, source_text_updated_at, first_seen, last_updated)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT(url) DO UPDATE SET
           title = COALESCE(excluded.title, products.title),
           current_price = COALESCE(excluded.current_price, products.current_price),
           source_text = COALESCE(excluded.source_text, products.source_text),
           category = COALESCE(excluded.category, products.category),
           source_text_updated_at = CASE WHEN excluded.source_text IS NOT NULL
             THEN excluded.source_text_updated_at ELSE products.source_text_updated_at END,
           last_updated = excluded.last_updated`,
      ).bind(
        job.url,
        job.site_id,
        body.title ?? null,
        body.price ?? null,
        body.source_text ?? null,
        body.category ?? null,
        body.source_text != null ? now : null,
        now,
      ),
    );
  }

  if (body.price != null) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO price_history (product_id, price, ts)
         SELECT p.id, ?1, ?2 FROM products p
         WHERE p.url = ?3 AND NOT EXISTS (
           SELECT 1 FROM price_history ph WHERE ph.product_id = p.id
             AND ph.price = ?1
             AND ph.ts = (SELECT MAX(ts) FROM price_history ph2 WHERE ph2.product_id = p.id)
         )`,
      ).bind(body.price, now, job.url),
    );
  }

  for (const link of body.links ?? []) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO products (url, site_id, first_seen, last_updated) VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(url) DO NOTHING`,
      ).bind(link, job.site_id, now),
    );
    stmts.push(
      env.DB.prepare(
        `INSERT INTO render_jobs (url, site_id, type, created_at, updated_at)
         SELECT ?1, ?2, 'detail', ?3, ?3
         WHERE NOT EXISTS (
           SELECT 1 FROM render_jobs WHERE url = ?1 AND type = 'detail' AND status IN ('pending','leased')
         )`,
      ).bind(link, job.site_id, now),
    );
  }

  for (const item of body.items ?? []) {
    if (!item.url) continue;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO products (url, site_id, title, current_price, category, first_seen, last_updated)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(url) DO UPDATE SET
           title = COALESCE(excluded.title, products.title),
           current_price = COALESCE(excluded.current_price, products.current_price),
           category = COALESCE(excluded.category, products.category),
           last_updated = excluded.last_updated`,
      ).bind(item.url, job.site_id, item.title ?? null, item.price ?? null, item.category ?? null, now),
    );
    if (item.price != null) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO price_history (product_id, price, ts)
           SELECT p.id, ?1, ?2 FROM products p
           WHERE p.url = ?3 AND NOT EXISTS (
             SELECT 1 FROM price_history ph WHERE ph.product_id = p.id
               AND ph.price = ?1
               AND ph.ts = (SELECT MAX(ts) FROM price_history ph2 WHERE ph2.product_id = p.id)
           )`,
        ).bind(item.price, now, item.url),
      );
    }
    stmts.push(
      env.DB.prepare(
        `INSERT INTO render_jobs (url, site_id, type, created_at, updated_at)
         SELECT ?1, ?2, 'detail', ?3, ?3
         WHERE EXISTS (SELECT 1 FROM products WHERE url = ?1 AND source_text IS NULL)
           AND NOT EXISTS (
             SELECT 1 FROM render_jobs WHERE url = ?1 AND type = 'detail' AND status IN ('pending','leased')
           )`,
      ).bind(item.url, job.site_id, now),
    );
  }

  stmts.push(
    env.DB.prepare("UPDATE render_jobs SET status = 'done', updated_at = ?1 WHERE id = ?2").bind(now, id),
  );
  await env.DB.batch(stmts);
  return json({ ok: true, links: body.links?.length ?? 0, items: body.items?.length ?? 0 });
}

async function reportResult(id: number, req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as ResultBody;
  return rapporteraRenderResultat(id, body, env);
}

interface IngestBody {
  products?: { url: string; title?: string; price?: number; site_id?: number; source_text?: string }[];
}

async function ingest(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as IngestBody;
  const items = body.products ?? [];
  if (items.length === 0) return json({ upserted: 0 });
  const now = Date.now();
  const stmts = items
    .filter((p) => p.url)
    .map((p) =>
      env.DB.prepare(
        `INSERT INTO products (url, site_id, title, current_price, source_text, source_text_updated_at, first_seen, last_updated)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(url) DO UPDATE SET
           title = COALESCE(excluded.title, products.title),
           current_price = COALESCE(excluded.current_price, products.current_price),
           source_text = COALESCE(excluded.source_text, products.source_text),
           source_text_updated_at = CASE WHEN excluded.source_text IS NOT NULL
             THEN excluded.source_text_updated_at ELSE products.source_text_updated_at END,
           last_updated = excluded.last_updated`,
      ).bind(
        p.url,
        p.site_id ?? null,
        p.title ?? null,
        p.price ?? null,
        p.source_text ?? null,
        p.source_text != null ? now : null,
        now,
      ),
    );
  await env.DB.batch(stmts);
  return json({ upserted: stmts.length });
}

function buildChainFromEnv(env: Env): ProviderChain | null {
  const specs: ProviderSpec[] = [];
  const keys: Record<ProviderName, string | undefined> = {
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
    gemini: env.GEMINI_API_KEY,
    azure_openai: env.AZURE_OPENAI_API_KEY,
  };
  for (const [name, apiKey] of Object.entries(keys) as [ProviderName, string | undefined][]) {
    if (!apiKey) continue;
    if (name === "azure_openai") {
      if (!env.AZURE_OPENAI_ENDPOINT || !env.AZURE_OPENAI_DEPLOYMENT) continue;
      specs.push({
        provider: name,
        creds: { apiKey, endpoint: env.AZURE_OPENAI_ENDPOINT, deployment: env.AZURE_OPENAI_DEPLOYMENT },
        model: env.AZURE_OPENAI_DEPLOYMENT,
      });
      continue;
    }
    specs.push({ provider: name, creds: { apiKey }, model: DEFAULT_MODELS[name][0] });
  }
  return specs.length > 0 ? new ProviderChain(specs) : null;
}

async function reclaimLeases(env: Env, now: number): Promise<number> {
  const r = await env.DB.prepare(
    "UPDATE render_jobs SET status='pending', updated_at=?1 WHERE status='leased' AND lease_until < ?1",
  )
    .bind(now)
    .run();
  return r.meta.changes ?? 0;
}

async function scheduleDetailJobs(env: Env, now: number, limit: number): Promise<number> {
  const r = await env.DB.prepare(
    `INSERT INTO render_jobs (url, site_id, type, status, created_at, updated_at)
     SELECT p.url, p.site_id, 'detail', 'pending', ?1, ?1 FROM products p
     WHERE (p.source_text IS NULL OR p.category IS NULL)
       AND NOT EXISTS (
         SELECT 1 FROM render_jobs rj
         WHERE rj.url = p.url AND rj.type = 'detail' AND rj.status IN ('pending','leased')
       )
     LIMIT ?2`,
  )
    .bind(now, limit)
    .run();
  return r.meta.changes ?? 0;
}

async function scheduleDueCrawls(env: Env, now: number): Promise<number> {
  const due = await env.DB.prepare(
    `SELECT id, base_url FROM sites
     WHERE enabled = 1
       AND (last_crawled IS NULL OR last_crawled + scrape_interval * 1000 < ?1)
       AND NOT EXISTS (
         SELECT 1 FROM render_jobs rj
         WHERE rj.site_id = sites.id AND rj.type = 'list' AND rj.status IN ('pending','leased')
       )`,
  )
    .bind(now)
    .all<{ id: number; base_url: string }>();
  const sites = due.results ?? [];
  if (sites.length === 0) return 0;
  const stmts = sites.flatMap((s) => [
    env.DB.prepare(
      `INSERT INTO render_jobs (url, site_id, type, status, created_at, updated_at)
       VALUES (?1, ?2, 'list', 'pending', ?3, ?3)`,
    ).bind(s.base_url, s.id, now),
    env.DB.prepare("UPDATE sites SET last_crawled = ?1 WHERE id = ?2").bind(now, s.id),
  ]);
  await env.DB.batch(stmts);
  return sites.length;
}

async function describeMissing(env: Env, chain: ProviderChain, now: number, limit: number, concurrency: number): Promise<number> {
  const sel = await env.DB.prepare(
    `SELECT p.id, p.title, p.category, p.source_text, p.current_price, s.name AS site_name
     FROM products p LEFT JOIN sites s ON s.id = p.site_id
     WHERE p.description IS NULL
     ORDER BY (p.source_text IS NOT NULL) DESC, p.id
     LIMIT ?1`,
  )
    .bind(limit)
    .all<{
      id: number;
      title: string | null;
      category: string | null;
      source_text: string | null;
      current_price: number | null;
      site_name: string | null;
    }>();
  const products = sel.results ?? [];
  if (products.length === 0) return 0;

  let done = 0;
  const system = buildSystemPrompt();
  for (let i = 0; i < products.length; i += concurrency) {
    const batch = products.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (p) => {
        try {
          const parts = await chain.generate(
            system,
            userMessage(
              p.site_name ?? "",
              p.title ?? "",
              p.current_price != null ? String(p.current_price) : "",
              p.category ?? "",
              p.source_text ?? "",
            ),
          );
          if (!parts.beskrivning) return false;
          await env.DB.prepare(
            "UPDATE products SET description=?1, description_why=?2, description_updated_at=?3 WHERE id=?4",
          )
            .bind(parts.beskrivning, parts.varför, now, p.id)
            .run();
          return true;
        } catch (err) {
          if (err instanceof AllProvidersExhausted) throw err;
          console.warn(`Hoppar över produkt ${p.id}:`, err);
          return false;
        }
      }),
    ).catch((err) => {
      if (err instanceof AllProvidersExhausted) return null;
      throw err;
    });
    if (results === null) break;
    done += results.filter(Boolean).length;
  }
  return done;
}

interface ProductRow {
  id: number;
  title: string | null;
  category: string | null;
  source_text: string | null;
  description: string | null;
  description_why: string | null;
  current_price: number | null;
  site_name: string | null;
}

async function describeProduct(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { url?: unknown; id?: unknown; refresh?: unknown };
  const hasUrl = typeof body.url === "string" && body.url.trim() !== "";
  const hasId = Number.isInteger(body.id) && Number(body.id) > 0;
  if (hasUrl === hasId) return json({ error: "ange exakt en av url eller id" }, 400);
  const where = hasUrl ? "p.url = ?1" : "p.id = ?1";
  const key = hasUrl ? (body.url as string).trim() : body.id;
  const refresh = body.refresh === true;
  const p = await env.DB.prepare(
    `SELECT p.id, p.title, p.category, p.source_text, p.description, p.description_why,
            p.current_price, s.name AS site_name
     FROM products p LEFT JOIN sites s ON s.id = p.site_id
     WHERE ${where}`,
  )
    .bind(key)
    .first<ProductRow>();
  if (!p) return json({ error: "produkt finns inte" }, 404);
  if (p.description && !refresh) {
    return json({ beskrivning: p.description, varför: p.description_why ?? "", cached: true });
  }
  const chain = buildChainFromEnv(env);
  if (!chain) return json({ error: "ingen AI-leverantör konfigurerad" }, 503);

  let parts: { beskrivning: string; varför: string };
  try {
    parts = await chain.generate(
      buildSystemPrompt(),
      userMessage(
        p.site_name ?? "",
        p.title ?? "",
        p.current_price != null ? String(p.current_price) : "",
        p.category ?? "",
        p.source_text ?? "",
      ),
    );
  } catch (err) {
    if (err instanceof AllProvidersExhausted) {
      const retryAfter = Math.max(1, Math.ceil((err.resumeAt.getTime() - Date.now()) / 1000));
      return new Response(
        JSON.stringify({ error: "AI-kvot tillfälligt slut, försök snart igen", retry_at: err.resumeAt.toISOString() }),
        {
          status: 429,
          headers: { "content-type": "application/json; charset=utf-8", "Retry-After": String(retryAfter) },
        },
      );
    }
    return json({ error: err instanceof Error ? err.message : "beskrivning misslyckades" }, 502);
  }
  if (!parts.beskrivning) return json({ error: "tomt svar från AI" }, 502);
  await env.DB.prepare(
    "UPDATE products SET description=?1, description_why=?2, description_updated_at=?3 WHERE id=?4",
  )
    .bind(parts.beskrivning, parts.varför, Date.now(), p.id)
    .run();
  return json({ beskrivning: parts.beskrivning, varför: parts.varför, cached: false });
}

async function sendAlert(kind: string, target: string, title: string, body: string, url: string): Promise<boolean> {
  try {
    if (kind === "ntfy") {
      const r = await fetch(target, { method: "POST", headers: { Title: title, Click: url }, body });
      return r.ok;
    }
    if (kind === "slack") {
      const r = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `*${title}*\n${body}\n${url}` }),
      });
      return r.ok;
    }
    if (kind === "telegram") {
      const sep = target.lastIndexOf(":");
      const r = await fetch(`https://api.telegram.org/bot${target.slice(0, sep)}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: target.slice(sep + 1), text: `${title}\n${body}\n${url}` }),
      });
      return r.ok;
    }
    if (kind === "webhook") {
      const r = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, url }),
      });
      return r.ok;
    }
  } catch {
    return false;
  }
  return false;
}

interface DropRow {
  account_id: string;
  product_id: number;
  last_alert: number | null;
  title: string | null;
  url: string;
  new_price: number;
  old_price: number;
}

async function checkPriceDrops(env: Env, now: number): Promise<number> {
  const minPct = Number(env.ALERT_MIN_DROP_PCT) || 5;
  const minKr = Number(env.ALERT_MIN_DROP_KR) || 100;
  const cooldownMs = (Number(env.ALERT_COOLDOWN_HOURS) || 24) * 3_600_000;
  const drops = await env.DB.prepare(
    `WITH ranked AS (
       SELECT product_id, price, ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY ts DESC) rn
       FROM price_history
       WHERE product_id IN (SELECT DISTINCT product_id FROM price_watch)
     ),
     pair AS (
       SELECT a.product_id, a.price AS new_price, b.price AS old_price
       FROM ranked a JOIN ranked b ON a.product_id = b.product_id AND b.rn = 2
       WHERE a.rn = 1
     )
     SELECT w.account_id, w.product_id, w.last_alert, pr.title, pr.url,
            pair.new_price, pair.old_price
     FROM price_watch w
     JOIN pair ON pair.product_id = w.product_id
     JOIN products pr ON pr.id = w.product_id
     WHERE pair.new_price < pair.old_price`,
  ).all<DropRow>();

  let sent = 0;
  for (const d of drops.results ?? []) {
    const dropKr = d.old_price - d.new_price;
    const dropPct = (dropKr / d.old_price) * 100;
    if (dropPct < minPct || dropKr < minKr) continue;
    if (d.last_alert != null && d.last_alert + cooldownMs > now) continue;
    const channels = await env.DB.prepare(
      "SELECT kind, target FROM alert_channels WHERE account_id = ?1 AND enabled = 1",
    )
      .bind(d.account_id)
      .all<{ kind: string; target: string }>();
    const list = channels.results ?? [];
    if (list.length === 0) continue;
    const title = "💸 Prisfall";
    const body = `${d.title ?? "Produkt"}: ${d.old_price} kr → ${d.new_price} kr (-${dropKr} kr, ${dropPct.toFixed(0)} %)`;
    let anySent = false;
    for (const c of list) {
      if (await sendAlert(c.kind, c.target, title, body, d.url)) anySent = true;
    }
    if (anySent) {
      await env.DB.prepare("UPDATE price_watch SET last_alert = ?1 WHERE account_id = ?2 AND product_id = ?3")
        .bind(now, d.account_id, d.product_id)
        .run();
      sent++;
    }
  }
  return sent;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    try {
      const reclaimed = await reclaimLeases(env, now);
      const crawls = await scheduleDueCrawls(env, now);
      const scheduled = await scheduleDetailJobs(env, now, Number(env.SCHEDULE_LIMIT) || 200);
      const alerts = await checkPriceDrops(env, now);
      let described = 0;
      const chain = buildChainFromEnv(env);
      if (chain) {
        described = await describeMissing(env, chain, now, Number(env.DESCRIBE_LIMIT) || 10, Number(env.DESCRIBE_WORKERS) || 2);
      }
      console.log(`cron: reclaimed=${reclaimed} crawls=${crawls} scheduled=${scheduled} alerts=${alerts} described=${described}`);
    } catch (err) {
      console.error("cron misslyckades:", err);
      await reportErrorToGitHub(REPO, "Engine cron misslyckades", err, env);
    }
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === "GET" && path === "/health") return json({ ok: true });
    if (!authorized(req, env)) return json({ error: "obehörig" }, 401);
    try {
      if (req.method === "POST" && path === "/jobs/lease") return await leaseJobs(req, env);
      if (req.method === "POST" && path === "/ingest") return await ingest(req, env);
      if (req.method === "POST" && path === "/describe") return await describeProduct(req, env);
      const m = path.match(/^\/jobs\/(\d+)\/result$/);
      if (req.method === "POST" && m) return await reportResult(Number(m[1]), req, env);
      return json({ error: "okänd route" }, 404);
    } catch (err) {
      console.error("engine fetch-fel:", err);
      return json({ error: "internt fel" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
