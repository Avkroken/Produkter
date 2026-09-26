# Produkter

Produkter är ett system för att samla in produktdata och generera produktbeskrivningar med flera AI-leverantörer. Repositoryt innehåller både en lokal/Docker-baserad Python-app, scraper/fetcher-komponenter och en Cloudflare-baserad runtime uppdelad i flera Workers.

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
- [Drift](docs/operations.md) — test, Docker, Cloudflare och incidenter
- [Fetcher-dokumentation](scraper/fetcher/README.md) — den externa browser/fetcher-gränsen
- [SECURITY.md](SECURITY.md) — säkerhetsrapportering

README är medvetet kort; systemet är för stort för att fungera som en enda lång manual.
