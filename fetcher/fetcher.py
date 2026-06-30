"""Statslös Playwright-fetcher — "muskeln" i den enhetliga arkitekturen.

Se product-describer-cloudflare/DESIGN.md. Den här processen är allt som blir
kvar på servern: den håller ingen data, har ingen inkommande port, ingen DB.
Den gör bara utgående HTTPS mot `engine`-Workern på Cloudflare:

    1. POST {ENGINE_URL}/jobs/lease        -> leasar N render-jobb
    2. renderar varje jobb med Playwright  -> extraherar titel/pris/source_text
    3. POST {ENGINE_URL}/jobs/{id}/result  -> rapporterar tillbaka

Dör servern förlorar man bara den här loopen; den redeployas var som helst med
ENGINE_URL + INGEST_API_KEY. All durabel data ligger i D1.

Fas 2: hanterar `detail`-jobb (produktsidor). `list`-jobb (discovery) tillkommer
senare — då behöver lease-svaret även list-selektorerna.

Miljövariabler:
    ENGINE_URL           t.ex. https://product-describer-engine.<subdomän>.workers.dev
    INGEST_API_KEY       operatörsnyckeln (X-API-Key)
    FETCHER_CONCURRENCY  parallella renderingar (default 3)
    LEASE_BATCH          jobb per lease (default 10)
    POLL_IDLE_SEC        vila när kön är tom (default 15)
    RENDER_WAIT_MS       max väntan på client-side-innehåll (default 12000)
    HEADLESS             "0" för synlig browser (default headless)
"""

import asyncio
import logging
import os
import random

import requests
from playwright.async_api import async_playwright, Error as PlaywrightError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("fetcher")

ENGINE_URL = os.environ.get("ENGINE_URL", "").rstrip("/")
API_KEY = os.environ.get("INGEST_API_KEY", "")
CONCURRENCY = int(os.environ.get("FETCHER_CONCURRENCY", "3"))
LEASE_BATCH = int(os.environ.get("LEASE_BATCH", "10"))
POLL_IDLE_SEC = int(os.environ.get("POLL_IDLE_SEC", "15"))
RENDER_WAIT_MS = int(os.environ.get("RENDER_WAIT_MS", "12000"))
HEADLESS = os.environ.get("HEADLESS", "1") != "0"
MAX_SOURCE_LEN = 1200

BROWSER_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"]

# Resolves once a JSON-LD Product node with a description is present (SPA-butiker
# injicerar den client-side). Samma villkor som extraktionen letar efter.
_JSONLD_READY_JS = """
() => {
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let d; try { d = JSON.parse(s.textContent); } catch (e) { continue; }
    const ns = Array.isArray(d) ? d : (d['@graph'] || [d]);
    for (const n of ns) {
      if (!n) continue;
      const t = n['@type'];
      const isP = t === 'Product' || (Array.isArray(t) && t.includes('Product'));
      if (isP && n.description) return true;
    }
  }
  return false;
}
"""

# Extraherar {title, price, source_text} från en produktsida. Verifierad logik
# från enrich.py: detail_selector -> JSON-LD Product -> og/meta för source_text;
# JSON-LD Product.name/offers.price för titel/pris.
_EXTRACT_JS = """
(detailSelector) => {
  const clean = (t) => (t || '').replace(/\\s+/g, ' ').trim();
  const out = { title: null, price: null, source_text: '' };

  // Plocka Product-noden ur JSON-LD (titel/pris/beskrivning).
  let product = null;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let d; try { d = JSON.parse(s.textContent); } catch (e) { continue; }
    const ns = Array.isArray(d) ? d : (d['@graph'] || [d]);
    for (const n of ns) {
      if (!n) continue;
      const t = n['@type'];
      const isP = t === 'Product' || (Array.isArray(t) && t.includes('Product'));
      if (isP) { product = n; break; }
    }
    if (product) break;
  }
  if (product) {
    if (product.name) out.title = clean(product.name);
    const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    const p = offers && (offers.price ?? offers.lowPrice);
    // JSON-LD-pris är maskinformat ("48.00", "1299.00"). parseFloat + round
    // ger hela kronor; strippa ev. blanksteg/komma utan att blåsa upp decimaler.
    if (p != null) { const num = Math.round(parseFloat(String(p).replace(/\\s/g, '').replace(',', '.'))); if (!isNaN(num)) out.price = num; }
  }

  // source_text: detail_selector -> JSON-LD description -> og -> meta.
  if (detailSelector) {
    try { const el = document.querySelector(detailSelector);
      if (el) { const t = clean(el.innerText || el.textContent); if (t) out.source_text = t; } } catch (e) {}
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
}
"""


