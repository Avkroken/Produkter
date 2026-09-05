import assert from "node:assert/strict";
import test from "node:test";

import { appD1SessionConstraint } from "../app/src/d1-routing.ts";
import { withD1Session } from "../shared/d1-session.ts";

test("catalog reads may use D1 replicas", () => {
  assert.equal(appD1SessionConstraint("GET", "/api/catalog"), "first-unconstrained");
  assert.equal(appD1SessionConstraint("GET", "/api/categories"), "first-unconstrained");
  assert.equal(appD1SessionConstraint("GET", "/api/produkt/42"), "first-unconstrained");
});

test("stateful and mutating app routes start on primary", () => {
  assert.equal(appD1SessionConstraint("GET", "/api/jobs"), "first-primary");
  assert.equal(appD1SessionConstraint("GET", "/api/admin/stats"), "first-primary");
  assert.equal(appD1SessionConstraint("POST", "/api/produkt/42/describe"), "first-primary");
});

test("nested sessions retain the original D1 binding for primary reads", () => {
  const constraints = [];
  const primary = {
    withSession(constraint) {
      constraints.push(constraint);
      return { constraint };
    },
  };
  const env = { DB: primary, marker: "ok" };

  const replicaEnv = withD1Session(env, "first-unconstrained");
  const primaryEnv = withD1Session(replicaEnv, "first-primary");

  assert.deepEqual(constraints, ["first-unconstrained", "first-primary"]);
  assert.equal(replicaEnv.marker, "ok");
  assert.equal(primaryEnv.D1_PRIMARY, primary);
  assert.equal(primaryEnv.DB.constraint, "first-primary");
});
