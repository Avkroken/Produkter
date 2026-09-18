export async function verifyTurnstile(
  request: Request,
  secret: string | undefined,
  hostnames: string | undefined,
  token: unknown,
  expectedAction: string,
): Promise<boolean> {
  if (!secret || !hostnames || typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return false;
    const result = await response.json<{ success?: boolean; action?: string; hostname?: string }>();
    const allowed = new Set(hostnames.split(",").map(v => v.trim().toLowerCase()).filter(Boolean));
    return result.success === true && result.action === expectedAction
      && typeof result.hostname === "string" && allowed.has(result.hostname.toLowerCase());
  } catch { return false; }
}
