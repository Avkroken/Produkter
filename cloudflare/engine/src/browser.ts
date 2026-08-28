import { launch } from "@cloudflare/playwright";

export interface BrowserRunEnv {
  BROWSER: Fetcher;
  INGEST_API_KEY: string;
}

type InternalFetch = (request: Request) => Promise<Response>;

type RenderJob = {
  id: number;
  url: string;
  type: "detail" | "list" | string;
  site_id: number | null;
  detail_selector?: string;
  use_stealth?: number;
  base_url?: string;
  product_selector?: string;
  title_selector?: string;
  price_selector?: string;
  link_selector?: string;
  pagination_type?: string;
  max_pages?: number;
  exclude_link_pattern?: string;
  url_scope?: string;
};

type RenderResult = {
  error?: string;
  title?: string | null;
  price?: number | null;
  source_text?: string;
  category?: string | null;
  items?: Array<{ url: string; title?: string | null; price?: number | null; category?: string | null }>;
};

const MAX_SOURCE_LEN = 1200;
const MAX_LIST_PAGES = 60;
const RENDER_WAIT_MS = 12_000;

const JSONLD_READY_JS = `() => {
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let d; try { d = JSON.parse(s.textContent || ''); } catch { continue; }
    const ns = Array.isArray(d) ? d : (d['@graph'] || [d]);
    for (const n of ns) {
      if (!n) continue;
      const t = n['@type'];
      const isProduct = t === 'Product' || (Array.isArray(t) && t.includes('Product'));
      if (isProduct && n.description) return true;
    }
  }
  return false;
}`;

const DETAIL_EXTRACT_JS = `(detailSelector) => {
  const clean = (t) => (t || '').replace(/\\s+/g, ' ').trim();
  const out = { title: null, price: null, source_text: '', category: null };

  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let d; try { d = JSON.parse(s.textContent || ''); } catch { continue; }
    const ns = Array.isArray(d) ? d : (d['@graph'] || [d]);
    for (const n of ns) {
      const t = n && n['@type'];
      const isBreadcrumb = t === 'BreadcrumbList' || (Array.isArray(t) && t.includes('BreadcrumbList'));
      if (n && isBreadcrumb && Array.isArray(n.itemListElement)) {
        const names = n.itemListElement
          .map((e) => clean((e && e.item && e.item.name) || (e && e.name)))
          .filter(Boolean);
        if (names.length >= 2) out.category = names[names.length - 2];
        else if (names.length === 1) out.category = names[0];
      }
    }
    if (out.category) break;
  }

  let product = null;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let d; try { d = JSON.parse(s.textContent || ''); } catch { continue; }
    const ns = Array.isArray(d) ? d : (d['@graph'] || [d]);
    for (const n of ns) {
      if (!n) continue;
      const t = n['@type'];
      const isProduct = t === 'Product' || (Array.isArray(t) && t.includes('Product'));
      if (isProduct) { product = n; break; }
    }
    if (product) break;
  }

  if (product) {
    if (product.name) out.title = clean(product.name);
    const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    const p = offers && (offers.price ?? offers.lowPrice);
    if (p != null) {
      const num = Math.round(parseFloat(String(p).replace(/\\s/g, '').replace(',', '.')));
      if (!Number.isNaN(num)) out.price = num;
    }
  }

  if (detailSelector) {
    try {
      const el = document.querySelector(detailSelector);
      if (el) {
        const text = clean(el.innerText || el.textContent);
        if (text) out.source_text = text;
      }
    } catch {}
  }
  if (!out.category && product && typeof product.category === 'string') out.category = clean(product.category);
  if (!out.category) {
    const bc = document.querySelector('nav[aria-label*="readcrumb"], ol[class*="readcrumb"], ul[class*="readcrumb"], [class*="readcrumb"]');
    if (bc) {
      let els = bc.querySelectorAll('a');
      if (!els.length) els = bc.querySelectorAll('li');
      let items = Array.from(els).map((e) => clean(e.innerText || e.textContent)).filter(Boolean);
      items = items.filter((v, i, a) => a.indexOf(v) === i);
      if (items.length) {
        let last = items[items.length - 1];
        if (out.title && last === clean(out.title) && items.length >= 2) last = items[items.length - 2];
        if (last && last.length <= 60) out.category = last;
      }
    }
  }
  if (!out.source_text && product && product.description) out.source_text = clean(product.description);
  if (!out.source_text) {
    const og = document.querySelector('meta[property="og:description"]');
    if (og && og.content) out.source_text = clean(og.content);
  }
  if (!out.source_text) {
    const m = document.querySelector('meta[name="description"]');
    if (m && m.content) out.source_text = clean(m.content);
  }
  return out;
}`;

