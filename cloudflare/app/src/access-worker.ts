import app from "./worker";
import { accessRoute } from "./access-routing";
import type { Env } from "./db";

type AccessEnv = Env & { ASSETS: Fetcher };

type AppHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
};

const appHandler = app as unknown as AppHandler;

function requestWithPath(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

function redirectToCanonical(request: Request, pathname: string): Response {
  const target = new URL(request.url);
  target.pathname = pathname;
  return new Response(null, {
    status: 308,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function injectAccessRouting(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  return new HTMLRewriter()
    .on('script[src="/app.js"]', {
      element(element) {
        element.before('<script src="/access-routing.js"></script>', { html: true });
      },
    })
    .transform(response);
}

export default {
  async fetch(request: Request, env: AccessEnv, ctx: ExecutionContext): Promise<Response> {
    const externalUrl = new URL(request.url);
    const route = accessRoute(request.method, externalUrl.pathname);

    if (route.type === "redirect") {
      return redirectToCanonical(request, route.pathname);
    }

    if (route.type === "asset") {
      return injectAccessRouting(await env.ASSETS.fetch(requestWithPath(request, route.pathname)));
    }

    const upstreamRequest = route.type === "rewrite"
      ? requestWithPath(request, route.pathname)
      : request;
    const response = await appHandler.fetch(upstreamRequest, env, ctx);

    if (externalUrl.pathname === "/" || externalUrl.pathname === "/admin" || externalUrl.pathname.startsWith("/admin/")) {
      return injectAccessRouting(response);
    }
    return response;
  },
} satisfies ExportedHandler<AccessEnv>;
