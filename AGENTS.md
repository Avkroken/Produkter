# AGENTS.md

Den här filen innehåller instruktioner för AI-agenter som arbetar i repositoryt.

Root-`AGENTS.md` är den auktoritativa källan för repositoryövergripande agentpolicy. En mer specifik `AGENTS.md` längre ned i katalogträdet får lägga till regler för sitt subtree, men ska inte duplicera eller motsäga den repositoryövergripande policyn.

Följ dessutom de repository-specifika instruktionerna längre ned i denna fil.

<!-- AVKROKEN-COMMON:START -->

## Arbetsprincip

Leverera fungerande, verifierade och avgränsade ändringar.

CI, GitHub Copilot Code Review och mänskliga reviewers är oberoende verifieringslager. De ska inte vara den första debuggern för fel som agenten rimligen kan upptäcka själv före en pull request.

Ändra inte mer än uppgiften kräver. Bevara befintlig arkitektur och repository-specifika konventioner om det inte finns ett konkret skäl att ändra dem.

## Innan implementation

Innan kod ändras:

1. Läs denna fil och eventuell närmare `AGENTS.md` för de filer som berörs.
2. Läs relevant implementation, tester, konfiguration och närliggande dokumentation innan lösningen bestäms.
3. Identifiera repositoryts faktiska build-, test-, lint-, typecheck- och CI-kommandon från repositoryts befintliga konfiguration.
4. Följ repositoryts branchmodell. Skapa inte egna branchkonventioner och anta inte att en policy är ruleset-enforced utan att den faktiskt är det.
5. Gör minsta kompletta ändring som löser problemet.

## Pre-PR quality gate

Innan en ready pull request skapas eller uppdateras ska agenten:

- granska hela den egna diffen mot PR:ns base branch;
- kontrollera korrekthet, säkerhet, felhantering, kompatibilitet och relevanta edge cases;
- köra alla relevanta lokala tester samt tillämplig lint, typecheck och build;
- lägga till eller uppdatera tester när beteende ändras och detta är praktiskt testbart;
- kontrollera att inga secrets, credentials, debugrester eller oavsiktliga filer har lagts till;
- fixa legitima egna findings innan PR:n lämnas för extern review.

Efter en senare commit eller push ska validering som påverkas av den nya ändringen köras igen. Utgå inte från att en tidigare grön körning fortfarande validerar en ändrad HEAD.

Om full lokal validering inte är möjlig ska detta redovisas konkret i PR:n; hitta inte på ett grönt resultat.

## Review-signal

Vid code review ska funktionell och teknisk signal prioriteras framför redaktionell puts.

Rapportera inte rena stavnings-, grammatik-, interpunktions-, wording- eller stilfel i README och annan dokumentation, Markdown eller annan mänskligt läsbar prosa, kodkommentarer eller docstrings.

Undantag: rapportera ett textfel när det materiellt kan ändra teknisk betydelse, säkerhet, korrekthet, användarbeteende eller en instruktion som förväntas köras eller kopieras bokstavligt.

Rapportera typos och andra textfel i maskin- eller semantikbärande innehåll när de kan påverka beteendet, inklusive identifierare och symbolnamn, strängkonstanter med programbetydelse, paths och filnamn, konfigurationsnycklar, environment-variabler, API-fält, kommandon och flaggor, selectors samt protokoll- och enumvärden.

Prioritera korrekthet, säkerhet, tillförlitlighet, kompatibilitet, tester och underhållbarhet.

## Reviewnivå och eskalering

Använd lägsta reviewnivå som ger tillräcklig säkerhet.

### Low

Använd GitHub Copilot Code Review Lite för rutinmässiga, lokala och väl avgränsade ändringar.

### Medium

Använd Copilot Balanced när ändringen innehåller icke-trivial logik, påverkar flera sammanhängande komponenter, ändrar API-/kompatibilitetsbeteende eller annars kräver mer reasoning än en normal Lite-review.

### High

Använd minst Balanced för ändringar som berör exempelvis autentisering eller access control, credentials och secret-hantering, persistent data/schema/migrationer, concurrency/retries/idempotency, distributed/cross-service state, protokoll/integrationskontrakt, releaseflöden eller privilegierad infrastruktur samt stora eller riskfyllda refactors.

Om en High-fråga fortfarande kräver en separat djup implementation eller ett oberoende andra pass, delegera via den installerade OpenAI Codex-agenten i GitHub. Använd agentens faktiska `@handle` som GitHub visar; gissa inte mention-namnet.

### Critical

Behandla en ändring eller finding som Critical när ett fel trovärdigt kan innebära exempelvis auth bypass, secret exposure, dataförlust/-korruption, destruktiv eller irreversibel migration, allvarlig produktionspåverkan eller motsvarande exceptionell konsekvens.

Kör Balanced och använd Codex. Om den kritiska frågan fortfarande är olöst eller väsentligt tvetydig, begär ett separat andra pass från den installerade Anthropic Claude-agenten via dess faktiska GitHub-`@handle`.

Bygg inte ett nytt router-workflow enbart för att automatisera denna eskalering. Native GitHub-delegering är standardvägen så länge inget organisationsbeslut säger annat.

## Pull request och merge

Pusha aldrig direkt till `main`. Följ repositoryts specifika branchmodell.

Skapa en ready PR först när pre-PR-gaten är genomförd.

Efter varje ny commit eller push ska den aktuella PR-statusen verifieras igen. Verifiera åtminstone aktuell HEAD, required checks/CI, mergeability, mergekonflikter och obligatoriska review-trådar/blockers.