def _headers():
    return {"X-API-Key": API_KEY, "Content-Type": "application/json"}


def lease(n):
    r = requests.post(f"{ENGINE_URL}/jobs/lease", json={"n": n}, headers=_headers(), timeout=30)
    r.raise_for_status()
    return r.json().get("jobs", [])


def post_result(job_id, payload):
    r = requests.post(f"{ENGINE_URL}/jobs/{job_id}/result", json=payload, headers=_headers(), timeout=30)
    r.raise_for_status()
    return r.json()


async def accept_cookies(page):
    # Best-effort: klicka bort vanliga cookie-dialoger så de inte skymmer innehåll.
    for sel in (
        "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
        "button#onetrust-accept-btn-handler",
        "button:has-text('Acceptera alla')",
        "button:has-text('Godkänn alla')",
    ):
        try:
            el = await page.query_selector(sel)
            if el:
                await el.click(timeout=2000)
                break
        except PlaywrightError:
            continue


async def render_detail(context, job):
    page = await context.new_page()
    try:
        await page.goto(job["url"], wait_until="domcontentloaded", timeout=45000)
        await accept_cookies(page)
        detail_selector = job.get("detail_selector") or ""
        try:
            if detail_selector:
                await page.wait_for_selector(detail_selector, timeout=RENDER_WAIT_MS)
            else:
                await page.wait_for_function(_JSONLD_READY_JS, timeout=RENDER_WAIT_MS)
        except PlaywrightError:
            pass  # best-effort: extrahera ändå det som finns
        data = await page.evaluate(_EXTRACT_JS, detail_selector)
        st = (data.get("source_text") or "")[:MAX_SOURCE_LEN]
        return {"title": data.get("title"), "price": data.get("price"), "source_text": st}
    finally:
        await page.close()


async def process(context, sem, job):
    async with sem:
        try:
            if job.get("type") != "detail":
                logger.info("hoppar över jobb %s (typ %s ej implementerad)", job["id"], job.get("type"))
                await asyncio.to_thread(post_result, job["id"], {"error": f"typ {job.get('type')} ej implementerad i fetchern"})
                return
            result = await render_detail(context, job)
            await asyncio.to_thread(post_result, job["id"], result)
            logger.info("jobb %s: %s tecken source_text", job["id"], len(result["source_text"]))
        except Exception as e:  # noqa: BLE001 — rapportera tillbaka, låt engine retry:a
            logger.warning("jobb %s misslyckades: %s", job["id"], e)
            try:
                await asyncio.to_thread(post_result, job["id"], {"error": str(e)[:400]})
            except Exception:
                pass
        await asyncio.sleep(random.uniform(1, 3))  # artighet mot målsajten


async def main():
    if not ENGINE_URL or not API_KEY:
        raise SystemExit("ENGINE_URL och INGEST_API_KEY måste vara satta")
    logger.info("fetcher startar mot %s (concurrency=%s)", ENGINE_URL, CONCURRENCY)
    sem = asyncio.Semaphore(CONCURRENCY)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS, args=BROWSER_ARGS)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            locale="sv-SE",
            timezone_id="Europe/Stockholm",
        )
        try:
            while True:
                try:
                    jobs = await asyncio.to_thread(lease, LEASE_BATCH)
                except Exception as e:  # noqa: BLE001
                    logger.warning("lease misslyckades: %s — väntar", e)
                    await asyncio.sleep(POLL_IDLE_SEC)
                    continue
                if not jobs:
                    await asyncio.sleep(POLL_IDLE_SEC)
                    continue
                await asyncio.gather(*(process(context, sem, j) for j in jobs))
        finally:
            await context.close()
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
