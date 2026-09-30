import { pathToFileURL } from "node:url";

export function assertPortableDeploySafe(env = process.env) {
  if (env.WORKERS_CI !== "1") return;

  const branch = env.WORKERS_CI_BRANCH?.trim();
  if (branch && branch !== "main") return;

  throw new Error(
    "Tracked wrangler.jsonc is preview-only and must not deploy a production Worker from Workers Builds. " +
    "Configure production to use generated wrangler.production.jsonc with CLOUDFLARE_DEPLOYMENT_CONFIG.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertPortableDeploySafe();
}