När GitHub bedömer PR:n som direkt mergebar och alla tillämpliga repository-gates är uppfyllda — required checks/CI är klara och godkända, inga mergekonflikter finns och inga relevanta obligatoriskt olösta review-trådar eller andra blockers återstår — ska PR:n mergas omedelbart.

Försök inte aktivera auto-merge på en PR som redan är direkt mergebar.

Använd auto-merge när PR:n ännu inte kan mergas enbart därför att obligatoriska gates fortfarande väntar och repositoryt stöder auto-merge. När gates blir uppfyllda får GitHub genomföra merge enligt sin normala enforcement.

Repositoryts aktuella ruleset, merge queue och repositoryinställningar bestämmer vilka merge-metoder som är tillåtna. Agenten ska inte kringgå eller ersätta den live-konfigurationen med en egen metodpolicy.

Om GitHub inte tillåter merge trots att PR:n ser grön ut ska den konkreta blockeraren identifieras. Forcera eller kringgå inte repositoryskydd.

## Credentials och AI-infrastruktur

Committa eller exponera aldrig secrets, tokens, privata nycklar eller andra credentials.

Lägg inte till `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` eller annan extern AI-provider-credential i repository, Actions secrets eller organisationskonfiguration utan uttryckligt godkännande från repository- eller organisationsägaren.

Ändra inte billing, Copilot-policy, repository secrets eller organisationsinställningar enbart för att möjliggöra AI-routing utan uttryckligt godkännande.

Föredra befintliga GitHub/Copilot-native mekanismer framför nya workflows, botar eller dispatchers när de redan löser uppgiften.

## Definition of done

För en uppgift som skapar eller uppdaterar en pull request är arbetet inte klart förrän implementationen är färdig och avgränsad till uppgiften, relevanta tester och lokala checks har körts eller en konkret begränsning har dokumenterats, den slutliga diffen har självgranskats, legitima review-findings har åtgärdats, PR-status har verifierats mot aktuell HEAD, PR:n antingen har mergats därför att alla gates är uppfyllda eller har auto-merge aktiverat därför att endast väntande obligatoriska gates återstår, och ingen repositoryregel har kringgåtts.

För read-only reviews, investigations, frågor eller live-konfigurationsuppgifter som inte skapar eller uppdaterar en PR gäller inte PR-/mergekraven ovan. En sådan uppgift är klar när den efterfrågade undersökningen eller live-ändringen är genomförd och relevant resulterande status har verifierats.

<!-- AVKROKEN-COMMON:END -->

## Repository-specifika instruktioner

Repot innehåller tre delar av samma produkt: Python-appen i roten, Cloudflare Workers under `cloudflare/` och scraper-kedjan under `scraper/`.

### Teknik och struktur

- Roten: Python, Flask, Gunicorn, provider-failover och filbearbetning.
- `cloudflare/`: Workers-delarna `app`, `engine` och `processor`.
- `scraper/`: webshop-scraper som matar produktdata till kedjan.
- Användarnas provider-nycklar är kontoavgränsade och ska lagras krypterat; credentials får aldrig hårdkodas eller committas.
- Jobb och filer ska alltid kontrolleras mot `account_id` innan åtkomst.
- Partiella jobbresultat ska bevaras så paus/resume inte tappar färdigt arbete.
- GitHub Actions pinnas till commit-SHA när praktiskt möjligt.

### Versioner

Undvik versionspinnar om de inte behövs. Nödvändiga pinnar ska dokumenteras med orsak och villkor för borttagning. Dependabot ska hantera normala dependency-uppdateringar via PR.

### Branch- och automationskontrakt

Arbete sker via tillfälliga arbetsgrenar och pull requests till `main`. Arbetsgrenar får använda repo- eller agentvalda namn som `claude/*`, `codex/*`, `feature/*`, `fix/*` eller motsvarande; de återanvändbara `work/feature`, `work/fix` och `work/chore` får fortfarande användas men är inte obligatoriska.

Kör relevanta Python-tester, Node-typechecks och andra komponentkontroller innan push.

`.github/workflows/pr-watchdog.yml` bevakar alla lokala branches utom `main`, merge-köns `gh-readonly-queue/*`, den interna permanenta state-branchen `automation/pr-watchdog-state` och uttryckliga permanenta undantag. När en branch med unika commits först observeras utan öppen PR sparas `firstSeen` beständigt på state-branchen. Perioden fortsätter även om HEAD ändras och nollställs först när en öppen PR finns eller branchen inte längre har unika commits mot `main`. Efter mer än 60 minuter skapas en ready PR till `main` och workflowen begär squash auto-merge med `mergeMethod:SQUASH`; required CI, review, merge queue och övriga live-regler fortsätter att blockera faktisk merge tills de är uppfyllda. Om squash auto-merge inte stöds av repositoryts live-inställningar ska workflowfelet rapporteras som en faktisk konfigurationsmismatch, inte döljas i dokumentationen. Exakt samma HEAD öppnas inte på nytt om den redan har behandlats i en stängd PR. Watchdoggen avgör inte om arbetet är önskvärt eller mergebart; CI, review och merge-gates gör det.

`.github/workflows/sync-pool.yml` får fortsätta synka de uttryckliga återanvändbara `work/*`-slotsen men får aldrig resetta godtyckliga agent- eller arbetsgrenar.

Repoets regler/ruleset för `main` ska kräva required status checks och resolution av review conversations före merge. Dokumenterad policy ersätter inte faktisk enforcement.

### Svarsformat

**[SKILLS.md](SKILLS.md) styr allt svarsformat. Läs den och följ den i varje svar.**

SKILLS.md har företräde framför den här filen och framför varje annan formuleringsanvisning i repot. Sammanfatta den inte, återge den inte i kortform och väg den inte mot andra skrivelser — det är den filen som gäller.
