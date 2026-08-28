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

## GitHub-arbetsflöde

Arbete sker i en **sluten pool av tre grenar**, en per arbetstyp:

| Slot | För |
| --- | --- |
| `work/feature` | ny funktionalitet |
| `work/fix` | buggfixar och CI-problem |
| `work/chore` | dokumentation, städning, konfiguration |

`main` tar bara emot squash-mergade PR:er som passerat gröna required checks och inte har några olösta review-trådar.

**Skapa aldrig egna grenar.** Rulesetet blockerar det — en push som försöker
skapa något utanför poolen avvisas. Poolen finns för att grenar som skapas per
uppgift blir liggande halvfärdiga.

1. Välj sloten som matchar arbetet. Är den upptagen duger vilken ledig som helst —
   namnen är vägledning, inte en spärr. Ligger det omergat arbete i en slot,
   **slutför det först** i stället för att börja något nytt i en annan.
2. Kör relevanta Python-tester, Node-typechecks och andra komponentkontroller innan push.
3. Pusha till sloten och öppna PR från den till `main` som klar för granskning.
   **Aktivera auto-merge omedelbart när PR:n skapats.** Auto-merge ska vara armerad medan
   CI och review pågår; PR:n får sedan mergas automatiskt först när samtliga mergekrav är uppfyllda.
4. Behandla både required CI-checkar och olösta review-trådar som stoppklossar.
   Läs alltid alla review-kommentarer och review-trådar. Bedöm varje kommentar sakligt:
   relevanta fynd ska åtgärdas i samma PR, irrelevanta eller redan åtgärdade fynd ska
   verifieras och därefter lösas med tydlig motivering vid behov. Markera inte en tråd
   som resolved innan den faktiskt är utvärderad och eventuell fix är pushad.
5. Efter varje kodändring eller ny review-feedback: kontrollera PR:n igen, lös CI-fel i
   samma slot och verifiera att inga nya olösta review-trådar har tillkommit. Auto-merge
   ska förbli aktiverad så att PR:n går vidare utan manuell merge när både CI och review
   är klara.
6. En PR är färdig först när required checks är gröna och alla review-trådar är resolved.
   Om dessa villkor är uppfyllda ska auto-merge/merge-kön få merga PR:n till `main` utan
   extra manuell väntan.
7. **Squash merge är den enda tillåtna merge-metoden.** Efter merge rebasar
   `.github/workflows/sync-pool.yml` varje slot på `main`.

Repoets regler/ruleset för `main` ska därför kräva både required status checks och
resolution av review conversations före merge. Auto-merge ersätter inte dessa krav;
den ska endast automatisera själva mergen när kraven har blivit uppfyllda.

Skicka aldrig direkt till `main`, kringgå inte branch protection/rulesets och ändra
inte hemligheter eller organisationsinställningar utan uttrycklig instruktion.

## Svarsformat

**[SKILLS.md](SKILLS.md) styr allt svarsformat. Läs den och följ den i varje svar.**

SKILLS.md har företräde framför den här filen och framför varje annan
formuleringsanvisning i repot. Sammanfatta den inte, återge den inte i kortform
och väg den inte mot andra skrivelser — det är den filen som gäller.
