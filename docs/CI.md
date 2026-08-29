# CI och branchflöde

## Grundmodell

Arbete sker på fria arbetsgrenar. `main` tar endast emot squash-mergade PR:er.

1. Skapa eller använd en arbetsgren för ändringen.
2. Öppna PR till `main`.
3. Aktivera auto-merge direkt.
4. Required CI och olösta review-trådar blockerar merge tills de är klara.
5. Relevanta reviewfynd åtgärdas i samma PR och tråden löses först efter verifierad fix.
6. **Squash merge är den enda tillåtna merge-metoden.**

Repot använder inte merge queue. Required CI behöver därför svara på `pull_request`;
CI kan även köras på push till `main` för efter-merge-verifiering. Workflowen använder
inte `merge_group`.

## Selektiv CI

Dyra jobb ska bara köras när deras kod faktiskt påverkas. Required checks får däremot inte filtreras bort på workflow-nivå med `paths:` eftersom GitHub då kan lämna checken i `Expected/Pending`. För required checks startar workflowet och ett billigt impact-jobb avgör vilka bygg/testjobb som ska köras. Ett job-level `if:` kan då hoppa över irrelevant arbete utan att skapa en permanent väntande required check.

Routing ska vara deterministisk och konservativ:

- Python/root + `scraper/` => Python-CI.
- `cloudflare/**` => Node/TypeScript-CI.
- Dependency- eller CI-konfiguration som kan påverka flera delar => kör berörda delar, och vid osäkerhet båda.
- Dokumentation/processfiler ska inte behöva starta språkbyggen.
- Okända käll-/konfigurationsändringar ska fail-open till mer CI, inte riskera falskt negativt.

`CI / required` är den stabila check som rulesetet kräver. Den ska alltid köras och
får bara lyckas när impact-analysen lyckas och alla relevanta språkaggregat lyckas.

## Docker-impact

Docker-images routas separat från språk-CI.

- Huvudimagen `produkter` kopierar explicit bara root-Pythonfilerna och `templates/`; den använder inte längre `COPY . .`.
- Root-`.dockerignore` utesluter bland annat `cloudflare/`, `scraper/`, docs, tester och utvecklingsscript från huvudimagens build-context.
- `scraper` har redan ett separat context (`scraper/`) och har en egen `.dockerignore` som utesluter tester, dokumentation och lokal metadata.
- En ändring i root-Python, `templates/`, root-`Dockerfile` eller root-`.dockerignore` bygger/skannar bara `produkter`-imagen.
- En relevant ändring under `scraper/` bygger/skannar bara `scraper`-imagen.
- Ändringar i Docker-workflowen, Trivy-actionen eller själva impact-routingen verifierar båda images.
- Code Scanning-kategorierna är stabila (`trivy-product-describer` och `trivy-scraper`) och ska inte härledas från produktnamn.

Required checken `docker` är ett stabilt aggregatorjobb. Image-jobb får hoppas över med job-level `if:` utan att rulesetet tappar sitt required check-namn.

Docker- och security-workflows får egna filter när det är säkert, men stabila Code Scanning-kategorier och required check-namn får inte ändras bara för att komponenter byter namn.

## Deploy

Cloudflare Workers deployas av **Workers Builds**, inte av GitHub Actions. Varje
Worker är kopplad mot det här repot och bygger från `main` vid push, med en egen
root directory:

| Worker | Root directory |
| --- | --- |
| `produkter` | `cloudflare/app` |
| `produkter-motor` | `cloudflare/engine` |
| `produkter-bearbetare` | `cloudflare/processor` |

`wrangler.jsonc` i respektive katalog är sanningskällan för namn, bindings,
routes och cron-triggers. Worker-namnet i dashboarden måste matcha `name` i
configen, annars failar bygget. Bindings som ändras i dashboarden skrivs över
vid nästa deploy från `main`.

`shared/` ligger utanför alla root directories men bundlas in i tre av dem.
Build watch paths måste därför inkludera både worker-katalogen och
`cloudflare/shared/*`, annars deployas inte en ändring i delad kod.

Secrets (`PROVIDER_CONFIG_KEY`, `INGEST_API_KEY`, `GEMINI_API_KEY`,
`GITHUB_ERROR_REPORT_TOKEN`) sätts med `wrangler secret put` och rörs inte av
bygget. `PROVIDER_CONFIG_KEY` måste ha samma värde i `produkter` och
`produkter-bearbetare` — appen krypterar, bearbetaren dekrypterar.

## Princip

Målet är minsta säkra CI-mängd, inte minsta möjliga antal checks. Om påverkan inte kan avgöras deterministiskt ska CI hellre köra för mycket än missa en relevant verifiering.
