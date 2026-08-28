// Fas 5 — bistånds-underlag. Kontot söker i den operatörs-ägda katalogen
// (products i D1), väljer produkter och skriver en egen motivering per produkt
// ("varför just jag behöver detta"). Genererar utskrivbar sida och CSV-export.
import type { Account, Env } from "./db";

const CATALOG_LIMIT = 30;

export interface CatalogRow {
  id: number;
  url: string;
  title: string | null;
  current_price: number | null;
  description: string | null;
}

export interface BistandRow extends CatalogRow {
  motivation: string;
}

export function catalogFilter(q: string, category: string): { whereSql: string; binds: (string | number)[] } {
  const query = q.trim();
  const cat = category.trim();
  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (query) { where.push("title LIKE ?"); binds.push(`%${query}%`); }
  if (cat) { where.push("category = ?"); binds.push(cat); }
  return { whereSql: ` WHERE ${where.length ? where.join(" AND ") : "true"}`, binds };
}

export async function searchCatalog(env: Env, q: string, offset = 0, category = ""): Promise<CatalogRow[]> {
  const query = q.trim();
  const cat = category.trim();
  const off = Math.max(0, offset | 0);
  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (query) { where.push(`title LIKE ?${binds.length + 1}`); binds.push(`%${query}%`); }
  if (cat) { where.push(`category = ?${binds.length + 1}`); binds.push(cat); }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const order = query || cat ? "id" : "id DESC";
  const sql = `SELECT id, url, title, current_price, description FROM products${whereSql} ORDER BY ${order} LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`;
  const { results } = await env.DB.prepare(sql).bind(...binds, CATALOG_LIMIT, off).all<CatalogRow>();
  return results ?? [];
}

export async function listCategories(env: Env): Promise<{ category: string; n: number }[]> {
  const { results } = await env.DB.prepare(
    "SELECT category, count(*) n FROM products WHERE category IS NOT NULL AND category != '' GROUP BY category ORDER BY n DESC LIMIT 100",
  ).all<{ category: string; n: number }>();
  return results ?? [];
}

export async function listBistand(env: Env, accountId: string): Promise<BistandRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.url, p.title, p.current_price, p.description,
            COALESCE(NULLIF(TRIM(b.motivation), ''), p.description_why, '') AS motivation
     FROM bistand_items b JOIN products p ON p.id = b.product_id
     WHERE b.account_id = ?1 ORDER BY b.created_at`,
  ).bind(accountId).all<BistandRow>();
  return results ?? [];
}

export async function listBistandPage(env: Env, accountId: string, limit: number, offset: number): Promise<{ items: BistandRow[]; total: number }> {
  const lim = Math.max(1, Math.min(100, limit | 0));
  const off = Math.max(0, offset | 0);
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.url, p.title, p.current_price, p.description, b.motivation
     FROM bistand_items b JOIN products p ON p.id = b.product_id
     WHERE b.account_id = ?1 ORDER BY b.created_at LIMIT ?2 OFFSET ?3`,
  ).bind(accountId, lim, off).all<BistandRow>();
  const total = await env.DB.prepare("SELECT count(*) AS n FROM bistand_items WHERE account_id = ?1").bind(accountId).first<{ n: number }>();
  return { items: results ?? [], total: total?.n ?? 0 };
}

export async function upsertBistand(env: Env, accountId: string, productId: number, motivation: string): Promise<boolean> {
  const product = await env.DB.prepare("SELECT id FROM products WHERE id = ?1").bind(productId).first();
  if (!product) return false;
  await env.DB.prepare(
    `INSERT INTO bistand_items (account_id, product_id, motivation, created_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(account_id, product_id) DO UPDATE SET motivation = excluded.motivation`,
  ).bind(accountId, productId, motivation, Date.now()).run();
  return true;
}

export async function removeBistand(env: Env, accountId: string, productId: number): Promise<void> {
  await env.DB.prepare("DELETE FROM bistand_items WHERE account_id = ?1 AND product_id = ?2").bind(accountId, productId).run();
}

