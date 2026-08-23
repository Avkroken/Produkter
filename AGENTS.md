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

Undvik versionspinnar om de inte behövs. Nödvändiga pinnar ska dokumenteras med orsak och villkor för borttagning. Dependabot ska hantera normala dependency-uppdateringar via PR, inte auto-merge.

## GitHub-arbetsflöde

`main` är den enda långlivade arbetsgrenen. `dev` används inte.

1. Skapa en kortlivad branch från aktuell `main` för varje uppgift.
2. Kör relevanta Python-tester, Node-typechecks och andra komponentkontroller innan push.
3. Öppna PR från arbetsbranchen till `main` som klar för granskning. Aktivera inte auto-merge.
4. Lös CI- och reviewproblem på samma branch tills required checks är gröna och review-trådar lösta.
5. Merge sker med **squash merge**. Använd inte merge commits eller rebase merge. Head-branchen får raderas efter merge.

Skicka aldrig direkt till `main`, kringgå inte branch protection/rulesets och ändra inte hemligheter eller organisationsinställningar utan uttrycklig instruktion.

## Svarsformat

Led med nästa åtgärd eller resultat. Numrera flerstegsarbete, håll listor korta och ange konkret orsak/fix vid fel.
