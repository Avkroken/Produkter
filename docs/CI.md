# CI och branchflöde

## Grundmodell

Arbete sker på tillfälliga arbetsgrenar och går till `main` via pull request.

1. Öppna en ready PR till `main`.
2. Aktivera auto-merge omedelbart.
3. Required checks `python` och `node` måste bli gröna.
4. Alla review-kommentarer ska utvärderas och relevanta fynd åtgärdas innan deras trådar löses.
5. Efter varje ny commit kontrolleras CI och review-status igen.
6. Squash är enda tillåtna merge-metod i nuvarande live-ruleset.

Repositoryt använder inte merge queue och workflows behöver därför inte `merge_group`.

## Selektiv CI

`.github/scripts/ci-impact.sh` avgör vilka komponentjobb som behöver köras. De required wrapper-jobben `python` och `node` startar alltid och ger ett slutligt resultat även när deras dyra underjobb kan hoppas över.

Routing är konservativ:

- root-Python och `scraper/` påverkar Python-CI
- `cloudflare/**` påverkar Node/TypeScript-CI
- dependency- och CI-konfiguration kör berörda delar, vid osäkerhet båda
- dokumentation/processfiler behöver normalt inte språkbyggen
- okänd påverkan väljer mer verifiering framför risk för falskt negativt

Node-workers använder respektive `package-lock.json` med `npm ci` och npm-cache. För varje Worker kör CI typkontroll och Wrangler dry-run. Den gemensamma produktionsverifieraren under `cloudflare/scripts/` kör dessutom Node-tester i app-matrisbenet. CI testar verifieringslogik men innehåller ingen produktionsdeploykedja.

## Docker och säkerhet

Docker-images routas separat från required språk-CI.

- root-Python, `templates/`, root-`Dockerfile` och `.dockerignore` påverkar `produkter`-imagen
- relevant kod under `scraper/` påverkar `scraper`-imagen
- Docker-workflow, Trivy-action och impact-routing verifierar båda images
- schemalagda och manuella körningar bygger båda images
- Code Scanning-kategorierna är stabila: `trivy-product-describer` och `trivy-scraper`

Docker/Trivy, Dependency Review och OSV är kompletterande verifiering men är inte required contexts i nuvarande ruleset. De ska inte skapa konstgjorda wrapper-checkar eller tomma SARIF-resultat för regler som inte finns.

## Deploy

Cloudflare Workers Builds äger normal produktionsdeploy från `main`; GitHub Actions deployar inte produktion. Varje Worker har en egen Cloudflare production trigger. Production branch är `main`, build command är tomt och non-production branch builds är avstängda för produktions-Workers.

| Worker | Root directory | Deploy command |
| --- | --- | --- |
| `produkter` | `cloudflare/app` | `npm run deploy && npm run verify:production` |
| `produkter-motor` | `cloudflare/engine` | `npm run deploy && npm run verify:production` |
| `produkter-bearbetare` | `cloudflare/processor` | `npm run deploy` |

`deploy` är i samtliga tre paket direkt `wrangler deploy --strict`. Det finns ingen repo-lokal `deploy:production`-orkestrerare och ingen branch/SHA-logik i deploykod. Production branch, root directory, watch paths och kommandosekvens ägs av Cloudflare Workers Builds; Cloudflare registrerar själv buildens Git-metadata.

Efter deploy verifieras bara ytor som faktiskt finns:

- `produkter`: huvuddomänen måste svara HTTP 200 via `npm run verify:production`.
- `produkter-motor`: `https://motor.denied.se/health` måste svara HTTP 200 med `{ "ok": true }` via `npm run verify:production`.
- `produkter-bearbetare`: ingen HTTP-check skapas eftersom Workern är en privat Queue-konsument utan publik route.

`cloudflare/scripts/verify-production.mjs` innehåller endast applikationsspecifik HTTP-verifiering. Det scriptet får inte deploya Workers, tolka Workers Builds branch/SHA eller bli en parallell kontrollplan.

`wrangler.jsonc` i respektive katalog är source of truth för Worker-namn, bindings, routes och cron-triggers. Build watch paths ska vara:

- `produkter`: `cloudflare/app/**`, `cloudflare/shared/**`, `cloudflare/scripts/verify-production.mjs`
- `produkter-motor`: `cloudflare/engine/**`, `cloudflare/shared/**`, `cloudflare/scripts/verify-production.mjs`
- `produkter-bearbetare`: `cloudflare/processor/**`, `cloudflare/shared/**`

D1-databasen `produkter` delas av flera Workers och repositoryt har i nuläget ingen Wrangler `migrations/`-kedja, endast versionshanterade SQL-filer under `cloudflare/infra/`. Därför ska de tre separata Workers Builds **inte** automatiskt applicera D1-schema vid deploy. Schemaändringar ska hanteras separat tills en entydig migrationsägare och idempotent migrationskedja införs.

Secrets sätts utanför repositoryt och får inte committas. Ändra inte Worker-secrets eller bindings som en del av CI-städning utan uttryckligt behov och efter verifiering av runtime-konfigurationen.

## Princip

Live-ruleset är sanningskällan för merge-gates. CI ska vara så liten som möjligt utan att tappa relevant verifiering; vid osäker påverkan ska den hellre köra mer än missa ett test.
