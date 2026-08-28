export interface CrawlEnv {
  DB: D1Database;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_BROWSER_TOKEN?: string;
  CRAWL_SITE_LIMIT?: string;
  CRAWL_PAGE_LIMIT?: string;
}

type CrawlSite = {
  job_id: number;
  site_id: number;
  url: string;
  base_url: string;
  max_pages: number;
  url_scope: string;
  exclude_link_pattern: string;
};

type CrawlRun = {
  site_id: number;
  crawl_id: string;
  status: string;
  started_at: number;
  updated_at: number;
  mode?: string;
};

type CrawlRecord = {
  url?: string;
  status?: string;
  json?: unknown;
  metadata?: { status?: number; title?: string; url?: string };
};

type CrawlResultat = {
  id?: string;
  status?: string;
  records?: CrawlRecord[];
  cursor?: string | number | null;
  total?: number;
  finished?: number;
  browserSecondsUsed?: number;
};

type CrawlSvar = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: CrawlResultat | string;
};

type ProduktData = {
  isProduct?: boolean;
  name?: string;
  price?: number;
  currency?: string;
  description?: string;
  category?: string;
};

type CrawlLage = "static" | "rendered";

const MAX_KALLTEXT_LANGD = 1200;
const STANDARD_SAJTER_PER_TICK = 2;
const STANDARD_SIDTAK = 100;
const ABSOLUT_SIDTAK = 1000;
const MAX_RUN_AGE_MS = 30 * 60 * 1000;
const FALLBACK_MARKOR = "playwright-fallback:";

function apiBas(env: CrawlEnv): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID ?? "")}/browser-rendering/crawl`;
}

function authHeaders(env: CrawlEnv): HeadersInit {
  return { Authorization: `Bearer ${env.CLOUDFLARE_BROWSER_TOKEN ?? ""}`, "content-type": "application/json" };
}

function harCrawlKonfiguration(env: CrawlEnv): boolean {
  return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_BROWSER_TOKEN);
}

async function sakerstallTabell(env: CrawlEnv): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS crawl_runs (
       site_id INTEGER PRIMARY KEY,
       crawl_id TEXT NOT NULL,
       status TEXT NOT NULL,
       mode TEXT NOT NULL DEFAULT 'static',
       started_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL,
       last_error TEXT
     )`,
  ).run();
  try {
    await env.DB.prepare("ALTER TABLE crawl_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'static'").run();
  } catch {
    // Kolumnen finns redan på uppgraderade databaser.
  }
}

function sidtak(env: CrawlEnv, site: CrawlSite): number {
  const globalt = Math.min(Math.max(1, Number(env.CRAWL_PAGE_LIMIT) || STANDARD_SIDTAK), ABSOLUT_SIDTAK);
  return Math.min(Math.max(1, Number(site.max_pages) || STANDARD_SIDTAK), globalt);
}

function includeMonster(site: CrawlSite): string[] {
  if (site.url_scope.trim()) {
    const scope = site.url_scope.trim().replace(/\*+$/, "").replace(/\/+$/, "");
    return [`${scope}/**`];
  }
  const origin = new URL(site.base_url).origin;
  return [`${origin}/**`];
}

function excludeMonster(site: CrawlSite): string[] | undefined {
  const pattern = site.exclude_link_pattern.trim();
  return pattern ? [`**${pattern}**`] : undefined;
}

function crawlBody(env: CrawlEnv, site: CrawlSite, mode: CrawlLage): Record<string, unknown> {
  const body: Record<string, unknown> = {
    url: site.base_url || site.url,
    crawlPurposes: ["search"],
    limit: sidtak(env, site),
    source: "all",
    render: mode === "rendered",
    formats: ["json"],
    jsonOptions: {
      prompt:
        "Avgör om sidan är en enskild produktsida. Om den är det: extrahera produktnamn, aktuellt pris som ett numeriskt värde, valuta, kort saklig produktbeskrivning och kategori. Sätt isProduct till true. Om sidan inte är en produktsida, sätt isProduct till false. Hitta inte på saknade värden.",
      response_format: {
        type: "json_schema",
        json_schema: {
          type: "object",
          properties: {
            isProduct: { type: "boolean" }, name: { type: "string" }, price: { type: "number" },
            currency: { type: "string" }, description: { type: "string" }, category: { type: "string" },
          },
          required: ["isProduct"],
        },
      },
    },
    options: {
      includeExternalLinks: false, includeSubdomains: false,
      includePatterns: includeMonster(site), excludePatterns: excludeMonster(site),
    },
  };
  if (mode === "rendered") body.rejectResourceTypes = ["image", "media", "font", "stylesheet"];
  return body;
}

