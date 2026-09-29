// Utgående mail via Resend. Avsändaren är installationskonfiguration.
import type { Env } from "./db";

/**
 * Skickar ett textmejl via Resend och returnerar om tjänsten svarade med 2xx.
 * Returnerar false om API-nyckel/avsändare saknas eller vid HTTP-, nätverks-
 * eller timeoutfel (10 sekunder); bekräftar inte leverans till mottagaren.
 */
export async function sendEmail(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false;
  const from = env.MAIL_FROM;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
