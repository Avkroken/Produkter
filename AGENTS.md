# AGENTS.md

Den här filen är den auktoritativa repositoryövergripande arbetsinstruktionen. En närmare `AGENTS.md` får lägga till regler för sitt subtree men får inte motsäga reglerna här.

## Repository

Repot innehåller tre delar av samma produkt:

- root: Python/Flask, provider-failover och filbearbetning
- `cloudflare/`: Workers-delarna `app`, `engine` och `processor`
- `scraper/`: Python/Playwright-kedjan som samlar produktdata

Credentials, provider-nycklar och andra secrets får aldrig hårdkodas eller committas. Kontoskopad data ska alltid behålla sin `account_id`-isolering.

## Brancher och pull requests

- Pusha aldrig direkt till `main`.
- Arbeta på en tillfällig branch och öppna en ready pull request till `main`.
- Aktivera inte auto-merge förrän repositoryts live-ruleset har verifierats och PR:n uppfyller de merge-gates som beskrivs nedan.
- Merge till `main` ska ske via den metod som live-rulesetet tillåter; för närvarande endast squash merge.
- De återanvändbara `work/*`-brancherna får användas men är inte en obligatorisk branchpool och har inget särskilt ruleset-skydd.

## Merge-gates

Repositoryts live-konfiguration är sanningskällan. Dokumentation ersätter inte rulesets.

För `main` gäller för närvarande organisationsrulesets med följande gates:

- required status checks: `CI / required`, `docker`, `dependency-review` och `scan-pr / osv-scan`
- required checks körs med strict latest-base-verifiering
- Code Scanning kräver `CodeQL` med `errors_and_warnings` för alerts och `medium_or_higher` för security alerts
- en approval krävs; stale reviews avvisas efter push och den senaste pushen måste godkännas av någon annan
- olösta review-trådar blockerar merge
- Copilot Code Review körs vid push till PR-grenen men är inte en required status check
- CodeRabbit är best-effort review och är inte en required status check; relevanta faktiska review-fynd måste ändå utvärderas och åtgärdas
- squash är enda tillåtna merge-metod
- rulesetet har inga bypass actors
- repositoryt använder inte merge queue

Alla review-kommentarer och review-trådar ska läsas och utvärderas. Om ett relevant problem identifieras ska det åtgärdas i samma PR. En review-tråd markeras resolved först när kommentaren är utvärderad och eventuell nödvändig fix är pushad.

Efter varje ny commit ska relevanta tester/CI köras igen och PR:ns review-status kontrolleras på nytt, eftersom nya kommentarer kan ha tillkommit. Merge eller auto-merge får ske först när required checks är gröna på aktuell PR-HEAD, strict latest-base-kravet är uppfyllt, CodeQL-gaten är godkänd och alla relevanta review-trådar är resolved.

Om merge inte kan ske trots verifierade gates ska den konkreta blockeraren i live-ruleset, review-state eller repositoryinställning identifieras och rapporteras. Kringgå aldrig skyddet.

## Verifiering före PR

1. Läs relevant implementation, konfiguration, tester och närliggande dokumentation.
2. Granska hela den egna diffen mot `main`.
3. Kör relevanta Python-tester, Node-typechecks, Docker/build-kontroller eller andra komponenttester som ändringen påverkar.
4. Lägg till eller uppdatera tester när beteende ändras och det är praktiskt testbart.
5. Kontrollera att diffen inte innehåller secrets, debugrester, genererade skräpfiler eller oavsiktliga ändringar.

Om full lokal validering inte är möjlig ska begränsningen beskrivas konkret i PR:n.

## GitHub Actions och Cloudflare

