import type { Env } from "./db";

const FETCHER_PREFIX = "/fetcher";

function json(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export function fetcherEnginePath(pathname: string): string | null {
  if (pathname === `${FETCHER_PREFIX}/jobs/lease` || pathname === "/jobs/lease") {
    return "/jobs/lease";
  }

  const result = pathname.match(/^\/(?:fetcher\/)?jobs\/(\d+)\/result$/);
  if (result) return `/jobs/${result[1]}/result`;

  return null;
}

export async function handleFetcherIngress(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const enginePath = fetcherEnginePath(pathname);
  if (!enginePath) return null;

  if (request.method !== "POST") {
    return json({ error: "metod tillåts inte" }, 405, { allow: "POST" });
  }

  if (!env.INGEST_API_KEY) {
    return json({ error: "fetcher-ingress ej konfigurerad" }, 503);
  }

  if (request.headers.get("X-API-Key") !== env.INGEST_API_KEY) {
    return json({ error: "obehörig" }, 401);
  }

  const upstreamUrl = new URL(request.url);
  upstreamUrl.protocol = "https:";
  upstreamUrl.host = "produkter-motor.internal";
  upstreamUrl.pathname = enginePath;

  const upstreamRequest = new Request(upstreamUrl, request);
  const headers = new Headers(upstreamRequest.headers);
  headers.set("X-API-Key", env.INGEST_API_KEY);

  try {
    return await env.ENGINE.fetch(new Request(upstreamRequest, { headers }));
  } catch (error) {
    console.error("fetcher ingress: engine service binding misslyckades", error);
    return json({ error: "motorn ej tillgänglig" }, 502);
  }
}