export async function bulkAddBistand(env: Env, accountId: string, q: string, category: string): Promise<number> {
  const { whereSql, binds } = catalogFilter(q, category);
  const r = await env.DB.prepare(
    `INSERT INTO bistand_items (account_id, product_id, motivation, created_at)
     SELECT ?, id, '', ? FROM products${whereSql}
     ON CONFLICT(account_id, product_id) DO NOTHING`,
  ).bind(accountId, Date.now(), ...binds).run();
  return r.meta.changes ?? 0;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPrice(kr: number | null): string {
  if (kr == null) return "—";
  return `${kr.toLocaleString("sv-SE")} kr`;
}

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function underlagCsv(items: BistandRow[]): string {
  const rows: (string | number | null)[][] = [
    ["Produktens namn", "Pris", "Direktlänk till produkten", "Motivering till varför jag behöver just den här produkten."],
    ...items.map((r) => [r.title ?? "", formatPrice(r.current_price), r.url, r.motivation]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export async function renderUnderlag(env: Env, account: Account): Promise<string> {
  const items = await listBistand(env, account.id);
  const total = items.reduce((sum, r) => sum + (r.current_price ?? 0), 0);
  const date = new Date().toISOString().slice(0, 10);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(underlagCsv(items))}`;
  const rows = items.map((r) => `
    <article class="item"><table class="meta">
      <tr><th>Produktens namn</th><td>${escapeHtml(r.title ?? "(namnlös produkt)")}</td></tr>
      <tr><th>Pris</th><td>${formatPrice(r.current_price)}</td></tr>
      <tr><th>Direktlänk till produkten</th><td><a href="${escapeHtml(r.url)}">${escapeHtml(r.url)}</a></td></tr>
      <tr><th>Motivering till varför jag behöver just den här produkten.</th><td>${r.motivation ? escapeHtml(r.motivation) : "<em>(ingen motivering tillgänglig)</em>"}</td></tr>
    </table></article>`).join("");

  return `<!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Underlag till socialtjänsten</title>
<style>
*{box-sizing:border-box}body{font-family:Georgia,"Times New Roman",serif;background:#0c0e14;color:#e4e2dc;max-width:820px;margin:0 auto;padding:2rem;line-height:1.5}header{border-bottom:2px solid #f0a500;padding-bottom:1rem;margin-bottom:1.5rem}h1{font-size:1.6rem;margin:0 0 .25rem}.sub{color:#9aa0aa;margin:0}.item{border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:1rem 1.25rem;margin-bottom:1rem;background:#13161f;page-break-inside:avoid}table.meta{width:100%;border-collapse:collapse;margin:0}table.meta th{width:16rem;text-align:left;padding:.25rem .75rem .25rem 0;color:#9aa0aa;font-weight:normal;vertical-align:top}table.meta td{padding:.25rem 0;vertical-align:top}table.meta a{color:#f0a500;word-break:break-all}.summary{margin-top:1.5rem;font-size:1.1rem}.toolbar{margin-bottom:1.5rem}.toolbar button,.toolbar a{font-family:system-ui,sans-serif;font-size:.95rem;padding:.5rem 1rem;margin-right:.5rem;border:1px solid rgba(255,255,255,.2);border-radius:5px;background:#13161f;color:#e4e2dc;text-decoration:none;cursor:pointer}.empty{color:#6b7280;font-style:italic}@media print{body{background:#fff;color:#111;padding:0;max-width:none}header{border-bottom-color:#111}.sub{color:#444}.item{border-color:#ccc;background:#fff}table.meta th{color:#555}table.meta a{color:#0a58ca}.toolbar{display:none}a{color:#111;text-decoration:none}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Skriv ut / spara som PDF</button><a href="${escapeHtml(csvHref)}" download="underlag.csv">Ladda ner CSV</a><a href="/">← Tillbaka</a></div>
<header><h1>Underlag till socialtjänsten</h1><p class="sub">Produkter med motivering — sammanställt ${escapeHtml(date)} av ${escapeHtml(account.email)}</p></header>
${items.length ? rows : '<p class="empty">Inga produkter tillagda ännu.</p>'}
${items.length ? `<p class="summary"><strong>Summa:</strong> ${formatPrice(total)} (${items.length} produkter)</p>` : ""}
</body></html>`;
}
