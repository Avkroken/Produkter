import app from "./index";
import { appD1SessionConstraint } from "./d1-routing";
import type { Env } from "./db";
import { withD1Session } from "../../shared/d1-session";

type AppHandler = {
  fetch(request: Request, env: Env): Promise<Response>;
};

const appHandler = app as unknown as AppHandler;

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    return appHandler.fetch(request, withD1Session(env, appD1SessionConstraint(request.method, pathname)));
  },
} satisfies ExportedHandler<Env>;
