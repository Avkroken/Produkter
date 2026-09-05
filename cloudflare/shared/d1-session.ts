type D1SessionCarrier = {
  DB: D1Database;
  D1_PRIMARY?: D1Database;
};

export type D1SessionConstraint = Parameters<D1Database["withSession"]>[0];

export function withD1Session<T extends { DB: D1Database }>(env: T, constraint: D1SessionConstraint): T {
  const carrier = env as T & D1SessionCarrier;
  const primary = carrier.D1_PRIMARY ?? env.DB;
  return Object.assign(Object.create(env), {
    DB: primary.withSession(constraint),
    D1_PRIMARY: primary,
  }) as T;
}
