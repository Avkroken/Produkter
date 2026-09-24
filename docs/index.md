# Dokumentation

Navigationssida för Produkter.

## Hitta rätt

| Område | Dokument |
| --- | --- |
| systemets komponenter och current-state | [Projektkontext](project-context.md) |
| dataflöden, AI-providerkedja och trust boundaries | [Arkitektur](architecture.md) |
| utveckling, test, Docker och deployment | [Drift](operations.md) |
| extern render/browser-fetcher | [scraper/fetcher/README.md](../scraper/fetcher/README.md) |
| säkerhetsrapportering | [SECURITY.md](../SECURITY.md) |

## Komponentkarta

Repositoryt innehåller flera separata runtimeytor:

- **Python webbapp** — `app.py`, templates och lokal persistent job/config-state.
- **CLI/sync** — `main.py`, filbearbetning och synk mot scraper-API.
- **AI-providerlager** — `providers.py` + `provider_config.py`.
- **Scraper** — `scraper/` med API, scraping, web UI och fetcher.
- **Extern fetcher** — dokumenterad separat under `scraper/fetcher/`.
- **Cloudflare runtime** — `cloudflare/app`, `cloudflare/engine`, `cloudflare/processor`, delad kod, migrationer och infra.

## Vanliga läsvägar

### Jag ändrar AI-providerstöd

Läs [architecture.md](architecture.md), `providers.py`, `provider_config.py` och provider-tester.

### Jag ändrar webbappen

Läs project-context, `app.py`, `auth.py` och auth-/main-tester.

### Jag ändrar scraping/fetch

Läs scraperkoden och [fetcher-dokumentationen](../scraper/fetcher/README.md). Håll browsergränsen separerad från AI-providerlagret.

### Jag ändrar Cloudflare runtime

Läs `cloudflare/*/wrangler.jsonc`, migrationer och operations-dokumentet. App/engine/processor är separata deployenheter och ska inte beskrivas som en enda Worker.

## Wiki

GitHub Wiki är aktiverad och passar särskilt bra för denna repo eftersom dokumentationen har flera tydliga områden. Versionsstyrd Markdown är underlaget; Wiki ska vara en klickbar presentation av samma information, inte en konkurrerande source of truth.
