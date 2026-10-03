# Projektkontext

**Senast verifierad:** 2026-09-27

## Ansvar

Produkter hanterar produktdata och generering av produktbeskrivningar. Repositoryt kombinerar flera runtimeformer och ska därför inte dokumenteras som en enda monolit.

## Python-app

Rootens Python-del innehåller:

- `app.py` — Flask-webbapp och jobbhantering
- `main.py` — CLI och scraper-synk
- `auth.py` — webbappens authlager
- `extractors.py` — fil-/radextraktion
- `providers.py` — AI-providerabstraktion och failover
- `provider_config.py` — per-account providerkonfiguration
- `prompts.py` — promptbyggande
- `github_report.py` — felrapportering

## Input och jobb

CLI/webbappen kan extrahera produktdata från flera filformat och skriver genererade resultat till outputfiler.

Webbappen sparar jobbmetadata och mellanresultat under sina data-/outputkataloger så att jobb kan återupptas.

## AI-providers

Providerlagret stödjer flera implementationer via en `ProviderChain`.

Verifierad configmodell:

- provider credentials lagras per account under configvolym;
- credentials krypteras med `PROVIDER_CONFIG_MASTER_KEY` när de skrivs via aktuell configväg;
- provider order/model sparas separat från credentialfilen;
- CLI-läget kan i stället bygga providerkedja från environment.

Providerfailover och kvot-/resume-beteende är en del av applikationslogiken och ska inte dupliceras i UI.

## Docker

Rootens `docker-compose.yml` definierar:

- webbappen `app`;
- valfri `sync`-profil;
- separata volumes för uploads, outputs och config;
- anslutning till scraper-nätverk för synckomponenten.

## Scraper

`scraper/` är en egen delsystemyta med API, scraping, web UI, alerts och en extern fetcher.

Browser/render-fetcher dokumenteras under [`scraper/fetcher/README.md`](../scraper/fetcher/README.md).

## Cloudflare

`cloudflare/` innehåller separata deployenheter:

- `app`
- `engine`
- `processor`

samt `shared`, `migrations`, `infra` och scripts.

Installationsspecifik Cloudflare-state kan ligga i den gitignorerade `cloudflare/deployment.json`, skapad från `deployment.example.json`, och `cloudflare/scripts/configure.mjs` kan generera lokala `wrangler.production.jsonc` för app, engine och processor. De versionsstyrda `wrangler.jsonc`-filerna använder de anslutna production-Worker-namnen som Workers Builds kräver men innehåller inga production-resurs-ID:n eller secretvärden. Direkt lokal deploy via tracked production-config blockeras; `wrangler.preview.jsonc` behåller separata `*-preview`-namn. På Workers Builds `main` rekonstruerar build-hooken först en temporär production-config från provider-state; därefter deployas den anslutna production-Workern i den yttre deployen. Tracked upload-metadata sätter `keep_bindings` för vars, secrets, D1, KV, R2, Queue, Service och AI samt samma observability-kontrakt som production-configen, så den yttre deployen inte kan strippa den kompletta live-staten. Om live-state redan är skadad backfyller den inre deployen endast saknade bindings från senaste kompletta faktiskt deployade historiska Worker-version. Worker-namn kan överstyras med `CLOUDFLARE_WORKER_APP`, `CLOUDFLARE_WORKER_ENGINE` och `CLOUDFLARE_WORKER_PROCESSOR`; D1-migrationsändringar blockerar fortsatt auto-deploy. Icke-main branches använder Cloudflare Worker Previews och deras Preview command, inte production deploy. Den canonical Cloudflare-appen publicerar även en PWA-bas (manifest, 192/512-ikoner och network-only service worker) för installations-/store-packaging utan att flytta auth-, provider-, jobb- eller katalogstate till klientcache.

De Workers som använder D1 ska binda samma installationsspecifika databas. Om installationen använder EU-jurisdiction ska databasen skapas med `jurisdiction=eu`. Shared D1-routing använder Sessions API för request-, cron- och queue-vägar med lämplig `first-unconstrained`/`first-primary`-constraint.

## State- och failuremodell

Systemet innehåller flera typer av state: jobb/resultat/config i Python-appen, scraperstate och Cloudflare-resurser. Dokumentation ska ange vilket subsystem som äger respektive state i stället för att använda ett generiskt "databasen".

## Tema

De användarvända webbgränssnitten i Flask-appen, scraper-WebUI och Cloudflare-appen följer samma presentationskontrakt: `legacy`, `forest` (visas som **Avkroken**) och `blackout`. `legacy` är fallback och återger det äldre Avkroken-uttrycket med mörk bas, cyan/blå/violett/magenta glow och diskret 42 px-rutnät, medan Produkters orange respektive scraper-specifika accenter förblir produkt-/delsystemsspecifika.

Temavalet persisteras i `localStorage["avkroken.theme"]` och i den icke-känsliga presentationscookien `avkroken_theme`. När hostnamnet medger det härleds en gemensam parent-domain vid runtime för kontinuitet mellan installationens subdomäner; repositoryt hårdkodar ingen installationsdomän och faller tillbaka till host-only cookie när en delad domän inte kan sättas. Äldre lokala `theme=light|dark` känns igen som migrationssignal till Legacy men raderas inte. Temapreferensen är strikt kosmetisk och får aldrig påverka auth-, provider-, scraper-, jobb- eller canonical state.

## Secrets

Providerkeys, scraper-API-keys, session secrets och andra credentials ska ligga i avsedd runtime/configmodell och aldrig i docs eller Git.

## Uppdateringskontrakt

Uppdatera denna fil när subsystemgränser, providerkedja, persistent state, Docker-topologi eller Cloudflare-deployenheter ändras.
