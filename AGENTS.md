# produkter — AI Agent Guide

Repot innehåller tre delar av samma produkt: Python-appen i roten, Cloudflare Workers under `cloudflare/` och scraper-kedjan under `scraper/`.

## Teknik och struktur

- Roten: Python, Flask, Gunicorn, provider-failover och filbearbetning.
- `cloudflare/`: Workers-delarna `app`, `engine` och `processor`.
- `scraper/`: webshop-scraper som matar produktdata till kedjan.
- Användarnas provider-nycklar är kontoavgränsade och ska lagras krypterat; credentials får aldrig hårdkodas eller committas.
- Jobb och filer ska alltid kontrolleras mot `account_id` innan åtkomst.
- Partiella jobbresultat ska bevaras så paus/resume inte tappar färdigt arbete.
- GitHub Actions pinnas till commit-SHA när praktiskt möjligt.

## Versioner

Undvik versionspinnar om de inte behövs. Nödvändiga pinnar ska dokumenteras med orsak och villkor för borttagning. Dependabot ska hantera normala dependency-uppdateringar via PR; auto-merge får användas enligt repots regler när alla krav är uppfyllda.

## Review signal

- Prioritera funktionell korrekthet, säkerhet, tillförlitlighet, kompatibilitet, tester och underhållbarhet.
- Rapportera normalt inte rena stavnings-, grammatik-, interpunktions-, formulerings- eller stilfel i människoläsbar text som dokumentation, Markdown, README, kommentarer eller docstrings.
- Rapportera sådana textfel när de materiellt ändrar teknisk betydelse, säkerhet, korrekthet, användarbeteende eller en bindande instruktion.
- Rapportera fortsatt typos i körbar eller maskinbetydande text när de kan påverka beteende, till exempel identifierare, strängkonstanter, paths, konfigurationsnycklar, API-fält, kommandon, selectors och protokollvärden.

## GitHub-arbetsflöde

Arbete sker via tillfälliga arbetsgrenar och pull requests till `main`. Arbetsgrenar får använda repo- eller agentvalda namn som `claude/*`, `codex/*`, `feature/*`, `fix/*` eller motsvarande; de återanvändbara `work/feature`, `work/fix` och `work/chore` får fortfarande användas men är inte obligatoriska.

1. Kör relevanta Python-tester, Node-typechecks och andra komponentkontroller innan push.
2. Pusha arbetsgrenen och öppna en ready PR till `main`.
3. **Aktivera auto-merge omedelbart när PR:n skapats**, även medan CI och review fortfarande pågår.
4. Required CI-checkar och olösta review-trådar är merge-blockerare. Läs alltid alla review-kommentarer och review-trådar; relevanta fynd åtgärdas i samma PR och en tråd markeras inte resolved innan den är utvärderad och eventuell fix är pushad.
5. Efter varje ny commit eller review-feedback ska PR:n kontrolleras igen. Lös CI-fel i samma branch och verifiera att inga nya olösta review-trådar har tillkommit. När required checks är gröna och alla review-trådar är resolved ska den redan armerade auto-merge-funktionen/merge-kön föra PR:n till `main`. **Squash merge är den enda tillåtna merge-metoden.**

`.github/workflows/pr-watchdog.yml` bevakar alla lokala branches utom `main`, merge-köns `gh-readonly-queue/*`, den interna permanenta state-branchen `automation/pr-watchdog-state` och uttryckliga permanenta undantag. När en branch med unika commits först observeras utan öppen PR sparas `firstSeen` beständigt på state-branchen. Perioden fortsätter även om HEAD ändras och nollställs först när en öppen PR finns eller branchen inte längre har unika commits mot `main`. Efter mer än 60 minuter skapas en ready PR till `main` och squash auto-merge armeras. Exakt samma HEAD öppnas inte på nytt om den redan har behandlats i en stängd PR. Watchdoggen avgör inte om arbetet är önskvärt eller mergebart; CI, review och merge-gates gör det.

`.github/workflows/sync-pool.yml` får fortsätta synka de uttryckliga återanvändbara `work/*`-slotsen men får aldrig resetta godtyckliga agent- eller arbetsgrenar.

Repoets regler/ruleset för `main` ska kräva required status checks och resolution av review conversations före merge. Auto-merge ersätter inte dessa krav; den automatiserar endast själva mergen när kraven är uppfyllda.

Skicka aldrig direkt till `main`, kringgå inte branch protection/rulesets, required checks, review resolution eller merge queue och ändra inte hemligheter eller organisationsinställningar utan uttrycklig instruktion.

## Svarsformat

**[SKILLS.md](SKILLS.md) styr allt svarsformat. Läs den och följ den i varje svar.**

SKILLS.md har företräde framför den här filen och framför varje annan formuleringsanvisning i repot. Sammanfatta den inte, återge den inte i kortform och väg den inte mot andra skrivelser — det är den filen som gäller.
