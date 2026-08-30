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
- **Aktivera auto-merge omedelbart när PR:n skapats**, även om CI eller review fortfarande pågår.
- Använd inte direkt merge om det inte uttryckligen har begärts.
- Repositoryts live-ruleset tillåter för närvarande endast squash merge.
- De återanvändbara `work/*`-brancherna får användas men är inte en obligatorisk branchpool och har inget särskilt ruleset-skydd.

## Merge-gates

Repositoryts live-konfiguration är sanningskällan. Dokumentation ersätter inte rulesets.

För `main` gäller för närvarande:

- required status checks: `python` och `node`
- olösta review-trådar blockerar merge
- Copilot Code Review körs vid push till PR-grenen
- squash är enda tillåtna merge-metod
- repositoryt använder inte merge queue

Alla review-kommentarer och review-trådar ska läsas och utvärderas. Om ett relevant problem identifieras ska det åtgärdas i samma PR. En review-tråd markeras resolved först när kommentaren är utvärderad och eventuell nödvändig fix är pushad.

Efter varje ny commit ska relevanta tester/CI köras igen och PR:ns review-status kontrolleras på nytt, eftersom nya kommentarer kan ha tillkommit. När required checks är gröna och alla relevanta review-trådar är resolved ska den redan aktiverade auto-merge-funktionen föra PR:n till `main`.

Om auto-merge inte sker trots gröna required checks och lösta trådar ska den konkreta blockeraren i live-ruleset, review-state eller repositoryinställning identifieras och rapporteras. Kringgå aldrig skyddet.

## Verifiering före PR

1. Läs relevant implementation, konfiguration, tester och närliggande dokumentation.
2. Granska hela den egna diffen mot `main`.
3. Kör relevanta Python-tester, Node-typechecks, Docker/build-kontroller eller andra komponenttester som ändringen påverkar.
4. Lägg till eller uppdatera tester när beteende ändras och det är praktiskt testbart.
5. Kontrollera att diffen inte innehåller secrets, debugrester, genererade skräpfiler eller oavsiktliga ändringar.

Om full lokal validering inte är möjlig ska begränsningen beskrivas konkret i PR:n.

## GitHub Actions och Cloudflare

- `.github/workflows/ci.yml` producerar de required checkarna `python` och `node`. Impact-routingen får hoppa över dyra komponentjobb men de två wrapper-checkarna ska alltid ge ett slutligt resultat.
- Node-CI ska typkontrollera varje Worker, köra Wrangler dry-run och testa den gemensamma production-deploy-garden.
- `.github/workflows/docker.yml`, `dependency-review.yml` och `osv-scanner.yml` ger kompletterande build- och säkerhetskontroller men är inte required contexts i nuvarande ruleset.
- `.github/workflows/pr-watchdog.yml` kan öppna en PR för en lokal branch med unika commits som saknat PR för länge och armerar squash auto-merge direkt. Dess state ligger på `automation/pr-watchdog-state`.
- `.github/workflows/auto-fix-review.yml` får begära en Codex-fix för feedback från uttryckligen betrodda review-botar. Den får inte lösa review-tråden åt implementationen.
- Cloudflare Workers Builds äger normal produktionsdeploy från `main`; GitHub Actions ska inte deploya produktion.
- Varje Worker-root (`cloudflare/app`, `cloudflare/engine`, `cloudflare/processor`) ska använda `npm run deploy:production` som Workers Builds deploy command.
- `cloudflare/scripts/deploy-production.mjs` failar stängt på fel Workers Builds-branch eller ogiltig build-SHA, använder `wrangler deploy --strict` och märker deploymenten med Git-SHA.
- Efter deploy verifieras bara verkliga publika ytor: appens huvuddomän och motorns `/health`. Processorn är en privat Queue-konsument och ska inte få en konstgjord publik health-route.
- `wrangler.jsonc` är source of truth för Worker-bindings, routes, cron och övrig versionshanterad Worker-konfiguration. Build watch paths ska även omfatta relevant `cloudflare/shared/**` och `cloudflare/scripts/**`.
- D1 `produkter` delas av flera Workers. Repositoryt saknar för närvarande en Wrangler `migrations/`-kedja och de separata Workers Builds får därför inte var för sig applicera `cloudflare/infra/*.sql` automatiskt. Inför först en entydig migrationsägare och idempotent migrationskedja innan schemaändringar läggs i production deploy.

GitHub Actions ska pinnas till commit-SHA när praktiskt möjligt. Nödvändiga versionspinnar ska ha en tydlig anledning och normala dependency-uppdateringar ska hanteras via PR.

## Definition of done

En PR-baserad uppgift är klar först när implementationen är färdig, relevanta tester har körts eller en konkret begränsning dokumenterats, den slutliga diffen har granskats, alla review-kommentarer har utvärderats, required checks är gröna, relevanta review-trådar är resolved och auto-merge antingen har mergat PR:n eller är armerad medan en verifierad extern gate fortfarande väntar.