async function startaCrawl(env: CrawlEnv, site: CrawlSite, mode: CrawlLage): Promise<string> {
  const response = await fetch(apiBas(env), { method: "POST", headers: authHeaders(env), body: JSON.stringify(crawlBody(env, site, mode)) });
  const data = (await response.json().catch(() => ({}))) as CrawlSvar;
  const id = typeof data.result === "string" ? data.result : data.result?.id;
  if (!response.ok || !data.success || !id) {
    const message = data.errors?.map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${response.status}`;
    throw new Error(`crawl-start misslyckades: ${message}`);
  }
  return id;
}

async function hamtaCrawl(env: CrawlEnv, crawlId: string, query = "limit=1"): Promise<CrawlResultat> {
  const suffix = query ? `?${query}` : "";
  const response = await fetch(`${apiBas(env)}/${encodeURIComponent(crawlId)}${suffix}`, { headers: authHeaders(env) });
  const data = (await response.json().catch(() => ({}))) as CrawlSvar;
  if (!response.ok || !data.success || typeof data.result === "string" || !data.result) {
    const message = data.errors?.map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${response.status}`;
    throw new Error(`crawl-status misslyckades: ${message}`);
  }
  return data.result;
}

function produktFranRecord(record: CrawlRecord): ProduktData | null {
  const raw = record.json;
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  return {
    isProduct: data.isProduct === true,
    name: typeof data.name === "string" ? data.name.trim() : undefined,
    price: typeof data.price === "number" && Number.isFinite(data.price) ? data.price : undefined,
    currency: typeof data.currency === "string" ? data.currency.trim() : undefined,
    description: typeof data.description === "string" ? data.description.trim() : undefined,
    category: typeof data.category === "string" ? data.category.trim() : undefined,
  };
}

function normaliseraPris(product: ProduktData): number | null {
  if (product.price == null || !Number.isFinite(product.price) || product.price < 0) return null;
  const currency = product.currency?.trim().toUpperCase();
  if (!currency || !["SEK", "KR", "KRONOR"].includes(currency)) return null;
  return Math.round(product.price);
}

async function skapaListFallback(env: CrawlEnv, siteId: number, now: number, error: string): Promise<void> {
  const site = await env.DB.prepare("SELECT base_url FROM sites WHERE id=?1 AND enabled=1").bind(siteId).first<{ base_url: string }>();
  if (!site?.base_url) return;
  await env.DB.prepare(
    `INSERT INTO render_jobs (url, site_id, type, status, last_error, created_at, updated_at)
     SELECT ?1, ?2, 'list', 'pending', ?3, ?4, ?4
     WHERE NOT EXISTS (SELECT 1 FROM render_jobs WHERE site_id=?2 AND type='list' AND status IN ('pending','leased'))`,
  ).bind(site.base_url, siteId, `${FALLBACK_MARKOR}${error}`.slice(0, 500), now).run();
}

