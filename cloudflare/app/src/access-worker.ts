import app from "./worker";
import { accessRoute } from "./access-routing";
import type { Env } from "./db";

type AccessEnv = Env & { ASSETS: Fetcher };

type AppHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
};

const appHandler = app as unknown as AppHandler;
const SEO_DESCRIPTION = "Produkter är en kostnadsfri tjänst för produktkatalog, prisbevakning, ansökningsunderlag och AI-genererade produktbeskrivningar.";

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

function withRobotsHeader(response: Response, value: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function applyHtmlIndexingPolicy(response: Response, pathname: string): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  return withRobotsHeader(response, pathname === "/" ? "index, follow" : "noindex, nofollow");
}

function configuredPublicOrigin(env: AccessEnv): string {
  const url = new URL(env.PUBLIC_APP_URL);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_APP_URL måste vara ett HTTPS-origin utan path/query");
  }
  return url.origin;
}

function robotsResponse(origin: string, headOnly: boolean): Response {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
  return new Response(headOnly ? null : body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function sitemapResponse(origin: string, headOnly: boolean): Response {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${origin}/</loc></url>\n` +
    `</urlset>\n`;
  return new Response(headOnly ? null : body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}

function injectAccessRouting(response: Response, pathname: string, canonicalRoot: string): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const rewriter = new HTMLRewriter()
    .on('script[src="/app.js"]', {
      element(element) {
        element.before('<script src="/access-routing.js"></script>', { html: true });
      },
    });

  if (pathname === "/") {
    rewriter
      .on("title", {
        element(element) {
          element.setInnerContent("Produkter – produktkatalog, prisbevakning och AI-beskrivningar");
        },
      })
      .on("head", {
        element(element) {
          element.append(
            `<meta name="description" content="${SEO_DESCRIPTION}">` +
            '<meta name="robots" content="index,follow,max-image-preview:large">' +
            `<link rel="canonical" href="${canonicalRoot}/">`,
            { html: true },
          );
        },
      });
  }

  return applyHtmlIndexingPolicy(rewriter.transform(response), pathname);
}

export default {
  async fetch(request: Request, env: AccessEnv, ctx: ExecutionContext): Promise<Response> {
    const externalUrl = new URL(request.url);
    const canonicalRoot = configuredPublicOrigin(env);
    const headOnly = request.method === "HEAD";
    if ((request.method === "GET" || headOnly) && externalUrl.pathname === "/robots.txt") {
      return robotsResponse(canonicalRoot, headOnly);
    }
    if ((request.method === "GET" || headOnly) && externalUrl.pathname === "/sitemap.xml") {
      return sitemapResponse(canonicalRoot, headOnly);
    }
    const route = accessRoute(request.method, externalUrl.pathname);

    if (route.type === "redirect") {
      return redirectToCanonical(request, route.pathname);
    }

    if (route.type === "asset") {
      return injectAccessRouting(
        await env.ASSETS.fetch(requestWithPath(request, route.pathname)),
        externalUrl.pathname,
        canonicalRoot,
      );
    }

    const upstreamRequest = route.type === "rewrite"
      ? requestWithPath(request, route.pathname)
      : request;
    const response = await appHandler.fetch(upstreamRequest, env, ctx);

    if (externalUrl.pathname === "/" || externalUrl.pathname === "/admin" || externalUrl.pathname.startsWith("/admin/")) {
      return injectAccessRouting(response, externalUrl.pathname, canonicalRoot);
    }
    return applyHtmlIndexingPolicy(response, externalUrl.pathname);
  },
} satisfies ExportedHandler<AccessEnv>;
