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

`main` tar bara emot squash-mergade PR:er som passerat gröna checkar.

**Skapa aldrig egna grenar.** Rulesetet blockerar det — en push som försöker
skapa något utanför poolen avvisas. Poolen finns för att grenar som skapas per
uppgift blir liggande halvfärdiga.

1. Välj sloten som matchar arbetet. Är den upptagen duger vilken ledig som helst —
   namnen är vägledning, inte en spärr. Ligger det omergat arbete i en slot,
   **slutför det först** i stället för att börja något nytt i en annan.
2. Kör relevanta Python-tester, Node-typechecks och andra komponentkontroller innan push.
3. Pusha till sloten och öppna PR från den till `main` som klar för granskning.
   Aktivera auto-merge — merge-kön tar PR:n så snart required checks är gröna.
4. Lös CI- och reviewproblem i samma slot; PR:n uppdateras av varje push.
5. **Squash merge är den enda tillåtna merge-metoden.** Efter merge rebasar
   `.github/workflows/sync-pool.yml` varje slot på `main`.

Skicka aldrig direkt till `main`, kringgå inte branch protection/rulesets och ändra
inte hemligheter eller organisationsinställningar utan uttrycklig instruktion.

## Svarsformat

**[SKILLS.md](SKILLS.md) styr allt svarsformat. Läs den och följ den i varje svar.**

SKILLS.md har företräde framför den här filen och framför varje annan
formuleringsanvisning i repot. Sammanfatta den inte, återge den inte i kortform
och väg den inte mot andra skrivelser — det är den filen som gäller.
