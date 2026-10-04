import assert from "node:assert/strict";
import test from "node:test";

import { ingestApiKey } from "../shared/ingest-secret.ts";

test("Secrets Store takes precedence over legacy Worker secret", async () => {
  const value = await ingestApiKey({
    INGEST_API_KEY_STORE: { get: async () => "central" },
    INGEST_API_KEY: "legacy",
  });
  assert.equal(value, "central");
});

test("legacy Worker secret remains a migration fallback", async () => {
  assert.equal(await ingestApiKey({ INGEST_API_KEY: "legacy" }), "legacy");
  assert.equal(await ingestApiKey({}), null);
});

test("Secrets Store lookup fails closed instead of falling back", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const value = await ingestApiKey({
      INGEST_API_KEY_STORE: { get: async () => { throw new Error("unavailable"); } },
      INGEST_API_KEY: "legacy",
    });
    assert.equal(value, null);
  } finally {
    console.error = original;
  }
});