- `.github/workflows/ci.yml` producerar den required checken `CI / required` och verifierar Python-delarna samt samtliga tre Worker-paket. CI ska inte innehålla produktionsdeploylogik.
- Node-CI ska typkontrollera varje Worker, köra Wrangler dry-run och testa den gemensamma produktionsverifieraren.
- `.github/workflows/docker.yml` producerar den required checken `docker`, bygger båda images och kör Trivy. Alla relevanta fynd rapporteras till Code Scanning och fixerbara HIGH/CRITICAL-fynd blockerar jobbet.
- `.github/workflows/dependency-review.yml` producerar den required checken `dependency-review`.
- `.github/workflows/osv-scanner.yml` är repositoryts egen OSV-definition, producerar `scan-pr / osv-scan` på pull requests och rapporterar resultat till Code Scanning.
- CodeQL körs via GitHub Code Scanning/default setup och verkställs av rulesetets Code Scanning-regel.
- Repositoryts workflows får inte skapa eller uppdatera pull requests eller branches, arma eller genomföra merge, automatisera review, delegera remediation/kodarbete till AI-agenter eller lagra säkerhetsalert-snapshots i repositoryt. De två centrala metadata-callers som beskrivs nedan är det enda metadata-only-undantaget och får inte ändra branch, review eller merge-state.
- Cloudflare Workers Builds äger normal produktionsdeploy från `main`; GitHub Actions ska inte deploya produktion.
- Varje produktions-Worker ska ha en egen Workers Builds production trigger med branch `main`, sin Worker-root som root directory, tomt build command och avstängda non-production branch builds.
- `cloudflare/app` ska använda deploy command `npm run deploy && npm run verify:production`.
- `cloudflare/engine` ska använda deploy command `npm run deploy && npm run verify:production`.
- `cloudflare/processor` ska använda deploy command `npm run deploy` och ska inte få en konstgjord publik health-route.
- `deploy` ska i samtliga tre Worker-paket vara direkt `wrangler deploy --strict`. Skapa inte repo-lokala deploy-wrappers för branchkontroll, Git-SHA-metadata eller annan kontrollplanslogik som Workers Builds redan äger.
- `cloudflare/scripts/verify-production.mjs` får endast verifiera verkliga publika applikationsytor: appens huvuddomän och motorns `/health`. Den får inte deploya Workers eller tolka Workers Builds metadata.
- `wrangler.jsonc` är source of truth för Worker-bindings, routes, cron och övrig versionshanterad Worker-konfiguration.
- Build watch paths ska vara `cloudflare/app/**`, `cloudflare/shared/**` och verifieraren för appen; `cloudflare/engine/**`, `cloudflare/shared/**` och verifieraren för motorn; samt `cloudflare/processor/**` och `cloudflare/shared/**` för processorn.
- D1 `produkter` delas av flera Workers. Repositoryt saknar för närvarande en Wrangler `migrations/`-kedja och de separata Workers Builds får därför inte var för sig applicera `cloudflare/infra/*.sql` automatiskt. Inför först en entydig migrationsägare och idempotent migrationskedja innan schemaändringar läggs i production deploy.

GitHub Actions ska pinnas till commit-SHA när praktiskt möjligt. Nödvändiga versionspinnar ska ha en tydlig anledning och normala dependency-uppdateringar ska hanteras via PR.

## Metadata-only AI triage exception

Repositoryägaren har uttryckligen godkänt metadata-only issue triage via GitHub Agentic Workflows. Detta är ett smalt undantag från bredare förbud mot AI-delegering och gäller inte kodarbete eller remediation.

- `.github/workflows/metadata-routing.yml` får endast anropa Avkrokens centrala deterministiska metadata-routing för assignee och labels.
- `.github/workflows/issue-classification.yml` får endast trigga på öppnade/återöppnade issues och anropa den SHA-pinnade centrala `issue-classification.lock.yml`.
- AI-delen får läsa det triggande issuet och read-only repositorykontext som behövs för klassificering.
- `gh-aw` safe outputs får endast lägga till exakt en `difficulty:*` och en `security:*` label från den centrala allowlisten.
- Workflowen får inte kommentera, assigna coding agents, skapa/ändra branches eller PR:er, reviewa, mergea, deploya eller utföra/föreslå remediation.
- Copilot-auth får komma från organization billing eller GitHub Actions-secreten `COPILOT_GITHUB_TOKEN`. Credentialvärden får aldrig committas, loggas eller kopieras till dokumentation.

Detta undantag ändrar inte Cloudflare-, säkerhets-, CI-, review- eller mergepolicyn.

## Definition of done

En PR-baserad uppgift är klar först när implementationen är färdig, relevanta tester har körts eller en konkret begränsning dokumenterats, den slutliga diffen har granskats, alla review-kommentarer har utvärderats, live-rulesetet är verifierat, required checks och CodeQL-gaten är gröna på aktuell och latest-base-verifierad PR-HEAD, relevanta review-trådar är resolved och PR:n antingen är squash-mergad eller har verifierad auto-merge armerad medan en extern gate fortfarande väntar.

## PR-scope efter öppning

Den här sektionen förtydligar tidigare formuleringar om att relevanta findings ska åtgärdas i samma PR.

- När en PR har öppnats är dess avsedda scope, så som det beskrivs i PR:n, fryst. Fortsatta commits får endast slutföra eller korrigera det scopet.
- Om CI, Code Scanning, tester eller review hittar ett fel som orsakas av PR:ns befintliga ändringar ska just det felet rättas på samma branch/PR. Det är en korrigering inom scope, inte ny scope.
- Ny funktionalitet, opportunistiska refactors, städning eller separata förbättringar som upptäcks efter att PR:n öppnats ska få en ny kortlivad branch och en ny PR från aktuell `main`; återanvänd inte den öppna PR-grenen för nästa uppgift.
- Försök inte hinna lägga commits före eller under en pågående CI-/reviewkörning av tidsskäl. Gör en komplett ändring, pusha den, låt gates utvärdera den HEAD:en och reagera därefter.
- Efter varje korrigerande commit ska relevanta tester köras om och hela tillämpliga gate- och review-state verifieras på den nya HEAD:en före merge.
