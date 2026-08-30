import { buildGeminiRequest } from "./providers";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}`);
}

const routed = buildGeminiRequest("gateway-key", "gemini-2.5-flash", {
  baseUrl: "https://gateway.example/google-ai-studio",
  headers: { "cf-aig-skip-cache": "true" },
});
assertEqual(
  routed.url,
  "https://gateway.example/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent",
  "gateway-URL ska sakna API-nyckel",
);
assertEqual(routed.headers["x-goog-api-key"], "gateway-key", "gateway-anrop ska skicka Google-nyckeln som header");
assertEqual(routed.headers["cf-aig-skip-cache"], "true", "gateway-headers ska bevaras");

const direct = buildGeminiRequest("direct key", "gemini-2.5-flash");
assertEqual(
  direct.url,
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=direct%20key",
  "direktanrop ska skicka URL-kodad nyckel som queryparameter",
);
assertEqual(direct.headers["x-goog-api-key"], undefined, "direktanrop ska inte lägga till gateway-headern");
