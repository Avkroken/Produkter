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

`dev` är den enda skrivbara grenen. `main` tar bara emot squash-mergade PR:er
som passerat gröna checkar.

**Skapa aldrig egna grenar.** Allt arbete sker på `dev`. Det är en hård regel, inte
en rekommendation: grenar som skapas per uppgift blir liggande halvfärdiga, och det
är hela anledningen till att modellen ser ut så här.

1. Utgå från aktuell `dev`. Ligger det osynkat arbete där, bygg vidare på det i
   stället för att börja om någon annanstans.
2. Kör relevanta Python-tester, Node-typechecks och andra komponentkontroller innan push.
3. Pusha till `dev` och öppna PR från `dev` till `main` som klar för granskning.
   Aktivera auto-merge — merge-kön tar PR:n så snart required checks är gröna.
4. Lös CI- och reviewproblem på `dev`; PR:n uppdateras automatiskt av varje push.
5. **Squash merge är den enda tillåtna merge-metoden.** Efter merge återställs `dev` till
   `main` automatiskt av `.github/workflows/sync-dev.yml`.

Skicka aldrig direkt till `main`, kringgå inte branch protection/rulesets och ändra
inte hemligheter eller organisationsinställningar utan uttrycklig instruktion.

## Svarsformat

**[SKILLS.md](SKILLS.md) styr allt svarsformat. Läs den och följ den i varje svar.**

SKILLS.md har företräde framför den här filen och framför varje annan
formuleringsanvisning i repot. Sammanfatta den inte, återge den inte i kortform
och väg den inte mot andra skrivelser — det är den filen som gäller.
