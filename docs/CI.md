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

Node-workers använder respektive `package-lock.json` med `npm ci` och npm-cache. För varje Worker kör CI typkontroll och Wrangler dry-run. Den gemensamma production-deploy-garden under `cloudflare/scripts/` kör dessutom Node-tester i app-matrisbenet.

## Docker och säkerhet

Docker-images routas separat från required språk-CI.

- root-Python, `templates/`, root-`Dockerfile` och `.dockerignore` påverkar `produkter`-imagen
- relevant kod under `scraper/` påverkar `scraper`-imagen
- Docker-workflow, Trivy-action och impact-routing verifierar båda images
- schemalagda och manuella körningar bygger båda images
- Code Scanning-kategorierna är stabila: `trivy-product-describer` och `trivy-scraper`

Docker/Trivy, Dependency Review och OSV är kompletterande verifiering men är inte required contexts i nuvarande ruleset. De ska inte skapa konstgjorda wrapper-checkar eller tomma SARIF-resultat för regler som inte finns.

## Deploy

Cloudflare Workers Builds äger normal produktionsdeploy från `main`; GitHub Actions deployar inte produktion. Varje Worker använder sin egen root directory och samma versionshanterade production-command:

| Worker | Root directory | Deploy command |
| --- | --- | --- |
| `produkter` | `cloudflare/app` | `npm run deploy:production` |
| `produkter-motor` | `cloudflare/engine` | `npm run deploy:production` |
| `produkter-bearbetare` | `cloudflare/processor` | `npm run deploy:production` |

`deploy:production` kör `cloudflare/scripts/deploy-production.mjs`. I Workers Builds failar skriptet stängt om branchen inte är `main` eller om `WORKERS_CI_COMMIT_SHA` saknas/är ogiltig. Wrangler deployas med `--strict` och buildens Git-SHA sparas i deployment-meddelandet.

Efter deploy verifieras bara ytor som faktiskt finns:

- `produkter`: huvuddomänen måste svara HTTP 200.
- `produkter-motor`: `https://motor.denied.se/health` måste svara HTTP 200 med `{ "ok": true }`.
- `produkter-bearbetare`: ingen HTTP-check skapas eftersom Workern är en privat Queue-konsument utan publik route.

`wrangler.jsonc` i respektive katalog är sanningskällan för Worker-namn, bindings, routes och cron-triggers. Build watch paths måste omfatta respektive Worker-root samt `cloudflare/shared/**` och `cloudflare/scripts/**` när de används av Workern/deploykedjan.

D1-databasen `produkter` delas av flera Workers och repositoryt har i nuläget ingen Wrangler `migrations/`-kedja, endast versionshanterade SQL-filer under `cloudflare/infra/`. Därför ska de tre separata Workers Builds **inte** automatiskt applicera D1-schema vid deploy. Schemaändringar ska hanteras separat tills en entydig migrationsägare och idempotent migrationskedja införs.

Secrets sätts utanför repositoryt och får inte committas. Ändra inte Worker-secrets eller bindings som en del av CI-städning utan uttryckligt behov och efter verifiering av runtime-konfigurationen.

## Princip

Live-ruleset är sanningskällan för merge-gates. CI ska vara så liten som möjligt utan att tappa relevant verifiering; vid osäker påverkan ska den hellre köra mer än missa ett test.
