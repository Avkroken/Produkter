import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ATTEMPTS = 5;
const RETRY_DELAY_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Returnerar ett HTTPS-origin utan avslutande snedstreck. Kastar vid saknat eller ogiltigt
 * värde, annan sökväg än /, query eller fragment. Native URL-parsefel kan använda parserns
 * eget felmeddelande; övrig validering identifierar konfigurationsfältets label.
 */
function origin(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${label} in cloudflare/deployment.json`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must be an HTTPS origin without path/query`);
  }
  return url.origin;
}

/**
 * Bygger publika HTTP-kontroller för app (startsidan) eller engine (/health) från deployment.
 * Kastar för andra nycklar eller om motsvarande installations-URL är ogiltig.
 */
export function productionProfile(key, deployment) {
  if (key === "app") {
    const appUrl = origin(deployment?.appUrl, "appUrl");
    return {
      name: deployment?.workers?.app || "app",
      checks: [{ kind: "status", url: `${appUrl}/`, status: 200 }],
    };
  }
  if (key === "engine") {
    const engineUrl = origin(deployment?.engineUrl, "engineUrl");
    return {
      name: deployment?.workers?.engine || "engine",
      checks: [{ kind: "json-ok", url: `${engineUrl}/health`, status: 200 }],
    };
  }
  throw new Error(`No public production verification profile for ${key || "<missing>"}`);
}

export async function validateProductionResponse(check, response) {
  if (check.kind === "protected") {
    if (response.status === 401 || response.status === 403) return;
    if (response.status === 302) {
      const location = response.headers.get("location");
      const destination = location ? new URL(location, check.url) : null;
      if (destination?.protocol === "https:" && destination.hostname.endsWith(".cloudflareaccess.com")
          && destination.pathname.startsWith("/cdn-cgi/access/login/")) return;
    }
    throw new Error(`${check.url} did not enforce the expected public access restriction (status ${response.status})`);
  }

  if (response.status !== check.status) {
    const location = response.headers.get("location");
    const redirect = location ? `; location ${new URL(location, check.url).toString()}` : "";
    throw new Error(`${check.url} returned ${response.status}, expected ${check.status}${redirect}`);
  }

  if (check.kind === "json-ok") {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error(`${check.url} returned unexpected content-type ${contentType || "<missing>"}`);
    }
    const body = await response.json();
    if (body?.ok !== true) throw new Error(`${check.url} did not return { ok: true }`);
  }
}

async function request(check, fetchImpl) {
  return fetchImpl(check.url, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "user-agent": "produkter-workers-build-production-check" },
  });
}

export async function checkProduction(profile, {
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const failures = [];
    await Promise.all(profile.checks.map(async (check) => {
      try {
        const response = await request(check, fetchImpl);
        await validateProductionResponse(check, response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(message);
      }
    }));

    if (failures.length === 0) {
      console.log(`${profile.name}: production HTTP checks passed on attempt ${attempt}`);
      return;
    }

    console.error(`attempt ${attempt}: ${failures.join("; ")}`);
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  throw new Error(`${profile.name}: production checks failed after ${ATTEMPTS} attempts`);
}

/**
 * Returnerar parsad deployment-JSON från miljön om den inte är tom, annars från deployment.json.
 * env och den synkrona readFile-funktionen kan ersättas av anroparen.
 * Ogiltig miljö-JSON och saknad fil ger förklarande fel; andra läs-/JSON-fel förs vidare.
 */
export function loadDeployment({ env = process.env, readFile = readFileSync } = {}) {
  const inline = env.CLOUDFLARE_DEPLOYMENT_CONFIG?.trim();
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch (error) {
      throw new Error(
        `CLOUDFLARE_DEPLOYMENT_CONFIG is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const path = fileURLToPath(new URL("../deployment.json", import.meta.url));
  try {
    return JSON.parse(readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(
        "Missing cloudflare/deployment.json. Create it locally or set CLOUDFLARE_DEPLOYMENT_CONFIG in an external CI/build environment.",
      );
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const profileKey = process.argv[2];
  checkProduction(productionProfile(profileKey, loadDeployment())).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
