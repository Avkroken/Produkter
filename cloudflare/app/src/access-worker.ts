import app from "./worker";
import { accessRoute } from "./access-routing";
import type { Env } from "./db";
import { configuredPublicOrigin, robotsText, sitemapText } from "./public-metadata";

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

function robotsResponse(origin: string, headOnly: boolean): Response {
  return new Response(headOnly ? null : robotsText(origin), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function sitemapResponse(origin: string, headOnly: boolean): Response {
  return new Response(headOnly ? null : sitemapText(origin), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}

function injectAccessRouting(
  response: Response,
  pathname: string,
  canonicalRoot: string,
  env: AccessEnv,
): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const googleOAuthEnabled = Boolean(env.OAUTH_GOOGLE_CLIENT_ID && env.OAUTH_GOOGLE_CLIENT_SECRET);
  const microsoftOAuthEnabled = Boolean(env.OAUTH_MICROSOFT_CLIENT_ID && env.OAUTH_MICROSOFT_CLIENT_SECRET);
  const supportEnabled = Boolean(env.SUPPORT_PAYPAL_URL || env.SUPPORT_DONATION_URL);

  const rewriter = new HTMLRewriter()
    .on('script[src="/app.js"]', {
      element(element) {
        element.before('<script src="/access-routing.js"></script>', { html: true });
      },
    })
    .on("[data-turnstile-widget]", {
      element(element) {
        element.setAttribute("data-sitekey", env.TURNSTILE_SITE_KEY);
      },
    })
    .on('[data-oauth-provider="google"]', {
      element(element) {
        if (!googleOAuthEnabled) element.remove();
      },
    })
    .on('[data-oauth-provider="microsoft"]', {
      element(element) {
        if (!microsoftOAuthEnabled) element.remove();
      },
    })
    .on("[data-oauth-divider]", {
      element(element) {
        if (!googleOAuthEnabled && !microsoftOAuthEnabled) element.remove();
      },
    })
    .on('[data-support-provider="paypal"]', {
      element(element) {
        if (env.SUPPORT_PAYPAL_URL) element.setAttribute("href", env.SUPPORT_PAYPAL_URL);
        else element.remove();
      },
    })
    .on('[data-support-provider="donation"]', {
      element(element) {
        if (env.SUPPORT_DONATION_URL) element.setAttribute("href", env.SUPPORT_DONATION_URL);
        else element.remove();
      },
    })
    .on("[data-support-nav]", {
      element(element) {
        if (!supportEnabled) element.remove();
      },
    })
    .on("[data-support-section]", {
      element(element) {
        if (!supportEnabled) element.remove();
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
    const canonicalRoot = configuredPublicOrigin(env.PUBLIC_APP_URL);
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
        env,
      );
    }

    const upstreamRequest = route.type === "rewrite"
      ? requestWithPath(request, route.pathname)
      : request;
    const response = await appHandler.fetch(upstreamRequest, env, ctx);

    if (externalUrl.pathname === "/" || externalUrl.pathname === "/admin" || externalUrl.pathname.startsWith("/admin/")) {
      return injectAccessRouting(response, externalUrl.pathname, canonicalRoot, env);
    }
    return applyHtmlIndexingPolicy(response, externalUrl.pathname);
  },
} satisfies ExportedHandler<AccessEnv>;
