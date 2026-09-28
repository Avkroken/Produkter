import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const units = ["app", "engine", "processor"];

for (const unit of units) {
  test(`${unit} Wrangler config declares previews`, () => {
    const configPath = path.join(here, "..", unit, "wrangler.jsonc");
    const source = fs.readFileSync(configPath, "utf8");
    assert.match(
      source,
      /"previews"\s*:\s*\{\s*\}/,
      `${configPath} must include an explicit empty previews block for wrangler preview`,
    );
  });
}
