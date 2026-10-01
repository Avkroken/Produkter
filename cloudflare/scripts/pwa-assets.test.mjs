import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const publicFile = name => readFile(new URL("../app/public/" + name, import.meta.url), "utf8");

test("canonical Cloudflare app publishes an installable web app manifest", async () => {
  const [html, raw] = await Promise.all([
    publicFile("index.html"),
    publicFile("site.webmanifest"),
  ]);
  const manifest = JSON.parse(raw);

  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ["192x192", "512x512"]);
  assert.match(html, /<link rel="manifest" href="\/site\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon"[^>]+app-icon-192\.png/);
  assert.match(html, /<script src="\/pwa\.js" defer><\/script>/);
});

test("service worker remains network-only across authenticated application state", async () => {
  const [pwa, worker] = await Promise.all([
    publicFile("pwa.js"),
    publicFile("service-worker.js"),
  ]);

  assert.match(pwa, /window\.isSecureContext/);
  assert.match(pwa, /serviceWorker\.register\("\/service-worker\.js"/);
  assert.match(worker, /self\.addEventListener\("fetch"/);
  assert.doesNotMatch(worker, /caches\./);
  assert.doesNotMatch(worker, /respondWith\(/);
  assert.doesNotMatch(worker, /\/api\//);
});
