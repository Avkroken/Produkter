/**
 * Verifierar token via Siteverify mot exakt expectedAction och en kommaseparerad
 * lista med tillåtna hostnames, jämförda utan hänsyn till skiftläge. Klientens
 * CF-Connecting-IP skickas med när den finns. Returnerar false vid saknad
 * konfiguration, tom token eller token över 2048 tecken, nekad verifiering,
 * HTTP-/JSON-/nätverksfel eller timeout efter 10 sekunder.
 */
export async function verifyTurnstile(
  request: Request,
  secret: string | undefined,
  hostnames: string | undefined,
  token: unknown,
  expectedAction: string,
): Promise<boolean> {
  if (!secret || typeof token !== "string" || !token || token.length > 2048) return false;
  const allowed = new Set((hostnames ?? "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean));
  if (allowed.size === 0) return false;

  const body = new URLSearchParams({ secret, response: token });
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body,
    });
    if (!response.ok) return false;
    const result = await response.json<{ success?: boolean; action?: string; hostname?: string }>();
    return result.success === true && result.action === expectedAction
      && typeof result.hostname === "string" && allowed.has(result.hostname.toLowerCase());
  } catch { return false; }
}