async function importeraRecord(env: CrawlEnv, siteId: number, record: CrawlRecord, now: number): Promise<boolean> {
  const url = record.url || record.metadata?.url;
  if (!url) {
    console.warn("crawl_record_avvisad", { siteId, orsak: "saknar-url", status: record.status });
    return false;
  }
  if (record.status !== "completed") {
    console.warn("crawl_record_avvisad", { siteId, url, orsak: "ej-completed", status: record.status });
    return false;
  }

  const product = produktFranRecord(record);
  if (!product) {
    console.warn("crawl_record_avvisad", { siteId, url, orsak: "saknar-json" });
    return false;
  }
  if (!product.isProduct) {
    console.warn("crawl_record_avvisad", { siteId, url, orsak: "inte-produkt" });
    return false;
  }

  const title = product.name?.slice(0, 500) || null;
  if (!title) {
    console.warn("crawl_record_avvisad", { siteId, url, orsak: "saknar-titel" });
    return false;
  }
  if (product.price == null || !Number.isFinite(product.price) || product.price < 0) {
    console.warn("crawl_record_avvisad", {
      siteId, url, orsak: "saknar-eller-ogiltigt-pris", price: product.price,
    });
    return false;
  }

  const price = normaliseraPris(product);
  if (price == null) {
    console.warn("crawl_record_avvisad", {
      siteId, url, orsak: "ogiltig-valuta", currency: product.currency ?? null, price: product.price,
    });
    return false;
  }
  const sourceText = product.description?.slice(0, MAX_KALLTEXT_LANGD) || null;
  const category = product.category?.slice(0, 200) || null;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO products (url, site_id, title, current_price, source_text, category, source_text_updated_at, first_seen, last_updated)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
       ON CONFLICT(url) DO UPDATE SET
         site_id = COALESCE(products.site_id, excluded.site_id), title = excluded.title, current_price = excluded.current_price,
         description = CASE WHEN excluded.source_text IS NOT NULL AND COALESCE(excluded.source_text, '') <> COALESCE(products.source_text, '') THEN NULL ELSE products.description END,
         description_why = CASE WHEN excluded.source_text IS NOT NULL AND COALESCE(excluded.source_text, '') <> COALESCE(products.source_text, '') THEN NULL ELSE products.description_why END,
         source_text = COALESCE(excluded.source_text, products.source_text), category = COALESCE(excluded.category, products.category),
         source_text_updated_at = CASE WHEN excluded.source_text IS NOT NULL THEN excluded.source_text_updated_at ELSE products.source_text_updated_at END,
         last_updated = excluded.last_updated`,
    ).bind(url, siteId, title, price, sourceText, category, sourceText ? now : null, now),
    env.DB.prepare(
      `INSERT INTO price_history (product_id, price, ts)
       SELECT p.id, ?1, ?2 FROM products p WHERE p.url=?3 AND NOT EXISTS (
         SELECT 1 FROM price_history ph WHERE ph.product_id=p.id AND ph.price=?1
           AND ph.ts=(SELECT MAX(ts) FROM price_history ph2 WHERE ph2.product_id=p.id))`,
    ).bind(price, now, url),
  ]);
  return true;
}

async function importeraFardigCrawl(env: CrawlEnv, run: CrawlRun): Promise<{ importerade: number; fel: number; disallowed: number }> {
  let cursor: string | number | null | undefined;
  let importerade = 0;
  let fel = 0;
  let disallowed = 0;
  const now = Date.now();
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor != null) params.set("cursor", String(cursor));
    const result = await hamtaCrawl(env, run.crawl_id, params.toString());
    for (const record of result.records ?? []) {
      try {
        if (record.status === "disallowed") disallowed++;
        if (record.status === "errored") fel++;
        if (await importeraRecord(env, run.site_id, record, now)) importerade++;
      } catch (err) {
        fel++;
        console.error("crawl_record_fel", { siteId: run.site_id, url: record.url, fel: err instanceof Error ? err.message : String(err) });
      }
    }
    cursor = result.cursor;
  } while (cursor != null && cursor !== "");
  return { importerade, fel, disallowed };
}

async function hamtaSiteForFallback(env: CrawlEnv, siteId: number): Promise<CrawlSite | null> {
  return env.DB.prepare(
    `SELECT 0 AS job_id, s.id AS site_id, s.base_url AS url, s.base_url, s.max_pages, s.url_scope, s.exclude_link_pattern
     FROM sites s WHERE s.id=?1 AND s.enabled=1`,
  ).bind(siteId).first<CrawlSite>();
}

async function sparaRun(env: CrawlEnv, siteId: number, crawlId: string, mode: CrawlLage, now: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO crawl_runs (site_id, crawl_id, status, mode, started_at, updated_at, last_error)
     VALUES (?1, ?2, 'running', ?3, ?4, ?4, NULL)
     ON CONFLICT(site_id) DO UPDATE SET crawl_id=excluded.crawl_id, status=excluded.status, mode=excluded.mode,
       started_at=excluded.started_at, updated_at=excluded.updated_at, last_error=NULL`,
  ).bind(siteId, crawlId, mode, now).run();
}

