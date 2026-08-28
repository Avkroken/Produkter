import core from "./index";
import { processBrowserQueue, type BrowserRunEnv } from "./browser";

interface Env extends BrowserRunEnv {
  DB: D1Database;
  INGEST_API_KEY: string;
  BROWSER_RENDER_LIMIT?: string;
  [key: string]: unknown;
}

type CoreHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void>;
};

const coreHandler = core as unknown as CoreHandler;

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Behåll engine:s befintliga cron som sanningskälla för schemaläggning,
    // lease-recovery, prisbevakning och AI-beskrivningar.
    await coreHandler.scheduled(controller, env, ctx);

    const limit = Math.min(Math.max(1, Number(env.BROWSER_RENDER_LIMIT) || 3), 10);
    try {
      const rendered = await processBrowserQueue(
        env,
        (request) => coreHandler.fetch(request, env, ctx),
        limit,
      );
      console.log(`browser-run: rendered=${rendered}`);
    } catch (err) {
      console.error("browser-run cron misslyckades:", err);
    }
  },

  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return coreHandler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
