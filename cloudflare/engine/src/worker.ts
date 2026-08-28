import core from "./index";
import { bearbetaRenderKo, type WebblasareEnv } from "./webblasare";

interface Env extends WebblasareEnv {
  DB: D1Database;
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

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Core-handlern är sanningskälla för schemaläggning, lease-recovery,
    // prisbevakning och AI-beskrivningar. Browser Run konsumerar renderkön efteråt.
    await coreHandler.scheduled(controller, env, ctx);

    const limit = Math.min(Math.max(1, Number(env.BROWSER_RENDER_LIMIT) || 3), 10);
    try {
      const renderade = await bearbetaRenderKo(env, limit);
      console.log("browser_run_cron_klar", { renderade });
    } catch (err) {
      console.error("browser_run_cron_fel", err);
    }
  },

  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return coreHandler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
