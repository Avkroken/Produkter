import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Returnerar e-postadressen trimmad och i gemener; kastar om formatet är ogiltigt eller längden överstiger 254 tecken. */
export function normalizeAdminEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Ange en giltig e-postadress för kontot som ska bli admin.");
  }
  return email;
}

/** Returnerar värdet som en citerad SQL-sträng med enkla citattecken dubblerade. */
export function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

/**
 * Kör SQL mot aktuell Wrangler-konfigurations fjärrdatabas DB och returnerar JSON-svaret.
 * Kastar om kommandot misslyckas eller svaret inte kan tolkas som JSON.
 */
function wranglerJson(sql) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    command,
    ["--no-install", "wrangler", "d1", "execute", "DB", "--remote", "--config", "wrangler.production.jsonc", "--command", sql, "--json"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error("Wrangler D1-kommandot misslyckades.");
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("Kunde inte tolka Wrangler D1-svaret som JSON.");
  }
}

/**
 * Samlar poster från nästlade results-arrayer i Wrangler-svaret.
 * Lägger till i och returnerar samma rows-array; övriga skalärvärden ignoreras.
 */
function collectRows(value, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRows(item, rows);
    return rows;
  }
  if (!value || typeof value !== "object") return rows;
  if (Array.isArray(value.results)) rows.push(...value.results);
  for (const child of Object.values(value)) {
    if (child !== value.results) collectRows(child, rows);
  }
  return rows;
}

/**
 * Returnerar den enda raden med id och email som strängar, eller null om ingen finns.
 * Kastar om flera sådana rader förekommer i Wrangler-svaret.
 */
export function findAccountRow(result) {
  const matches = collectRows(result).filter(
    (row) => row && typeof row === "object" && typeof row.id === "string" && typeof row.email === "string",
  );
  if (matches.length > 1) {
    throw new Error("Flera konton matchar e-postadressen skiftlägesokänsligt. Bootstrap avbryts.");
  }
  return matches[0] ?? null;
}

/** Bygger SQL för att hitta konton via skiftlägesokänslig e-postmatchning, sorterade på id. */
export function buildAccountLookupSql(email) {
  return `SELECT id, email, role FROM accounts WHERE lower(email) = lower(${sqlLiteral(email)}) ORDER BY id`;
}

/** Bygger SQL som ger det angivna konto-id:t adminrollen; kör inte uppdateringen. */
export function buildPromoteSql(accountId) {
  return `UPDATE accounts SET role = 'admin' WHERE id = ${sqlLiteral(accountId)}`;
}

/**
 * Ger det befintliga kontot för CLI-argumentets e-postadress adminrollen i fjärrdatabasen.
 * Kastar vid ogiltig adress, saknat/tvetydigt konto, Wrangler-fel eller misslyckad
 * efterkontroll. En redan utförd rolländring återställs inte om efterkontrollen misslyckas.
 */
async function main() {
  const email = normalizeAdminEmail(process.argv[2]);
  const account = findAccountRow(wranglerJson(buildAccountLookupSql(email)));
  if (!account) {
    throw new Error(
      `Kontot ${email} finns inte i D1. Skapa/logga in kontot först och kör sedan bootstrap-kommandot igen.`,
    );
  }

  wranglerJson(buildPromoteSql(account.id));
  const verified = findAccountRow(wranglerJson(buildAccountLookupSql(email)));
  if (!verified || verified.role !== "admin") {
    throw new Error("Admin-bootstrap kunde inte verifieras.");
  }
  console.log(`Admin-bootstrap klar för ${verified.email}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
