import { launch } from "@cloudflare/playwright";
import { leasaRenderJobb, rapporteraRenderResultat } from "./index";

export interface WebblasareEnv {
  BROWSER: Fetcher;
  DB: D1Database;
  BROWSER_MAX_LIST_PAGES?: string;
}

type RenderJobb = {
  id: number;
  attempt: number;
  url: string;
  type: "detail" | "list" | string;
  site_id: number | null;
  detail_selector?: string;
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

type RenderResultat = {
  error?: string;
  title?: string | null;
  price?: number | null;
  source_text?: string;
  category?: string | null;
  items?: Array<{ url: string; title?: string | null; price?: number | null; category?: string | null }>;
};

const MAX_KALLTEXT_LANGD = 1200;
const ABSOLUT_MAX_LISTSIDOR = 60;
const STANDARD_MAX_LISTSIDOR = 20;
const RENDER_VANTETID_MS = 12_000;
const CRON_BUDGET_MS = 12 * 60_000;

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
      const normalized = String(p).replace(/\\s/g, '').replace(',', '.');
      const num = Number(normalized);
      if (Number.isFinite(num)) out.price = Math.round(num);
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
  const parsePrice = (text) => {
    const t = clean(text).replace(/\\u00a0/g, ' ');
    const m = t.match(/(\\d[\\d\\s.,]*?)\\s*(?:kr|SEK|:-)/i);
    if (!m) return null;
    let value = m[1].replace(/\\s/g, '');
    if (value.includes(',')) value = value.replace(/\\./g, '').replace(',', '.');
    else if (/^\\d{1,3}(?:\\.\\d{3})+$/.test(value)) value = value.replace(/\\./g, '');
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
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
      if (p) price = parsePrice(p.innerText || p.textContent);
    }
    if (price == null) price = parsePrice(el.innerText);

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

function arPrivatVard(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [, aRaw, bRaw] = ipv4;
  const a = Number(aRaw);
  const b = Number(bRaw);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function valideraMalUrl(rawUrl: string, basUrl?: string): URL {
  const url = new URL(rawUrl, basUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Otillåtet protokoll: ${url.protocol}`);
  if (url.username || url.password) throw new Error("URL med inloggningsuppgifter tillåts inte");
  if (arPrivatVard(url.hostname)) throw new Error(`Privat målhost tillåts inte: ${url.hostname}`);
  if (basUrl) {
    const bas = new URL(basUrl);
    if (url.origin !== bas.origin) throw new Error(`Mål utanför butikens origin: ${url.origin}`);
  }
  return url;
}

async function hamtaJobb(env: WebblasareEnv, antal: number): Promise<RenderJobb[]> {
  return (await leasaRenderJobb(env, antal)) as RenderJobb[];
}

async function rapporteraResultat(env: WebblasareEnv, jobb: RenderJobb, resultat: RenderResultat): Promise<void> {
  const response = await rapporteraRenderResultat(jobb.id, { ...resultat, attempt: jobb.attempt }, env);
  if (!response.ok) throw new Error(`Resultatrapportering misslyckades: HTTP ${response.status}`);
}

async function accepteraKakor(page: any): Promise<void> {
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
      // Best effort; fortsätt med nästa vanlig cookie-knapp.
    }
  }
}

async function renderaDetalj(context: any, jobb: RenderJobb): Promise<RenderResultat> {
  const mal = valideraMalUrl(jobb.url, jobb.base_url);
  const page = await context.newPage();
  try {
    await page.goto(mal.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await accepteraKakor(page);
    const detailSelector = jobb.detail_selector ?? "";
    try {
      if (detailSelector) await page.waitForSelector(detailSelector, { timeout: RENDER_VANTETID_MS });
      else await page.waitForFunction(JSONLD_READY_JS as any, undefined, { timeout: RENDER_VANTETID_MS });
    } catch {
      // Extrahera det som hunnit renderas.
    }
    const rawData = await page.evaluate(DETAIL_EXTRACT_JS as any, detailSelector);
    const data = rawData && typeof rawData === "object"
      ? rawData as Partial<RenderResultat>
      : {};
    return {
      title: data.title ?? null,
      price: data.price ?? null,
      source_text: (data.source_text ?? "").slice(0, MAX_KALLTEXT_LANGD),
      category: data.category ?? null,
    };
  } finally {
    await page.close();
  }
}

async function scrollaTillSlut(page: any, produktSelector: string, deadline: number): Promise<void> {
  let previous = -1;
  for (let i = 0; i < 15 && Date.now() < deadline; i++) {
    try {
      const before = (await page.locator(produktSelector).count()) as number;
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForTimeout(500);
      const after = (await page.locator(produktSelector).count()) as number;
      if (after === before && after === previous) break;
      previous = after;
    } catch {
      break;
    }
  }
}

function maxListSidor(env: WebblasareEnv, jobb: RenderJobb): number {
  const globaltTak = Math.min(
    Math.max(1, Number(env.BROWSER_MAX_LIST_PAGES) || STANDARD_MAX_LISTSIDOR),
    ABSOLUT_MAX_LISTSIDOR,
  );
  return Math.min(Math.max(1, Number(jobb.max_pages) || 1), globaltTak);
}

async function renderaLista(context: any, env: WebblasareEnv, jobb: RenderJobb, deadline: number): Promise<RenderResultat> {
  const baseUrl = valideraMalUrl(jobb.base_url ?? jobb.url).href;
  const productSelector = jobb.product_selector ?? "";
  if (!productSelector) return { items: [] };

  const antalSidor = jobb.pagination_type === "query" ? maxListSidor(env, jobb) : 1;
  const seen = new Map<string, { url: string; title?: string | null; price?: number | null }>();
  const cfg = {
    productSel: productSelector,
    titleSel: jobb.title_selector ?? "",
    priceSel: jobb.price_selector ?? "",
    linkSel: jobb.link_selector ?? "",
    excludePattern: jobb.exclude_link_pattern ?? "",
    urlScope: jobb.url_scope ?? "",
  };

  for (let sidnummer = 1; sidnummer <= antalSidor && Date.now() < deadline; sidnummer++) {
    const bas = new URL(baseUrl);
    if (sidnummer > 1) bas.searchParams.set("page", String(sidnummer));
    const mal = valideraMalUrl(bas.href, baseUrl);
    const page = await context.newPage();
    let items: Array<{ url: string; title?: string | null; price?: number | null }> = [];
    try {
      await page.goto(mal.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await accepteraKakor(page);
      await scrollaTillSlut(page, productSelector, deadline);
      const rawItems = await page.evaluate(LIST_EXTRACT_JS as any, cfg);
      items = Array.isArray(rawItems)
        ? rawItems.filter(
            (item): item is (typeof items)[number] =>
              Boolean(item && typeof item === "object" && typeof item.url === "string"),
          )
        : [];
    } finally {
      await page.close();
    }
    if (items.length === 0) break;
    for (const item of items) {
      try {
        const sakerUrl = valideraMalUrl(item.url, baseUrl).href;
        seen.set(sakerUrl, { ...item, url: sakerUrl });
      } catch {
        // Externa/ogiltiga länkar läggs inte i kön.
      }
    }
    if (sidnummer < antalSidor && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { items: [...seen.values()] };
}

async function renderaJobb(context: any, env: WebblasareEnv, jobb: RenderJobb, deadline: number): Promise<RenderResultat> {
  if (jobb.type === "detail") return renderaDetalj(context, jobb);
  if (jobb.type === "list") return renderaLista(context, env, jobb, deadline);
  return { error: `Okänd renderjobbtyp: ${jobb.type}` };
}

export async function bearbetaRenderKo(env: WebblasareEnv, limit: number): Promise<number> {
  const jobb = await hamtaJobb(env, limit);
  if (jobb.length === 0) return 0;

  const deadline = Date.now() + CRON_BUDGET_MS;
  const browser = await launch(env.BROWSER, { keep_alive: 60_000 });
  let klara = 0;

  try {
    for (const aktuelltJobb of jobb) {
      if (Date.now() >= deadline) {
        console.warn("browser_run_budget_slut", { kvarvarande: jobb.length - klara });
        break;
      }

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        locale: "sv-SE",
        timezoneId: "Europe/Stockholm",
        extraHTTPHeaders: { "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7" },
      });

      try {
        const resultat = await renderaJobb(context, env, aktuelltJobb, deadline);
        await rapporteraResultat(env, aktuelltJobb, resultat);
        klara++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("browser_run_jobb_fel", { jobbId: aktuelltJobb.id, siteId: aktuelltJobb.site_id, fel: message });
        try {
          await rapporteraResultat(env, aktuelltJobb, { error: message.slice(0, 400) });
        } catch {
          // Leasen löper ut och kan återtas av core-handlern vid nästa cron.
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return klara;
}
