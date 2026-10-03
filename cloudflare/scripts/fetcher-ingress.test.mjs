import assert from "node:assert/strict";
import test from "node:test";

import { fetcherEnginePath, handleFetcherIngress } from "../app/src/fetcher-ingress.ts";

test("fetcher ingress exposes only lease and result routes", () => {
  assert.equal(fetcherEnginePath("/fetcher/jobs/lease"), "/jobs/lease");
  assert.equal(fetcherEnginePath("/jobs/lease"), "/jobs/lease");
  assert.equal(fetcherEnginePath("/fetcher/jobs/42/result"), "/jobs/42/result");
  assert.equal(fetcherEnginePath("/jobs/42/result"), "/jobs/42/result");
  assert.equal(fetcherEnginePath("/fetcher/jobs/nope/result"), null);
  assert.equal(fetcherEnginePath("/fetcher/ingest"), null);
  assert.equal(fetcherEnginePath("/fetcher/describe"), null);
  assert.equal(fetcherEnginePath("/api/jobs/lease"), null);
});

test("fetcher ingress rejects missing or wrong API key before service binding", async () => {
  let calls = 0;
  const env = {
    INGEST_API_KEY: "correct",
    ENGINE: { fetch: async () => { calls += 1; return new Response("unexpected"); } },
  };

  for (const key of [null, "wrong"]) {
    const headers = key ? { "X-API-Key": key } : {};
    const request = new Request("https://produkter.example/fetcher/jobs/lease", {
      method: "POST",
      headers,
      body: JSON.stringify({ n: 1 }),
    });
    const response = await handleFetcherIngress(request, env, "/fetcher/jobs/lease");
    assert.equal(response.status, 401);
  }

  assert.equal(calls, 0);
});

test("fetcher ingress forwards authorized requests through ENGINE service binding", async () => {
  let forwarded;
  const env = {
    INGEST_API_KEY: "correct",
    ENGINE: {
      fetch: async (request) => {
        forwarded = request;
        return Response.json({ jobs: [] }, { status: 200 });
      },
    },
  };

  const request = new Request("https://produkter.example/fetcher/jobs/lease?source=test", {
    method: "POST",
    headers: { "X-API-Key": "correct", "content-type": "application/json" },
    body: JSON.stringify({ n: 3 }),
  });
  const response = await handleFetcherIngress(request, env, "/fetcher/jobs/lease");

  assert.equal(response.status, 200);
  assert.equal(forwarded.url, "https://produkter-motor.internal/jobs/lease?source=test");
  assert.equal(forwarded.headers.get("X-API-Key"), "correct");
  assert.deepEqual(await forwarded.json(), { n: 3 });
});

test("fetcher ingress rejects non-POST methods and reports binding failures", async () => {
  const env = {
    INGEST_API_KEY: "correct",
    ENGINE: { fetch: async () => { throw new Error("binding down"); } },
  };

  const getResponse = await handleFetcherIngress(
    new Request("https://produkter.example/fetcher/jobs/lease", { headers: { "X-API-Key": "correct" } }),
    env,
    "/fetcher/jobs/lease",
  );
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get("allow"), "POST");

  const postResponse = await handleFetcherIngress(
    new Request("https://produkter.example/fetcher/jobs/7/result", {
      method: "POST",
      headers: { "X-API-Key": "correct" },
      body: "{}",
    }),
    env,
    "/fetcher/jobs/7/result",
  );
  assert.equal(postResponse.status, 502);
});
