# Projektkontext

**Senast verifierad:** 2026-09-24

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

Varje Worker-konfigurationsfil är auktoritativ för just den deployenhetens bindings/runtime.

De tre Cloudflare-Workers som använder D1 binder samma databas, `produkter-eu-v2`. Produktionsdatabasen ska skapas med Cloudflare-jurisdiction `eu`. Shared D1-routing använder Sessions API för request-, cron- och queue-vägar med lämplig `first-unconstrained`/`first-primary`-constraint, så read replication kan vara `auto` inom EU-jurisdictionen.

## State- och failuremodell

Systemet innehåller flera typer av state: jobb/resultat/config i Python-appen, scraperstate och Cloudflare-resurser. Dokumentation ska ange vilket subsystem som äger respektive state i stället för att använda ett generiskt "databasen".

## Secrets

Providerkeys, scraper-API-keys, session secrets och andra credentials ska ligga i avsedd runtime/configmodell och aldrig i docs eller Git.

## Uppdateringskontrakt

Uppdatera denna fil när subsystemgränser, providerkedja, persistent state, Docker-topologi eller Cloudflare-deployenheter ändras.
