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

Node-workers använder respektive `package-lock.json` med `npm ci` och npm-cache.

## Docker och säkerhet

Docker-images routas separat från required språk-CI.

- root-Python, `templates/`, root-`Dockerfile` och `.dockerignore` påverkar `produkter`-imagen
- relevant kod under `scraper/` påverkar `scraper`-imagen
- Docker-workflow, Trivy-action och impact-routing verifierar båda images
- schemalagda och manuella körningar bygger båda images
- Code Scanning-kategorierna är stabila: `trivy-product-describer` och `trivy-scraper`

Docker/Trivy, Dependency Review och OSV är kompletterande verifiering men är inte required contexts i nuvarande ruleset. De ska inte skapa konstgjorda wrapper-checkar eller tomma SARIF-resultat för regler som inte finns.

## Deploy

Cloudflare Workers deployas av Workers Builds från `main`, inte av GitHub Actions. Varje Worker använder sin egen root directory:

| Worker | Root directory |
| --- | --- |
| `produkter` | `cloudflare/app` |
| `produkter-motor` | `cloudflare/engine` |
| `produkter-bearbetare` | `cloudflare/processor` |

`wrangler.jsonc` i respektive katalog är sanningskällan för Worker-namn, bindings, routes och cron-triggers. Delad kod under `cloudflare/shared/` måste ingå i relevanta build watch paths.

Secrets sätts utanför repositoryt och får inte committas. Ändra inte Worker-secrets eller bindings som en del av CI-städning utan uttryckligt behov och efter verifiering av runtime-konfigurationen.

## Princip

Live-ruleset är sanningskällan för merge-gates. CI ska vara så liten som möjligt utan att tappa relevant verifiering; vid osäker påverkan ska den hellre köra mer än missa ett test.
