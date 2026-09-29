import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  configuredPublicOrigin,
  robotsText,
  sitemapText,
} from "../app/src/public-metadata.ts";

const publicFile = (name) => new URL(`../app/public/${name}`, import.meta.url);
const origin = configuredPublicOrigin("https://app.example.com");

test("robots.txt allows crawling and advertises the configured sitemap", () => {
  const robots = robotsText(origin);
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/app\.example\.com\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /Disallow:\s*\//);
});

test("sitemap only advertises the configured public root", () => {
  const sitemap = sitemapText(origin);
  assert.match(sitemap, /<loc>https:\/\/app\.example\.com\/<\/loc>/);
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 1);
});

test("public origin rejects non-HTTPS or path-bearing deployment URLs", () => {
  assert.throws(() => configuredPublicOrigin("http://app.example.com"), /HTTPS-origin/);
  assert.throws(() => configuredPublicOrigin("https://app.example.com/path"), /HTTPS-origin/);
});

test("password recovery pages are excluded from search indexing", async () => {
  const headers = await readFile(publicFile("_headers"), "utf8");
  assert.match(headers, /\/forgot-password\.html\s+X-Robots-Tag: noindex, nofollow/);
  assert.match(headers, /\/reset-password\.html\s+X-Robots-Tag: noindex, nofollow/);
});
