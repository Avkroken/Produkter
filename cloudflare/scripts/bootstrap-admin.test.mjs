import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountLookupSql,
  buildPromoteSql,
  findAccountRow,
  normalizeAdminEmail,
  sqlLiteral,
} from "./bootstrap-admin.mjs";

test("admin bootstrap normalizes and validates email", () => {
  assert.equal(normalizeAdminEmail(" Admin@Example.COM "), "admin@example.com");
  assert.throws(() => normalizeAdminEmail("not-an-email"), /giltig e-postadress/);
});

test("admin bootstrap SQL escapes values and scopes promotion to account id", () => {
  assert.equal(sqlLiteral("a'b"), "'a''b'");
  assert.match(buildAccountLookupSql("admin@example.com"), /lower\('admin@example\.com'\)/);
  assert.equal(buildPromoteSql("account'id"), "UPDATE accounts SET role = 'admin' WHERE id = 'account''id'");
});

test("admin bootstrap finds account rows in Wrangler JSON output", () => {
  assert.deepEqual(
    findAccountRow([{ results: [{ id: "abc", email: "admin@example.com", role: "user" }] }]),
    { id: "abc", email: "admin@example.com", role: "user" },
  );
  assert.equal(findAccountRow([{ results: [] }]), null);
});
