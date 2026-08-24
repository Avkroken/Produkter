# CI och branchflöde

## Grundmodell

`main` är den enda långlivade arbetsgrenen. Varje ändring görs på en kortlivad branch och går via PR till `main`.

1. Skapa en kortlivad branch från aktuell `main`.
2. Öppna PR från arbetsbranchen till `main`.
3. PR-CI verifierar den faktiska ändringen.
4. Auto-merge får aktiveras på PR:n; när required checks och eventuella reviewkrav är uppfyllda mergar GitHub automatiskt.
5. **Squash merge är den enda tillåtna merge-metoden.** Merge commit och rebase merge används inte.
6. Head-branchen raderas automatiskt efter merge.

CI ska inte köras dubbelt för samma arbetscommit. Vanlig CI triggas därför av `pull_request` och av `push` till `main` där efter-merge-verifiering behövs; kortlivade arbetsbrancher behöver ingen separat push-CI när samma commit redan verifieras genom PR:n.

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

Docker-, deploy- och security-workflows får egna filter när det är säkert, men stabila Code Scanning-kategorier och required check-namn får inte ändras bara för att komponenter byter namn.

## Princip

Målet är minsta säkra CI-mängd, inte minsta möjliga antal checks. Om påverkan inte kan avgöras deterministiskt ska CI hellre köra för mycket än missa en relevant verifiering.
