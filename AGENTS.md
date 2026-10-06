# AGENTS.md

## Läs först

- [docs/project-context.md](docs/project-context.md) — canonical runtime- och current-state.
- [docs/architecture.md](docs/architecture.md) — dataflöden och trust boundaries.
- [docs/operations.md](docs/operations.md) — verifiering och drift.
- [scraper/fetcher/README.md](scraper/fetcher/README.md) — externa Playwright-fetcherns kontrakt.
- Repositoryts egna README, `docs/`, workflows och versionerade konfiguration är auktoritativa för Produkter. Extern GitHub-/Cloudflare-live-state verifieras i respektive provider.

## Invariants

- Anta inte organization-scope eller andra org-funktioner utan live-verifiering.
- Arbeta i separat gren enligt `{agent}/{feature}/{date}`, där `date` skrivs som `YYYY-MM-DD`.
- Arbetet ska vara seriellt och semantiskt per repository: en arbetsgren/PR motsvarar en sammanhängande feature eller uppgift, och `feature`-delen ska beskriva arbetet semantiskt.
- Innan agenten påbörjar nästa uppgift i samma repository ska befintlig öppen arbetsgren, draft eller PR färdigställas genom relevanta checks, reviews och merge, eller uttryckligen avslutas/blockeras. Skapa inte tids-/ID-suffix eller parallella branchvarianter för att kringgå ett upptaget namn.
- Om `{agent}/{feature}/{date}` redan finns för uppgiften ska agenten fortsätta den befintliga arbetslinjen i stället för att skapa en ny.
- Commits ska använda Conventional Commits eller motsvarande tydlig typ, exempelvis `feat:`, `fix:`, `docs:`, `chore:`, `ci:` eller `test:`.
- Läs hela PR-review-state före merge, inklusive kommentarer och trådar som GitHub markerar som `outdated`; verifiera att grundproblemet faktiskt är löst.
- Cloudflare är control/state plane; D1 är canonical durable application state.
- Browser rendering ligger i den stateless externa Playwright-fetchern.
- Browser rendering ligger i den externa fetchern; ändringar av den runtimegränsen ska vara explicita och verifierade mot Produkters egen kod och konfiguration.
- Fetchern får inte bära unik canonical state; lease-expiry ska möjliggöra återhämtning efter hostfel.
- Verifiera berörd app/engine/processor med dess faktiska package- och Wrangler-konfiguration före merge.
- Försvaga inte repositoryts Node/Cloudflare/Python/Docker-verifiering eller observability-kontrakt som workaround.
- Lägg aldrig providercredentials, ingest-nycklar eller andra secrets i repository, logs eller publik dokumentation.
## Agent skills


### Matt Skills Curated

Use Matt Skills Curated as the preferred runtime engineering workflow catalog. Read `docs/agents/matt-skills.md` before routing non-trivial engineering work. If the user explicitly invokes `@Matt Skills Curated` or a packaged skill, honor that route unless a harder repository or safety constraint conflicts. Select the narrowest effective skill, keep one primary skill per lifecycle phase, and never vendor or invent missing skill bodies.

### Issue tracker

Use this repository's GitHub Issues for issues and specifications. Read `docs/agents/issue-tracker.md` before reading, creating, or publishing tickets.

### Triage roles

When issue classification or external-request triage is in scope, use the five canonical roles in `docs/agents/triage-labels.md`. Reuse equivalent existing repository labels; do not mutate provider labels merely to normalize names. A missing GitHub label does not erase the logical triage state.

### Domain docs

Use the single-context convention in `docs/agents/domain.md`; existing project-context, architecture, operations, and component documentation remain authoritative.

