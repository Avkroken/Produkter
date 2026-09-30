import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicFile = (name) => new URL(`../app/public/${name}`, import.meta.url);

test("Cloudflare app uses the shared Avkroken theme contract", async () => {
  const [css, js, index, forgot, reset] = await Promise.all([
    readFile(publicFile("theme.css"), "utf8"),
    readFile(publicFile("theme.js"), "utf8"),
    readFile(publicFile("index.html"), "utf8"),
    readFile(publicFile("forgot-password.html"), "utf8"),
    readFile(publicFile("reset-password.html"), "utf8"),
  ]);

  for (const html of [index, forgot, reset]) {
    assert.match(html, /data-theme="legacy"/);
    assert.equal((html.match(/href="\/theme\.css"/g) ?? []).length, 1);
    assert.equal((html.match(/src="\/theme\.js"/g) ?? []).length, 1);
    assert.match(html, /value="legacy">Legacy/);
    assert.match(html, /value="forest">Avkroken/);
    assert.match(html, /value="blackout">Blackout/);
  }

  assert.match(css, /:root\[data-theme="legacy"\]/);
  assert.match(css, /:root\[data-theme="forest"\]/);
  assert.match(css, /:root\[data-theme="blackout"\]/);
  assert.match(css, /rgba\(36,231,232,.11\)/);
  assert.match(css, /rgba\(213,29,203,.10\)/);
  assert.match(css, /background-size:42px 42px/);
  assert.doesNotMatch(css, /--accent:/);

  assert.match(js, /avkroken\.theme/);
  assert.match(js, /avkroken_theme/);
  assert.match(js, /Domain=\.denied\.se/);
  assert.match(js, /localStorage\.getItem\("theme"\)/);
});
