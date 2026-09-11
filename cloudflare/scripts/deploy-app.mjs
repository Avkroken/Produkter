import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureAuthSchema } from "./migrate-app-auth.mjs";

const cwd = fileURLToPath(new URL("../app/", import.meta.url));
const wrangler = fileURLToPath(new URL("../app/node_modules/wrangler/bin/wrangler.js", import.meta.url));
const args = process.argv.slice(2);
// This deploy script targets the production app only, never another config/environment.
if (args.some(arg => ["--env", "-e", "--config", "-c", "--name"].includes(arg) || /^(--env|--config|--name)=/.test(arg))) {
  throw new Error("Använd Wrangler direkt för alternativa miljöer eller konfigurationsfiler.");
}
function run(parameters, capture = false) {
  const result = spawnSync(process.execPath, [wrangler, ...parameters], {
    cwd, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Cloudflare-kommandot misslyckades. Publiceringen avbröts.");
  return result.stdout;
}
if (!args.includes("--dry-run")) {
  await ensureAuthSchema(async sql => {
    const result = JSON.parse(run(["d1", "execute", "DB", "--remote", "--json", "--command", sql], true));
    if (!Array.isArray(result) || result.some(item => item.success !== true)) throw new Error("Databasändringen kunde inte verifieras.");
    return result.flatMap(item => item.results || []);
  });
  console.log("Autentiseringsdatabasen är förberedd.");
}
// Git is authoritative. Public exposure is explicitly disabled in wrangler.jsonc.
run(["deploy", ...args]);
