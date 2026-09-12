import { WorkerEntrypoint } from "cloudflare:workers";
import core, { completeRedundantDetailJobs, describeProduct } from "./index";
import { bearbetaCrawlKo, type CrawlEnv } from "./crawl";
import { bearbetaRenderKo, type WebblasareEnv } from "./webblasare";
import { withD1Session } from "../../shared/d1-session";

interface Env extends WebblasareEnv, CrawlEnv {
  DB: D1Database;
  AI: Ai;
  INGEST_API_KEY: string;
  BROWSER_RENDER_LIMIT?: string;
  BROWSER_MAX_LIST_PAGES?: string;
  [key: string]: unknown;
}

type CoreHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void>;
};

const coreHandler = core as unknown as CoreHandler;

const handler = {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    env = withD1Session(env, "first-primary");
    // Core-handlern är sanningskälla för schemaläggning, lease-recovery,
    // prisbevakning och AI-beskrivningar. List-jobb delegeras därefter i första
    // hand till Cloudflares /crawl. De som inte kan delegeras ligger kvar och
    // konsumeras av Playwright-kön som fallback.
    await coreHandler.scheduled(controller, env, ctx);

    try {
      const crawl = await bearbetaCrawlKo(env);
      console.log("crawl_cron_klar", crawl);
    } catch (err) {
      // Ett fel i primärvägen får inte hindra Playwright-fallbacken.
      console.error("crawl_cron_fel", err);
    }

    // /crawl kan ha fyllt source_text för jobb som core-handlern nyss hann
    // schemalägga. Städa dem innan Browser Run leasar nästa batch.
    try {
      const redundant = await completeRedundantDetailJobs(env, Date.now());
      if (redundant > 0) console.log("browser_run_redundanta_stadade", { redundant });
    } catch (err) {
      console.error("browser_run_stadning_fel", err);
    }

    const limit = Math.min(Math.max(1, Number(env.BROWSER_RENDER_LIMIT) || 3), 10);
    try {
      const renderade = await bearbetaRenderKo(env, limit);
      console.log("browser_run_cron_klar", { renderade });
    } catch (err) {
      console.error("browser_run_cron_fel", err);
    }
  },

  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return coreHandler.fetch(request, withD1Session(env, "first-primary"), ctx);
  },
} satisfies ExportedHandler<Env>;

// RPC nås enbart via en uttrycklig Service Binding. Publik HTTP fortsätter
// genom den separata fetch-handlerns autentisering och Access-policy.
export default class Engine extends WorkerEntrypoint<Env> {
  fetch(request: Request): Promise<Response> {
    return handler.fetch(request, this.env, this.ctx);
  }

  scheduled(controller: ScheduledController): Promise<void> {
    return handler.scheduled(controller, this.env, this.ctx);
  }

  async describe(id: number): Promise<Response> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      return Response.json({ error: "ogiltigt produkt-id" }, { status: 400 });
    }
    try {
      const request = new Request("https://produkter-motor.internal/describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      return await describeProduct(request, withD1Session(this.env, "first-primary"));
    } catch (error) {
      console.error("engine rpc-fel:", error);
      return Response.json({ error: "internt fel" }, { status: 500 });
    }
  }
}