const LIST_EXTRACT_JS = `(cfg) => {
  const clean = (t) => (t || '').replace(/\\s+/g, ' ').trim();
  const toInt = (s) => {
    const d = (s || '').replace(/[^\\d]/g, '');
    if (!d) return null;
    const n = parseInt(d, 10);
    return Number.isNaN(n) ? null : n;
  };
  const parsePrice = (text, scoped) => {
    const t = clean(text);
    if (scoped) return toInt((t.match(/\\d[\\d\\s]*/) || [])[0]);
    const m = t.match(/(\\d[\\d\\s]*?)\\s*(?:kr|:-)/);
    return m ? toInt(m[1]) : null;
  };
  const out = [];
  const els = document.querySelectorAll(cfg.productSel);
  for (const el of els) {
    let title = null;
    if (cfg.titleSel) {
      const t = el.querySelector(cfg.titleSel);
      if (t) title = clean(t.innerText || t.textContent);
    }
    if (!title) title = clean(el.innerText).slice(0, 200) || null;

    let price = null;
    if (cfg.priceSel && !cfg.priceSel.startsWith('text=')) {
      const p = el.querySelector(cfg.priceSel);
      if (p) price = parsePrice(p.innerText || p.textContent, true);
    }
    if (price == null) price = parsePrice(el.innerText, false);

    let href = null;
    if (cfg.linkSel) {
      const a = el.querySelector(cfg.linkSel);
      if (a) href = a.getAttribute('href');
    }
    if (!href && el.tagName === 'A') href = el.getAttribute('href');
    if (!href) {
      const a = el.querySelector('a');
      if (a) href = a.getAttribute('href');
    }
    if (!href) continue;

    let url;
    try { url = new URL(href, location.href).href; } catch { continue; }
    if (cfg.excludePattern && url.includes(cfg.excludePattern)) continue;
    if (cfg.urlScope && !url.includes(cfg.urlScope)) continue;
    out.push({ url, title, price });
  }
  return out;
}`;

function headers(env: BrowserRunEnv): HeadersInit {
  return { "X-API-Key": env.INGEST_API_KEY, "Content-Type": "application/json" };
}

async function leaseJobs(env: BrowserRunEnv, dispatch: InternalFetch, n: number): Promise<RenderJob[]> {
  const response = await dispatch(
    new Request("https://engine.internal/jobs/lease", {
      method: "POST",
      headers: headers(env),
      body: JSON.stringify({ n }),
    }),
  );
  if (!response.ok) throw new Error(`lease failed: ${response.status}`);
  const body = (await response.json()) as { jobs?: RenderJob[] };
  return body.jobs ?? [];
}

async function reportResult(env: BrowserRunEnv, dispatch: InternalFetch, jobId: number, result: RenderResult): Promise<void> {
  const response = await dispatch(
    new Request(`https://engine.internal/jobs/${jobId}/result`, {
      method: "POST",
      headers: headers(env),
      body: JSON.stringify(result),
    }),
  );
  if (!response.ok) throw new Error(`result failed: ${response.status}`);
}

async function acceptCookies(page: any): Promise<void> {
  for (const selector of [
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "button#onetrust-accept-btn-handler",
    "button:has-text('Acceptera alla')",
    "button:has-text('Godkänn alla')",
  ]) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        await locator.click({ timeout: 2_000 });
        return;
      }
    } catch {
      // Best-effort: fortsätt med nästa vanligt förekommande cookie-knapp.
    }
  }
}