async function startaRenderadReserv(env: CrawlEnv, run: CrawlRun, orsak: string): Promise<boolean> {
  const site = await hamtaSiteForFallback(env, run.site_id);
  if (!site) return false;
  try {
    const crawlId = await startaCrawl(env, site, "rendered");
    await sparaRun(env, run.site_id, crawlId, "rendered", Date.now());
    console.warn("crawl_renderad_reserv", { siteId: run.site_id, crawlId, orsak });
    return true;
  } catch (err) {
    console.error("crawl_renderad_start_fel", { siteId: run.site_id, orsak, fel: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

async function behandlaAktivaCrawls(env: CrawlEnv): Promise<number> {
  const runs = await env.DB.prepare("SELECT site_id, crawl_id, status, mode, started_at, updated_at FROM crawl_runs ORDER BY updated_at LIMIT 20").all<CrawlRun>();
  let klara = 0;
  for (const run of runs.results ?? []) {
    try {
      const result = await hamtaCrawl(env, run.crawl_id, "limit=1");
      const status = result.status ?? "unknown";
      await env.DB.prepare("UPDATE crawl_runs SET status=?1, updated_at=?2, last_error=NULL WHERE site_id=?3").bind(status, Date.now(), run.site_id).run();
      console.log("crawl_status", { siteId: run.site_id, crawlId: run.crawl_id, mode: run.mode ?? "static", status, total: result.total, finished: result.finished, browserSecondsUsed: result.browserSecondsUsed });
      if (status === "running" || status === "queued") continue;

      const summary = await importeraFardigCrawl(env, run);
      console.log("crawl_import_klar", { siteId: run.site_id, crawlId: run.crawl_id, mode: run.mode ?? "static", status, ...summary });
      if (summary.fel > 0) {
        console.warn("crawl_import_aterforsok", { siteId: run.site_id, crawlId: run.crawl_id, fel: summary.fel });
        continue;
      }
      if (summary.importerade === 0 && summary.disallowed > 0) {
        console.warn("crawl_disallowed", { siteId: run.site_id, crawlId: run.crawl_id, antal: summary.disallowed });
      } else if (status === "completed" && summary.importerade === 0 && (run.mode ?? "static") === "static") {
        if (await startaRenderadReserv(env, run, "statisk-crawl-gav-inga-produkter")) continue;
        await skapaListFallback(env, run.site_id, Date.now(), "statisk crawl gav inga produkter och renderad reserv kunde inte starta");
      } else if (status !== "completed" && (run.mode ?? "static") === "static") {
        if (await startaRenderadReserv(env, run, `statisk-crawl-${status}`)) continue;
        await skapaListFallback(env, run.site_id, Date.now(), `statisk crawl avslutades med status ${status}`);
      } else if (summary.importerade === 0) {
        await skapaListFallback(env, run.site_id, Date.now(), `crawl avslutades med status ${status} utan kompletta produkter`);
      }
      await env.DB.prepare("DELETE FROM crawl_runs WHERE site_id=?1").bind(run.site_id).run();
      klara++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const now = Date.now();
      if (now - run.started_at >= MAX_RUN_AGE_MS) {
        await env.DB.prepare("DELETE FROM crawl_runs WHERE site_id=?1").bind(run.site_id).run();
        await skapaListFallback(env, run.site_id, now, `crawl-status kunde inte hämtas: ${message}`);
        console.error("crawl_run_utgangen", { siteId: run.site_id, crawlId: run.crawl_id, mode: run.mode ?? "static", fel: message });
        klara++;
      } else {
        await env.DB.prepare("UPDATE crawl_runs SET last_error=?1, updated_at=?2 WHERE site_id=?3").bind(message.slice(0, 500), now, run.site_id).run();
        console.error("crawl_fel", { siteId: run.site_id, crawlId: run.crawl_id, mode: run.mode ?? "static", fel: message });
      }
    }
  }
  return klara;
}

async function delegeraListJobb(env: CrawlEnv): Promise<number> {
  if (!harCrawlKonfiguration(env)) {
    console.warn("crawl_ej_konfigurerad");
    return 0;
  }
  const antal = Math.min(Math.max(1, Number(env.CRAWL_SITE_LIMIT) || STANDARD_SAJTER_PER_TICK), 10);
  const pending = await env.DB.prepare(
    `SELECT r.id AS job_id, r.site_id, r.url, s.base_url, s.max_pages, s.url_scope, s.exclude_link_pattern
     FROM render_jobs r JOIN sites s ON s.id=r.site_id
     WHERE r.type='list' AND r.status='pending' AND s.enabled=1
       AND COALESCE(r.last_error, '') NOT LIKE ?1
     ORDER BY r.id LIMIT ?2`,
  ).bind(`${FALLBACK_MARKOR}%`, antal).all<CrawlSite>();
  let startade = 0;
  for (const site of pending.results ?? []) {
    const active = await env.DB.prepare("SELECT crawl_id FROM crawl_runs WHERE site_id=?1").bind(site.site_id).first<{ crawl_id: string }>();
    if (active) {
      await env.DB.prepare("UPDATE render_jobs SET status='done', updated_at=?1 WHERE id=?2").bind(Date.now(), site.job_id).run();
      continue;
    }
    try {
      const crawlId = await startaCrawl(env, site, "static");
      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO crawl_runs (site_id, crawl_id, status, mode, started_at, updated_at, last_error)
           VALUES (?1, ?2, 'running', 'static', ?3, ?3, NULL)
           ON CONFLICT(site_id) DO UPDATE SET crawl_id=excluded.crawl_id, status=excluded.status, mode='static',
             started_at=excluded.started_at, updated_at=excluded.updated_at, last_error=NULL`,
        ).bind(site.site_id, crawlId, now),
        env.DB.prepare("UPDATE render_jobs SET status='done', last_error=NULL, updated_at=?1 WHERE id=?2").bind(now, site.job_id),
      ]);
      startade++;
      console.log("crawl_startad", { siteId: site.site_id, crawlId, mode: "static", sidtak: sidtak(env, site) });
    } catch (err) {
      console.error("crawl_start_fel", { siteId: site.site_id, mode: "static", fel: err instanceof Error ? err.message : String(err) });
    }
  }
  return startade;
}

export async function bearbetaCrawlKo(env: CrawlEnv): Promise<{ startade: number; klara: number }> {
  await sakerstallTabell(env);
  const klara = harCrawlKonfiguration(env) ? await behandlaAktivaCrawls(env) : 0;
  const startade = await delegeraListJobb(env);
  return { startade, klara };
}