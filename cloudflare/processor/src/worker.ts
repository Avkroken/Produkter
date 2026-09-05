import processor from "./index";
import { withD1Session } from "../../shared/d1-session";

interface Env {
  DB: D1Database;
  [key: string]: unknown;
}

type ProcessorHandler = {
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void>;
};

const processorHandler = processor as unknown as ProcessorHandler;

export default {
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    return processorHandler.queue(batch, withD1Session(env, "first-primary"));
  },
} satisfies ExportedHandler<Env>;
