import { hashPassword, sha256Hex } from "../../shared/crypto";
import { getAccountByEmail, type Env } from "./db";
import { AuthRequestError } from "./auth-errors";
import { sendEmail } from "./mail";

const RESET_TTL_MS = 20 * 60 * 1000;
export const RESET_MESSAGE = "Om adressen finns registrerad skickas en återställningslänk. Kontrollera även skräpposten. Länken gäller i 20 minuter.";

// D1 makes concurrent increments atomic. Store digests, not email addresses/IPs.
export async function resetRateLimit(env: Env, bucket: string, value: string, limit: number): Promise<boolean> {
  const now = Date.now();
  const key = `${bucket}:${await sha256Hex(value)}`;
  const row = await env.DB.prepare(
    "INSERT INTO auth_rate_limits (key, hits, expires_at) VALUES (?, 1, ?) " +
    "ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN expires_at <= ? THEN 1 ELSE hits + 1 END, " +
    "expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING hits",
  ).bind(key, now + 3600000, now, now).first<{ hits: number }>();
  return !!row && row.hits <= limit;
}

export function normalizeResetEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new AuthRequestError("Ange en giltig e-postadress.");
  }
  return value.trim().toLowerCase();
}

// Called through waitUntil: account existence and mail latency cannot affect the response.
export async function deliverPasswordReset(env: Env, email: string): Promise<void> {
  try {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM auth_rate_limits WHERE expires_at <= ?").bind(now),
      env.DB.prepare("DELETE FROM password_resets WHERE expires_at <= ?").bind(now),
    ]);
    const account = await getAccountByEmail(env.DB, email);
    if (!account) return;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    const digest = await sha256Hex(token);
    await env.DB.prepare(
      "INSERT INTO password_resets (account_id, token_hash, auth_version, expires_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(account_id) DO UPDATE SET token_hash=excluded.token_hash, auth_version=excluded.auth_version, expires_at=excluded.expires_at",
    ).bind(account.id, digest, account.auth_version, now + RESET_TTL_MS).run();
    // Fixed HTTPS origin prevents Host injection; fragment avoids HTTP logs/referrers.
    const link = `https://produkter.denied.se/reset-password.html#token=${encodeURIComponent(token)}`;
    const sent = await sendEmail(env, account.email, "Återställ ditt lösenord på Produkter",
      `Välj ett nytt lösenord via länken nedan. Länken gäller i 20 minuter och kan användas en gång.\n\n${link}\n\nOm du inte begärde detta kan du ignorera mejlet. Ditt lösenord har inte ändrats.`);
    if (!sent) {
      // A timeout can occur after Resend accepted the message. Keep the token until expiry.
      console.error("password_reset_delivery_failed");
    }
  } catch { console.error("password_reset_delivery_failed"); }
}

export async function resetPassword(env: Env, token: unknown, password: unknown): Promise<void> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    throw new AuthRequestError("Länken är ogiltig eller har gått ut. Begär en ny återställningslänk.");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 1024) {
    throw new AuthRequestError("Lösenordet måste vara mellan 8 och 1024 tecken.");
  }
  const digest = await sha256Hex(token);
  const { hash, salt } = await hashPassword(password);
  // Conditional UPDATE invalidates this authorization atomically by changing its version.
  // D1 batch rolls back together: concurrent submissions/replays cannot both succeed.
  const [updated] = await env.DB.batch([
    env.DB.prepare(
      "UPDATE accounts SET password_hash=?, password_salt=?, auth_version=auth_version+1 " +
      "WHERE id = (SELECT account_id FROM password_resets WHERE token_hash=? AND expires_at>?) " +
      "AND auth_version = (SELECT auth_version FROM password_resets WHERE token_hash=?)",
    ).bind(hash, salt, digest, Date.now(), digest),
    env.DB.prepare("DELETE FROM password_resets WHERE token_hash=?").bind(digest),
  ]);
  if (updated.meta.changes !== 1) {
    throw new AuthRequestError("Länken är ogiltig eller har gått ut. Begär en ny återställningslänk.");
  }
}
