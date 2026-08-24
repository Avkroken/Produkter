# CI och branchflöde

## Grundmodell

Arbete sker i en sluten pool av tre grenar, en per arbetstyp — `work/feature`,
`work/fix` och `work/chore`. Namnen gör PR-listan självbeskrivande. Rulesetet
blockerar skapande av allt utanför poolen, så antalet arbetsgrenar kan inte växa.
Kortlivade grenar per uppgift användes tidigare och blev liggande halvfärdiga.

1. En bot tar sloten som matchar arbetet, eller vilken ledig som helst om den är
   upptagen. Finns omergat arbete i en slot slutförs det först.
2. PR öppnas från sloten till `main`.
3. PR-CI verifierar ändringen.
4. Auto-merge aktiveras; merge-kön tar PR:n när required checks är gröna och
   mergar en i taget mot aktuell `main`.
5. **Squash merge är den enda tillåtna merge-metoden.**
6. `sync-pool.yml` rebasar varje slot på `main` efter varje merge.

Punkt 6 är inte kosmetika. Squash-merge ger `main` en enda ny commit medan sloten
behåller sina ursprungliga — utan rebase divergerar de och nästa PR fylls av
konflikter. `--empty=drop` tar bort de commits vars innehåll redan finns i main
och replayar resten, så arbete som tillkommit under en öppen PR överlever.

Tre slots ger parallellt arbete utan grenkaos, och gör merge-kön meningsfull:
den serialiserar upp till tre strömmar mot `main`.

CI ska inte köras dubbelt för samma arbetscommit. Vanlig CI triggas därför av
`pull_request`, av `merge_group` (merge-kön) och av `push` till `main` där
efter-merge-verifiering behövs.

## Merge-kön

Kön kräver att required checks svarar på `merge_group`-eventet. Varje workflow vars
jobb är en required check har därför `merge_group:` i sin `on:` — utan den skickar
kön `merge_group.checks_requested`, ingen svarar, och PR:n kastas ut efter
`check_response_timeout_minutes`.

`CodeQL` är medvetet **inte** en required status check. Code scanning default setup
rapporterar inte på merge-grupper, så kravet hade låst kön permanent. Skyddet ligger
i stället i `code_scanning`-regeln, som verkar på PR-nivå före kön.

## Selektiv CI

Dyra jobb ska bara köras när deras kod faktiskt påverkas. Required checks får däremot inte filtreras bort på workflow-nivå med `paths:` eftersom GitHub då kan lämna checken i `Expected/Pending`. För required checks startar workflowet och ett billigt impact-jobb avgör vilka bygg/testjobb som ska köras. Ett job-level `if:` kan då hoppa över irrelevant arbete utan att skapa en permanent väntande required check.

Routing ska vara deterministisk och konservativ:

- Python/root + `scraper/` => Python-CI.
- `cloudflare/**` => Node/TypeScript-CI.
- Dependency- eller CI-konfiguration som kan påverka flera delar => kör berörda delar, och vid osäkerhet båda.
- Dokumentation/processfiler ska inte behöva starta språkbyggen.
- Okända käll-/konfigurationsändringar ska fail-open till mer CI, inte riskera falskt negativt.

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
| `security-alert-ingest` | `cloudflare/security-alerts` |

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
