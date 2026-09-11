import assert from "node:assert/strict";
import test from "node:test";
import { ensureAuthSchema } from "./migrate-app-auth.mjs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { build } = require("esbuild");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { outputFiles } = await build({ stdin: { contents: `import app from "./worker.ts"; export default { async fetch(request, env) { const tasks=[]; const response=await app.fetch(request,env,{waitUntil(p){tasks.push(p)}}); await Promise.all(tasks); return response; } };`, resolveDir: new URL("../app/src/", import.meta.url).pathname, loader: "ts" }, bundle: true, write: false, format: "esm", platform: "browser", target: "es2022" });
const schema = await readFile(new URL("../infra/schema.sql", import.meta.url), "utf8");
const cryptoBundle = await build({ entryPoints: [new URL("../shared/crypto.ts", import.meta.url).pathname], bundle: true, write: false, format: "esm", platform: "node" });
const { hashPassword, sha256Hex } = await import(`data:text/javascript;base64,${Buffer.from(cryptoBundle.outputFiles[0].text).toString("base64")}`);

async function fixture({ mail = true, dbReady = true, mailStatus = 200 } = {}) {
  const messages = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: outputFiles[0].text, compatibilityDate: "2026-06-01", d1Databases: ["DB"], kvNamespaces: ["SESSIONS"], bindings: mail ? { RESEND_API_KEY: "test-only", MAIL_FROM: "noreply@send.denied.se" } : {},
    outboundService: async request => { assert.equal(new URL(request.url).hostname, "api.resend.com"); messages.push(await request.json()); return new Response('{"id":"test"}', { status: mailStatus }); },
  }));
  const db = await mf.getD1Database("DB");
  if (dbReady) {
    await db.exec(schema.replace(/--[^\n]*/g, "").replace(/\n/g, " "));
    const { hash, salt } = await hashPassword("original-password");
    await db.prepare("INSERT INTO accounts (id,email,password_hash,password_salt,role,created_at) VALUES ('test-account','person@example.com',?,?,'admin',0)").bind(hash,salt).run();
  }
  async function post(path, body, extra = {}) {
    const response = await mf.dispatchFetch(`https://produkter.denied.se${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Origin": "https://produkter.denied.se", "CF-Connecting-IP": "192.0.2.1", ...extra }, body: JSON.stringify(body) });
    return response;
  }
  return { mf, db, messages, post };
}

test("recovery is generic, token is hashed, changes password once and revokes sessions", async () => {
  const f = await fixture();
  try {
    const signedIn = await f.post("/login", { email: "person@example.com", password: "original-password" });
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.get("set-cookie").split(";")[0];
    const response = await f.post("/api/auth/forgot-password", { email: "Person@Example.com" });
    assert.equal(response.status, 202);
    const missing = await f.post("/api/auth/forgot-password", { email: "absent@example.com" });
    assert.deepEqual(await response.json(), await missing.json());
    assert.equal(f.messages.length, 1);
    const link = f.messages[0].text.match(/https:\/\/\S+/)[0];
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token");
    const stored = await f.db.prepare("SELECT token_hash FROM password_resets").first();
    assert.equal(stored.token_hash, await sha256Hex(token));
    assert.notEqual(stored.token_hash, token);
    const results = await Promise.all([f.post("/api/auth/reset-password", {token,password:"new-password"}),f.post("/api/auth/reset-password", {token,password:"new-password"})]);
    assert.deepEqual(results.map(r=>r.status).sort(), [200,400]);
    assert.equal((await f.post("/login", {email:"person@example.com",password:"original-password"})).status,401);
    assert.equal((await f.post("/login", {email:"person@example.com",password:"new-password"})).status,200);
    assert.equal((await f.mf.dispatchFetch("https://produkter.denied.se/api/admin/stats", {headers:{Cookie:cookie}})).status,401);
    const kv = await f.mf.getKVNamespace("SESSIONS");
    await kv.put(`session:${await sha256Hex("legacy-session")}`, "test-account");
    assert.equal((await f.mf.dispatchFetch("https://produkter.denied.se/api/admin/stats", {headers:{Cookie:"session=legacy-session"}})).status,401);
  } finally { await f.mf.dispose(); }
});

test("expired token cannot reset and invalid input is rejected", async () => {
  const f=await fixture();
  try {
    const token="a".repeat(64);
    await f.db.prepare("INSERT INTO password_resets VALUES ('test-account',?,0,0)").bind(await sha256Hex(token)).run();
    assert.equal((await f.post("/api/auth/reset-password", {token,password:"new-password"})).status,400);
    assert.equal((await f.post("/login", {email:"person@example.com",password:"original-password"})).status,200);
    assert.equal((await f.post("/login", {email:[],password:{}})).status,400);
    assert.equal((await f.post("/api/auth/forgot-password", {email:"person@example.com"}, {Origin:"https://evil.example"})).status,403);
    assert.equal((await f.post("/api/auth/reset-password", {token,password:"short"})).status,400);
  } finally { await f.mf.dispose(); }
});

test("missing mail configuration and database failure are service errors", async () => {
  const f=await fixture({mail:false});
  const broken=await fixture({dbReady:false});
  try {
    assert.equal((await f.post("/api/auth/forgot-password", {email:"person@example.com"})).status,503);
    const response=await broken.post("/login", {email:"person@example.com",password:"wrong-password"});
    assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/SELECT|D1_ERROR|no such table/);
  } finally { await f.mf.dispose(); await broken.mf.dispose(); }
});

test("per-address mail throttling stays generic and IP limit rejects excess", async () => {
  const f=await fixture();
  try {
    for(let i=0;i<10;i++) assert.equal((await f.post("/api/auth/forgot-password",{email:"person@example.com"})).status,202);
    assert.equal(f.messages.length,3);
    assert.equal((await f.post("/api/auth/forgot-password",{email:"person@example.com"})).status,429);
  } finally { await f.mf.dispose(); }
});


test("mail failure preserves a possibly delivered token until expiry", async () => {
  const f = await fixture({ mailStatus: 500 });
  try {
    assert.equal((await f.post("/api/auth/forgot-password", { email: "person@example.com" })).status, 202);
    const link = f.messages[0].text.match(/https:\/\/\S+/)[0];
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token");
    assert.equal((await f.post("/api/auth/reset-password", { token, password: "new-password" })).status, 200);
  } finally { await f.mf.dispose(); }
});

test("signup rejects passwords that subsequent login would reject", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.post("/signup", { email: "new@example.com", password: "a".repeat(1025) })).status, 400);
    assert.equal(await f.db.prepare("SELECT id FROM accounts WHERE email='new@example.com'").first(), null);
  } finally { await f.mf.dispose(); }
});

test("deployment migration is additive, repeatable and indexes expiry cleanup", async () => {
  const f = await fixture({ dbReady: false });
  try {
    const query = async sql => (await f.db.batch(sql.split(";").map(s => s.trim()).filter(Boolean).map(s => f.db.prepare(s)))).flatMap(r => r.results);
    await assert.rejects(ensureAuthSchema(query), /Kontotabellen saknas/);
    await f.db.exec("CREATE TABLE accounts (id TEXT PRIMARY KEY, password_hash TEXT NOT NULL); INSERT INTO accounts VALUES ('existing','unchanged');");
    await ensureAuthSchema(query);
    await ensureAuthSchema(query);
    assert.deepEqual(await f.db.prepare("SELECT * FROM accounts").first(), { id: "existing", password_hash: "unchanged", auth_version: 0 });
    for (const table of ["password_resets", "auth_rate_limits"]) {
      const plan = await query(`EXPLAIN QUERY PLAN DELETE FROM ${table} WHERE expires_at < 1`);
      assert.match(JSON.stringify(plan), /USING.*INDEX/);
    }
  } finally { await f.mf.dispose(); }
});
