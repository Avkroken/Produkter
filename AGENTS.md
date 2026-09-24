# AGENTS.md

## Läs först

- [docs/project-context.md](docs/project-context.md) — canonical runtime- och current-state.
- [docs/architecture.md](docs/architecture.md) — dataflöden och trust boundaries.
- [docs/operations.md](docs/operations.md) — verifiering och drift.
- [scraper/fetcher/README.md](scraper/fetcher/README.md) — externa Playwright-fetcherns kontrakt.
- `Avkroken/Avkroken/docs/organization/engineering-context.md` och `documentation-standard.md` — central CI/governance och dokumentationsmodell.

## Invariants

- Arbeta i separat gren enligt `{agent}/{feature}/{YYYY-MM-DD}/{HH-mm}-{id}`.
- Cloudflare är control/state plane; D1 är canonical durable application state.
- Browser rendering ligger i den stateless externa Playwright-fetchern.
- Återintroducera inte Cloudflare Browser Run i Produkter som lokal genväg. Jobb är Avkroken-workloaden som behåller Browser Run.
- Fetchern får inte bära unik canonical state; lease-expiry ska möjliggöra återhämtning efter hostfel.
- Verifiera berörd app/engine/processor med dess faktiska package- och Wrangler-konfiguration före merge.
- Försvaga inte central Node/Cloudflare/Python/Docker-CI eller Cloudflare free-first observability-policy som workaround.
- Lägg aldrig providercredentials, ingest-nycklar eller andra secrets i repository, logs eller publik dokumentation.
