export interface IngestSecretEnv {
  INGEST_API_KEY_STORE?: SecretsStoreSecret;
  INGEST_API_KEY?: string;
}

export async function ingestApiKey(env: IngestSecretEnv): Promise<string | null> {
  if (env.INGEST_API_KEY_STORE) {
    try {
      const value = await env.INGEST_API_KEY_STORE.get();
      return value || null;
    } catch (error) {
      console.error(
        "INGEST_API_KEY kunde inte läsas från Secrets Store",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  return env.INGEST_API_KEY || null;
}
