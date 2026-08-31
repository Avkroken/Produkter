import { pathToFileURL } from "node:url";

const ATTEMPTS = 5;
const RETRY_DELAY_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;

const PROFILES = {
  app: {
    name: "produkter",
    checks: [
      { kind: "status", url: "https://produkter.denied.se/", status: 200 },
    ],
  },
  engine: {
    name: "produkter-motor",
    checks: [
      { kind: "json-ok", url: "https://motor.denied.se/health", status: 200 },
    ],
  },
};

export function productionProfile(key) {
  const profile = PROFILES[key];
  if (!profile) throw new Error(`No public production verification profile for ${key || "<missing>"}`);
  return profile;
}

export async function validateProductionResponse(check, response) {
  if (response.status !== check.status) {
    throw new Error(`${check.url} returned ${response.status}, expected ${check.status}`);
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
      console.log(`${profile.name}: production checks passed on attempt ${attempt}`);
      return;
    }

    console.error(`attempt ${attempt}: ${failures.join("; ")}`);
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  throw new Error(`${profile.name}: production checks failed after ${ATTEMPTS} attempts`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const profileKey = process.argv[2];
  checkProduction(productionProfile(profileKey)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
