import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appHtml = await readFile(new URL("../app/public/index.html", import.meta.url), "utf8");
const recoveryHtml = await readFile(new URL("../app/public/forgot-password.html", import.meta.url), "utf8");
const appJs = await readFile(new URL("../app/public/app.js", import.meta.url), "utf8");
const recoveryJs = await readFile(new URL("../app/public/password-recovery.js", import.meta.url), "utf8");
const siteverify = await readFile(new URL("../app/src/turnstile.ts", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../app/package.json", import.meta.url), "utf8"));

test("Turnstile widgets use explicit rendering and deployment-injected site keys", () => {
  for (const html of [appHtml, recoveryHtml]) {
    assert.match(html, /turnstile\/v0\/api\.js\?render=explicit/);
    assert.match(html, /data-turnstile-widget/);
    assert.match(html, /data-sitekey=""/);
    assert.doesNotMatch(html, /data-sitekey="0x[0-9A-Za-z]+"/);
  }
  assert.match(appHtml, /data-action="signup"/);
  assert.match(recoveryHtml, /data-action="password_recovery"/);
});

test("AJAX protected forms retain and reset explicit widget ids", () => {
  assert.match(appJs, /turnstile\.render/);
  assert.match(appJs, /turnstile\.getResponse/);
  assert.match(appJs, /turnstile\.reset/);
  assert.match(recoveryJs, /turnstile\.render/);
  assert.match(recoveryJs, /turnstile\.getResponse/);
  assert.match(recoveryJs, /turnstile\.reset/);
});

test("server-side Siteverify validates bounded tokens, action, hostname, and timeout", () => {
  assert.match(siteverify, /token\.length > 2048/);
  assert.match(siteverify, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(siteverify, /AbortSignal\.timeout\(10_000\)/);
  assert.match(siteverify, /result\.action === expectedAction/);
  assert.match(siteverify, /allowed\.has\(result\.hostname\.toLowerCase\(\)\)/);
});

test("TURNSTILE_SECRET has a dedicated Wrangler installation command", () => {
  assert.equal(
    pkg.scripts["secret:set-turnstile"],
    "npm run config:generate && wrangler secret put TURNSTILE_SECRET --config wrangler.production.jsonc",
  );
});

test("dynamic HTML bypasses conditional asset caching", async () => {
  const accessWorker = await readFile(new URL("../app/src/access-worker.ts", import.meta.url), "utf8");
  assert.match(accessWorker, /headers\.delete\("If-None-Match"\)/);
  assert.match(accessWorker, /headers\.delete\("If-Modified-Since"\)/);
  assert.match(accessWorker, /headers\.set\("Cache-Control", "no-store"\)/);
  assert.match(accessWorker, /headers\.delete\("ETag"\)/);
});
