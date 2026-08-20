const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

if (!accountId || !token) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID och CLOUDFLARE_API_TOKEN krävs");
}

const apiBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
const headers = { Authorization: `Bearer ${token}` };

async function request(path, options = {}, allow404 = false) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${await response.text()}`);
  }
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response;
}

async function renameD1() {
  const id = "f1301925-95c3-47c7-b513-a25d4cfaf881";
  const current = await request(`/d1/database/${id}`);
  if (current.result?.name !== "produkter") {
    await request(`/d1/database/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "produkter" }),
    });
  }
  const verified = await request(`/d1/database/${id}`);
  if (verified.result?.name !== "produkter") throw new Error("D1-namnbytet kunde inte verifieras");
  console.log("D1: produkter");
}

async function renameKv() {
  const id = "adafd9ea9ec24bc8ab8da87ff80467cc";
  await request(`/storage/kv/namespaces/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "produkter-sessioner" }),
  });
  const namespaces = await request("/storage/kv/namespaces?per_page=100");
  const verified = namespaces.result?.some(
    (item) => item.id === id && item.title === "produkter-sessioner",
  );
  if (!verified) throw new Error("KV-namnbytet kunde inte verifieras");
  console.log("KV: produkter-sessioner");
}

function objectPath(bucket, key) {
  return `/r2/buckets/${bucket}/objects/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function ensureR2() {
  const oldBucket = "product-describer-uploads";
  const newBucket = "produkter-uppladdningar";
  if (!(await request(`/r2/buckets/${newBucket}`, {}, true))) {
    await request("/r2/buckets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newBucket }),
    });
  }

  let cursor = "";
  let copied = 0;
  do {
    const query = new URLSearchParams({ per_page: "1000" });
    if (cursor) query.set("cursor", cursor);
    const page = await request(`/r2/buckets/${oldBucket}/objects?${query}`, {}, true);
    if (!page) break;
    const objects = Array.isArray(page.result) ? page.result : page.result?.objects || [];
    for (const object of objects) {
      const source = await request(objectPath(oldBucket, object.key));
      const uploadHeaders = {};
      const contentType = source.headers.get("content-type");
      if (contentType) uploadHeaders["content-type"] = contentType;
      await request(objectPath(newBucket, object.key), {
        method: "PUT",
        headers: uploadHeaders,
        body: source.body,
        duplex: "half",
      });
      copied += 1;
    }
    cursor = page.result_info?.cursor || page.result?.cursor || "";
  } while (cursor);
  console.log(`R2: ${newBucket}; kopierade ${copied} objekt; gammal bucket behålls`);
}

async function ensureQueue() {
  const list = await request("/queues?per_page=100");
  if (!list.result?.some((queue) => queue.queue_name === "produkter-jobb")) {
    await request("/queues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queue_name: "produkter-jobb" }),
    });
  }
  const verified = await request("/queues?per_page=100");
  if (!verified.result?.some((queue) => queue.queue_name === "produkter-jobb")) {
    throw new Error("Den nya kön kunde inte verifieras");
  }
  console.log("Kö: produkter-jobb");
}

await renameD1();
await renameKv();
await ensureR2();
await ensureQueue();
console.log("Första namnbytessteget är klart; gamla R2- och köresurser behålls tills trafiken verifierats.");
