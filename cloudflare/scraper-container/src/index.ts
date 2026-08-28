import { Container, getContainer, switchPort } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

interface Env {
  SCRAPER_CONTAINER: DurableObjectNamespace<ScraperContainer>;
  DB_HOST: string;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  API_KEY: string;
  TZ: string;
  GITHUB_ERROR_REPORT_TOKEN?: string;
}

export class ScraperContainer extends Container {
  defaultPort = 8765;
  requiredPorts = [3000, 8765];
  sleepAfter = "10m";
  enableInternet = true;

  envVars = {
    DB_HOST: env.DB_HOST,
    DB_NAME: env.DB_NAME,
    DB_USER: env.DB_USER,
    DB_PASSWORD: env.DB_PASSWORD,
    API_KEY: env.API_KEY,
    TZ: env.TZ,
    GITHUB_ERROR_REPORT_TOKEN: env.GITHUB_ERROR_REPORT_TOKEN ?? "",
  };

  override onStart() {
    console.log("Scraper container started");
  }

  override onStop() {
    console.log("Scraper container stopped");
  }

  override onError(error: unknown) {
    console.error("Scraper container error", error);
    throw error;
  }
}

function scraper(envBindings: Env) {
  return getContainer(envBindings.SCRAPER_CONTAINER, "primary");
}

export default {
  async fetch(request: Request, envBindings: Env): Promise<Response> {
    const url = new URL(request.url);
    const instance = scraper(envBindings);

    if (url.pathname === "/ui" || url.pathname.startsWith("/ui/")) {
      const upstreamUrl = new URL(request.url);
      upstreamUrl.pathname = url.pathname === "/ui" ? "/" : url.pathname.slice(3);
      const upstream = new Request(upstreamUrl, request);
      return instance.fetch(switchPort(upstream, 3000));
    }

    return instance.fetch(request);
  },

  async scheduled(_controller: ScheduledController, envBindings: Env): Promise<void> {
    const instance = scraper(envBindings);
    await instance.fetch(new Request("https://scraper.internal/health"));
  },
} satisfies ExportedHandler<Env>;