async function renderDetail(context: any, job: RenderJob): Promise<RenderResult> {
  const page = await context.newPage();
  try {
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await acceptCookies(page);
    const detailSelector = job.detail_selector ?? "";
    try {
      if (detailSelector) await page.waitForSelector(detailSelector, { timeout: RENDER_WAIT_MS });
      else await page.waitForFunction(JSONLD_READY_JS as any, undefined, { timeout: RENDER_WAIT_MS });
    } catch {
      // Best-effort: extrahera den data som hunnit renderas.
    }
    const data = (await page.evaluate(DETAIL_EXTRACT_JS as any, detailSelector)) as {
      title: string | null;
      price: number | null;
      source_text: string;
      category: string | null;
    };
    return {
      title: data.title,
      price: data.price,
      source_text: (data.source_text ?? "").slice(0, MAX_SOURCE_LEN),
      category: data.category,
    };
  } finally {
    await page.close();
  }
}

async function infiniteScroll(page: any, productSelector: string): Promise<void> {
  let previous = -1;
  for (let i = 0; i < 15; i++) {
    try {
      const before = (await page.locator(productSelector).count()) as number;
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForTimeout(500);
      const after = (await page.locator(productSelector).count()) as number;
      if (after === before && after === previous) break;
      previous = after;
    } catch {
      break;
    }
  }
}

async function renderList(context: any, job: RenderJob): Promise<RenderResult> {
  const baseUrl = job.base_url ?? job.url;
  const productSelector = job.product_selector ?? "";
  if (!productSelector) return { items: [] };

  const maxPages = Math.min(Math.max(1, Number(job.max_pages) || 1), MAX_LIST_PAGES);
  const pages = job.pagination_type === "query" ? maxPages : 1;
  const seen = new Map<string, { url: string; title?: string | null; price?: number | null }>();

  const cfg = {
    productSel: productSelector,
    titleSel: job.title_selector ?? "",
    priceSel: job.price_selector ?? "",
    linkSel: job.link_selector ?? "",
    excludePattern: job.exclude_link_pattern ?? "",
    urlScope: job.url_scope ?? "",
  };

  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const url = pageNum === 1 ? baseUrl : `${baseUrl}${separator}page=${pageNum}`;
    const page = await context.newPage();
    let items: Array<{ url: string; title?: string | null; price?: number | null }> = [];
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await acceptCookies(page);
      await infiniteScroll(page, productSelector);
      items = (await page.evaluate(LIST_EXTRACT_JS as any, cfg)) as typeof items;
    } finally {
      await page.close();
    }
    if (items.length === 0) break;
    for (const item of items) if (item.url) seen.set(item.url, item);
    if (pageNum < pages) await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { items: [...seen.values()] };
}

async function renderJob(context: any, job: RenderJob): Promise<RenderResult> {
  if (job.type === "detail") return renderDetail(context, job);
  if (job.type === "list") return renderList(context, job);
  return { error: `unsupported render job type: ${job.type}` };
}

export async function processBrowserQueue(
  env: BrowserRunEnv,
  dispatch: InternalFetch,
  limit: number,
): Promise<number> {
  if (!env.INGEST_API_KEY) throw new Error("INGEST_API_KEY saknas");
  const jobs = await leaseJobs(env, dispatch, limit);
  if (jobs.length === 0) return 0;

  // En session per cron-tick, flera sidor/jobbs inom samma browser. Det minskar
  // acquisitions/concurrency och följer Browser Runs rekommendation om reuse.
  const browser = await launch(env.BROWSER, { keep_alive: 60_000 });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "sv-SE",
    timezoneId: "Europe/Stockholm",
    extraHTTPHeaders: { "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7" },
  });

  let done = 0;
  try {
    // Sekventiellt medvetet: list-jobb kan själva öppna många sidor. Det håller
    // target-rate och Browser Run-concurrency låg; nästa cron fortsätter kön.
    for (const job of jobs) {
      try {
        const result = await renderJob(context, job);
        await reportResult(env, dispatch, job.id, result);
        done++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          await reportResult(env, dispatch, job.id, { error: message.slice(0, 400) });
        } catch {
          // Leasen löper ut och reclaimas av core-handlern vid nästa cron.
        }
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
  return done;
}
