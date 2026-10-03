# Produkter

Produkter är ett system för att samla in produktdata och generera produktbeskrivningar med flera AI-leverantörer. Repositoryt innehåller både en lokal/Docker-baserad Python-app, scraper/fetcher-komponenter och en Cloudflare-baserad runtime uppdelad i flera Workers.

## Snabbstart för egen installation

```bash
cp .env.example .env
cp cloudflare/deployment.example.json cloudflare/deployment.json
```

Fyll därefter i endast dina egna värden i de två lokala konfigurationsfilerna. Se [Self-hosting](docs/self-hosting.md) för Cloudflare-resurser och secrets.

När `cloudflare/deployment.json` innehåller din installation genererar du de gitignorerade produktionskonfigurationerna för Wrangler:

```bash
node cloudflare/scripts/configure.mjs
```

Generatorn skriver `cloudflare/*/wrangler.production.jsonc`. De versionsstyrda `cloudflare/*/wrangler.jsonc` är resursfria, använder separata `*-preview`-Worker-namn lokalt och ska inte fyllas med installationens production-ID:n eller secretvärden. Workers Builds matchar production-triggern till den anslutna Worker-identiteten; därför bevarar tracked config befintliga vars/secrets/resursbindings via upload-metadata och explicit observability, medan icke-main branches kör Worker Previews.

## Snabb verifiering

Python-delarna:

```bash
python -m pip install -r requirements.txt
pytest
```

Dockerkonfiguration:

```bash
docker compose config
```

## Dokumentation

Börja i **[dokumentationsöversikten](docs/index.md)**.

- [Projektkontext](docs/project-context.md) — komponenter, runtime och state
- [Arkitektur](docs/architecture.md) — dataflöden och trust boundaries
- [Self-hosting](docs/self-hosting.md) — minimal installationskonfiguration
- [Drift](docs/operations.md) — test, Docker, Cloudflare och incidenter
- [Fetcher-dokumentation](scraper/fetcher/README.md) — den externa browser/fetcher-gränsen
- [SECURITY.md](SECURITY.md) — säkerhetsrapportering

README är medvetet kort; systemet är för stort för att fungera som en enda lång manual.
