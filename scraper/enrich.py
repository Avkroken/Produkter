#!/usr/bin/env python3
"""One-shot, resumable product-page enrichment.

The periodic scraper (scraper.py) only ever sees category-*listing* pages, so
it stores just title/price/url/category. That leaves the describer guessing a
product's actual properties from an opaque name. This job visits each product's
own page via the stored URL and extracts its real description text into
products.source_text, so the describer can ground its output on facts instead
of hallucinating.

Heuristic extraction (no per-site config needed): JSON-LD Product.description,
then og:description, then meta description. Whatever it finds is cleaned and
truncated. If nothing is found the row is marked with an empty string (not
NULL) so it is not retried forever — re-running the job only picks up rows that
were never attempted (source_text IS NULL). Safe to interrupt and resume.

Run from the repo root:
    python -m scraper.enrich                 # whole backlog
    python -m scraper.enrich --limit 200      # first 200 still missing
    python -m scraper.enrich --site Webhallen  # one site only
    python -m scraper.enrich --refresh         # re-extract everything
"""
import argparse
import asyncio
import logging
import os
import random
import re
import sys

# Allow `python scraper/enrich.py` as well as `python -m scraper.enrich`.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from playwright.async_api import async_playwright, Error as PlaywrightError  # noqa: E402

from scraper.scraper import (  # noqa: E402
    BROWSER_ARGS,
    accept_cookies,
    get_db,
    get_setting,
    init_credentials,
    init_db,
    init_db_pool,
    return_db,
    scrape_page_with_retry,
)

try:
    from github_report import report_error_to_github
except ImportError:  # best-effort, mirrors scraper.py's conventions
    def report_error_to_github(*_args, **_kwargs):
        return None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("enrich")

MAX_SOURCE_LEN = 1200

# Runs in the page; returns the best available product description text.
_EXTRACT_JS = """
() => {
  const clean = (t) => (t || '').replace(/\\s+/g, ' ').trim();
  // 1. JSON-LD Product description (most reliable for e-commerce)
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try { data = JSON.parse(s.textContent); } catch (e) { continue; }
    const nodes = Array.isArray(data) ? data : (data['@graph'] || [data]);
    for (const node of nodes) {
      if (!node) continue;
      const t = node['@type'];
      const isProduct = t === 'Product' || (Array.isArray(t) && t.includes('Product'));
      if (isProduct && node.description) return clean(node.description);
    }
  }
  // 2. Open Graph / 3. standard meta description
  const og = document.querySelector('meta[property="og:description"]');
  if (og && og.content) return clean(og.content);
  const meta = document.querySelector('meta[name="description"]');
  if (meta && meta.content) return clean(meta.content);
  return '';
}
"""


def _clean(text):
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:MAX_SOURCE_LEN]


def fetch_backlog(limit, site, refresh):
    conn = get_db()
    try:
        cur = conn.cursor()
        clauses = ["p.url IS NOT NULL"]
        params = []
        if not refresh:
            clauses.append("p.source_text IS NULL")
        if site:
            clauses.append("c.name = %s")
            params.append(site)
        where = " AND ".join(clauses)
        query = (
            "SELECT p.id, p.url, COALESCE(c.use_stealth, 0) "
            "FROM products p LEFT JOIN scraper_config c ON c.id = p.site_config_id "
            f"WHERE {where} ORDER BY p.id"
        )
        if limit and limit > 0:
            query += " LIMIT %s"
            params.append(limit)
        cur.execute(query, params)
        return cur.fetchall()
    finally:
        return_db(conn)


def store_source_text(product_id, text):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE products SET source_text = %s, source_text_updated_at = NOW() WHERE id = %s",
            (text, product_id),
        )
        conn.commit()
    finally:
        return_db(conn)


async def enrich_one(context, product_id, url, use_stealth):
    page = await scrape_page_with_retry(context, url, use_stealth=bool(use_stealth))
    if not page:
        logger.warning("Kunde inte ladda %s (id %s)", url, product_id)
        return False
    try:
        await accept_cookies(page)
        raw = await page.evaluate(_EXTRACT_JS)
    except PlaywrightError as e:
        logger.warning("Extraktion misslyckades för id %s: %s", product_id, e)
        return False
    finally:
        await page.close()

    text = _clean(raw)
    # Empty string (not NULL) marks "attempted, nothing found" so resume skips it.
    store_source_text(product_id, text)
    logger.info("id %s: %s tecken", product_id, len(text))
    return bool(text)


async def run(args):
    rows = fetch_backlog(args.limit, args.site, args.refresh)
    if not rows:
        logger.info("Inget att berika (source_text redan satt eller inga produkter).")
        return
    logger.info("Berikar %s produkter (concurrency=%s)", len(rows), args.concurrency)

    headless = get_setting("headless")
    sem = asyncio.Semaphore(args.concurrency)
    done = {"ok": 0, "empty": 0}

    browser = None
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless, args=BROWSER_ARGS)
        try:
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080},
                locale="sv-SE",
                timezone_id="Europe/Stockholm",
                extra_http_headers={
                    "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "DNT": "1",
                },
            )

            async def worker(row):
                product_id, url, use_stealth = row
                async with sem:
                    try:
                        ok = await enrich_one(context, product_id, url, use_stealth)
                        done["ok" if ok else "empty"] += 1
                    except PlaywrightError as e:
                        logger.warning("Hoppar över id %s: %s", product_id, e)
                    # jitter between page loads to stay polite / under rate limits
                    await asyncio.sleep(random.uniform(1, 3))

            await asyncio.gather(*(worker(r) for r in rows))
            await context.close()
        finally:
            await browser.close()

    logger.info("Klart. Med text: %s, tomma: %s", done["ok"], done["empty"])


def main():
    parser = argparse.ArgumentParser(description="Berika produkter med source_text från produktsidan.")
    parser.add_argument("--limit", type=int, default=0, help="Max antal produkter (0 = alla kvarvarande).")
    parser.add_argument("--concurrency", type=int, default=3, help="Parallella sidladdningar.")
    parser.add_argument("--site", default="", help="Begränsa till en scraper_config.name.")
    parser.add_argument("--refresh", action="store_true", help="Berika om även produkter som redan har source_text.")
    args = parser.parse_args()

    init_credentials()
    init_db_pool()
    init_db()
    try:
        asyncio.run(run(args))
    except Exception as e:  # best-effort felrapport, matchar scraper.py-konventionen
        logger.exception("Oväntat fel i enrich")
        report_error_to_github("blixten85/scraper", "enrich: oväntat fel", e, {})
        sys.exit(1)


if __name__ == "__main__":
    main()
