import { WorkerEntrypoint } from "cloudflare:workers";
import core, { completeRedundantDetailJobs, describeProduct } from "./index";
import { withD1Session } from "../../shared/d1-session";

interface Env {
  DB: D1Database;
  AI: Ai;
  INGEST_API_KEY: string;
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

    // Cloudflare är kontrollplanet: schemaläggning, lease-recovery,
    // prisbevakning och AI-beskrivningar ligger kvar här. Render-jobben
    // konsumeras av den externa statslösa Playwright-fetchern via /jobs/lease.
    await coreHandler.scheduled(controller, env, ctx);

    // Om annan ingest redan hunnit fylla source_text ska väntande detail-jobb
    // inte skickas till den externa fetchern i onödan.
    try {
      const redundant = await completeRedundantDetailJobs(env, Date.now());
      if (redundant > 0) console.log("external_fetcher_redundanta_stadade", { redundant });
    } catch (err) {
      console.error("external_fetcher_stadning_fel", err);
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
