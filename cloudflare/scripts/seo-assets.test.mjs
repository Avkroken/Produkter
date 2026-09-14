import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../app/public/${name}`, import.meta.url);

test("robots.txt allows crawling and advertises the canonical sitemap", async () => {
  const robots = await readFile(publicFile("robots.txt"), "utf8");
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/produkter\.denied\.se\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /Disallow:\s*\//);
});

test("sitemap only advertises the canonical public root", async () => {
  const sitemap = await readFile(publicFile("sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/produkter\.denied\.se\/<\/loc>/);
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 1);
});

test("password recovery pages are excluded from search indexing", async () => {
  const headers = await readFile(publicFile("_headers"), "utf8");
  assert.match(headers, /\/forgot-password\.html\s+X-Robots-Tag: noindex, nofollow/);
  assert.match(headers, /\/reset-password\.html\s+X-Robots-Tag: noindex, nofollow/);
});
